# Dashboard virtual machine agent

The dashboard talks to `vm_agent.py` through its Unix socket. VM names and
operations are allowlisted; `vm_mouse.py` runs SDK mouse input in a bounded
subprocess so COM initialization cannot block the HTTP server.

Install both management units together:

```sh
sudo install -m 0644 tools/vm-agent/new-api-vboxsvc.service /etc/systemd/system/
sudo install -m 0644 tools/vm-agent/new-api-vm-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now new-api-vboxsvc.service new-api-vm-agent.service
```

`new-api-vboxsvc.service` owns the persistent VirtualBox management process.
It starts outside the agent's `NoNewPrivileges` sandbox because the supported
VirtualBox VM launcher uses setuid to initialize its virtualization driver.
The HTTP agent keeps `NoNewPrivileges=true`. Its dependency starts the
management service first, including after a reboot. VirtualBox's daemon
launcher exits with status 126 on successful handoff; the management unit
accepts this status and tracks the child through its PID file.

Before replacing an already running VBoxSVC instance, save every running VM
and verify its state file. Restarting VBoxSVC while guests are running can
interrupt those guests. Back up the VM configuration files and global
`VirtualBox.xml` before recovery. Restarting only the HTTP agent does not
require stopping the management service or saving running VMs.

Verify the deployed agent with:

```sh
systemctl status new-api-vboxsvc new-api-vm-agent
curl --unix-socket /run/new-api-vm-agent/agent.sock http://localhost/v1/settings
curl --unix-socket /run/new-api-vm-agent/agent.sock http://localhost/v1/vms
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tools/vm-agent -p test_vm_agent.py
```
