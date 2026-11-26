# Virtual iBMC training panel

The DragonAPI overview's **Remote workspaces → Virtual iBMC** entry manages the
`openEuler` VirtualBox guest. This is an application-level training simulator,
not Huawei firmware, and not an IPMI or Redfish endpoint.

## Implemented operations

- COM1 serial login at 115200 8N1, fixed 80×24 terminal, binary-safe input/output.
  Serial access does not depend on guest networking or SSH.
- VirtualBox display, keyboard and mouse via the existing KVM console; a separate
  existing Guacamole SSH connection remains available.
- Start, ACPI shutdown, forced power off, reset, save, pause and resume.
- Persistent disk/DVD/PXE boot order with disk fallback for DVD/PXE.
- Mount/eject approved local ISO images and create/list VM snapshots while off.
- VM inventory, JSON diagnostic export, and the latest 200 management events.
- Explicitly simulated locator LED and alarm severity for training exercises.

Physical temperature/fan/PSU/RAID sensors, BIOS/BMC firmware flashing, hardware
watchdogs, BMC accounts, IPMI and Redfish are **not emulated**. Guest and host
resource measurements are not fabricated. PXE requires a separately configured
boot server/network; selecting it alone does not provision one. Snapshot restore
remains a host administration operation.

## Host configuration

The existing `new-api-vm-agent.service` loads `tools/vm-agent/ibmc.py`. No new
public listener, guest agent, or extra virtual machine is needed. Paths can be
set through the unit environment:

- `IBMC_SERIAL_PATH=/mnt/data/VM/openEuler/serial.sock`
- `IBMC_MEDIA_ROOT=/mnt/data/ISO`
- `IBMC_STATE_PATH=/var/lib/new-api-vm-agent/ibmc.json`

The VM must be shut down before configuring its UART:

```sh
VBoxManage modifyvm openEuler --uart1 0x3f8 4 \
  --uartmode1 server /mnt/data/VM/openEuler/serial.sock
```

The guest kernel needs `console=ttyS0,115200n8` and a running
`serial-getty@ttyS0.service`; both are configured in the deployed openEuler guest.
Start the HTTP agent before booting the guest. It continuously drains COM1 to
avoid a full UART delaying kernel output. Restarting the HTTP agent reconnects
the UART automatically without restarting VBoxSVC or the guest.

Only regular `*.iso` files in the approved media directory are listed. Symlinks
outside that directory, arbitrary paths and remote URLs are rejected. The
existing SATA controller's port 1 is the virtual DVD drive. Media and boot
changes require a powered-off/aborted guest; saved state must first be resumed
and shut down. The original `clean-install` snapshot predates the interactive
UART setting: after restoring it from the host, reapply the command above.

## Access and privacy

All `/api/system/ibmc` routes require the highest DragonAPI administrator role.
Serial routes additionally require a current dashboard login session; personal
API keys cannot access terminal traffic. Every read/write checks authentication
again. Serial traffic uses a separate per-administrator rate limit (1200 requests
per minute), so output polling does not exhaust the dashboard API allowance.
The serial lease token travels in a header or POST body, not the browser
URL, and is never logged by the host agent. Request bodies are not recorded by
the administrative audit middleware. Serial write requests explicitly suppress
per-keystroke administrative audit entries.

Only one serial session may be attached. Its lease expires after 120 seconds
without polling. COM1 output is held only in a bounded 256 KiB memory buffer,
cleared on disconnect/lease expiration. No terminal recording is saved to disk.
The web terminal stops polling and releases its lease when the tab/panel closes.
The backend connection remains open to drain the UART.

As with a physical serial console, disconnecting the browser does **not** log
out the guest shell. Type `exit` before disconnecting. Connecting never sends an
automatic Enter, which could execute a partially typed command. Power controls
that can interrupt sessions and offline configuration changes require UI
confirmation. Event logs record operation names/results, never terminal input.

## Validation

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tools/vm-agent -p 'test_*.py'
```

Frontend regression tests are in the overview's `__tests__/ibmc-*.test.tsx`.
Go controller tests check serial session requirements and action validation.

The Dragon Lab OS serial tab may explicitly request automatic login. The agent
loads its existing OS username/password from a private owner-only file specified
by `IBMC_SERIAL_LOGIN_FILE` (default `/var/lib/new-api-vm-agent/serial-login.json`).
It recognizes an explicit getty login prompt and its following password prompt,
sends at most one credential pair, and does not retry a failed password or type
credentials into an existing shell. A silent terminal can be awakened with the
explicit Send Enter button. The separate management terminal logs into the
independent iBMC SSH simulator; it is not the physical COM1 login screen.
