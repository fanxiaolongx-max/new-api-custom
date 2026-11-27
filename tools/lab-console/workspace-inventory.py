"""Publish console bindings for the dashboard without exporting connection credentials."""
import json
import os
import subprocess
from pathlib import Path

slots_path = Path("/var/lib/new-api-vm-agent/lab-os-slots.json")
output = Path("/run/new-api-vm-agent/workspace-consoles.json")
sql = """SELECT coalesce(json_agg(row_to_json(c)), '[]') FROM (
  SELECT connection_id AS id, connection_name AS name, protocol
  FROM guacamole_connection
  WHERE protocol = 'ssh' OR (protocol = 'telnet' AND connection_name ~* '(^|[-_ ])(LSW|SW)[0-9]+$')
  ORDER BY connection_id
) c"""
rows = json.loads(subprocess.check_output(
    ["docker", "exec", "-i", "postgres", "sh", "-c",
     'exec psql -XqAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d guacamole'],
    input=sql, text=True, timeout=10,
))
ssh_ids = {row["id"] for row in rows if row["protocol"] == "ssh"}
slots = json.loads(slots_path.read_text()) if slots_path.exists() else []
bindings = {slot["vm"]: node["console_id"] for slot in slots for node in slot["nodes"]
            if node["id"] == "os" and node["console_id"] in ssh_ids}
switches = [dict(name=row["name"], id=row["id"]) for row in rows if row["protocol"] == "telnet"]
tmp = output.with_suffix(".tmp")
tmp.write_text(json.dumps(dict(switches=switches, vm_consoles=bindings)))
os.replace(tmp, output)
