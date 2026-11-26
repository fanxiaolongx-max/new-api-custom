#!/usr/bin/env python3
"""On-demand, local-only camera and microphone stream for the dashboard."""
import http.server
import os
import socketserver
import subprocess
import threading

SOCKET = os.environ.get('CAMERA_AGENT_SOCKET', '/run/new-api-vm-agent/camera.sock')
VIDEO = os.environ.get('CAMERA_VIDEO_DEVICE', '/dev/video0')
AUDIO = os.environ.get('CAMERA_AUDIO_SOURCE', 'alsa_input.pci-0000_00_1f.3.analog-stereo')
stream_lock = threading.Lock()

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != '/stream':
            self.send_error(404)
            return
        if not stream_lock.acquire(timeout=3):
            try:
                self.send_error(409)
            except (BrokenPipeError, ConnectionResetError):
                pass
            return
        process = None
        try:
            process = subprocess.Popen([
                '/usr/bin/ffmpeg', '-hide_banner', '-loglevel', 'error',
                '-f', 'v4l2', '-framerate', '15', '-video_size', '640x480', '-i', VIDEO,
                '-f', 'pulse', '-i', AUDIO,
                '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-profile:v', 'baseline',
                '-level', '3.0', '-pix_fmt', 'yuv420p', '-b:v', '600k', '-g', '30',
                '-c:a', 'aac', '-b:a', '64k', '-f', 'mp4',
                '-movflags', 'empty_moov+default_base_moof+frag_keyframe', '-frag_duration', '500000',
                '-flush_packets', '1', 'pipe:1',
            ], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)
            first = process.stdout.read(4096)
            if not first:
                self.send_error(503)
                return
            self.send_response(200)
            self.send_header('Content-Type', 'video/mp4')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(first)
            while chunk := process.stdout.read(16384):
                self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            if process is not None:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                process.stdout.close()
            stream_lock.release()

    def log_message(self, format, *args):
        pass

class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True

if __name__ == '__main__':
    try:
        os.unlink(SOCKET)
    except FileNotFoundError:
        pass
    old_umask = os.umask(0o177)
    with Server(SOCKET, Handler) as server:
        os.umask(old_umask)
        server.serve_forever()
