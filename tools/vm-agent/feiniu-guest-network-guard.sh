#!/bin/sh
# Install inside fnOS; it must keep working when SSH/the bridge is unreachable.
set -eu

interface=enp0s3
gateway=192.168.100.1
state_dir=/run/feiniu-guest-network-guard
mkdir -p "$state_dir"
failures=0
last_recovery=0
if [ -f "$state_dir/state" ]; then
  read -r failures last_recovery < "$state_dir/state"
fi
now=$(cut -d. -f1 /proc/uptime)

if [ "$now" -lt 180 ] || ping -n -c 2 -W 2 "$gateway" >/dev/null 2>&1; then
  printf '0 %s\n' "$last_recovery" > "$state_dir/state"
  exit 0
fi

failures=$((failures + 1))
if [ "$failures" -lt 3 ] || { [ "$last_recovery" -gt 0 ] && [ "$((now - last_recovery))" -lt 300 ]; }; then
  printf '%s %s\n' "$failures" "$last_recovery" > "$state_dir/state"
  exit 0
fi

printf '0 %s\n' "$now" > "$state_dir/state"
echo "Gateway unreachable for 3 checks; restarting $interface"
# Always try to bring it back up, including on timeout/termination.
trap 'ip link set "$interface" up' EXIT
ip link set "$interface" down
ip link set "$interface" up
trap - EXIT
if ping -n -c 2 -W 2 "$gateway" >/dev/null 2>&1; then
  echo 'Gateway connectivity recovered'
else
  echo 'Gateway still unreachable; retry allowed in 5 minutes'
fi
