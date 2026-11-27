"""Publish per-guest wiring and live port samples to the VM agent shared directory."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import time

CONFIG = Path("/var/lib/new-api-vm-agent/lab-os-slots.json")
OUTPUT = Path("/run/new-api-vm-agent/lab-os-nodes.json")
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
        result = subprocess.run(['VBoxManage','showvminfo',s['vm'],'--machinereadable'],
                                capture_output=True, text=True, timeout=8)
        state = next((line.split('"')[1] for line in result.stdout.splitlines()
                      if line.startswith('VMState="')), 'unknown')
        rows.append(dict(name=s['name'], state=state, nodes=s['nodes'], links=s['links'],
                         status=dict(updated=int(time.time()), endpoints=endpoints, links=links)))
    return rows


if __name__ == '__main__':
    while True:
        rows = collect(json.loads(CONFIG.read_text()))
        tmp = OUTPUT.with_suffix('.tmp')
        tmp.write_text(json.dumps(rows))
        os.replace(tmp, OUTPUT)
        time.sleep(10)
