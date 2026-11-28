import base64
import socket
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import ibmc
import vm_agent


class IBMCControlTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.media = self.root / 'media'
        self.media.mkdir()
        for key, value in [('MEDIA_ROOT', self.media), ('STATE_PATH', self.root / 'state.json')]:
            patch = mock.patch.object(ibmc, key, value)
            patch.start()
            self.addCleanup(patch.stop)
        self.run = mock.Mock(return_value='')
        self.values = {'VMState': 'poweroff', 'UUID': 'test', 'memory': '2048', 'cpus': '2', 'uartmode1': 'server,/test', 'SnapshotUUID': 'snapshot-id', 'SnapshotName': 'clean-install'}
        self.controller = ibmc.IBMC(self.run, lambda name: self.values)

    def test_boot_device_is_validated_and_keeps_disk_fallback(self):
        self.controller.action({'action': 'boot', 'device': 'dvd'})
        self.run.assert_called_once_with('modifyvm', 'openEuler', '--boot1', 'dvd', '--boot2', 'disk', '--boot3', 'none', '--boot4', 'none')
        with self.assertRaises(ValueError):
            self.controller.action({'action': 'boot', 'device': '--delete'})
        self.assertEqual(self.run.call_count, 1)

    def test_running_guest_rejects_media_boot_and_snapshot_changes(self):
        self.values['VMState'] = 'running'
        for action in ['mount', 'eject', 'boot', 'snapshot']:
            with self.subTest(action=action), self.assertRaises(ValueError):
                self.controller.action({'action': action, 'device': 'dvd'})
        self.run.assert_not_called()

    def test_iso_library_rejects_traversal_and_symlinks_outside_library(self):
        (self.media / 'allowed.iso').write_bytes(b'iso')
        (self.root / 'secret.iso').write_bytes(b'secret')
        (self.media / 'symlink.iso').symlink_to(self.root / 'secret.iso')
        self.assertEqual(self.controller.media(), [{'id': 'allowed.iso', 'size': 3}])
        for filename in ['../secret.iso', 'symlink.iso', '/etc/passwd']:
            with self.subTest(filename=filename), self.assertRaises(ValueError):
                self.controller.action({'action': 'mount', 'media': filename})
        self.run.assert_not_called()
        self.controller.action({'action': 'mount', 'media': 'allowed.iso'})
        self.assertEqual(self.run.call_args.args[-1], str(self.media / 'allowed.iso'))

    def test_simulated_alarm_and_uid_persist_without_controlling_hardware(self):
        self.controller.action({'action': 'uid', 'enabled': True})
        self.controller.action({'action': 'alarm', 'severity': 'critical'})
        restored = ibmc.IBMC(self.run, lambda name: self.values).status()
        self.assertTrue(restored['simulation'])
        self.assertTrue(restored['uid'])
        self.assertEqual(restored['alarm'], 'critical')
        self.assertEqual(restored['snapshots'], [{'id': 'snapshot-id', 'name': 'clean-install'}])
        self.run.assert_not_called()

    def test_force_off_only_operates_on_the_allowlisted_vm(self):
        self.values['VMState'] = 'running'
        self.controller.action({'action': 'poweroff', 'name': 'win11'})
        self.run.assert_called_once_with('controlvm', 'openEuler', 'poweroff', timeout=30)

    def test_secondary_node_uses_isolated_vm_name_and_state_file(self):
        secondary_state = self.root / 'ibmc-Node-02.json'
        node_values = {**self.values, 'UUID': 'node-02-uuid', 'VMState': 'running'}
        node_serial = mock.Mock(token='')
        secondary = ibmc.IBMC(self.run, lambda name: node_values, vm_name='DragonLab-Node-02', state_path=secondary_state, serial=node_serial)

        self.controller.action({'action': 'uid', 'enabled': True})
        secondary.action({'action': 'poweroff'})

        primary_status = self.controller.status()
        secondary_status = secondary.status()
        self.assertEqual(primary_status['name'], 'openEuler')
        self.assertTrue(primary_status['uid'])
        self.assertEqual(secondary_status['name'], 'DragonLab-Node-02')
        self.assertFalse(secondary_status['uid'])
        self.run.assert_called_once_with('controlvm', 'DragonLab-Node-02', 'poweroff', timeout=30)


class SerialConsoleTest(unittest.TestCase):
    def setUp(self):
        self.console = ibmc.SerialConsole()
        self.local, self.peer = socket.socketpair()
        self.addCleanup(self.local.close)
        self.addCleanup(self.peer.close)
        self.console.connection = self.local
        self.session = self.console.open()['session']

    def test_console_is_exclusive_and_invalid_tokens_cannot_read_or_write(self):
        with self.assertRaises(ValueError):
            self.console.open()
        for operation in ['read', 'write', 'close']:
            with self.subTest(operation=operation), self.assertRaises(ValueError):
                self.console.request({'operation': operation, 'session': 'wrong'})
        self.assertEqual(self.console.token, self.session)

    def test_binary_input_is_forwarded_exactly_and_close_clears_private_output(self):
        self.console.buffer.extend(b'private output')
        self.console.request({'operation': 'write', 'session': self.session, 'data': base64.b64encode(b'\x03pwd\r').decode()})
        self.assertEqual(self.peer.recv(32), b'\x03pwd\r')
        self.console.request({'operation': 'close', 'session': self.session})
        self.assertEqual(self.console.buffer, b'')
        with self.assertRaises(ValueError):
            self.console.request({'operation': 'read', 'session': self.session})
        self.assertIs(self.console.connection, self.local)  # COM1 keeps draining without a web viewer.

    def test_cursor_recovers_from_truncation_without_duplicating_output(self):
        self.console.offset = 100
        self.console.buffer.extend(b'login:')
        result = self.console.request({'operation': 'read', 'session': self.session, 'cursor': 0})
        self.assertTrue(result['truncated'])
        self.assertEqual(base64.b64decode(result['data']), b'login:')
        self.assertEqual(result['cursor'], 106)
        next_result = self.console.request({'operation': 'read', 'session': self.session, 'cursor': 106})
        self.assertEqual(next_result['data'], '')
        with self.assertRaises(ValueError):
            self.console.request({'operation': 'read', 'session': self.session, 'cursor': 107})

    def test_oversized_or_invalid_serial_input_is_rejected(self):
        for data in ['bad###', base64.b64encode(b'x' * 4097).decode(), '']:
            with self.subTest(length=len(data)), self.assertRaises(ValueError):
                self.console.request({'operation': 'write', 'session': self.session, 'data': data})


class MachineInventoryTest(unittest.TestCase):
    def test_quoted_storage_keys_are_parsed_for_mounted_media(self):
        with mock.patch.object(vm_agent, 'run_vbox', return_value='VMState="poweroff"\n"SATA-1-0"="/mnt/data/ISO/test.iso"\n'):
            values = vm_agent.machine_readable_values('openEuler')
        self.assertEqual(values['SATA-1-0'], '/mnt/data/ISO/test.iso')
        self.assertEqual(values['VMState'], 'poweroff')


class SerialAutoLoginTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.credentials = Path(self.directory.name) / 'login.json'
        self.credentials.write_text('{"username":"test-user","password":"test-password"}')
        self.credentials.chmod(0o600)
        patch = mock.patch.object(ibmc, 'SERIAL_LOGIN_FILE', self.credentials)
        patch.start()
        self.addCleanup(patch.stop)
        self.console = ibmc.SerialConsole()
        self.console.connection = mock.Mock()

    def test_only_explicit_prompts_receive_one_credential_pair_and_failure_is_not_retried(self):
        self.console.open(auto_login=True)
        self.console.connection.sendall.assert_not_called()
        self.console.accept_output(b'openEuler login: ')
        self.console.connection.sendall.assert_called_once_with(b'test-user\r')
        self.console.accept_output(b'\r\nPass')
        self.assertEqual(self.console.connection.sendall.call_count, 1)
        self.console.accept_output(b'word: ')
        self.assertEqual(self.console.connection.sendall.call_args.args[0], b'test-password\r')
        self.console.accept_output(b'\r\nLogin incorrect\r\nopenEuler login: ')
        self.assertEqual(self.console.connection.sendall.call_count, 2)
        self.assertEqual(self.console.login_password, '')

    def test_existing_shell_and_manual_typing_never_receive_saved_credentials(self):
        lease = self.console.open(auto_login=True)
        self.console.accept_output(b'[root@openEuler ~]# ')
        self.console.connection.sendall.assert_not_called()
        self.console.request({'operation':'write', 'session':lease['session'], 'data':base64.b64encode(b'whoami\r').decode()})
        self.console.accept_output(b'\r\nopenEuler login: ')
        self.console.connection.sendall.assert_called_once_with(b'whoami\r')

    def test_public_credentials_file_is_rejected_and_reconnect_does_not_type_into_password_prompt(self):
        self.credentials.chmod(0o644)
        self.console.accept_output(b'openEuler login: ')
        self.console.open(auto_login=True)
        self.console.connection.sendall.assert_not_called()
        self.console.close()
        self.credentials.chmod(0o600)
        self.console.accept_output(b'\r\nPassword: ')
        self.console.open(auto_login=True)
        self.console.connection.sendall.assert_not_called()


class MultiNodeAgentTest(unittest.TestCase):
    def test_http_endpoints_route_ibmc_status_and_actions_by_node(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            slots = root / 'slots.json'
            slots.write_text('[{"name":"Node-02","vm":"DragonLab-Node-02"}]')
            node2_controller = mock.Mock()
            node2_controller.status.return_value = {'name': 'DragonLab-Node-02', 'state': 'poweroff'}
            node2_controller.action.return_value = {'success': True}

            node1_controller = mock.Mock()
            node1_controller.status.return_value = {'name': 'openEuler', 'state': 'running'}

            server = mock.Mock()
            server.control_lock = vm_agent.threading.Lock()
            server.ibmc_nodes.return_value = [
                {'node': 'Node-01', 'vm': 'openEuler'},
                {'node': 'Node-02', 'vm': 'DragonLab-Node-02'},
            ]
            server.ibmc_for.side_effect = lambda node: {
                '': ('Node-01', node1_controller),
                'Node-01': ('Node-01', node1_controller),
                'Node-02': ('Node-02', node2_controller),
            }.get(node, (None, None))

            handler = mock.Mock()
            handler.server = server
            handler.path = '/v1/ibmc?node=Node-02'
            vm_agent.Handler.do_GET(handler)
            handler.send_json.assert_called_with(200, {
                'name': 'DragonLab-Node-02',
                'state': 'poweroff',
                'node': 'Node-02',
                'nodes': [
                    {'node': 'Node-01', 'vm': 'openEuler'},
                    {'node': 'Node-02', 'vm': 'DragonLab-Node-02'},
                ],
            })

            handler.reset_mock()
            handler.path = '/v1/ibmc?node=Node-99'
            vm_agent.Handler.do_GET(handler)
            handler.send_json.assert_called_with(404, {'error': 'unknown iBMC node'})

            handler.reset_mock()
            handler.path = '/v1/ibmc/action'
            handler.read_json.return_value = {'node': 'Node-02', 'action': 'start'}
            vm_agent.Handler.do_POST(handler)
            server.serial_for.assert_called_once_with('Node-02')
            node2_controller.action.assert_called_once_with({'action': 'start'})
            handler.send_json.assert_called_with(200, {'success': True})
