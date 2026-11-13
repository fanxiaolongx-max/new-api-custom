#!/usr/bin/env python3
"""Reattach fnOS's VirtualBox bridge after a host USB NIC reconnect."""

import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path


VM_NAME = "feiniu"
VM_IP = os.environ.get("FEINIU_IP", "192.168.100.124")
GATEWAY = os.environ.get("FEINIU_GATEWAY", "192.168.100.1")
STATE_PATH = Path("/run/feiniu-network-guard/state.json")
BRIDGE_INTERFACES = {"enx000ec675333b", "wlp0s20f3"}


def vbox(*args):
    return subprocess.run(
        ["/usr/bin/VBoxManage", *args],
        check=True, capture_output=True, text=True, timeout=15,
    ).stdout


def reachable(address, interface):
    result = subprocess.run(
        ["/usr/bin/ping", "-n", "-I", interface, "-c", "2", "-W", "2", address],
        capture_output=True, timeout=6,
    )
    return result.returncode == 0


def active_lan_bridge():
    """Follow the host's preferred route to this LAN, excluding VPNs/other LANs."""
    output = subprocess.run(
        ["/usr/sbin/ip", "-j", "-4", "route", "show", "default"],
        check=True, capture_output=True, text=True, timeout=5,
    ).stdout
    routes = sorted(json.loads(output), key=lambda route: route.get("metric", 0))
    for route in routes:
        interface = route.get("dev", "")
        if route.get("gateway") != GATEWAY or interface not in BRIDGE_INTERFACES:
            continue
        try:
            if Path(f"/sys/class/net/{interface}/carrier").read_text().strip() == "1":
                return interface
        except OSError:
            continue
    return None


def check_network(prepare_start=False):
    now = time.time()
    try:
        state = json.loads(STATE_PATH.read_text())
    except FileNotFoundError:
        state = {"failures": 0, "last_recovery": 0}

    values = {}
    for line in vbox("showvminfo", VM_NAME, "--machinereadable").splitlines():
        key, separator, value = line.partition("=")
        if separator:
            values[key] = value.strip('"')

    interface = values.get("bridgeadapter1", "")
    configurable_state = {"poweroff", "saved", "aborted"} if prepare_start else {"running"}
    eligible = (
        values.get("VMState") in configurable_state
        and values.get("nic1") == "bridged"
        and values.get("cableconnected1") == "on"
        and interface
    )
    # A saved VM or a deliberate disconnected cable must stay that way.
    if not eligible:
        if prepare_start:
            return
        state["failures"] = 0
        STATE_PATH.write_text(json.dumps(state))
        return

    preferred_interface = active_lan_bridge()
    if preferred_interface and preferred_interface != interface and reachable(GATEWAY, preferred_interface):
        if prepare_start:
            vbox("modifyvm", VM_NAME, "--bridge-adapter1", preferred_interface)
        else:
            # Changing the backing interface preserves the guest NIC and MAC.
            current = vbox("showvminfo", VM_NAME, "--machinereadable")
            for expected in (
                'VMState="running"', 'nic1="bridged"', 'cableconnected1="on"',
                f'bridgeadapter1="{interface}"',
            ):
                if expected not in current.splitlines():
                    return
            vbox("controlvm", VM_NAME, "nic1", "bridged", preferred_interface)
            state["failures"] = 0
            STATE_PATH.write_text(json.dumps(state))
        print(f"fnOS bridge switched from {interface} to {preferred_interface}", flush=True)
        return
    if prepare_start:
        return

    changed = datetime.fromisoformat(values["VMStateChangeTime"].replace("Z", "+00:00"))
    try:
        carrier = Path(f"/sys/class/net/{interface}/carrier").read_text().strip()
    except OSError:
        carrier = "0"
    if now - changed.timestamp() < 180:
        state["failures"] = 0
    elif carrier != "1":
        state["failures"] = 0
    elif not reachable(GATEWAY, interface) or reachable(VM_IP, interface):
        # Router/host outage is not evidence of a broken VM bridge.
        state["failures"] = 0
    else:
        state["failures"] += 1

    if state["failures"] < 3 or now - state["last_recovery"] < 300:
        STATE_PATH.write_text(json.dumps(state))
        return

    # Recheck immediately before changing the VM in case it was saved meanwhile.
    current = vbox("showvminfo", VM_NAME, "--machinereadable")
    for expected in (
        'VMState="running"', 'nic1="bridged"', 'cableconnected1="on"',
        f'bridgeadapter1="{interface}"',
    ):
        if expected not in current.splitlines():
            state["failures"] = 0
            STATE_PATH.write_text(json.dumps(state))
            return

    state.update(failures=0, last_recovery=now)
    STATE_PATH.write_text(json.dumps(state))
    print(f"{VM_IP} failed 3 checks; reattaching {VM_NAME} to {interface}", flush=True)
    try:
        vbox("controlvm", VM_NAME, "nic1", "null")
    finally:
        # Attempt to restore the bridge even if detachment reports an error.
        vbox("controlvm", VM_NAME, "nic1", "bridged", interface)
    if reachable(VM_IP, interface):
        print("fnOS network recovered", flush=True)
    else:
        print("fnOS still unreachable; retry allowed in 5 minutes", flush=True)


if __name__ == "__main__":
    check_network(prepare_start="--prepare-start" in sys.argv)
