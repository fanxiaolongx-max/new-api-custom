#!/usr/bin/env python3
"""Expose one pinned, command-restricted Kindle screenshot over a Unix socket."""
import os
import socket
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn

SOCKET = os.environ.get('KINDLE_SCREEN_SOCKET', '/run/new-api-vm-agent/kindle-screen.sock')
KEY_DIR = os.environ.get('KINDLE_SCREEN_KEY_DIR', os.path.expanduser('~/.local/share/kindle-dashboard-access'))
HOST = os.environ.get('KINDLE_SCREEN_HOST', '192.168.100.207')
capture_lock = threading.Lock()


class Server(ThreadingMixIn, HTTPServer):
    address_family = socket.AF_UNIX
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != '/screen':
            self.send_error(404)
            return
        if not capture_lock.acquire(blocking=False):
            self.send_error(503)
            return
        try:
            result = subprocess.run([
                '/usr/bin/ssh', '-T', '-i', os.path.join(KEY_DIR, 'screen_key'),
                '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
                '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + os.path.join(KEY_DIR, 'known_hosts'),
                '-o', 'ConnectTimeout=8', 'root@' + HOST,
            ], capture_output=True, timeout=15, check=True)
            image = result.stdout
            if not image.startswith(b'\x89PNG\r\n\x1a\n') or len(image) > 8 * 1024 * 1024:
                raise ValueError('invalid screenshot')
            self.send_response(200)
            self.send_header('Content-Type', 'image/png')
            self.send_header('Content-Length', str(len(image)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(image)
        except (OSError, ValueError, subprocess.SubprocessError):
            self.send_error(503)
        finally:
            capture_lock.release()

    def log_message(self, format, *args):
        return


if __name__ == '__main__':
    try:
        os.unlink(SOCKET)
    except FileNotFoundError:
        pass
    os.umask(0o077)
    with Server(SOCKET, Handler) as server:
        server.serve_forever()
