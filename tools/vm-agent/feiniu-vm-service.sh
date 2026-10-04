#!/bin/sh

set -eu

vm_name=feiniu
vm_config=/mnt/data/VM/feiniu/feiniu.vbox

if [ ! -f "$vm_config" ]; then
  echo "Virtual machine config is unavailable: $vm_config" >&2
  exit 1
fi

vm_state=$(
  /usr/bin/VBoxManage showvminfo "$vm_name" --machinereadable |
    /usr/bin/sed -n 's/^VMState="\(.*\)"/\1/p'
)

case "${1:-}" in
  start)
    if [ "$vm_state" != "running" ]; then
      /usr/bin/VBoxManage startvm "$vm_name" --type headless
    fi
    ;;
  stop)
    if [ "$vm_state" = "running" ] || [ "$vm_state" = "paused" ]; then
      /usr/bin/VBoxManage controlvm "$vm_name" savestate
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop}" >&2
    exit 2
    ;;
esac
