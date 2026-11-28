#!/usr/bin/env python3
"""Restricted host-side VirtualBox agent for the dashboard.

The service listens on a Unix socket only. VM names and actions are validated
against fixed allowlists before invoking VBoxManage or the local VirtualBox SDK.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import json

import ibmc
from ibmc import IBMC, SerialConsole
import os
import re
import socket
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs, unquote, urlparse

SOCKET_PATH = os.environ.get("VM_AGENT_SOCKET", "/run/new-api-vm-agent/agent.sock")
VBOX_MANAGE = os.environ.get("VBOX_MANAGE", "/usr/bin/VBoxManage")
ALLOWED_VMS = tuple(
    name.strip()
    for name in os.environ.get("VM_AGENT_VMS", "winXP,win7,win11,feiniu,openEuler").split(",")
    if name.strip()
)
MAX_BODY_BYTES = 16 * 1024
WINDOWS_VM = os.environ.get("VM_AGENT_WINDOWS_VM", "win11")
COMPANION_VM = os.environ.get("VM_AGENT_COMPANION_VM", "feiniu")
WINDOWS_VM_CPUS = int(os.environ.get("VM_AGENT_WINDOWS_CPUS", "4"))
# Keep Win11 at 4 GiB on this host, including with older service environments.
WINDOWS_VM_MEMORY_MB = 4096
IDLE_SAVE_VMS = tuple(
    name.strip()
    for name in os.environ.get("VM_AGENT_IDLE_SAVE_VMS", "winXP,win7,win11").split(",")
    if name.strip() in ALLOWED_VMS
)
DEFAULT_IDLE_SAVE_MINUTES = int(os.environ.get("VM_AGENT_IDLE_SAVE_MINUTES", "30"))
MAX_IDLE_SAVE_MINUTES = 24 * 60
SETTINGS_PATH = Path(
    os.environ.get(
        "VM_AGENT_SETTINGS_PATH",
        "/var/lib/new-api-vm-agent/settings.json",
    )
)
LIFECYCLE_MARKER = Path(
    os.environ.get(
        "VM_AGENT_LIFECYCLE_MARKER",
        "/run/new-api-vm-agent/feiniu-saved-for-win11",
    )
)
ACTIVE_STATES = {"running", "paused", "starting", "restoring", "stopping", "saving"}

STATE_NAMES = {
    "poweroff": "powered_off",
    "saved": "saved",
    # VirtualBox keeps a resumable state file after an interrupted restore.
    "aborted-saved": "saved",
    "running": "running",
    "paused": "paused",
    "aborted": "aborted",
    "gurumeditation": "error",
}


VBOX_COMMAND_LOCK = threading.RLock()


def ensure_managed_service() -> None:
    if os.environ.get("VM_AGENT_REQUIRE_MANAGED_SERVICE") != "1":
        return
    try:
        pid = int(Path("/run/new-api-vboxsvc/manager.pid").read_text().strip())
        if Path(f"/proc/{pid}/comm").read_text().strip() != "VBoxSVC":
            raise ValueError("stale PID")
    except (OSError, ValueError) as exc:
        raise RuntimeError("VirtualBox management service is restarting") from exc


def run_vbox(*args: str, timeout: int = 20) -> str:
    with VBOX_COMMAND_LOCK:
        ensure_managed_service()
        completed = subprocess.run(
            [VBOX_MANAGE, *args],
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    if completed.returncode != 0:
        message = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(message or "VirtualBox command failed")
    return completed.stdout


LAB_SLOTS_PATH = Path("/var/lib/new-api-vm-agent/lab-os-slots.json")
WORKSPACE_CONSOLES_PATH = Path(
    os.environ.get("VM_AGENT_WORKSPACE_CONSOLES_PATH", "/run/new-api-vm-agent/workspace-consoles.json")
)
KINDLE_HOST = os.environ.get("VM_AGENT_KINDLE_HOST", "192.168.100.207")
KINDLE_PORT = int(os.environ.get("VM_AGENT_KINDLE_PORT", "22"))
DEBIAN_SSH_HOST = os.environ.get("VM_AGENT_DEBIAN_SSH_HOST", "172.19.0.1")
DEBIAN_SSH_PORT = int(os.environ.get("VM_AGENT_DEBIAN_SSH_PORT", "22"))
WORKSPACE_STATUS_TTL = float(os.environ.get("VM_AGENT_WORKSPACE_STATUS_TTL", "15"))


def read_lab_slots_raw() -> list[dict[str, object]]:
    try:
        slots = json.loads(LAB_SLOTS_PATH.read_text())
    except (OSError, ValueError):
        return []
    if not isinstance(slots, list):
        return []
    return [slot for slot in slots if isinstance(slot, dict)]


def registered_vm_names() -> list[str]:
    names: list[str] = []
    for line in run_vbox("list", "vms").splitlines():
        name = line.rpartition('" {')[0].removeprefix('"')
        if name and name != "<inaccessible>":
            names.append(name)
    return names


def registered_vm_set() -> set[str]:
    return set(registered_vm_names())


def lab_ibmc_slots() -> list[dict[str, str]]:
    """Return provisioned lab slots (excluding Node-01) registered in VirtualBox."""
    entries: list[dict[str, str]] = []
    for slot in read_lab_slots_raw():
        name = slot.get("name")
        vm = slot.get("vm")
        if (
            isinstance(name, str)
            and re.fullmatch(r"Node-[0-9]{2,3}", name)
            and name != "Node-01"
            and isinstance(vm, str)
            and re.fullmatch(r"DragonLab-Node-[0-9]+", vm)
        ):
            entries.append({"name": name, "vm": vm})
    if not entries:
        return []
    registered = registered_vm_set()
    return [entry for entry in entries if entry["vm"] in registered]


def managed_vm_names() -> tuple[str, ...]:
    """Discover all accessible VirtualBox VMs (without an exclusion list)."""
    try:
        discovered = registered_vm_names()
    except (OSError, RuntimeError, subprocess.SubprocessError):
        return ALLOWED_VMS
    if not discovered:
        return ALLOWED_VMS
    discovered_set = set(discovered)
    ordered = [name for name in ALLOWED_VMS if name in discovered_set]
    return tuple(dict.fromkeys((*ordered, *discovered)))


def lab_guest_serial_path(node: str) -> Path | None:
    """COM1 socket of a provisioned lab slot such as Node-02, or None."""
    if not re.fullmatch(r"Node-[0-9]{2,3}", node):
        return None
    vm = next((slot.get("vm") for slot in read_lab_slots_raw() if slot.get("name") == node), None)
    if not isinstance(vm, str) or not re.fullmatch(r"DragonLab-Node-[0-9]+", vm):
        return None
    mode = machine_readable_values(vm).get("uartmode1", "")
    if not mode.startswith("server,"):
        return None
    return Path(mode.removeprefix("server,"))


def machine_readable_values(name: str) -> dict[str, str]:
    output = run_vbox("showvminfo", name, "--machinereadable", timeout=5)
    values: dict[str, str] = {}
    for line in output.splitlines():
        key, separator, value = line.partition("=")
        if not separator:
            continue
        values[key.strip('"')] = value.strip().strip('"')
    return values


def start_machine(name: str) -> None:
    """Select the available fnOS LAN bridge before starting or restoring it."""
    if name == COMPANION_VM:
        subprocess.run(
            ["/usr/bin/python3", str(Path(__file__).with_name("feiniu-network-guard.py")), "--prepare-start"],
            check=True, capture_output=True, text=True, timeout=40,
        )
    run_vbox("startvm", name, "--type", "headless", timeout=30)


def machine_info(name: str) -> dict[str, object]:
    values = machine_readable_values(name)

    raw_state = values.get("VMState", "unknown").lower()
    return {
        "name": name,
        "state": STATE_NAMES.get(raw_state, raw_state),
        "os_type": values.get("ostype", ""),
        "memory_mb": int(values.get("memory") or "0"),
        "cpu_count": int(values.get("cpus") or "0"),
    }


def probe_tcp_reachable(host: str, port: int, timeout: float = 0.6) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def probe_ensp_switch_state(port: int, win7_running: bool) -> str:
    if not win7_running:
        return "stopped"
    if has_established_connection(port):
        return "running"
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.4) as sock:
            sock.settimeout(0.15)
            try:
                data = sock.recv(1)
            except TimeoutError:
                return "running"
            return "running" if data else "stopped"
    except OSError:
        return "stopped"


def ensp_switch_targets() -> list[tuple[str, int]]:
    defaults = [("S5700-LSW1", 2000), ("S5700-LSW2", 2001)]
    try:
        consoles = json.loads(WORKSPACE_CONSOLES_PATH.read_text(encoding="utf-8"))
        switches = consoles.get("switches", []) if isinstance(consoles, dict) else []
    except (OSError, ValueError):
        return defaults
    targets: list[tuple[str, int]] = []
    for item in switches:
        if not isinstance(item, dict) or not isinstance(item.get("name"), str):
            continue
        name = item["name"]
        match = re.search(r"(\d+)$", name)
        if not match:
            continue
        index = int(match.group(1))
        if index >= 1:
            targets.append((name, 1999 + index))
    return targets or defaults


def rdp_port_for_machine(name: str) -> int | None:
    for key, value in machine_readable_values(name).items():
        if not key.startswith("Forwarding("):
            continue
        fields = value.split(",")
        if len(fields) == 6 and fields[0].lower() == "rdp" and fields[1] == "tcp":
            try:
                return int(fields[3])
            except ValueError:
                return None
    return None


def has_established_connection(local_port: int) -> bool:
    expected_port = f"{local_port:04X}"
    for table_path in (Path("/proc/net/tcp"), Path("/proc/net/tcp6")):
        try:
            lines = table_path.read_text(encoding="ascii").splitlines()[1:]
        except OSError:
            continue
        for line in lines:
            columns = line.split()
            if len(columns) > 3 and columns[1].rsplit(":", 1)[-1] == expected_port:
                if columns[3] == "01":
                    return True
    return False


def validate_idle_save_minutes(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("idle_save_minutes must be an integer")
    if value < 0 or value > MAX_IDLE_SAVE_MINUTES:
        raise ValueError(
            f"idle_save_minutes must be between 0 and {MAX_IDLE_SAVE_MINUTES}"
        )
    return value


def load_idle_save_minutes() -> int:
    try:
        payload = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        return validate_idle_save_minutes(payload.get("idle_save_minutes"))
    except FileNotFoundError:
        return validate_idle_save_minutes(DEFAULT_IDLE_SAVE_MINUTES)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"vm-agent: invalid settings file, using default: {exc}", flush=True)
        return validate_idle_save_minutes(DEFAULT_IDLE_SAVE_MINUTES)


def persist_idle_save_minutes(minutes: int) -> None:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = SETTINGS_PATH.with_suffix(".tmp")
    temporary_path.write_text(
        json.dumps({"idle_save_minutes": minutes}) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary_path, SETTINGS_PATH)


def save_companion_for_windows() -> bool:
    """Save the companion VM before Windows starts and remember ownership."""
    if COMPANION_VM not in ALLOWED_VMS:
        return False
    if machine_info(COMPANION_VM)["state"] not in {"running", "paused"}:
        return False

    run_vbox("controlvm", COMPANION_VM, "savestate", timeout=30)
    LIFECYCLE_MARKER.parent.mkdir(parents=True, exist_ok=True)
    LIFECYCLE_MARKER.write_text("saved\n", encoding="utf-8")
    return True


def restore_companion_after_windows() -> None:
    """Restore only a companion VM that this agent previously saved."""
    if not LIFECYCLE_MARKER.exists() or COMPANION_VM not in ALLOWED_VMS:
        return
    state = machine_info(COMPANION_VM)["state"]
    if state == "saved":
        start_machine(COMPANION_VM)
        state = machine_info(COMPANION_VM)["state"]
    if state in ACTIVE_STATES:
        LIFECYCLE_MARKER.unlink(missing_ok=True)


def reconcile_vm_lifecycle() -> None:
    """Keep Win11 and fnOS mutually exclusive, including guest shutdowns."""
    if WINDOWS_VM not in ALLOWED_VMS or COMPANION_VM not in ALLOWED_VMS:
        return
    windows_info = machine_info(WINDOWS_VM)
    if windows_info["state"] in ACTIVE_STATES:
        save_companion_for_windows()
        return
    restore_companion_after_windows()
    configure_windows_resources(windows_info)


def configure_windows_resources(info: dict[str, object]) -> None:
    """Apply the requested Win11 defaults whenever its settings are mutable."""
    if info["state"] not in {"powered_off", "aborted"}:
        return
    if (
        info.get("cpu_count") == WINDOWS_VM_CPUS
        and info.get("memory_mb") == WINDOWS_VM_MEMORY_MB
    ):
        return
    run_vbox(
        "modifyvm",
        WINDOWS_VM,
        "--cpus",
        str(WINDOWS_VM_CPUS),
        "--memory",
        str(WINDOWS_VM_MEMORY_MB),
    )


class UnixHTTPServer(ThreadingMixIn, HTTPServer):
    address_family = socket.AF_UNIX
    daemon_threads = True

    def __init__(self, socket_path: str, handler: type[BaseHTTPRequestHandler]) -> None:
        self.control_lock = threading.Lock()
        self.ibmc = IBMC(run_vbox, machine_readable_values)
        self.ibmc.serial.start()
        self.guest_ibmcs: dict[str, IBMC] = {}
        self.guest_ibmcs_lock = threading.Lock()
        self.guest_serials: dict[str, SerialConsole] = {}
        self.guest_serials_lock = threading.Lock()
        self.settings_lock = threading.Lock()
        self.workspace_status_lock = threading.Lock()
        self.workspace_status_cache: tuple[float, bool, dict[str, dict[str, str]]] | None = None
        self.next_lifecycle_check = time.monotonic()
        self.idle_save_minutes = load_idle_save_minutes()
        self.last_control_activity = {
            name: time.monotonic() for name in IDLE_SAVE_VMS
        }
        self.last_vm_states: dict[str, str] = {}
        self.rdp_ports: dict[str, int | None] = {}
        super().__init__(socket_path, handler)

    def mark_control_activity(self, name: str) -> None:
        if name in self.last_control_activity:
            self.last_control_activity[name] = time.monotonic()

    def update_idle_save_minutes(self, minutes: int) -> None:
        minutes = validate_idle_save_minutes(minutes)
        with self.settings_lock:
            persist_idle_save_minutes(minutes)
            self.idle_save_minutes = minutes

    def reconcile_idle_saves(self) -> None:
        now = time.monotonic()
        timeout_seconds = self.idle_save_minutes * 60
        for name in IDLE_SAVE_VMS:
            state = str(machine_info(name)["state"])
            previous_state = self.last_vm_states.get(name)
            self.last_vm_states[name] = state
            if state not in {"running", "paused"}:
                continue
            if previous_state not in {None, "running", "paused"}:
                self.last_control_activity[name] = now

            if state == "running":
                if name not in self.rdp_ports:
                    self.rdp_ports[name] = rdp_port_for_machine(name)
                rdp_port = self.rdp_ports[name]
                if rdp_port is not None and has_established_connection(rdp_port):
                    self.last_control_activity[name] = now
                    continue

            if timeout_seconds == 0:
                continue
            inactive_seconds = now - self.last_control_activity[name]
            if inactive_seconds < timeout_seconds:
                continue
            run_vbox("controlvm", name, "savestate", timeout=30)
            self.last_control_activity[name] = now
            self.last_vm_states[name] = "saved"
            print(
                f"vm-agent: saved {name} after {self.idle_save_minutes} inactive minutes",
                flush=True,
            )

    def server_bind(self) -> None:
        socket_path = Path(self.server_address)
        socket_path.parent.mkdir(parents=True, exist_ok=True)
        if socket_path.exists():
            socket_path.unlink()
        super().server_bind()
        os.chmod(socket_path, 0o660)

    def ibmc_nodes(self) -> list[dict[str, str]]:
        nodes = [{"node": "Node-01", "vm": ibmc.VM_NAME}]
        for slot in lab_ibmc_slots():
            nodes.append({"node": slot["name"], "vm": slot["vm"]})
        return nodes

    def ibmc_for(self, node: str) -> tuple[str, IBMC] | tuple[None, None]:
        if node in ("", "Node-01"):
            return "Node-01", self.ibmc
        if not re.fullmatch(r"Node-[0-9]{2,3}", node):
            return None, None
        slot = next((entry for entry in lab_ibmc_slots() if entry["name"] == node), None)
        if slot is None:
            return None, None
        with self.guest_ibmcs_lock:
            controller = self.guest_ibmcs.get(node)
            if controller is None:
                console = self.serial_for(node)
                controller = IBMC(
                    run_vbox,
                    machine_readable_values,
                    vm_name=slot["vm"],
                    state_path=ibmc.STATE_PATH.with_name(f"ibmc-{node}.json"),
                    serial=console,
                )
                self.guest_ibmcs[node] = controller
            return node, controller

    def serial_for(self, node: str) -> SerialConsole | None:
        if node in ("", "Node-01"):
            return self.ibmc.serial
        with self.guest_serials_lock:
            console = self.guest_serials.get(node)
            if console is None:
                path = lab_guest_serial_path(node)
                if path is None:
                    return None
                console = SerialConsole(path)
                console.start()
                self.guest_serials[node] = console
                # The first open must not race the reader thread's socket connect.
                deadline = time.monotonic() + 2
                while console.connection is None and time.monotonic() < deadline:
                    time.sleep(0.05)
            return console

    def start_lab_guest_serials(self) -> None:
        for slot in read_lab_slots_raw():
            node = slot.get("name")
            if isinstance(node, str) and re.fullmatch(r"Node-[0-9]{2,3}", node) and node != "Node-01":
                try:
                    self.serial_for(node)
                except Exception as exc:
                    print(f"vm-agent: failed to attach serial for {node}: {exc}", flush=True)

    def workspace_statuses(self, vms: list[dict[str, object]]) -> dict[str, dict[str, str]]:
        win7_running = any(vm.get("name") == "win7" and vm.get("state") == "running" for vm in vms)
        now = time.monotonic()
        with self.workspace_status_lock:
            cached = self.workspace_status_cache
            if cached is not None and cached[1] == win7_running and now - cached[0] < WORKSPACE_STATUS_TTL:
                return cached[2]
        targets = ensp_switch_targets()
        statuses: dict[str, dict[str, str]] = {}
        with ThreadPoolExecutor(max_workers=max(2, len(targets) + 2)) as pool:
            kindle_future = pool.submit(probe_tcp_reachable, KINDLE_HOST, KINDLE_PORT)
            debian_future = pool.submit(probe_tcp_reachable, DEBIAN_SSH_HOST, DEBIAN_SSH_PORT, 0.3)
            switch_futures = {
                name: pool.submit(probe_ensp_switch_state, port, win7_running)
                for name, port in targets
            }
            statuses["Kindle"] = {"state": "running" if kindle_future.result() else "offline"}
            statuses["Debian"] = {"state": "running" if debian_future.result() else "offline"}
            for name, future in switch_futures.items():
                statuses[name] = {"state": future.result()}
        with self.workspace_status_lock:
            self.workspace_status_cache = (time.monotonic(), win7_running, statuses)
        return statuses

    def server_close(self) -> None:
        self.ibmc.serial.stop()
        for console in self.guest_serials.values():
            console.stop()
        socket_path = Path(self.server_address)
        super().server_close()
        if socket_path.exists():
            socket_path.unlink()

    def service_actions(self) -> None:
        if time.monotonic() < self.next_lifecycle_check:
            return
        if not self.control_lock.acquire(blocking=False):
            return
        threading.Thread(target=self.reconcile_in_background, daemon=True).start()

    def reconcile_in_background(self) -> None:
        try:
            try:
                reconcile_vm_lifecycle()
            except Exception as exc:
                print(f"vm-agent: lifecycle reconciliation failed: {exc}", flush=True)
            try:
                self.reconcile_idle_saves()
            except Exception as exc:
                print(f"vm-agent: idle-save reconciliation failed: {exc}", flush=True)
        finally:
            self.next_lifecycle_check = time.monotonic() + 5
            self.control_lock.release()


class Handler(BaseHTTPRequestHandler):
    server_version = "new-api-vm-agent/1"

    def log_message(self, fmt: str, *args: object) -> None:
        if "/v1/ibmc/serial" not in self.path:
            print(f"vm-agent: {fmt % args}", flush=True)

    def send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        try:
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass  # A client can disconnect while VirtualBox is still working.

    def read_json(self) -> dict[str, object]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("invalid content length") from exc
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ValueError("invalid request body size")
        payload = json.loads(self.rfile.read(length))
        if not isinstance(payload, dict):
            raise ValueError("request body must be an object")
        return payload

    def route(self) -> tuple[str | None, str | None]:
        parts = [unquote(part) for part in urlparse(self.path).path.split("/") if part]
        if len(parts) < 3 or parts[:2] != ["v1", "vms"]:
            return None, None
        name = parts[2]
        if name not in ALLOWED_VMS and name not in managed_vm_names():
            return None, None
        suffix = "/".join(parts[3:])
        return name, suffix

    def do_GET(self) -> None:
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/v1/ibmc":
                query = parse_qs(parsed.query)
                node = query.get("node", [""])[0]
                resolved_node, controller = self.server.ibmc_for(node)
                if controller is None:
                    self.send_json(404, {"error": "unknown iBMC node"})
                    return
                status = controller.status()
                status["node"] = resolved_node
                status["nodes"] = self.server.ibmc_nodes()
                self.send_json(200, status)
                return
            if parsed.path == "/v1/ibmc/serial":
                query = parse_qs(parsed.query)
                console = self.server.serial_for(query.get("node", [""])[0])
                if console is None:
                    self.send_json(404, {"error": "unknown serial node"})
                    return
                self.send_json(200, console.request({"operation": "read", "session": query.get("session", [""])[0], "cursor": int(query.get("cursor", ["0"])[0])}))
                return
            if urlparse(self.path).path == "/v1/settings":
                self.send_json(
                    200, {"idle_save_minutes": self.server.idle_save_minutes}
                )
                return
            if urlparse(self.path).path == "/v1/vms":
                vms = [machine_info(name) for name in managed_vm_names()]
                self.send_json(200, {"vms": vms, "workspaces": self.server.workspace_statuses(vms)})
                return

            name, suffix = self.route()
            if name is None or suffix != "screenshot":
                self.send_json(404, {"error": "not found"})
                return
            if machine_info(name)["state"] != "running":
                self.send_json(409, {"error": "virtual machine is not running"})
                return

            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as screenshot:
                path = screenshot.name
            try:
                run_vbox("controlvm", name, "screenshotpng", path, timeout=10)
                body = Path(path).read_bytes()
                self.server.mark_control_activity(name)
            finally:
                Path(path).unlink(missing_ok=True)
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            self.send_json(502, {"error": str(exc)})

    def do_PUT(self) -> None:
        try:
            if urlparse(self.path).path != "/v1/settings":
                self.send_json(404, {"error": "not found"})
                return
            payload = self.read_json()
            self.server.update_idle_save_minutes(payload.get("idle_save_minutes"))
            self.send_json(
                200, {"idle_save_minutes": self.server.idle_save_minutes}
            )
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
        except Exception as exc:
            self.send_json(502, {"error": str(exc)})

    def do_POST(self) -> None:
        try:
            path = urlparse(self.path).path
            if path == "/v1/ibmc/action":
                payload = self.read_json()
                node = payload.pop("node", "")
                if node is None:
                    node = ""
                if not isinstance(node, str):
                    raise ValueError("Invalid iBMC node")
                resolved_node, controller = self.server.ibmc_for(node)
                if controller is None:
                    self.send_json(404, {"error": "unknown iBMC node"})
                    return
                if not self.server.control_lock.acquire(timeout=10):
                    self.send_json(409, {"error": "VirtualBox is busy"})
                    return
                try:
                    if payload.get("action") == "start" and resolved_node != "Node-01":
                        self.server.serial_for(resolved_node)
                    self.send_json(200, controller.action(payload))
                finally:
                    self.server.control_lock.release()
                return
            if path == "/v1/ibmc/serial":
                payload = self.read_json()
                node = payload.get("node", "")
                console = self.server.serial_for(node if isinstance(node, str) else "")
                if console is None:
                    self.send_json(404, {"error": "unknown serial node"})
                    return
                payload.pop("node", None)
                if payload.get("operation") == "open":
                    result = console.open(auto_login=payload.get("auto_login") is True)
                else:
                    result = console.request(payload)
                self.send_json(200, result)
                return
            name, suffix = self.route()
            if name is None:
                self.send_json(404, {"error": "not found"})
                return
            payload = self.read_json()

            if suffix == "action":
                if not self.server.control_lock.acquire(timeout=10):
                    self.send_json(409, {"error": "VirtualBox is busy; refresh the machine state before retrying"})
                    return
                try:
                    self.handle_action(name, payload)
                finally:
                    self.server.control_lock.release()
                return
            if suffix == "keyboard":
                self.handle_keyboard(name, payload)
                return
            if suffix == "mouse":
                self.handle_mouse(name, payload)
                return
            self.send_json(404, {"error": "not found"})
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
        except subprocess.TimeoutExpired:
            self.send_json(504, {"error": "VirtualBox command timed out"})
        except Exception as exc:
            self.send_json(502, {"error": str(exc)})

    def handle_action(self, name: str, payload: dict[str, object]) -> None:
        action = payload.get("action")
        info = machine_info(name)
        state = info["state"]
        if action == "start":
            if state not in {"powered_off", "saved", "aborted"}:
                raise ValueError("virtual machine cannot be started from its current state")
            if name == COMPANION_VM and machine_info(WINDOWS_VM)["state"] in ACTIVE_STATES:
                raise ValueError("fnOS cannot start while Win11 is active")
            companion_saved = False
            if name == WINDOWS_VM:
                companion_saved = save_companion_for_windows()
            try:
                if name == WINDOWS_VM:
                    configure_windows_resources(info)
                for slot in read_lab_slots_raw():
                    if slot.get("vm") == name and isinstance(slot.get("name"), str):
                        try:
                            self.server.serial_for(slot["name"])
                        except Exception as exc:
                            print(f"vm-agent: failed to attach serial for {name}: {exc}", flush=True)
                        break
                start_machine(name)
                self.server.mark_control_activity(name)
            except Exception:
                if name == WINDOWS_VM and companion_saved:
                    restore_companion_after_windows()
                raise
        elif action == "shutdown":
            if state != "running":
                raise ValueError("virtual machine is not running")
            run_vbox("controlvm", name, "acpipowerbutton")
        elif action == "save":
            if state not in {"running", "paused"}:
                raise ValueError("virtual machine cannot save its current state")
            run_vbox("controlvm", name, "savestate", timeout=30)
        elif action == "poweroff":
            if state not in {"running", "paused"}:
                raise ValueError("virtual machine is not running")
            run_vbox("controlvm", name, "poweroff", timeout=30)
        else:
            raise ValueError("unsupported action")
        self.send_json(200, {"vm": machine_info(name)})

    def handle_keyboard(self, name: str, payload: dict[str, object]) -> None:
        if machine_info(name)["state"] != "running":
            raise ValueError("virtual machine is not running")
        text = payload.get("text")
        scancodes = payload.get("scancodes")
        if isinstance(text, str):
            if not text or len(text) > 256 or any(ord(char) < 32 for char in text):
                raise ValueError("invalid keyboard text")
            run_vbox("controlvm", name, "keyboardputstring", text)
        elif isinstance(scancodes, list):
            if not scancodes or len(scancodes) > 32:
                raise ValueError("invalid scancode sequence")
            codes: list[str] = []
            for value in scancodes:
                if not isinstance(value, int) or value < 0 or value > 255:
                    raise ValueError("invalid scancode")
                codes.append(f"{value:02x}")
            run_vbox("controlvm", name, "keyboardputscancode", *codes)
        else:
            raise ValueError("keyboard input is required")
        self.server.mark_control_activity(name)
        self.send_json(200, {"success": True})

    def handle_mouse(self, name: str, payload: dict[str, object]) -> None:
        x = payload.get("x")
        y = payload.get("y")
        buttons = payload.get("buttons", 0)
        if not isinstance(x, int) or not isinstance(y, int):
            raise ValueError("mouse coordinates must be integers")
        if not isinstance(buttons, int) or buttons < 0 or buttons > 7:
            raise ValueError("invalid mouse buttons")
        if x < 0 or x > 65535 or y < 0 or y > 65535:
            raise ValueError("mouse coordinates are out of range")
        if machine_info(name)["state"] != "running":
            raise ValueError("virtual machine is not running")

        # SDK initialization can hang along with VBoxSVC. Bound its lifetime so
        # a console request cannot block the agent's startup or leak COM sessions.
        with VBOX_COMMAND_LOCK:
            ensure_managed_service()
            completed = subprocess.run(
                [sys.executable, str(Path(__file__).with_name("vm_mouse.py")), name, str(x), str(y), str(buttons)],
                capture_output=True,
                text=True,
                timeout=10,
            )
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.strip() or "VirtualBox mouse input failed")
        self.server.mark_control_activity(name)
        self.send_json(200, {"success": True})


def main() -> None:
    if not ALLOWED_VMS:
        raise SystemExit("VM_AGENT_VMS must contain at least one VM")
    with UnixHTTPServer(SOCKET_PATH, Handler) as server:
        server.start_lab_guest_serials()
        print(f"vm-agent: listening on {SOCKET_PATH} for {', '.join(ALLOWED_VMS)}", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
