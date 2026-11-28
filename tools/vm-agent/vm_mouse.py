#!/usr/bin/env python3
"""Run one VirtualBox SDK mouse operation in a disposable process."""

import argparse

from vboxapi import VirtualBoxManager


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("name")
    parser.add_argument("x", type=int)
    parser.add_argument("y", type=int)
    parser.add_argument("buttons", type=int)
    args = parser.parse_args()
    if not args.name or args.name == "<inaccessible>":
        parser.error("invalid virtual machine name")
    if not (0 <= args.x <= 65535 and 0 <= args.y <= 65535 and 0 <= args.buttons <= 7):
        parser.error("mouse input is out of range")

    manager = VirtualBoxManager(None, None)
    session = None
    try:
        machine = manager.getVirtualBox().findMachine(args.name)
        session = manager.openMachineSession(machine, fPermitSharing=True)
        session.console.mouse.putMouseEventAbsolute(args.x, args.y, 0, 0, args.buttons)
    finally:
        try:
            if session is not None:
                manager.closeMachineSession(session)
        finally:
            manager.deinit()


if __name__ == "__main__":
    main()
