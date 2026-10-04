#!/usr/bin/env python3
"""Restricted host-side VirtualBox agent for the dashboard.

The service listens on a Unix socket only. VM names and actions are validated
against fixed allowlists before invoking VBoxManage or the local VirtualBox SDK.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import tempfile
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from vboxapi import VirtualBoxManager


SOCKET_PATH = os.environ.get("VM_AGENT_SOCKET", "/run/new-api-vm-agent/agent.sock")
VBOX_MANAGE = os.environ.get("VBOX_MANAGE", "/usr/bin/VBoxManage")
ALLOWED_VMS = tuple(
    name.strip()
    for name in os.environ.get("VM_AGENT_VMS", "winXP,win7,win11,feiniu").split(",")
    if name.strip()
)
MAX_BODY_BYTES = 16 * 1024
WINDOWS_VM = os.environ.get("VM_AGENT_WINDOWS_VM", "win11")
COMPANION_VM = os.environ.get("VM_AGENT_COMPANION_VM", "feiniu")
WINDOWS_VM_CPUS = int(os.environ.get("VM_AGENT_WINDOWS_CPUS", "4"))
WINDOWS_VM_MEMORY_MB = int(os.environ.get("VM_AGENT_WINDOWS_MEMORY_MB", "8192"))
LIFECYCLE_MARKER = Path(
    os.environ.get(
        "VM_AGENT_LIFECYCLE_MARKER",
        "/run/new-api-vm-agent/feiniu-saved-for-win11",
    )
)
ACTIVE_STATES = {"running", "paused", "starting", "stopping", "saving"}

STATE_NAMES = {
    "poweroff": "powered_off",
    "saved": "saved",
    "running": "running",
    "paused": "paused",
    "aborted": "aborted",
    "gurumeditation": "error",
}


def run_vbox(*args: str, timeout: int = 20) -> str:
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


def machine_info(name: str) -> dict[str, object]:
    output = run_vbox("showvminfo", name, "--machinereadable")
    values: dict[str, str] = {}
    for line in output.splitlines():
        key, separator, value = line.partition("=")
        if not separator:
            continue
        values[key] = value.strip().strip('"')

    raw_state = values.get("VMState", "unknown").lower()
    return {
        "name": name,
        "state": STATE_NAMES.get(raw_state, raw_state),
        "os_type": values.get("ostype", ""),
        "memory_mb": int(values.get("memory", "0")),
        "cpu_count": int(values.get("cpus", "0")),
    }


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
        run_vbox("startvm", COMPANION_VM, "--type", "headless", timeout=30)
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


class UnixHTTPServer(HTTPServer):
    address_family = socket.AF_UNIX

    def __init__(self, socket_path: str, handler: type[BaseHTTPRequestHandler]) -> None:
        self.vbox_manager = VirtualBoxManager(None, None)
        self.next_lifecycle_check = time.monotonic()
        super().__init__(socket_path, handler)

    def server_bind(self) -> None:
        socket_path = Path(self.server_address)
        socket_path.parent.mkdir(parents=True, exist_ok=True)
        if socket_path.exists():
            socket_path.unlink()
        super().server_bind()
        os.chmod(socket_path, 0o660)

    def server_close(self) -> None:
        socket_path = Path(self.server_address)
        super().server_close()
        self.vbox_manager.deinit()
        if socket_path.exists():
            socket_path.unlink()

    def service_actions(self) -> None:
        if time.monotonic() < self.next_lifecycle_check:
            return
        self.next_lifecycle_check = time.monotonic() + 2
        try:
            reconcile_vm_lifecycle()
        except Exception as exc:
            print(f"vm-agent: lifecycle reconciliation failed: {exc}", flush=True)


class Handler(BaseHTTPRequestHandler):
    server_version = "new-api-vm-agent/1"

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"vm-agent: {fmt % args}", flush=True)

    def send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

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
        if name not in ALLOWED_VMS:
            return None, None
        suffix = "/".join(parts[3:])
        return name, suffix

    def do_GET(self) -> None:
        try:
            if urlparse(self.path).path == "/v1/vms":
                reconcile_vm_lifecycle()
                self.send_json(200, {"vms": [machine_info(name) for name in ALLOWED_VMS]})
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

    def do_POST(self) -> None:
        try:
            name, suffix = self.route()
            if name is None:
                self.send_json(404, {"error": "not found"})
                return
            payload = self.read_json()

            if suffix == "action":
                self.handle_action(name, payload)
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
                run_vbox("startvm", name, "--type", "headless", timeout=30)
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
        reconcile_vm_lifecycle()
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

        session = None
        try:
            manager = self.server.vbox_manager
            machine = manager.getVirtualBox().findMachine(name)
            session = manager.openMachineSession(machine, fPermitSharing=True)
            session.console.mouse.putMouseEventAbsolute(x, y, 0, 0, buttons)
        finally:
            if session is not None:
                manager.closeMachineSession(session)
        self.send_json(200, {"success": True})


def main() -> None:
    if not ALLOWED_VMS:
        raise SystemExit("VM_AGENT_VMS must contain at least one VM")
    with UnixHTTPServer(SOCKET_PATH, Handler) as server:
        print(f"vm-agent: listening on {SOCKET_PATH} for {', '.join(ALLOWED_VMS)}", flush=True)
        reconcile_vm_lifecycle()
        server.serve_forever()


if __name__ == "__main__":
    main()
