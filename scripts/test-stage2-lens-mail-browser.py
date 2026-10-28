#!/usr/bin/env python3
"""Strictly local GoTrue callback E2E: temporary 9443 allowlist, always restore 8443.

Never reset the database or overwrite the long-lived Auth backup. No secrets logged.
"""
from __future__ import annotations

import json
import os
import pathlib
import socket
import subprocess
import tempfile
import time
import urllib.request

AUTH = "supabase_auth_Aisencore"
STANDBY = AUTH + "_stage2_8443_standby"
KONG = "supabase_kong_Aisencore"
NETWORK = "supabase_network_Aisencore"
IMAGE = "public.ecr.aws/supabase/gotrue:v2.197.0"


def docker(*args: str, timeout: int = 65) -> str:
    result = subprocess.run(["docker", *args], capture_output=True,
                            encoding="utf-8", errors="replace", timeout=timeout)
    if result.returncode:
        raise RuntimeError("docker " + args[0] + " failed: " + result.stderr[-400:])
    return result.stdout.strip()


def inspect(name: str) -> dict:
    return json.loads(docker("inspect", name))[0]


def main() -> None:
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
           if value.startswith("GOTRUE_URI_ALLOW_LIST=") else value
           for value in original["Config"]["Env"]]
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
        # Windows consoles can default to GBK; evidence must not fail on UTF-8 checkmarks.
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
