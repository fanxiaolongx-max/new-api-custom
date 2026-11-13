# fnOS automatic network recovery

The host ASIX USB Ethernet adapter has disconnected and re-enumerated while
fnOS was running. The physical link recovered but the VirtualBox bridge stopped
passing traffic. Reattaching the bridge and cycling fnOS's `enp0s3` restored LAN
connectivity; this does not establish which action alone was sufficient.

Two independent systemd timers check every 30 seconds. Each requires three
consecutive failures and allows at most one recovery per five minutes:

- **Host:** `feiniu-network-guard.timer` pings the router and fnOS through the
  configured bridge. If the host can reach the router but cannot reach fnOS,
  it detaches and reattaches VirtualBox NIC 1. Saved/paused VMs, manually
  disconnected cables, and the first three minutes after start/resume are skipped.
  It also follows the host's lowest-metric default route through the configured
  LAN gateway, selecting the wired `enx000ec675333b` or wireless `wlp0s20f3`.
  A bridge change requires the new interface to have carrier and reach the router.
  VPNs, other Wi-Fi subnets, and intentionally disconnected VM cables are ignored.
  Bridge switching preserves guest NIC 1 and its MAC `08:00:27:CB:7D:36`.
- **Guest:** `feiniu-guest-network-guard.timer` pings the LAN router and cycles
  `enp0s3` when it remains unreachable. It runs locally even when SSH is down.
  It skips the first three minutes after boot. A router outage can also trigger
  an interface cycle, so recovery is rate limited.

Neither timer restarts the VM, host network, or NAS services. Recovery may briefly
interrupt existing network connections. These guards repair network state;
they cannot repair a failing USB adapter/cable or a fully hung guest kernel.

## Installation

On the host, install `feiniu-network-guard.service` and
`feiniu-network-guard.timer` in `/etc/systemd/system/`, run
`systemctl daemon-reload`, then `systemctl enable --now feiniu-network-guard.timer`.
The unit uses the script in this checkout and runs as the VirtualBox owner `dragon`.
The boot service and dashboard agent also run bridge preparation before starting
or restoring fnOS, so an absent wired adapter does not prevent Wi-Fi startup.

Inside fnOS, install `feiniu-guest-network-guard.sh` as the executable
`/usr/local/sbin/feiniu-guest-network-guard`, install the corresponding guest
service and timer in `/etc/systemd/system/`, run `systemctl daemon-reload`, then
`systemctl enable --now feiniu-guest-network-guard.timer`.

Current LAN configuration: fnOS `192.168.100.124`, gateway `192.168.100.1`, guest
NIC `enp0s3`. If these change, update the guest script and the host unit's
`FEINIU_IP`/`FEINIU_GATEWAY` environment overrides. Prefer a DHCP reservation
for the NAS. Host bridge interface is read from the VM configuration.

Wireless bridging has been verified with fnOS at `192.168.100.124:5666`. This
verification does not establish a persistent static IP: the guest previously
used DHCP. To guarantee the same IP, set fnOS's existing IPv4 connection to
static `192.168.100.124/24`, gateway/DNS `192.168.100.1`, and reserve/exclude that
address in the router's DHCP configuration. Do not assign the NAS address to
either of the host's physical interfaces. These settings assume wired and
wireless remain on the same `192.168.100.0/24` LAN. Guest configuration requires
an authenticated fnOS administrator/root session.

## Status and logs

On the host:

```sh
systemctl status feiniu-network-guard.timer
journalctl -u feiniu-network-guard.service
```

Inside fnOS:

```sh
systemctl status feiniu-guest-network-guard.timer
journalctl -u feiniu-guest-network-guard.service
```

To stop automatic recovery, disable the corresponding timer with
`systemctl disable --now <timer-name>`. A successful check leaves its oneshot
service inactive; the timer should remain active (waiting).
