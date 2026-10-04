#!/usr/bin/env python3

import tempfile
import unittest
from pathlib import Path
from unittest import mock

import vm_agent


class VirtualMachineLifecycleTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.marker = Path(self.temporary_directory.name) / "saved-for-win11"
        self.marker_patch = mock.patch.object(vm_agent, "LIFECYCLE_MARKER", self.marker)
        self.marker_patch.start()
        self.addCleanup(self.marker_patch.stop)

    def test_reconcile_saves_feiniu_while_win11_is_running(self) -> None:
        states = {"win11": "running", "feiniu": "running"}
        commands: list[tuple[str, ...]] = []

        def run_vbox(*args: str, timeout: int = 20) -> str:
            commands.append(args)
            if args[:3] == ("controlvm", "feiniu", "savestate"):
                states["feiniu"] = "saved"
            return ""

        with (
            mock.patch.object(
                vm_agent,
                "machine_info",
                side_effect=lambda name: {"state": states[name]},
            ),
            mock.patch.object(vm_agent, "run_vbox", side_effect=run_vbox),
        ):
            vm_agent.reconcile_vm_lifecycle()

        self.assertEqual(commands, [("controlvm", "feiniu", "savestate")])
        self.assertTrue(self.marker.exists())

    def test_reconcile_restores_only_feiniu_saved_by_agent(self) -> None:
        states = {
            "win11": {"state": "powered_off", "cpu_count": 4, "memory_mb": 8192},
            "feiniu": {"state": "saved"},
        }
        self.marker.write_text("saved\n", encoding="utf-8")

        def run_vbox(*args: str, timeout: int = 20) -> str:
            if args[:2] == ("startvm", "feiniu"):
                states["feiniu"]["state"] = "running"
            return ""

        with (
            mock.patch.object(
                vm_agent,
                "machine_info",
                side_effect=lambda name: states[name],
            ),
            mock.patch.object(vm_agent, "run_vbox", side_effect=run_vbox) as run,
        ):
            vm_agent.reconcile_vm_lifecycle()

        run.assert_called_once_with("startvm", "feiniu", "--type", "headless", timeout=30)
        self.assertFalse(self.marker.exists())

    def test_powered_off_win11_receives_requested_resources(self) -> None:
        with mock.patch.object(vm_agent, "run_vbox") as run:
            vm_agent.configure_windows_resources(
                {"state": "powered_off", "cpu_count": 2, "memory_mb": 3072}
            )

        run.assert_called_once_with(
            "modifyvm", "win11", "--cpus", "4", "--memory", "8192"
        )


if __name__ == "__main__":
    unittest.main()
