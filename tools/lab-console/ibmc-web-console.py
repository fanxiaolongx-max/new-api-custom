#!/usr/bin/env python3
"""Interactive iBMC SSH client run inside the lab's ibmc network namespace.

Guacamole authenticates with its existing OS account. Simulator credentials and
its pinned host key remain inside the guest. No commands or traffic are logged.
"""
import importlib.util
import os
import select
import shlex
import subprocess
import signal
import sys
import termios
import tty

import paramiko


def main():
    environment = subprocess.check_output(['systemctl', 'show', 'ibmc-sim.service', '--property=Environment', '--value'], text=True)
    for entry in shlex.split(environment):
        name, _, value = entry.partition('=')
        if name in ('IBMC_USER', 'IBMC_PASSWORD'):
            os.environ[name] = value
    spec = importlib.util.spec_from_file_location('ibmc_sim', '/usr/local/sbin/ibmc_sim.py')
    simulator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(simulator)
    client = paramiko.SSHClient()
    key = paramiko.RSAKey.from_private_key_file(simulator.HOST_KEY)
    client.get_host_keys().add('127.0.0.1', key.get_name(), key)
    client.connect('127.0.0.1', username=simulator.USER, password=simulator.PASSWORD,
                   allow_agent=False, look_for_keys=False, timeout=8)
    size = os.get_terminal_size()
    channel = client.invoke_shell(term=os.environ.get('TERM', 'xterm'), width=max(size.columns, 80), height=max(size.lines, 24))
    previous = termios.tcgetattr(sys.stdin)

    def resize(_signum, _frame):
        size = os.get_terminal_size()
        channel.resize_pty(width=max(size.columns, 80), height=max(size.lines, 24))

    signal.signal(signal.SIGWINCH, resize)
    try:
        tty.setraw(sys.stdin.fileno())
        while not channel.closed:
            readable, _, _ = select.select([channel, sys.stdin], [], [], 1)
            if channel in readable:
                data = channel.recv(32768)
                if not data:
                    break
                sys.stdout.buffer.write(data)
                sys.stdout.buffer.flush()
            if sys.stdin in readable:
                data = os.read(sys.stdin.fileno(), 4096)
                if not data:
                    break
                channel.sendall(data)
    finally:
        termios.tcsetattr(sys.stdin, termios.TCSADRAIN, previous)
        channel.close()
        client.close()


if __name__ == '__main__':
    main()
