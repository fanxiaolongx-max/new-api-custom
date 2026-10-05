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


class IdleSaveTest(unittest.TestCase):
    def test_rdp_forwarding_port_is_read_from_virtualbox_configuration(self) -> None:
        with mock.patch.object(
            vm_agent,
            "machine_readable_values",
            return_value={
                'Forwarding(0)': "rdp,tcp,172.19.0.1,13389,,3389",
                'Forwarding(1)': "ssh,tcp,127.0.0.1,2222,,22",
            },
        ):
            self.assertEqual(vm_agent.rdp_port_for_machine("win11"), 13389)

    def test_inactive_running_windows_machine_is_saved(self) -> None:
        server = mock.Mock()
        server.idle_save_minutes = 30
        server.last_control_activity = {"win11": 100.0}
        server.last_vm_states = {"win11": "running"}
        server.rdp_ports = {"win11": 13389}

        with (
            mock.patch.object(vm_agent, "IDLE_SAVE_VMS", ("win11",)),
            mock.patch.object(vm_agent.time, "monotonic", return_value=2000.0),
            mock.patch.object(
                vm_agent, "machine_info", return_value={"state": "running"}
            ),
            mock.patch.object(
                vm_agent, "has_established_connection", return_value=False
            ),
            mock.patch.object(vm_agent, "run_vbox") as run,
        ):
            vm_agent.UnixHTTPServer.reconcile_idle_saves(server)

        run.assert_called_once_with("controlvm", "win11", "savestate", timeout=30)
        self.assertEqual(server.last_vm_states["win11"], "saved")

    def test_active_rdp_connection_refreshes_activity_without_saving(self) -> None:
        server = mock.Mock()
        server.idle_save_minutes = 1
        server.last_control_activity = {"win7": 100.0}
        server.last_vm_states = {"win7": "running"}
        server.rdp_ports = {"win7": 13390}

        with (
            mock.patch.object(vm_agent, "IDLE_SAVE_VMS", ("win7",)),
            mock.patch.object(vm_agent.time, "monotonic", return_value=500.0),
            mock.patch.object(
                vm_agent, "machine_info", return_value={"state": "running"}
            ),
            mock.patch.object(
                vm_agent, "has_established_connection", return_value=True
            ),
            mock.patch.object(vm_agent, "run_vbox") as run,
        ):
            vm_agent.UnixHTTPServer.reconcile_idle_saves(server)

        run.assert_not_called()
        self.assertEqual(server.last_control_activity["win7"], 500.0)

    def test_settings_update_persists_without_resetting_inactivity(self) -> None:
        server = mock.Mock()
        server.last_control_activity = {"winXP": 1.0, "win7": 2.0}

        with mock.patch.object(
            vm_agent, "persist_idle_save_minutes"
        ) as persist:
            vm_agent.UnixHTTPServer.update_idle_save_minutes(server, 45)

        persist.assert_called_once_with(45)
        self.assertEqual(server.idle_save_minutes, 45)
        self.assertEqual(server.last_control_activity, {"winXP": 1.0, "win7": 2.0})


if __name__ == "__main__":
    unittest.main()
