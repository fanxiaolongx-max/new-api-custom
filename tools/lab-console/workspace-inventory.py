"""Publish console bindings for the dashboard without exporting connection credentials."""
import json
import os
import subprocess
from pathlib import Path

slots_path = Path("/var/lib/new-api-vm-agent/lab-os-slots.json")
output = Path("/run/new-api-vm-agent/workspace-consoles.json")
sql = """SELECT coalesce(json_agg(row_to_json(c)), '[]') FROM (
  SELECT connection_id AS id, connection_name AS name, protocol,
         (SELECT json_object_agg(parameter_name,parameter_value)
          FROM guacamole_connection_parameter p WHERE p.connection_id=g.connection_id
          AND parameter_name IN ('hostname','port','username')) AS endpoint
  FROM guacamole_connection g
  WHERE protocol IN ('ssh', 'rdp', 'vnc') OR (protocol = 'telnet' AND connection_name ~* '(^|[-_ ])(LSW|SW)[0-9]+$')
  ORDER BY connection_id
) c"""
rows = json.loads(subprocess.check_output(
    ["docker", "exec", "-i", "postgres", "sh", "-c",
     'exec psql -XqAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d guacamole'],
    input=sql, text=True, timeout=10,
))
remote_ids = {row["id"] for row in rows if row["protocol"] in ("ssh", "rdp", "vnc")}
slots = json.loads(slots_path.read_text()) if slots_path.exists() else []
bindings = {
    row["name"]: row["id"]
    for row in rows
    if row["protocol"] in ("ssh", "rdp", "vnc") and not row["name"].endswith(" (root)")
}
bindings.update({
    slot["vm"]: node["console_id"]
    for slot in slots for node in slot["nodes"]
    if node["id"] == "os" and node["console_id"] in remote_ids
})
ssh = {row["id"]: row for row in rows if row["protocol"] == "ssh" and row["endpoint"]}
for row in ssh.values():
    if row["name"] == "openEuler":
        bindings["openEuler"] = row["id"]
root_by_endpoint = {
    (row["name"], row["endpoint"].get("hostname"), row["endpoint"].get("port")): row["id"]
    for row in ssh.values() if row["endpoint"].get("username") == "root"
}
root_consoles = {}
for vm, connection in bindings.items():
    base = ssh.get(connection)
    if not base or base["endpoint"].get("username") != "dragon":
        continue
    endpoint = base["endpoint"]
    root = root_by_endpoint.get((base["name"] + " (root)", endpoint.get("hostname"), endpoint.get("port")))
    if root:
        root_consoles[vm] = root
switches = [dict(name=row["name"], id=row["id"]) for row in rows if row["protocol"] == "telnet"]
tmp = output.with_suffix(".tmp")
tmp.write_text(json.dumps(dict(switches=switches, vm_consoles=bindings, root_consoles=root_consoles)))
os.replace(tmp, output)
