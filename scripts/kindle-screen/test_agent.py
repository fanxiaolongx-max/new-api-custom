import http.client
import importlib.util
import socket
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('kindle_agent', Path(__file__).with_name('agent.py'))
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


class UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__('localhost')
        self.path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX)
        self.sock.connect(self.path)


class CaptureTests(unittest.TestCase):
    def test_screenshot_endpoint_returns_png_and_rejects_bad_capture(self):
        with tempfile.TemporaryDirectory() as directory:
            with agent.Server(str(Path(directory) / 'agent.sock'), agent.Handler) as server:
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    with patch.object(agent.subprocess, 'run') as run:
                        run.return_value.stdout = b'\x89PNG\r\n\x1a\ncontent'
                        connection = UnixHTTPConnection(server.server_address)
                        connection.request('GET', '/screen')
                        response = connection.getresponse()
                        self.assertEqual(response.status, 200)
                        self.assertEqual(response.getheader('Content-Type'), 'image/png')
                        self.assertEqual(response.read(), run.return_value.stdout)
                        connection.close()
                        run.return_value.stdout = b'not an image'
                        connection = UnixHTTPConnection(server.server_address)
                        connection.request('GET', '/screen')
                        self.assertEqual(connection.getresponse().status, 503)
                        connection.close()
                finally:
                    server.shutdown()
                    thread.join()


if __name__ == '__main__':
    unittest.main()
