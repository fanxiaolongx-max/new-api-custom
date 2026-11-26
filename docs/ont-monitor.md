# HG8145V5 ONT monitoring

The console overview includes an **ONT monitor** card for super administrators.
Open **Configure ONT**, enter the router's address and login credentials, select
a polling interval, and enable monitoring. The backend process must be able to
reach the router's private IPv4 address on HTTP/HTTPS port 80 or 443. For the
device's self-signed HTTPS certificate, explicitly enable the device-scoped
certificate option in the form. It is off by default.

Settings, including credentials, are encrypted with AES-GCM in the options
table. Configure a persistent `CRYPTO_SECRET` or `SESSION_SECRET` before saving
settings. Keep that secret unchanged across restarts and replicas. The password
is never returned to the console. Leaving the password input blank preserves
the saved password. Disabling monitoring stops future collection. The latest
sanitized snapshot and measured history are persisted in the main database and
loaded after a restart. Historical observations and snapshots expire after 30
days; cleanup runs with collection.

The primary node starts collection at startup and continues even with the
console closed. Slave nodes reject the ONT endpoints; route these requests to
the primary node. Only one primary collector should manage a given ONT because
the firmware has a low concurrent session limit.

The collector reuses its session and follows a bounded set of same-origin menu
resources. It reads HG8145-family device, optical, WAN, LAN host, WLAN, Ethernet
and WAN state pages, plus read-only ASP pages found in the firmware menu. It
does not apply router settings, reboot, back up configuration or execute
firmware JavaScript. It parses HTML label/value fields, literal data objects
embedded in scripts and selected device metadata. Password/key/token fields
are excluded before snapshots reach the console; raw HTML and cookies are not
returned or stored as monitoring data.

This is not a complete configuration backup. Menus and JavaScript formats vary
by firmware and account permissions. Pages requiring dynamic browser rendering
or unsupported data declarations explicitly report no readable data. Missing
pages, permission failures and partial collection remain visible in page
details. A failed poll preserves the last successful snapshot and its timestamp.

The dashboard separates live measurements from collected device configuration.
Equipment details use category tabs for WAN, Ethernet, wireless, clients,
optics, identity and other parameters. Key readings use compact tables with
separate live/configuration columns. Traffic counter comparisons, port tiles
and signal meters summarize dense data; advanced parameters and collection
coverage start collapsed. Inventories and events are paginated, and every
collected field remains searchable inside its category. WAN statistics merge
with the named connection rather than creating duplicate cards. It provides optical
power curves, observed Internet state, sensor sparklines, an event timeline,
and per-page collection coverage. History windows are 1/6/24 hours and 7/30 days.
Long windows are reduced to 600 evenly spaced samples plus up to 200 recent
event-bearing samples; full samples remain stored for the retention period.

Optical readings require recognizable field names and plausible explicit or
unscaled units. Unknown/scaled units remain visible as raw fields and do not
become invented numeric measurements. WAN state is inferred from explicit
textual states such as Connected/Disconnected; opaque numeric firmware states
remain unknown. For this HG8145 profile, the WAN page references
`wan_dynamicinfo.asp` and `wan_staticinfo.asp`; their allowlisted literal
constructor arguments are joined by domain. The `stOpticInfo` voltage field
under `AMP.Optic` is reported in mV by the firmware and converted to V.
The Internet service is preferred over TR-069/voice WANs.
Missing readings and long gaps break curves. A collection failure is distinct
from an observed network outage.

Marked events include observed WAN IP changes, explicit link-state transitions,
device alarm onset, collection interruption/recovery and optical changes of
at least 3 dB between samples no more than 30 minutes apart. The optical change
marker is a review heuristic, not an absolute power limit or a firmware alarm.
Event times are observation times, not proof of the precise transition instant.

The default interval is 300 seconds, configurable from 60 to 86400 seconds.
Authentication, session-limit and lock failures wait at least 15 minutes before
retrying. Manual refresh respects this wait and a minimum gap of 60 seconds
between attempts. If the router reports that the
user is already logged in, sign out of its original management page and wait
for the next scheduled poll. Saving settings with unchanged credentials keeps
the existing backend session.

All endpoints require super administrator authentication and disable caching:

- `GET /api/system/ont`: sanitized settings, timestamps and latest snapshot.
- `GET /api/system/ont/history?hours=24`: bounded history and recent events for
  the configured device and account; valid hours: 1, 6, 24, 168, 720.
- `PUT /api/system/ont/settings`: save settings; an omitted/blank password keeps
  the existing password. Requests are limited to 4 KiB.
- `POST /api/system/ont/refresh`: queue a collection, respecting the minimum gap
  and any authentication backoff.


Parameter presentation follows the console language. The observed HG8145
parameter catalog has localized labels, with original field names and raw
values retained in hover text. Unknown numeric state/mode enums remain labeled
codes rather than guessed states. Switching language does not reload or alter
the device configuration.

Traffic observations persist unsigned byte counters as decimal strings to
preserve 64-bit precision. WAN business interfaces, WLAN, physical Ethernet and
PON are separate scopes; they overlap and must not be summed into a device
total. WAN service groups use explicit firmware service metadata. No application
classification is inferred from IP addresses. Displayed cumulative counters are
not daily usage. Sampling increments and average byte rates require two
comparable observations within twice the configured interval plus 30 seconds.
Missing counters, failed samples and decreasing/reset counters leave rates
unknown; wraparound is not guessed. Existing historical observations without
traffic fields remain readable and do not become zero-traffic samples.
