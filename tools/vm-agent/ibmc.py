"""Virtual iBMC training controller. Only allowlisted lab VMs are managed.

No IPMI emulation or physical sensor measurements are claimed. Serial traffic
is private, bounded, ephemeral, and never written to event logs.
"""
from __future__ import annotations

import base64
import binascii
import json
import os
import re
import secrets
import socket
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

VM_NAME = "openEuler"
SERIAL_PATH = Path(os.environ.get("IBMC_SERIAL_PATH", "/mnt/data/VM/openEuler/serial.sock"))
MEDIA_ROOT = Path(os.environ.get("IBMC_MEDIA_ROOT", "/mnt/data/ISO"))
STATE_PATH = Path(os.environ.get("IBMC_STATE_PATH", "/var/lib/new-api-vm-agent/ibmc.json"))
SERIAL_LOGIN_FILE = Path(os.environ.get("IBMC_SERIAL_LOGIN_FILE", "/var/lib/new-api-vm-agent/serial-login.json"))
SERIAL_LIMIT = 256 * 1024
SERIAL_LEASE_SECONDS = 120


class SerialConsole:
    def __init__(self, path=None):
        # Each lab guest has its own VirtualBox COM1 socket; the default is openEuler's.
        self.path = Path(path) if path else SERIAL_PATH
        self.lock = threading.RLock()
        self.connection = None
        self.token = ""
        self.buffer = bytearray()
        self.offset = 0
        self.last_poll = 0.0
        self.stopped = threading.Event()
        self.waiting_login = False
        self.prompt_tail = b""
        self.login_phase = 0
        self.login_deadline = 0.0
        self.login_password = ""
        self.login_username = ""

    def start(self):
        # Always drain COM1: an unconnected UART can stall Linux boot output.
        threading.Thread(target=self.receive, daemon=True).start()

    def stop(self):
        self.stopped.set()
        with self.lock:
            if self.connection:
                try:
                    self.connection.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
            self.close()

    def open(self, auto_login=False):
        with self.lock:
            if self.token and time.monotonic() - self.last_poll < SERIAL_LEASE_SECONDS:
                raise ValueError("Serial console is in use; disconnect the other console first")
            if self.connection is None:
                raise ValueError("Serial console is unavailable; start the VM and check COM1 configuration")
            self.token = secrets.token_urlsafe(32)
            self.last_poll = time.monotonic()
            if auto_login:
                try:
                    info = SERIAL_LOGIN_FILE.stat()
                    if info.st_uid != os.geteuid() or info.st_mode & 0o077:
                        raise ValueError("Serial login credentials must be private")
                    credentials = json.loads(SERIAL_LOGIN_FILE.read_text())
                    username, password = credentials["username"], credentials["password"]
                    if not isinstance(username, str) or not isinstance(password, str) or not username or len(username) > 128 or len(password) > 1024 or any(c in username + password for c in "\r\n\x00"):
                        raise ValueError("Invalid serial login credentials")
                    self.login_username = username
                    self.login_password = password
                    self.login_phase = -1
                    self.login_deadline = time.monotonic() + 15
                    if self.waiting_login:
                        self.connection.sendall(username.encode() + b"\r")
                        self.login_phase = 1
                        self.prompt_tail = b""
                        self.waiting_login = False
                except (OSError, ValueError, KeyError, TypeError):
                    self.login_phase = 0
                    self.login_password = ""
            return {"session": self.token, "cursor": self.offset}

    def close(self):
        with self.lock:
            self.token = ""
            self.login_phase = 0
            self.login_password = ""
            self.prompt_tail = b""
            self.buffer.clear()
            self.offset = 0

    def receive(self):
        while not self.stopped.is_set():
            connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            connection.settimeout(1)
            try:
                connection.connect(str(self.path))
                with self.lock:
                    self.connection = connection
                while True:
                    with self.lock:
                        if self.token and time.monotonic() - self.last_poll > SERIAL_LEASE_SECONDS:
                            self.close()
                    try:
                        data = connection.recv(16384)
                    except socket.timeout:
                        continue
                    if not data:
                        break
                    self.accept_output(data)
            except OSError:
                pass
            finally:
                with self.lock:
                    self.connection = None
                    self.close()
                connection.close()
            self.stopped.wait(1)

    def accept_output(self, data):
        """Preserve serial bytes and recognize only a fresh, explicit login prompt.

        Automatic login is opt-in per lease, sends at most one credential pair,
        and never sends Enter at an unknown shell or retries a failed password.
        """
        with self.lock:
            self.buffer.extend(data)
            if len(self.buffer) > SERIAL_LIMIT:
                removed = len(self.buffer) - SERIAL_LIMIT
                del self.buffer[:removed]
                self.offset += removed
            self.prompt_tail = (self.prompt_tail + data)[-2048:]
            clean = re.sub(rb"\x1b\[[0-?]*[ -/]*[@-~]", b"", self.prompt_tail).replace(b"\r", b"\n")
            self.waiting_login = bool(re.search(rb"(?:^|\n)[A-Za-z0-9_.-]+ login: *$", clean))
            if self.login_phase and time.monotonic() > self.login_deadline:
                self.login_phase = 0
                self.login_password = ""
            if self.login_phase == -1 and self.waiting_login:
                self.connection.sendall(self.login_username.encode() + b"\r")
                self.login_phase = 1
                self.prompt_tail = b""
                self.waiting_login = False
            elif self.login_phase == 1 and re.search(rb"(?:^|\n)Password: *$", clean):
                self.connection.sendall(self.login_password.encode() + b"\r")
                self.login_password = ""
                self.login_phase = 2
                self.prompt_tail = b""
            elif self.login_phase == 2 and self.waiting_login:
                self.login_phase = 0

    def request(self, payload):
        with self.lock:
            if not self.token or not secrets.compare_digest(str(payload.get("session", "")), self.token):
                raise ValueError("Serial session expired or invalid")
            self.last_poll = time.monotonic()
            operation = payload.get("operation")
            if operation == "read":
                cursor = payload.get("cursor", 0)
                if isinstance(cursor, bool) or not isinstance(cursor, int) or cursor < 0 or cursor > self.offset + len(self.buffer):
                    raise ValueError("Invalid serial cursor")
                start = max(cursor - self.offset, 0)
                data = bytes(self.buffer[start:start + 32768])
                return {"data": base64.b64encode(data).decode(), "cursor": self.offset + start + len(data), "truncated": cursor < self.offset}
            if operation == "write":
                encoded = payload.get("data")
                if not isinstance(encoded, str) or not encoded or len(encoded) > 5500:
                    raise ValueError("Invalid serial input size")
                try:
                    data = base64.b64decode(encoded, validate=True)
                except (ValueError, binascii.Error) as exc:
                    raise ValueError("Invalid serial input") from exc
                if not data or len(data) > 4096:
                    raise ValueError("Invalid serial input size")
                self.waiting_login = False
                if self.login_phase != -1 or data not in (b"\r", b"\r\n"):
                    self.login_phase = 0
                    self.login_password = ""
                self.prompt_tail = b""
                self.connection.sendall(data)
                return {"success": True}
            if operation == "close":
                self.close()
                return {"success": True}
            raise ValueError("Invalid serial operation")


class IBMC:
    def __init__(self, run_vbox, machine_values, vm_name=None, state_path=None, serial=None):
        self.run = run_vbox
        self.values = machine_values
        self.vm_name = vm_name or VM_NAME
        self.state_path = Path(state_path) if state_path else STATE_PATH
        self.lock = threading.RLock()
        self.serial = SerialConsole() if serial is None and vm_name is None else serial
        self.events = deque(maxlen=200)
        self.uid = False
        self.alarm = "normal"
        self.last_state = None
        try:
            state = json.loads(self.state_path.read_text())
            self.events.extend(state.get("events", [])[-200:])
            self.uid = bool(state.get("uid", False))
            self.alarm = state.get("alarm", "normal")
        except (OSError, ValueError, TypeError):
            pass

    def event(self, action, success=True, detail=""):
        self.events.appendleft({"id": secrets.token_hex(8), "time": int(time.time()), "action": action, "success": success, "detail": detail})
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.state_path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"events": list(self.events), "uid": self.uid, "alarm": self.alarm}))
        temporary.chmod(0o600)
        temporary.replace(self.state_path)

    def media(self):
        if not MEDIA_ROOT.exists():
            return []
        root = MEDIA_ROOT.resolve()
        return [{"id": p.name, "size": p.stat().st_size} for p in sorted(root.glob("*.iso"))
                if p.is_file() and p.resolve().parent == root]

    def status(self):
        with self.lock:
            v = self.values(self.vm_name)
            state = v.get("VMState", "unknown")
            if self.last_state is not None and self.last_state != state:
                self.event("power_state", detail=state)
            self.last_state = state
            snapshots = [{"id": value, "name": v.get(key.replace("SnapshotUUID", "SnapshotName"), "")}
                         for key, value in v.items() if key.startswith("SnapshotUUID")]
            return {
                "name": self.vm_name, "simulation": True, "state": state,
                "uuid": v.get("UUID", ""), "memory_mb": int(v.get("memory", "0")),
                "cpu_count": int(v.get("cpus", "0")), "firmware": v.get("firmware", "BIOS"),
                "os": "openEuler 24.03 LTS-SP4", "state_changed": v.get("VMStateChangeTime", ""),
                "boot": [v.get(f"boot{i}", "none") for i in range(1, 5)],
                "nic": v.get("nic1", ""), "mac": v.get("macaddress1", ""),
                "serial": v.get("uartmode1", "").startswith("server,"),
                "serial_busy": bool(self.serial and self.serial.token), "uid": self.uid, "alarm": self.alarm,
                "media": self.media(), "mounted_media": Path(v.get("SATA-1-0", "none")).name,
                "snapshots": snapshots, "events": list(self.events),
                "inventory": {key: value for key, value in v.items() if key in {
                    "chipset", "firmware", "cpuprofile", "paravirtprovider", "graphicscontroller",
                    "vram", "nic1", "nictype1", "cableconnected1", "macaddress1",
                    "uart1", "uarttype1", "boot1", "boot2", "boot3", "boot4"
                }},
            }

    def action(self, payload):
        action = payload.get("action")
        allowed = {"start", "shutdown", "poweroff", "reset", "save", "pause", "resume", "boot", "mount", "eject", "snapshot", "uid", "alarm"}
        if not isinstance(action, str) or action not in allowed:
            raise ValueError("Unsupported iBMC action")
        with self.lock:
            v = self.values(self.vm_name)
            state = v.get("VMState")
            try:
                if action == "start":
                    if state not in {"poweroff", "aborted", "saved", "aborted-saved"}:
                        raise ValueError("VM cannot start in this state")
                    self.run("startvm", self.vm_name, "--type", "headless", timeout=30)
                elif action in {"shutdown", "poweroff", "reset", "save", "pause", "resume"}:
                    expected = {"resume": {"paused"}, "poweroff": {"running", "paused"}, "save": {"running", "paused"}}.get(action, {"running"})
                    if state not in expected:
                        raise ValueError("VM state does not allow this power action")
                    command = {"shutdown": "acpipowerbutton", "save": "savestate"}.get(action, action)
                    self.run("controlvm", self.vm_name, command, timeout=30)
                elif action in {"boot", "mount", "eject", "snapshot"}:
                    if state not in {"poweroff", "aborted"}:
                        raise ValueError("Shut down the VM before changing boot, media, or snapshots")
                    if action == "boot":
                        device = payload.get("device")
                        if device not in {"disk", "dvd", "net"}:
                            raise ValueError("Unsupported boot device")
                        fallback = "none" if device == "disk" else "disk"
                        self.run("modifyvm", self.vm_name, "--boot1", device, "--boot2", fallback, "--boot3", "none", "--boot4", "none")
                    elif action in {"mount", "eject"}:
                        medium = "none"
                        if action == "mount":
                            medium_id = payload.get("media")
                            available = {item["id"] for item in self.media()}
                            if not isinstance(medium_id, str) or medium_id not in available:
                                raise ValueError("Select an ISO from the approved media library")
                            medium = str(MEDIA_ROOT.resolve() / medium_id)
                        self.run("storageattach", self.vm_name, "--storagectl", "SATA", "--port", "1", "--device", "0", "--type", "dvddrive", "--medium", medium)
                    else:
                        name = "ibmc-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
                        self.run("snapshot", self.vm_name, "take", name, timeout=30)
                elif action == "uid":
                    if not isinstance(payload.get("enabled"), bool):
                        raise ValueError("UID enabled must be boolean")
                    self.uid = payload["enabled"]
                elif action == "alarm":
                    if payload.get("severity") not in {"normal", "warning", "critical"}:
                        raise ValueError("Unsupported alarm severity")
                    self.alarm = payload["severity"]
                self.event(action, detail=str(payload.get("device", payload.get("severity", payload.get("media", "")))))
            except Exception:
                # Never log arbitrary input or terminal bytes.
                self.event(action, success=False)
                raise
            return {"success": True}
