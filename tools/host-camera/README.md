# Host camera agent

The dashboard automatically streams the host camera and microphone when a root
user opens the overview page, through a Unix-domain socket. The agent runs as the desktop user, not as root. Its socket
is mode 0600, inside the existing VM agent runtime directory, and is mounted
into the API container. The API requires a root dashboard login session and
checks that session again while streaming. Nothing is recorded by the agent.

The provided systemd user unit is configured for this host. It requires
`/usr/bin/ffmpeg` with V4L2, PulseAudio, libx264 and AAC support, and the
existing `/run/new-api-vm-agent` directory. Adjust the unit path and the
`CAMERA_VIDEO_DEVICE`, `CAMERA_AUDIO_SOURCE`, `CAMERA_AGENT_SOCKET`, and
`PULSE_SERVER` environment variables when moving to another machine. If the
socket path changes, mount its directory in the container and update the API
socket path as well. Only one viewer can use the device at a time. A stopped
viewer releases the capture process; audio starts muted in the browser.

To install the supplied unit, copy it into `~/.config/systemd/user/`, then run
`systemctl --user daemon-reload` and `systemctl --user enable --now
new-api-camera-agent.service`. Enable user lingering when this should work
without an interactive desktop login. Disabling the unit removes camera access
from the dashboard without changing the device permissions for other users.
