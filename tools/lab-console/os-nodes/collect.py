"""Publish per-guest wiring and live port samples to the VM agent shared directory."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import time

CONFIG = Path("/var/lib/new-api-vm-agent/lab-os-slots.json")
OUTPUT = Path("/run/new-api-vm-agent/lab-os-nodes.json")
# Factory-state summary for the "factory reset" button; checked far less often than ports.
FACTORY_OUTPUT = Path("/run/new-api-vm-agent/lab-factory.json")
# taishan-lab-reset touches this file so the next loop re-checks right away.
FACTORY_REQUEST = Path("/run/new-api-vm-agent/lab-factory.request")
FACTORY_EVERY = 6  # loops of 10s
GUEST_MODULE = """
import runpy, json, sys
lab = runpy.run_path('/usr/local/sbin/lab_link_status.py')
"""
# Reuse the lab guest's own read-only switch monitor and credential store.
SWITCH_PROBE = GUEST_MODULE + """
ports = json.loads(sys.argv[1])
result = {}
for sw in ('sw1', 'sw2'):
    session = lab['SwitchSession'](lab['SWITCHES'][sw])
    try:
        brief = lab['parse_brief'](session.run('display interface brief'))
        for trunk, members in ports[sw].items():
            selected = lab['parse_trunk'](session.run('display interface Eth-Trunk' + trunk)) if sw == 'sw2' else {}
            for port in members:
                full = port.replace('GE','GigabitEthernet')
                if full not in brief: continue
                phy, proto = brief[full]
                state = 'up' if (phy,proto) == ('up','up') else 'down'
                if sw == 'sw2' and state == 'up' and selected.get(full) != 'Selected':
                    state = 'warn' if full in selected else 'unknown'
                result[sw+':'+port] = dict(state=state,label=sw.upper()+' '+port, detail=' / '.join([phy,proto,selected.get(full,'')]).strip(' /'))
    except Exception:
        pass
    finally:
        session.close()
print(json.dumps(result))
"""
GUEST_PROBE = GUEST_MODULE + """
ep = lab['collect']({})
print(json.dumps({k:v for k,v in ep.items() if k.startswith(('ibmc:','os:'))}))
"""

# SW1 port VLANs through the lab guest's SSH session (not the eNSP serial console).
FACTORY_SWITCH_PROBE = GUEST_MODULE + """
session = lab['SwitchSession'](lab['SWITCHES']['sw1'])
try:
    out = session.run('display port vlan')
finally:
    session.close()
rows = {}
for line in out.splitlines():
    p = line.split()
    if len(p) >= 3 and p[0].startswith('GigabitEthernet'):
        rows['GE' + p[0][len('GigabitEthernet'):]] = [p[1], p[2]]
print(json.dumps(rows))
"""
FACTORY_GUEST_PROBE = """
import json, subprocess
def sh(command):
    return subprocess.run(command, shell=True, capture_output=True, text=True).stdout.strip()
print(json.dumps(dict(
    ibmc=sh("ip netns exec ibmc ip -4 -o addr show dev enp0s8 | awk '{print $4}' | head -1"),
    bond=sh("nmcli -t -f NAME con show | grep -c '^bond'"),
    selinux=sh('getenforce'))))
"""


def factory_status(slots):
    """Compare every node with the state taishan-lab-reset produces."""
    # name, ssh port, SW1 iBMC port, expected link type, expected PVID
    nodes = [('Node-01', 13393, 'GE0/0/2', 'hybrid', '1')]
    for s in slots:
        vlan = s.get('parking_vlan') or next((l.get('vlan') for l in s.get('links', []) if l.get('id') == 'sw1-ibmc'), '')
        nodes.append((s['name'], s['ssh'], s['mgmt'], 'access', str(vlan)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        switch = pool.submit(probe, 13393, FACTORY_SWITCH_PROBE)
        guests = [pool.submit(probe, n[1], FACTORY_GUEST_PROBE) for n in nodes]
    def sample(future):
        try:
            return future.result()
        except (ValueError, OSError, subprocess.SubprocessError):
            return None
    ports = sample(switch)
    checks = []
    for (name, _, port, link_type, pvid), guest in zip(nodes, guests):
        actual = ports.get(port) if ports else None
        checks.append(dict(node=name, item='sw1', target=port, expected=f'{link_type} {pvid}',
                           actual=' '.join(actual) if actual else None,
                           ok=actual == [link_type, pvid] if actual else None))
        guest = sample(guest) or {}
        for item, expected in (('ibmc', '192.168.2.100/24'), ('bond', '0'), ('selinux', 'Enforcing')):
            value = guest.get(item)
            checks.append(dict(node=name, item=item, expected=expected, actual=value,
                               ok=None if value is None else value == expected))
    if any(c['ok'] is False for c in checks):
        state = 'modified'
    elif any(c['ok'] is None for c in checks):
        state = 'unknown'
    else:
        state = 'factory'
    return dict(updated=int(time.time()), state=state, checks=checks)


def probe(port, program, args=()):
    import shlex
    command = shlex.join(['sudo', '-n', 'python3', '-I', '-', *args])
    result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                             '-o', 'ConnectTimeout=3', '-p', str(port),
                             'dragon@127.0.0.1', command], input=program,
                            capture_output=True, text=True, timeout=24, check=True)
    return json.loads(result.stdout)


def collect(slots):
    ports = {'sw1': {'': []}, 'sw2': {}}
    for slot in slots:
        ports['sw1'][''].append(slot['mgmt'])
        ports['sw2'][str(slot['trunk'])] = slot['members']
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        switch = pool.submit(probe, 13393, SWITCH_PROBE, [json.dumps(ports)])
        guests = [pool.submit(probe, s['ssh'], GUEST_PROBE) for s in slots]
    def sample(future):
        try:
            return future.result()
        except (ValueError, OSError, subprocess.SubprocessError):
            return {}
    switches = sample(switch)
    rows = []
    for s, guest in zip(slots, guests):
        endpoints = sample(guest)
        links = {'sw1-ibmc': ['sw1:'+s['mgmt'], 'ibmc:mgmt'],
                 'sw2-os-a': ['sw2:'+s['members'][0], 'os:enp0s9'],
                 'sw2-os-b': ['sw2:'+s['members'][1], 'os:enp0s10'],
                 'ibmc-os': ['ibmc:sol','os:console']}
        for pair in links.values():
            for key in pair:
                if key in switches: endpoints[key] = switches[key]
        try:
            result = subprocess.run(['VBoxManage','showvminfo',s['vm'],'--machinereadable'],
                                    capture_output=True, text=True, timeout=8)
            state = next((line.split('"')[1] for line in result.stdout.splitlines()
                          if line.startswith('VMState="')), 'unknown')
        except (OSError, subprocess.SubprocessError):
            # VirtualBox busy (e.g. while cloning): report unknown, keep sampling.
            state = 'unknown'
        rows.append(dict(name=s['name'], state=state, nodes=s['nodes'], links=s['links'],
                         status=dict(updated=int(time.time()), endpoints=endpoints, links=links)))
    return rows


def publish(path, payload):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(payload))
    os.replace(tmp, path)


if __name__ == '__main__':
    loop = 0
    checked = 0.0
    while True:
        try:
            slots = json.loads(CONFIG.read_text())
        except (OSError, ValueError):
            slots = []  # No provisioned guests yet: publish an empty inventory.
        publish(OUTPUT, collect(slots) if slots else [])
        try:
            requested = FACTORY_REQUEST.stat().st_mtime > checked
        except OSError:
            requested = False
        if loop % FACTORY_EVERY == 0 or requested:
            checked = time.time()
            publish(FACTORY_OUTPUT, factory_status(slots))
        loop += 1
        time.sleep(10)
