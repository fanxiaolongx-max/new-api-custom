import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from datetime import timezone
from pathlib import Path
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "feiniu_network_guard", Path(__file__).with_name("feiniu-network-guard.py")
)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

INFO = '\n'.join([
    'VMState="running"', 'nic1="bridged"', 'cableconnected1="on"',
    'bridgeadapter1="enx000ec675333b"',
    'VMStateChangeTime="2026-10-05T21:58:06.031000000Z"',
])
NOW = 1791320000
READ_TEXT = Path.read_text


class NetworkGuardTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.state_path = Path(temporary.name) / "state.json"
        for mocker in (
            patch.object(guard, "STATE_PATH", self.state_path),
            patch.object(guard.time, "time", return_value=NOW),
            patch.object(guard, "active_lan_bridge", return_value="enx000ec675333b"),
        ):
            mocker.start()
            self.addCleanup(mocker.stop)

    def seed_state(self, failures, last_recovery=0):
        self.state_path.write_text(json.dumps({
            "failures": failures, "last_recovery": last_recovery,
        }))

    def test_recovers_only_after_three_consecutive_failures(self):
        with patch.object(guard, "vbox", return_value=INFO) as vbox, \
             patch.object(guard.Path, "read_text", autospec=True) as read, \
             patch.object(guard, "reachable", side_effect=[True, False] * 3 + [True]):
            read.side_effect = lambda path: "1" if str(path).startswith("/sys/") else (
                READ_TEXT(path) if path.exists() else '{}'
            )
            self.seed_state(0)
            for attempt in range(3):
                guard.check_network()
                controls = [c.args for c in vbox.call_args_list if c.args[0] == "controlvm"]
                if attempt < 2:
                    self.assertEqual(controls, [])
            self.assertEqual(controls, [
                ("controlvm", "feiniu", "nic1", "null"),
                ("controlvm", "feiniu", "nic1", "bridged", "enx000ec675333b"),
            ])

    def test_healthy_guest_or_host_outage_breaks_failure_streak(self):
        for probes in ([True, True], [False]):
            with self.subTest(probes=probes):
                self.seed_state(2)
                with patch.object(guard, "vbox", return_value=INFO) as vbox, \
                     patch.object(guard.Path, "read_text", autospec=True) as read, \
                     patch.object(guard, "reachable", side_effect=probes):
                    read.side_effect = lambda path: "1" if str(path).startswith("/sys/") else READ_TEXT(path)
                    guard.check_network()
                self.assertEqual(len(vbox.call_args_list), 1)
                self.assertEqual(json.loads(self.state_path.read_text())["failures"], 0)

    def test_saved_disconnected_or_booting_vm_is_not_modified(self):
        for info in (
            INFO.replace('VMState="running"', 'VMState="saved"'),
            INFO.replace('cableconnected1="on"', 'cableconnected1="off"'),
            INFO.replace('nic1="bridged"', 'nic1="nat"'),
            INFO.replace("2026-10-05T21:58:06.031000000Z", guard.datetime.fromtimestamp(NOW, tz=timezone.utc).isoformat()),
        ):
            with self.subTest(info=info):
                self.seed_state(2)
                with patch.object(guard, "vbox", return_value=info) as vbox, \
                     patch.object(guard, "reachable") as probe:
                    guard.check_network()
                probe.assert_not_called()
                self.assertEqual(len(vbox.call_args_list), 1)

    def test_cooldown_prevents_repeated_resets(self):
        self.seed_state(2, NOW - 60)
        with patch.object(guard, "vbox", return_value=INFO) as vbox, \
             patch.object(guard.Path, "read_text", autospec=True) as read, \
             patch.object(guard, "reachable", side_effect=[True, False]):
            read.side_effect = lambda path: "1" if str(path).startswith("/sys/") else READ_TEXT(path)
            guard.check_network()
        self.assertEqual(len(vbox.call_args_list), 1)

    def test_disconnected_host_link_does_not_reset_vm(self):
        self.seed_state(2)
        with patch.object(guard, "vbox", return_value=INFO) as vbox, \
             patch.object(guard.Path, "read_text", autospec=True) as read, \
             patch.object(guard, "reachable") as probe:
            read.side_effect = lambda path: "0" if str(path).startswith("/sys/") else READ_TEXT(path)
            guard.check_network()
        probe.assert_not_called()
        self.assertEqual(len(vbox.call_args_list), 1)
        self.assertEqual(json.loads(self.state_path.read_text())["failures"], 0)

    def test_saving_vm_during_probe_cancels_recovery(self):
        self.seed_state(2)
        with patch.object(guard, "vbox", side_effect=[INFO, INFO.replace('VMState="running"', 'VMState="saving"')]) as vbox, \
             patch.object(guard.Path, "read_text", autospec=True) as read, \
             patch.object(guard, "reachable", side_effect=[True, False]):
            read.side_effect = lambda path: "1" if str(path).startswith("/sys/") else READ_TEXT(path)
            guard.check_network()
        self.assertEqual(len(vbox.call_args_list), 2)

    def test_bridge_restoration_is_attempted_if_detach_errors(self):
        self.seed_state(2)
        with patch.object(guard, "vbox", side_effect=[INFO, INFO, RuntimeError("detach failed"), ""]) as vbox, \
             patch.object(guard.Path, "read_text", autospec=True) as read, \
             patch.object(guard, "reachable", side_effect=[True, False]):
            read.side_effect = lambda path: "1" if str(path).startswith("/sys/") else READ_TEXT(path)
            with self.assertRaisesRegex(RuntimeError, "detach failed"):
                guard.check_network()
        self.assertEqual(vbox.call_args.args, ("controlvm", "feiniu", "nic1", "bridged", "enx000ec675333b"))

    def test_running_vm_follows_wifi_without_changing_guest_mac(self):
        with patch.object(guard, "active_lan_bridge", return_value="wlp0s20f3"), \
             patch.object(guard, "vbox", return_value=INFO) as vbox, \
             patch.object(guard, "reachable", return_value=True):
            guard.check_network()
        self.assertEqual(vbox.call_args.args, ("controlvm", "feiniu", "nic1", "bridged", "wlp0s20f3"))

    def test_powered_off_or_saved_vm_bridge_is_prepared_for_start(self):
        for vm_state in ("poweroff", "saved"):
            with self.subTest(state=vm_state), \
                 patch.object(guard, "active_lan_bridge", return_value="wlp0s20f3"), \
                 patch.object(guard, "vbox", return_value=INFO.replace('VMState="running"', f'VMState="{vm_state}"')) as vbox, \
                 patch.object(guard, "reachable", return_value=True):
                guard.check_network(prepare_start=True)
            self.assertEqual(vbox.call_args.args, ("modifyvm", "feiniu", "--bridge-adapter1", "wlp0s20f3"))

    def test_unreachable_wifi_gateway_does_not_trigger_failover(self):
        with patch.object(guard, "active_lan_bridge", return_value="wlp0s20f3"), \
             patch.object(guard, "vbox", return_value=INFO) as vbox, \
             patch.object(guard.Path, "read_text", autospec=True) as read, \
             patch.object(guard, "reachable", return_value=False):
            read.side_effect = lambda path: "0" if str(path).startswith("/sys/") else READ_TEXT(path)
            guard.check_network()
        self.assertEqual(len(vbox.call_args_list), 1)


class LanBridgeSelectionTests(unittest.TestCase):
    def test_route_metric_selects_wired_then_wifi_when_wired_disappears(self):
        routes = [
            {"dev": "wlp0s20f3", "gateway": guard.GATEWAY, "metric": 600},
            {"dev": "enx000ec675333b", "gateway": guard.GATEWAY, "metric": 100},
            {"dev": "tun0", "gateway": "10.0.0.1", "metric": 1},
        ]
        with patch.object(guard.subprocess, "run") as run, \
             patch.object(guard.Path, "read_text", return_value="1"):
            run.return_value.stdout = json.dumps(routes)
            self.assertEqual(guard.active_lan_bridge(), "enx000ec675333b")
            run.return_value.stdout = json.dumps([routes[0], routes[2]])
            self.assertEqual(guard.active_lan_bridge(), "wlp0s20f3")

    def test_other_wifi_subnet_and_disconnected_links_are_ignored(self):
        routes = [
            {"dev": "wlp0s20f3", "gateway": "192.168.1.1"},
            {"dev": "enx000ec675333b", "gateway": guard.GATEWAY},
        ]
        with patch.object(guard.subprocess, "run") as run, \
             patch.object(guard.Path, "read_text", return_value="0"):
            run.return_value.stdout = json.dumps(routes)
            self.assertIsNone(guard.active_lan_bridge())


class GuestNetworkGuardTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.state_dir = self.root / "state"
        self.log = self.root / "ip.log"
        self.script = self.root / "guard.sh"
        script = Path(__file__).with_name("feiniu-guest-network-guard.sh").read_text()
        script = script.replace("state_dir=/run/feiniu-guest-network-guard", f"state_dir={self.state_dir}")
        script = script.replace("now=$(cut -d. -f1 /proc/uptime)", "now=1000")
        self.script.write_text(script)
        for name, body in (
            ("ping", '#!/bin/sh\nexit "${FAKE_PING_EXIT:-1}"\n'),
            ("ip", '#!/bin/sh\necho "$*" >> "$FAKE_IP_LOG"\nif [ "$4" = down ]; then exit "${FAKE_DOWN_EXIT:-0}"; fi\n'),
        ):
            executable = self.root / name
            executable.write_text(body)
            executable.chmod(0o755)

    def run_check(self, **environment):
        return subprocess.run(
            ["/bin/sh", str(self.script)], capture_output=True, text=True,
            env={**os.environ, "PATH": f"{self.root}:/usr/bin:/bin",
                 "FAKE_IP_LOG": str(self.log), **environment}, timeout=5,
        )

    def test_recovers_after_three_failures_and_obeys_cooldown(self):
        for _ in range(2):
            self.assertEqual(self.run_check().returncode, 0)
            self.assertFalse(self.log.exists())
        self.assertEqual(self.run_check().returncode, 0)
        self.assertEqual(self.log.read_text().splitlines(), [
            "link set enp0s3 down", "link set enp0s3 up",
        ])
        for _ in range(3):
            self.assertEqual(self.run_check().returncode, 0)
        self.assertEqual(len(self.log.read_text().splitlines()), 2)

    def test_success_clears_consecutive_failures(self):
        self.run_check()
        self.run_check()
        self.assertEqual(self.run_check(FAKE_PING_EXIT="0").returncode, 0)
        self.run_check()
        self.assertFalse(self.log.exists())
        self.assertEqual((self.state_dir / "state").read_text(), "1 0\n")

    def test_interface_is_brought_up_even_when_down_command_fails(self):
        self.run_check()
        self.run_check()
        result = self.run_check(FAKE_DOWN_EXIT="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.log.read_text().splitlines(), [
            "link set enp0s3 down", "link set enp0s3 up",
        ])


if __name__ == "__main__":
    unittest.main()
