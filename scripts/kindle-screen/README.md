# Kindle remote screen and terminal

The screen agent listens only on `/run/new-api-vm-agent/kindle-screen.sock` with
mode 0600. It uses a dedicated SSH key restricted on the Kindle to `fbgrab` and
reading its output. The private key and pinned host keys live outside the
repository in `~/.local/share/kindle-dashboard-access/`. The root-session-only
API returns a new framebuffer capture and does not cache it. Captures cannot
show physical display defects or frontlight appearance.

The separate Guacamole instance uses the `kindle` login name and authenticates
that password against Kindle's `root` SSH account. Neither the extension nor
the connection configuration stores the password. SSH host keys and the IP
are pinned in the provider; update both after a device or address change.
Guacamole's brute-force protection and the gateway token endpoint rate limit
apply. The existing Debian terminal instance is not modified.

The running host uses the supplied systemd user service and compose file. The
compiled provider JAR is installed at
`~/.local/share/kindle-dashboard-access/kindle-auth.jar`; its source and
manifest are kept here. The gateway locations are documented in
`nginx-locations.conf` and must be included in the gateway's server block.
The overview includes a Kindle row with screen and terminal actions. The screen
dialog polls every 10 seconds while open; access requires a root dashboard
session. The deployed application image is selected in `docker-compose.override.yml`.
