import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import urllib.parse

from monitor import Client, MonitorError, check, main, redact


class MonitorTests(unittest.TestCase):
    def test_pagination_and_every_channel_model_including_disabled(self):
        client = Client("http://localhost", "private-pat")
        paths = []

        def api(path):
            paths.append(path)
            if path.startswith("/api/channel/?"):
                page = urllib.parse.parse_qs(urllib.parse.urlsplit(path).query)["p"][0]
                channel = {"id": int(page), "name": "test", "type": 57 if page == "2" else 1,
                           "status": 2 if page == "2" else 1, "models": "a/b,a/b,model + x", "key": "must-not-be-saved"}
                return {"success": True, "data": {"items": [channel], "total": 2}}
            return {"success": True, "time": 0.1}

        with patch.object(client, "get", side_effect=api):
            report = check(client)
        self.assertEqual((report["channels"], report["model_pairs"], report["passed"]), (2, 4, 4))
        self.assertNotIn("must-not-be-saved", json.dumps(report))
        self.assertEqual(report["disabled_channels"], [{"id": 2, "name": "test", "status": 2}])
        probes = [path for path in paths if "/test/" in path]
        self.assertEqual(len(probes), 4)
        self.assertEqual({urllib.parse.parse_qs(urllib.parse.urlsplit(p).query)["model"][0] for p in probes}, {"a/b", "model + x"})
        self.assertTrue(all("stream=true" in p for p in probes if "/test/2?" in p))

    def test_incomplete_or_repeated_inventory_never_reports_healthy(self):
        client = Client("http://localhost", "pat")
        channel = {"id": 1, "models": "a"}
        for responses in [
            [{"success": True, "data": {"items": [], "total": 1}}],
            [{"success": True, "data": {"items": [channel], "total": 2}}] * 2,
            [{"success": True, "data": {"items": [], "total": 0}}],
        ]:
            with self.subTest(responses=responses), patch.object(client, "get", side_effect=responses):
                with self.assertRaises(MonitorError):
                    check(client)

    def test_http_200_failure_timeout_and_invalid_responses_are_failures(self):
        client = Client("http://localhost", "private-pat")
        channel = {"id": 1, "name": "test", "type": 1, "status": 3}
        for value in [
            {"success": False, "message": "unsupported channel type"},
            {"message": "unexpected response"},
            MonitorError("timeout using Bearer private-pat"),
        ]:
            with self.subTest(value=value):
                options = {"side_effect": value} if isinstance(value, Exception) else {"return_value": value}
                with patch.object(client, "get", **options):
                    result = client.probe(channel, "model")
                self.assertFalse(result["ok"])
                self.assertNotIn("private-pat", json.dumps(result))

    def test_http_auth_failure_hides_body_and_credentials(self):
        client = Client("http://localhost", "private-pat")
        error = urllib.error.HTTPError("http://localhost", 401, "Unauthorized", {}, io.BytesIO(b"sensitive response"))
        with patch.object(client.opener, "open", side_effect=error):
            with self.assertRaisesRegex(MonitorError, "API HTTP 401"):
                client.channels()

    def test_missing_configuration_replaces_stale_green_report(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            (state / "latest.json").write_text('{"ok": true}')
            args = ["monitor", "--config", str(state / "missing.json"), "--state-dir", directory]
            with patch("sys.argv", args), patch.dict("os.environ", {"NEW_API_MONITOR_PAT": ""}), contextlib.redirect_stdout(io.StringIO()):
                code = main()
            report = json.loads((state / "latest.json").read_text())
            self.assertEqual(code, 2)
            self.assertFalse(report["ok"])
            self.assertIn("Missing admin PAT", report["monitor_error"])
            self.assertEqual(json.loads((state / "previous.json").read_text()), {"ok": True})
            self.assertEqual((state / "latest.json").stat().st_mode & 0o777, 0o600)

    def test_error_redaction(self):
        message = 'Bearer opaque-secret https://user:pass@example.org/?key=secret api_key="other-secret" sk-secretkey'
        cleaned = redact(message)
        for secret in ("opaque-secret", "user:pass", "example.org", "other-secret", "sk-secretkey"):
            self.assertNotIn(secret, cleaned)


if __name__ == "__main__":
    unittest.main()
