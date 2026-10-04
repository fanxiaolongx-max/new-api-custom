import json
import os
import tempfile
import unittest

from server import PoolManager, extract_tokens, token_id, token_summary


class TestTokenParsing(unittest.TestCase):
    def test_extracts_session_json_and_deduplicates_lines(self):
        self.assertEqual(extract_tokens('{"accessToken":"token-a"}'), ["token-a"])
        self.assertEqual(extract_tokens("token-a\ntoken-a\ntoken-b"), ["token-a", "token-b"])

    def test_public_summary_never_contains_raw_token(self):
        token = "header.payload.signature-secret"
        summary = token_summary(token, set(), now=1)
        self.assertNotIn(token, json.dumps(summary))
        self.assertEqual(summary["id"], token_id(token))


class TestPoolManager(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.manager = PoolManager(self.tempdir.name, "http://chat2api:5005")
        self.calls = []
        self.manager.upstream_post = lambda path, fields=None: self.calls.append((path, fields))

    def tearDown(self):
        self.tempdir.cleanup()

    def write_tokens(self, values):
        with open(self.manager.tokens_path, "w", encoding="utf-8") as handle:
            handle.write("\n".join(values) + ("\n" if values else ""))

    def test_add_only_uploads_new_tokens(self):
        self.write_tokens(["token-a"])
        result = self.manager.add("token-a\ntoken-b")
        self.assertEqual(result, {"added": 1, "duplicates": 1})
        self.assertEqual(self.calls, [("/tokens/upload", {"text": "token-b"})])

    def test_delete_resyncs_remaining_accounts(self):
        self.write_tokens(["token-a", "token-b"])
        self.manager.delete(token_id("token-a"))
        self.assertEqual(self.calls[0], ("/tokens/clear", None))
        self.assertEqual(self.calls[1], ("/tokens/upload", {"text": "token-b"}))

    def test_strategy_update_preserves_private_api_key(self):
        old_key = self.manager.ensure_config()["api_key"]
        self.manager.set_strategy("round_robin")
        config = self.manager.ensure_config()
        self.assertEqual(config["strategy"], "round_robin")
        self.assertEqual(config["api_key"], old_key)

    def test_retry_only_removes_selected_error(self):
        self.write_tokens(["token-a", "token-b"])
        with open(self.manager.errors_path, "w", encoding="utf-8") as handle:
            handle.write("token-a\ntoken-b\n")
        self.manager.retry(token_id("token-a"))
        self.assertEqual(self.manager.read_errors(), {"token-b"})
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
