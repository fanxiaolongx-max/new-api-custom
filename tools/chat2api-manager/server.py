#!/usr/bin/env python3
import base64
import hashlib
import json
import os
import secrets
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


MAX_REQUEST_BYTES = 1024 * 1024
MAX_TOKENS_PER_REQUEST = 200
VALID_STRATEGIES = {"random", "round_robin"}


def decode_jwt_payload(token):
    parts = token.split(".")
    if len(parts) < 2:
        return {}
    try:
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(payload).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return {}


def extract_tokens(raw):
    raw = raw.strip()
    if not raw:
        return []

    try:
        payload = json.loads(raw)
        if isinstance(payload, dict) and isinstance(payload.get("accessToken"), str):
            raw = payload["accessToken"]
    except json.JSONDecodeError:
        pass

    tokens = []
    seen = set()
    for line in raw.splitlines():
        value = line.strip()
        if not value or value.startswith("#"):
            continue
        try:
            payload = json.loads(value)
            if isinstance(payload, dict) and isinstance(payload.get("accessToken"), str):
                value = payload["accessToken"].strip()
        except json.JSONDecodeError:
            pass
        if value and value not in seen:
            seen.add(value)
            tokens.append(value)
    return tokens


def token_id(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:20]


def token_summary(token, error_tokens, now=None):
    now = int(time.time()) if now is None else now
    claims = decode_jwt_payload(token)
    profile = claims.get("https://api.openai.com/profile") or {}
    auth = claims.get("https://api.openai.com/auth") or {}
    email = profile.get("email") or claims.get("email") or claims.get("preferred_username")
    expires_at = claims.get("exp") if isinstance(claims.get("exp"), int) else None
    token_type = "refresh" if len(token) == 45 and "." not in token else "access"
    status = "active"
    if token in error_tokens:
        status = "error"
    elif expires_at is not None and expires_at <= now:
        status = "expired"
    return {
        "id": token_id(token),
        "email": email or ("RefreshToken account" if token_type == "refresh" else "ChatGPT account"),
        "plan": str(auth.get("chatgpt_plan_type") or "unknown").upper(),
        "token_type": token_type,
        "expires_at": expires_at,
        "status": status,
        "masked_token": f"{token[:6]}…{token[-4:]}" if len(token) > 12 else "••••••",
    }


class PoolManager:
    def __init__(self, data_dir, upstream_url):
        self.data_dir = data_dir
        self.upstream_url = upstream_url.rstrip("/")
        self.tokens_path = os.path.join(data_dir, "token.txt")
        self.errors_path = os.path.join(data_dir, "error_token.txt")
        self.config_path = os.path.join(data_dir, "pool_config.json")
        self.lock = threading.Lock()
        os.makedirs(data_dir, exist_ok=True)
        self.ensure_config()

    def read_lines(self, path):
        try:
            with open(path, encoding="utf-8") as handle:
                return [line.strip() for line in handle if line.strip() and not line.startswith("#")]
        except FileNotFoundError:
            return []

    def read_tokens(self):
        return list(dict.fromkeys(self.read_lines(self.tokens_path)))

    def read_errors(self):
        return set(self.read_lines(self.errors_path))

    def atomic_json_write(self, path, value):
        descriptor, temporary_path = tempfile.mkstemp(prefix=".pool-", dir=self.data_dir)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump(value, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
            os.chmod(temporary_path, 0o600)
            os.replace(temporary_path, path)
        finally:
            if os.path.exists(temporary_path):
                os.unlink(temporary_path)

    def ensure_config(self):
        config = {}
        try:
            with open(self.config_path, encoding="utf-8") as handle:
                config = json.load(handle)
        except (FileNotFoundError, json.JSONDecodeError):
            pass
        changed = False
        if config.get("strategy") not in VALID_STRATEGIES:
            config["strategy"] = "random"
            changed = True
        if not isinstance(config.get("api_key"), str) or len(config["api_key"]) < 32:
            config["api_key"] = "pool-" + secrets.token_urlsafe(32)
            changed = True
        if changed:
            self.atomic_json_write(self.config_path, config)
        return config

    def public_state(self):
        with self.lock:
            tokens = self.read_tokens()
            errors = self.read_errors()
            accounts = [token_summary(token, errors) for token in tokens]
            counts = {"total": len(accounts), "active": 0, "error": 0, "expired": 0}
            for account in accounts:
                counts[account["status"]] += 1
            return {
                "accounts": accounts,
                "counts": counts,
                "strategy": self.ensure_config()["strategy"],
            }

    def upstream_post(self, path, fields=None):
        body = urllib.parse.urlencode(fields or {}).encode("utf-8")
        request = urllib.request.Request(
            self.upstream_url + path,
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                if response.status < 200 or response.status >= 300:
                    raise RuntimeError(f"Chat2API returned HTTP {response.status}")
        except (urllib.error.URLError, TimeoutError) as error:
            raise RuntimeError("Chat2API is unavailable") from error

    def add(self, raw):
        candidates = extract_tokens(raw)
        if not candidates:
            raise ValueError("No valid token was found")
        if len(candidates) > MAX_TOKENS_PER_REQUEST:
            raise ValueError(f"At most {MAX_TOKENS_PER_REQUEST} tokens can be added at once")
        with self.lock:
            existing = set(self.read_tokens())
            additions = [token for token in candidates if token not in existing]
            if additions:
                self.upstream_post("/tokens/upload", {"text": "\n".join(additions)})
            return {"added": len(additions), "duplicates": len(candidates) - len(additions)}

    def resync(self, tokens, clear_errors=False):
        self.upstream_post("/tokens/clear")
        if tokens:
            self.upstream_post("/tokens/upload", {"text": "\n".join(tokens)})
        if clear_errors:
            with open(self.errors_path, "w", encoding="utf-8"):
                pass

    def delete(self, account_id):
        with self.lock:
            tokens = self.read_tokens()
            remaining = [token for token in tokens if token_id(token) != account_id]
            if len(remaining) == len(tokens):
                raise KeyError("Account not found")
            errors = self.read_errors()
            removed = set(tokens) - set(remaining)
            self.resync(remaining)
            with open(self.errors_path, "w", encoding="utf-8") as handle:
                for token in errors - removed:
                    handle.write(token + "\n")

    def retry(self, account_id):
        with self.lock:
            tokens = self.read_tokens()
            selected = next((token for token in tokens if token_id(token) == account_id), None)
            if selected is None:
                raise KeyError("Account not found")
            errors = self.read_errors()
            with open(self.errors_path, "w", encoding="utf-8") as handle:
                for token in errors - {selected}:
                    handle.write(token + "\n")

    def clear(self):
        with self.lock:
            self.resync([], clear_errors=True)

    def set_strategy(self, strategy):
        if strategy not in VALID_STRATEGIES:
            raise ValueError("Invalid routing strategy")
        with self.lock:
            config = self.ensure_config()
            config["strategy"] = strategy
            self.atomic_json_write(self.config_path, config)
        return strategy


class RequestHandler(BaseHTTPRequestHandler):
    manager = None

    def log_message(self, message, *args):
        print(f"chat2api-manager: {self.address_string()} {message % args}", flush=True)

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("Invalid Content-Length") from error
        if length <= 0 or length > MAX_REQUEST_BYTES:
            raise ValueError("Invalid request size")
        try:
            return json.loads(self.rfile.read(length))
        except json.JSONDecodeError as error:
            raise ValueError("Invalid JSON body") from error

    def do_GET(self):
        if self.path == "/healthz":
            self.send_json(200, {"status": "ok"})
            return
        if self.path == "/accounts":
            self.send_json(200, {"success": True, "data": self.manager.public_state()})
            return
        self.send_json(404, {"success": False, "message": "Not found"})

    def do_POST(self):
        try:
            if self.path == "/accounts":
                payload = self.read_json()
                result = self.manager.add(str(payload.get("tokens", "")))
                self.send_json(200, {"success": True, "data": result})
                return
            if self.path.startswith("/accounts/") and self.path.endswith("/retry"):
                account_id = self.path.split("/")[2]
                self.manager.retry(account_id)
                self.send_json(200, {"success": True})
                return
            self.send_json(404, {"success": False, "message": "Not found"})
        except ValueError as error:
            self.send_json(400, {"success": False, "message": str(error)})
        except KeyError as error:
            self.send_json(404, {"success": False, "message": error.args[0]})
        except RuntimeError as error:
            self.send_json(502, {"success": False, "message": str(error)})

    def do_PUT(self):
        try:
            if self.path == "/settings":
                payload = self.read_json()
                strategy = self.manager.set_strategy(str(payload.get("strategy", "")))
                self.send_json(200, {"success": True, "data": {"strategy": strategy}})
                return
            self.send_json(404, {"success": False, "message": "Not found"})
        except ValueError as error:
            self.send_json(400, {"success": False, "message": str(error)})

    def do_DELETE(self):
        try:
            if self.path == "/accounts":
                self.manager.clear()
                self.send_json(200, {"success": True})
                return
            if self.path.startswith("/accounts/"):
                self.manager.delete(self.path.split("/")[2])
                self.send_json(200, {"success": True})
                return
            self.send_json(404, {"success": False, "message": "Not found"})
        except KeyError as error:
            self.send_json(404, {"success": False, "message": error.args[0]})
        except RuntimeError as error:
            self.send_json(502, {"success": False, "message": str(error)})


def main():
    data_dir = os.getenv("CHAT2API_DATA_DIR", "/app/data")
    upstream_url = os.getenv("CHAT2API_URL", "http://chat2api:5005")
    RequestHandler.manager = PoolManager(data_dir, upstream_url)
    server = ThreadingHTTPServer(("0.0.0.0", 5010), RequestHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
