#!/bin/sh
set -eu

threshold="${VM_MEMORY_GUARD_THRESHOLD:-94}"
interval="${VM_MEMORY_GUARD_INTERVAL_SECONDS:-5}"

memory_usage_percent() {
  awk '
    /^(MemTotal|MemFree|Buffers|Cached|SReclaimable):/ {
      value[$1] = $2
    }
    END {
      total = value["MemTotal:"]
      used = total - value["MemFree:"] - value["Buffers:"] - value["Cached:"] - value["SReclaimable:"]
      if (total <= 0) {
        exit 1
      }
      printf "%d\n", used * 100 / total
    }
  ' /proc/meminfo
}

vm_state() {
  /usr/bin/VBoxManage showvminfo "$1" --machinereadable 2>/dev/null |
    /usr/bin/sed -n 's/^VMState="\([^"]*\)"$/\1/p'
}

while :; do
  usage="$(memory_usage_percent)"

  if [ "$usage" -ge "$threshold" ]; then
    for vm_name in win11 win7 winXP; do
      state="$(vm_state "$vm_name" || true)"
      if [ "$state" = "running" ] || [ "$state" = "paused" ]; then
        /usr/bin/logger -t windows-vm-memory-guard \
          "physical memory usage ${usage}% reached ${threshold}%; saving ${vm_name}"

        if /usr/bin/VBoxManage controlvm "$vm_name" savestate; then
          usage="$(memory_usage_percent)"
          if [ "$usage" -lt "$threshold" ]; then
            break
          fi
        else
          /usr/bin/logger -p daemon.err -t windows-vm-memory-guard \
            "failed to save ${vm_name}"
        fi
      fi
    done
  fi

  sleep "$interval"
done
