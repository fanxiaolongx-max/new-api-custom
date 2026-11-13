#!/usr/bin/env python3
"""Probe every configured channel/model through new-api's admin test API."""

import argparse
import concurrent.futures
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request


class MonitorError(Exception):
    pass


def redact(message, secrets=()):
    message = str(message)
    for secret in secrets:
        if secret:
            message = message.replace(secret, "[REDACTED]")
    message = re.sub(r"(?i)bearer\s+[^\s\"'<>]+", "Bearer [REDACTED]", message)
    message = re.sub(r"\b(?:sk-|AIza)[A-Za-z0-9_\-]+", "[REDACTED]", message)
    message = re.sub(r"https?://[^\s\"'<>]+", "[upstream URL]", message)
    message = re.sub(r"(?i)((?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password)\s*[\"']?\s*[:=]\s*[\"']?)[^\s\"',}]+", r"\1[REDACTED]", message)
    return message[:800]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Client:
    def __init__(self, base_url, token, timeout=120):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self.opener = urllib.request.build_opener(NoRedirect())

    def get(self, path):
        request = urllib.request.Request(
            self.base_url + path,
            headers={"Authorization": "Bearer " + self.token, "Accept": "application/json"},
        )
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                body = response.read(4 * 1024 * 1024 + 1)
            if len(body) > 4 * 1024 * 1024:
                raise MonitorError("API response exceeds 4 MiB")
            data = json.loads(body)
            if not isinstance(data, dict):
                raise MonitorError("API response is not an object")
            return data
        except urllib.error.HTTPError as error:
            raise MonitorError(f"API HTTP {error.code}") from None
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
            raise MonitorError(redact(error, [self.token])) from None

    def channels(self):
        channels = []
        seen = set()
        for page in range(1, 10001):
            response = self.get(f"/api/channel/?p={page}&page_size=100&id_sort=true&tag_mode=false")
            data = response.get("data")
            if response.get("success") is not True or not isinstance(data, dict):
                raise MonitorError("Cannot enumerate channels: " + redact(response.get("message", "invalid response"), [self.token]))
            items = data.get("items")
            total = data.get("total")
            if not isinstance(items, list) or type(total) is not int or total < 0:
                raise MonitorError("Invalid channel pagination")
            for item in items:
                if not isinstance(item, dict) or type(item.get("id")) is not int or item["id"] in seen:
                    raise MonitorError("Channel inventory changed or pagination repeated; run again")
                seen.add(item["id"])
                channels.append({key: item.get(key) for key in ("id", "name", "type", "status", "models")})
            if len(channels) == total:
                return channels
            if not items or len(channels) > total:
                raise MonitorError("Incomplete channel inventory")
        raise MonitorError("Channel pagination limit exceeded")

    def probe(self, channel, model):
        result = {
            "channel_id": channel["id"], "channel": redact(channel["name"], [self.token]),
            "channel_status": channel["status"], "model": redact(model, [self.token]),
        }
        query = {"model": model, "stream": "true" if channel["type"] == 57 else "false"}
        try:
            response = self.get(f"/api/channel/test/{channel['id']}?" + urllib.parse.urlencode(query))
            if type(response.get("success")) is not bool:
                raise MonitorError("Invalid probe response: missing success flag")
            result.update(ok=response["success"], seconds=response.get("time"))
            if not result["ok"]:
                result["error"] = redact(response.get("message") or "Channel test failed", [self.token])
        except MonitorError as error:
            result.update(ok=False, error=redact(error, [self.token]))
        return result


def check(client, workers=2):
    channels = client.channels()
    if not channels:
        raise MonitorError("No channels found; coverage cannot be verified")
    results = []
    jobs = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for channel in channels:
            models = list(dict.fromkeys(part.strip() for part in (channel["models"] or "").split(",") if part.strip()))
            if not models:
                results.append({"channel_id": channel["id"], "channel": redact(channel["name"], [client.token]), "model": "", "channel_status": channel["status"], "ok": False, "error": "No configured models; channel not tested"})
            for model in models:
                jobs.append(pool.submit(client.probe, channel, model))
        for future in concurrent.futures.as_completed(jobs):
            results.append(future.result())
    results.sort(key=lambda item: (item["channel_id"], item["model"]))
    return {
        "channels": len(channels), "model_pairs": len(jobs),
        "passed": sum(item["ok"] for item in results),
        "failed": sum(not item["ok"] for item in results), "results": results,
        "disabled_channels": [{"id": c["id"], "name": redact(c["name"], [client.token]), "status": c["status"]} for c in channels if c["status"] != 1],
    }


def write_report(path, report):
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=".report-")
    try:
        with os.fdopen(descriptor, "w") as output:
            json.dump(report, output, ensure_ascii=False, indent=2)
            output.write("\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path.home() / ".config/new-api-channel-monitor/config.json")
    parser.add_argument("--state-dir", type=Path, default=Path.home() / ".local/state/new-api-channel-monitor")
    args = parser.parse_args()
    os.umask(0o077)
    args.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (args.state_dir / "run.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('{"monitor_error":"A check is already running; no new report produced"}')
            return 2
        report = {"started_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        token = ""
        try:
            config = {}
            if args.config.exists():
                if args.config.stat().st_mode & 0o077:
                    raise MonitorError("Config permissions must be 600 or stricter")
                config = json.loads(args.config.read_text())
            token = os.environ.get("NEW_API_MONITOR_PAT") or config.get("admin_pat", "")
            if not isinstance(token, str) or not token.strip():
                raise MonitorError("Missing admin PAT: set NEW_API_MONITOR_PAT or admin_pat in the private config file")
            base_url = config.get("base_url", "http://127.0.0.1:3000")
            parsed = urllib.parse.urlsplit(base_url)
            if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise MonitorError("Invalid base_url")
            if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
                raise MonitorError("Remote dashboard connections require HTTPS")
            timeout = config.get("timeout_seconds", 120)
            workers = config.get("workers", 2)
            if type(timeout) is not int or not 1 <= timeout <= 300 or type(workers) is not int or not 1 <= workers <= 4:
                raise MonitorError("timeout_seconds must be 1..300 and workers must be 1..4")
            report.update(check(Client(base_url, token, timeout), workers))
        except (MonitorError, OSError, ValueError, TypeError, AttributeError, KeyError) as error:
            report["monitor_error"] = redact(error, [token] if isinstance(token, str) else [])
        report["finished_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        report["ok"] = not report.get("monitor_error") and report.get("failed") == 0
        latest = args.state_dir / "latest.json"
        if latest.exists():
            os.replace(latest, args.state_dir / "previous.json")
        write_report(latest, report)
        print(json.dumps(report, ensure_ascii=False))
        return 2 if report.get("monitor_error") else (0 if report["ok"] else 1)


if __name__ == "__main__":
    sys.exit(main())
