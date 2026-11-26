#!/usr/bin/env python3

import tempfile
import http.client
import socket
import threading
import subprocess
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
        for active_state in ("running", "restoring"):
            with self.subTest(windows_state=active_state):
                self.marker.unlink(missing_ok=True)
                states = {"win11": active_state, "feiniu": "running"}
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
            "win11": {"state": "powered_off", "cpu_count": 4, "memory_mb": 4096},
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
            mock.patch.object(vm_agent.subprocess, "run"),
        ):
            vm_agent.reconcile_vm_lifecycle()

        run.assert_called_once_with("startvm", "feiniu", "--type", "headless", timeout=30)
        self.assertFalse(self.marker.exists())

    def test_fnos_bridge_is_prepared_before_start_but_windows_is_not_changed(self) -> None:
        events = []
        with (
            mock.patch.object(vm_agent.subprocess, "run", side_effect=lambda *args, **kwargs: events.append("prepare")),
            mock.patch.object(vm_agent, "run_vbox", side_effect=lambda *args, **kwargs: events.append(args[1])),
        ):
            vm_agent.start_machine("feiniu")
            vm_agent.start_machine("win11")
        self.assertEqual(events, ["prepare", "feiniu", "win11"])

    def test_failed_bridge_preparation_does_not_start_fnos(self) -> None:
        with (
            mock.patch.object(vm_agent.subprocess, "run", side_effect=subprocess.CalledProcessError(1, "prepare")),
            mock.patch.object(vm_agent, "run_vbox") as run,
        ):
            with self.assertRaises(subprocess.CalledProcessError):
                vm_agent.start_machine("feiniu")
        run.assert_not_called()

    def test_powered_off_win11_receives_requested_resources(self) -> None:
        with mock.patch.object(vm_agent, "run_vbox") as run:
            vm_agent.configure_windows_resources(
                {"state": "powered_off", "cpu_count": 2, "memory_mb": 3072}
            )

        run.assert_called_once_with(
            "modifyvm", "win11", "--cpus", "4", "--memory", "4096"
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
        server.settings_lock = threading.Lock()
        server.last_control_activity = {"winXP": 1.0, "win7": 2.0}

        with mock.patch.object(
            vm_agent, "persist_idle_save_minutes"
        ) as persist:
            vm_agent.UnixHTTPServer.update_idle_save_minutes(server, 45)

        persist.assert_called_once_with(45)
        self.assertEqual(server.idle_save_minutes, 45)
        self.assertEqual(server.last_control_activity, {"winXP": 1.0, "win7": 2.0})


class AgentResponsivenessTest(unittest.TestCase):
    def test_interrupted_restore_remains_startable_without_discarding_saved_state(self) -> None:
        handler = mock.Mock()
        values = {"VMState": "aborted-saved", "memory": "1024", "cpus": "2", "ostype": "Windows XP (32-bit)"}
        with (
            mock.patch.object(vm_agent, "machine_readable_values", return_value=values),
            mock.patch.object(vm_agent, "run_vbox") as run,
        ):
            self.assertEqual(vm_agent.machine_info("winXP")["state"], "saved")
            vm_agent.Handler.handle_action(handler, "winXP", {"action": "start"})
        run.assert_called_once_with("startvm", "winXP", "--type", "headless", timeout=30)

    def test_listing_machines_does_not_run_lifecycle_mutations(self) -> None:
        handler = mock.Mock()
        handler.path = "/v1/vms"
        with (
            mock.patch.object(vm_agent, "reconcile_vm_lifecycle") as reconcile,
            mock.patch.object(vm_agent, "machine_info", side_effect=lambda name: {"name": name, "state": "saved"}),
        ):
            vm_agent.Handler.do_GET(handler)
        reconcile.assert_not_called()
        self.assertEqual(handler.send_json.call_args.args[0], 200)


    def test_mouse_input_uses_bounded_sdk_process_and_preserves_coordinates(self) -> None:
        handler = mock.Mock()
        with (
            mock.patch.object(vm_agent, "machine_info", return_value={"state": "running"}),
            mock.patch.object(vm_agent.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "", "")) as run,
        ):
            vm_agent.Handler.handle_mouse(handler, "win7", {"x": 0, "y": 65535, "buttons": 1})
        self.assertEqual(run.call_args.args[0][-4:], ["win7", "0", "65535", "1"])
        self.assertEqual(run.call_args.kwargs["timeout"], 10)
        handler.send_json.assert_called_once_with(200, {"success": True})
        handler.server.mark_control_activity.assert_called_once_with("win7")

    def test_settings_remain_available_while_lifecycle_query_is_blocked(self) -> None:
        entered = threading.Event()
        release = threading.Event()
        def blocked_lifecycle() -> None:
            entered.set()
            release.wait(5)

        with (
            tempfile.TemporaryDirectory() as directory,
            mock.patch.object(vm_agent, "reconcile_vm_lifecycle", side_effect=blocked_lifecycle),
            mock.patch.object(vm_agent.UnixHTTPServer, "reconcile_idle_saves"),
            mock.patch.object(vm_agent, "load_idle_save_minutes", return_value=30),
        ):
            path = str(Path(directory) / "agent.sock")
            server = vm_agent.UnixHTTPServer(path, vm_agent.Handler)
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            connection = http.client.HTTPConnection("localhost", timeout=1)
            connection.sock = socket.socket(socket.AF_UNIX)
            connection.sock.settimeout(1)
            try:
                self.assertTrue(entered.wait(2), "maintenance did not start")
                connection.sock.connect(path)
                connection.request("GET", "/v1/settings")
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                self.assertIn(b'"idle_save_minutes": 30', response.read())
            finally:
                connection.close()
                release.set()
                server.shutdown()
                worker.join(2)
                server.server_close()


if __name__ == "__main__":
    unittest.main()


class ManagedServiceRecoveryTest(unittest.TestCase):
    def test_missing_managed_pid_rejects_commands_without_auto_spawning_vboxsvc(self):
        with (mock.patch.dict(vm_agent.os.environ, {"VM_AGENT_REQUIRE_MANAGED_SERVICE": "1"}),
              mock.patch.object(Path, "read_text", side_effect=FileNotFoundError),
              mock.patch.object(vm_agent.subprocess, "run") as run):
            with self.assertRaisesRegex(RuntimeError, "management service is restarting"):
                vm_agent.run_vbox("showvminfo", "openEuler")
        run.assert_not_called()

    def test_stale_pid_cannot_be_mistaken_for_the_managed_service(self):
        with (mock.patch.dict(vm_agent.os.environ, {"VM_AGENT_REQUIRE_MANAGED_SERVICE": "1"}),
              mock.patch.object(Path, "read_text", side_effect=["123", "another-process"]),
              mock.patch.object(vm_agent.subprocess, "run") as run):
            with self.assertRaisesRegex(RuntimeError, "management service is restarting"):
                vm_agent.run_vbox("showvminfo", "openEuler")
        run.assert_not_called()
