#!/usr/bin/env python3
"""F07/R-16 and V4-retired-RPC isolated-in-transaction local pgTAP regression.

Uses ONLY the known AisenCore local database container on port 55322.
After the joint-dev local migration, each fixture runs in its own transaction
and MUST end with ROLLBACK. This is NOT an Edge/JWT E2E test.
No Supabase CLI db reset/push/migration up, no cloud resources.
"""
from __future__ import annotations

from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
CONTAINER = "supabase_db_Aisencore"
CASES = (
    ("001_core_foundation.test.sql", 25),
    ("002_membership_rls.test.sql", 10),
    ("003_entitlements_and_redemption_schema.test.sql", 57),
    ("004_membership_and_admin_rpcs.test.sql", 70),
    ("005_redemption_and_grant_rpcs.test.sql", 93),
    ("006_admin_user_lookup.test.sql", 47),
    ("007_admin_grant_request_lookup.test.sql", 19),
    ("008_feedback_foundation.test.sql", 32),
    ("009_feedback_rpcs.test.sql", 59),
    ("010_feedback_v2_inbox.test.sql", 30),
    ("011_feedback_v2_export.test.sql", 8),
    ("012_feedback_v3_lightweight.test.sql", 28),
    ("013_feedback_scoped_recovery.test.sql", 24),
    ("014_feedback_contact.test.sql", 15),
    ("015_backend_audit.test.sql", 29),
    ("016_dashboard_and_integrity.test.sql", 8),
)


def run(*args: str, input_text: str | None = None, timeout: int = 90):
    return subprocess.run(
        ["docker", *args], input=input_text, text=True,
        encoding="utf-8", capture_output=True, timeout=timeout, check=False
    )


def sql_config() -> tuple[str, ...]:
    return (
        "exec", "-i", CONTAINER, "psql", "-X", "-qAt",
        "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
    )


def check_existing_contract() -> None:
    statement = (
        "SELECT to_regprocedure('public.my_feedback(uuid)') IS NULL,"
        "to_regprocedure('public.my_feedback(text,uuid)') IS NOT NULL,"
        "(SELECT count(*) FROM auth.users WHERE id="
        "'1a000000-0000-4000-8000-000000000001');"
    )
    outcome = run(*sql_config(), "-c", statement, timeout=20)
    if outcome.returncode != 0 or outcome.stdout.strip() != "t|t|0":
        raise RuntimeError(
            "Known local database signature or cleanup marker changed; "
            "aborting without applying any migration"
        )


def main() -> None:
    if sys.argv[1:] not in ([], ['--feedback-only']):
        raise RuntimeError('Only --feedback-only or the full suite is supported')
    cases = (tuple(case for case in CASES if 'feedback' in case[0])
             if sys.argv[1:] else CASES)
    port = run("port", CONTAINER, "5432/tcp", timeout=20)
    if port.returncode != 0 or not re.search(r":55322\b", port.stdout):
        raise RuntimeError("Unsafe container/port mapping, expected :55322")
    check_existing_contract()
    total = 0
    for fixture, expected in cases:
        fixture_sql = (ROOT / "supabase/tests/database" / fixture).read_text("utf-8")
        if not fixture_sql.rstrip().endswith("ROLLBACK;"):
            raise RuntimeError(f"Fixture lacks guaranteed final ROLLBACK: {fixture}")
        result = run(*sql_config(), input_text=(
            fixture_sql
        ), timeout=100)
        oks = re.findall(r"^ok\s+\d+\s*-", result.stdout, flags=re.MULTILINE)
        failed = re.findall(r"^not ok\s+\d+", result.stdout, flags=re.MULTILINE)
        plans = re.findall(r"^1\.\.\d+$", result.stdout, flags=re.MULTILINE)
        print(f"{fixture}: exit={result.returncode} PASS={len(oks)}/{expected}")
        if (result.returncode != 0 or len(oks) != expected or failed or
                f"1..{expected}" not in plans):
            print(result.stdout[-2400:])
            print(result.stderr[-1200:])
            raise RuntimeError(f"pgTAP failure: {fixture}")
        check_existing_contract()
        total += len(oks)
    print(f"PASS {total}/{sum(case[1] for case in cases)}; "
          "all fixture transactions rolled back; installed migrations untouched")


if __name__ == "__main__":
    main()
