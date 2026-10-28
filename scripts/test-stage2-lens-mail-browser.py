#!/usr/bin/env python3
"""Strictly local GoTrue callback E2E: temporary 9443 allowlist, always restore 8443.

Never reset the database or overwrite the long-lived Auth backup. No secrets logged.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from uuid import uuid4

AUTH = "supabase_auth_Aisencore"
STANDBY = AUTH + "_stage2_8443_standby"
KONG = "supabase_kong_Aisencore"
NETWORK = "supabase_network_Aisencore"
IMAGE = "public.ecr.aws/supabase/gotrue:v2.197.0"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def short_ttl_expiry_test() -> None:
    """Exercise expired *real* GoTrue OTPs, not random invalid tokens."""
    cmd = subprocess.run(["cmd.exe", "/d", "/s", "/c",
                          "pnpm dlx supabase status --output json"],
                         capture_output=True, text=True, timeout=65, check=True)
    cfg = json.loads(cmd.stdout)
    assert cfg["API_URL"] == "http://127.0.0.1:55321"
    assert cfg["MAILPIT_URL"] == "http://127.0.0.1:55324"
    public, service = cfg["PUBLISHABLE_KEY"], cfg["SERVICE_ROLE_KEY"]
    prefix = cfg["API_URL"]
    ids: list[str] = []
    suffix = uuid4().hex[:14]
    password = "LocalExpiry!" + uuid4().hex

    def call(url: str, method="GET", data=None, key=public):
        headers = {"apikey": key, "authorization": "Bearer " + key}
        body = None
        if data is not None:
            body = json.dumps(data).encode()
            headers["content-type"] = "application/json"
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.build_opener(NoRedirect).open(req, timeout=12) as res:
                return res.status, res.read().decode("utf-8", "replace"), res.headers.get("Location", "")
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read().decode("utf-8", "replace"), exc.headers.get("Location", "")

    def inbox_link(email: str, kind: str) -> str:
        deadline = time.monotonic() + 28
        while time.monotonic() < deadline:
            with urllib.request.urlopen(cfg["MAILPIT_URL"] + "/api/v1/messages", timeout=5) as res:
                rows = json.load(res).get("messages", [])
            for row in rows:
                if not any(v.get("Address", "").lower() == email for v in row.get("To", [])):
                    continue
                with urllib.request.urlopen(cfg["MAILPIT_URL"] + "/api/v1/message/" +
                                            urllib.parse.quote(row["ID"]), timeout=5) as res:
                    detail = json.load(res)
                text = str(detail.get("Text", "")) + "\n" + str(detail.get("HTML", ""))
                match = re.search(re.escape(prefix + "/auth/v1/verify?") + r'[^\s<>"\']+', text)
                if match:
                    link = match.group().replace("&amp;", "&")
                    if urllib.parse.parse_qs(urllib.parse.urlsplit(link).query).get("type") == [kind]:
                        return link
            time.sleep(.3)
        raise AssertionError("Real " + kind + " mail not delivered")

    def assert_expired(link: str, kind: str) -> None:
        status, body, location = call(link)
        # GoTrue may redirect to the allowed callback with error_code or
        # respond with an HTTP error. Either must explicitly say otp_expired.
        assert "otp_expired" in (body + location), (kind, status,
            "unexpected response (without echoing the private token)")
        assert status >= 300, (kind, "expired proof unexpectedly accepted")

    def local_user_id(email: str) -> str:
        assert re.fullmatch(r"[a-z0-9@.\-]+", email)
        result = docker("exec", "supabase_db_Aisencore", "psql", "-X", "-qAt",
                        "-U", "postgres", "-d", "postgres", "-c",
                        "SELECT id FROM auth.users WHERE email='" + email + "'")
        assert re.fullmatch(r"[0-9a-f-]{36}", result)
        return result

    try:
        signup_email = "lens-ttl-" + suffix + "-confirm@example.invalid"
        status, _, _ = call(prefix + "/auth/v1/signup?redirect_to=" +
                            urllib.parse.quote("http://127.0.0.1:9443/auth/confirm", safe=""),
                            "POST", {"email": signup_email, "password": password})
        assert status == 200, "Real signup failed"
        ids.append(local_user_id(signup_email))
        confirm = inbox_link(signup_email, "signup")
        # A separate confirmed QA user is needed; signup proof is intentionally
        # allowed to expire before it can confirm this unconfirmed user.
        recovery_email = "lens-ttl-" + suffix + "-recovery@example.invalid"
        status, data, _ = call(prefix + "/auth/v1/admin/users", "POST",
                               {"email": recovery_email, "password": password,
                                "email_confirm": True}, service)
        assert status == 200, "Confirmed QA user creation failed"
        ids.append(json.loads(data)["id"])
        status, _, _ = call(prefix + "/auth/v1/recover?redirect_to=" +
                            urllib.parse.quote("http://127.0.0.1:9443/auth/reset-password", safe=""),
                            "POST", {"email": recovery_email})
        assert status == 200, "Real recovery request failed"
        recovery = inbox_link(recovery_email, "recovery")
        time.sleep(6)  # Temporary GoTrue is configured to 2-second OTP TTL.
        assert_expired(confirm, "signup")
        assert_expired(recovery, "recovery")
        assert docker("exec", "supabase_db_Aisencore", "psql", "-X", "-qAt",
                      "-U", "postgres", "-d", "postgres", "-c",
                      "SELECT email_confirmed_at IS NULL FROM auth.users WHERE id='" +
                      ids[0] + "'") == "t", "Expired confirmation changed account"
        status, _, _ = call(prefix + "/auth/v1/token?grant_type=password", "POST",
                            {"email": recovery_email, "password": password})
        assert status == 200, "Expired recovery unexpectedly changed the old password"
        print("REAL_GOTRUE_2S_EXPIRED_SIGNUP_AND_RECOVERY PASS", flush=True)
    finally:
        for user_id in ids:
            status, _, _ = call(prefix + "/auth/v1/admin/users/" + user_id, "DELETE",
                                key=service)
            assert status in (200, 204), "QA identity cleanup failed"
        count = docker("exec", "supabase_db_Aisencore", "psql", "-X", "-qAt",
                       "-U", "postgres", "-d", "postgres", "-c",
                       "SELECT count(*) FROM auth.users")
        assert count == "1", "Local QA Auth cleanup failed"


def docker(*args: str, timeout: int = 65) -> str:
    result = subprocess.run(["docker", *args], capture_output=True,
                            encoding="utf-8", errors="replace", timeout=timeout)
    if result.returncode:
        raise RuntimeError("docker " + args[0] + " failed: " + result.stderr[-400:])
    return result.stdout.strip()


def inspect(name: str) -> dict:
    return json.loads(docker("inspect", name))[0]


def main() -> None:
    expired_only = len(sys.argv) == 2 and sys.argv[1] == "--test-expired-only"
    assert expired_only or len(sys.argv) == 1, "Unsupported test mode"
    original = inspect(AUTH)
    assert original["State"]["Running"] and not original["Mounts"]
    assert original["Config"]["Image"] == IMAGE
    assert NETWORK in original["NetworkSettings"]["Networks"]
    assert "8443" in next(value for value in original["Config"]["Env"]
                          if value.startswith("GOTRUE_URI_ALLOW_LIST="))
    assert docker("inspect", "supabase_db_Aisencore")
    assert subprocess.run(["docker", "inspect", STANDBY], capture_output=True).returncode != 0
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 9443))
    additions = [
        "http://127.0.0.1:9443/auth/confirm",
        "http://127.0.0.1:9443/auth/reset-password",
        "http://localhost:9443/auth/confirm",
        "http://localhost:9443/auth/reset-password",
    ]
    env = [value + "," + ",".join(additions)
           if value.startswith("GOTRUE_URI_ALLOW_LIST=")
           else "GOTRUE_MAILER_OTP_EXP=2"
           if expired_only and value.startswith("GOTRUE_MAILER_OTP_EXP=")
           else value for value in original["Config"]["Env"]]
    if expired_only:
        assert any(x == "GOTRUE_MAILER_OTP_EXP=2" for x in env)
    fd, path = tempfile.mkstemp(prefix="aisencore-gotrue-qa-", suffix=".env")
    os.chmod(path, 0o600)
    renamed = False
    created = False
    outcome = 1
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as file:
            for value in env:
                file.write(value + "\n")
        docker("rename", AUTH, STANDBY)
        renamed = True
        docker("stop", "--time", "10", STANDBY)
        command = ["run", "-d", "--name", AUTH, "--network", NETWORK,
                   "--network-alias", "auth", "--restart", "unless-stopped",
                   "--env-file", path]
        for name, value in (original["Config"].get("Labels") or {}).items():
            command += ["--label", name + "=" + value]
        health = original["Config"].get("Healthcheck") or {}
        if len(health.get("Test") or []) > 1:
            command += ["--health-cmd", health["Test"][-1]]
            if health.get("Interval"):
                command += ["--health-interval", str(health["Interval"] / 1e9) + "s"]
            if health.get("Retries"):
                command += ["--health-retries", str(health["Retries"])]
        command += [IMAGE, *(original["Config"]["Cmd"] or [])]
        docker(*command, timeout=80)
        created = True
        docker("restart", KONG, timeout=65)
        healthy = False
        for _ in range(30):
            if inspect(AUTH)["State"].get("Health", {}).get("Status") == "healthy":
                try:
                    with urllib.request.urlopen("http://127.0.0.1:55321/auth/v1/health",
                                                timeout=4) as response:
                        if response.status == 200:
                            healthy = True
                            break
                except Exception:
                    pass
            time.sleep(2)
        assert healthy, "Temporary GoTrue not healthy"
        print("TEMP_CALLBACK_9443_READY", flush=True)
        if expired_only:
            short_ttl_expiry_test()
            outcome = 0
        else:
            lens = pathlib.Path("E:/Projects/Aisenlens")
            assert (lens / "tests/features/workflow/core-auth-mail.browser.test.js").is_file()
            child_env = os.environ.copy()
            child_env["AISENLENS_TEST_CALLBACK_PORT"] = "9443"
            child_env["PYTHONUTF8"] = "1"
            result = subprocess.run(["node.exe", "--test", "--test-concurrency=1",
                                     "tests/features/workflow/core-auth-mail.browser.test.js"],
                                    cwd=lens, env=child_env, capture_output=True,
                                    encoding="utf-8", errors="replace", timeout=190)
            outcome = result.returncode
            print("LENS_MAIL_BROWSER_EXIT", outcome, flush=True)
            printable = (result.stdout + "\n" + result.stderr)[-7000:]
            print(printable.encode("ascii", "backslashreplace").decode("ascii"), flush=True)
    finally:
        if created:
            subprocess.run(["docker", "stop", "--time", "10", AUTH], capture_output=True, timeout=45)
            subprocess.run(["docker", "rm", AUTH], capture_output=True, timeout=45)
        if renamed:
            docker("rename", STANDBY, AUTH)
            docker("start", AUTH)
            docker("restart", KONG, timeout=65)
            assert inspect(AUTH)["State"]["Running"]
            if expired_only:
                restored_ttl = next(v for v in inspect(AUTH)["Config"]["Env"]
                                    if v.startswith("GOTRUE_MAILER_OTP_EXP="))
                assert restored_ttl == next(v for v in original["Config"]["Env"]
                                            if v.startswith("GOTRUE_MAILER_OTP_EXP="))
            allowlist = next(value for value in inspect(AUTH)["Config"]["Env"]
                             if value.startswith("GOTRUE_URI_ALLOW_LIST="))
            assert "8443" in allowlist and "9443" not in allowlist
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        print("RESTORE_8443_AUTH PASS temporary callback removed, existing DB preserved", flush=True)
    assert outcome == 0, "Lens mail Chrome test did not pass"
    print("LENS_AUTH_MAIL_E2E PASS", flush=True)


if __name__ == "__main__":
    main()
