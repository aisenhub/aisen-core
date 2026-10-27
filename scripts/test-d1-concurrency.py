#!/usr/bin/env python3
"""D1 LCK-01..07: actual independent PostgreSQL connections through local Docker.

Uses only Python's standard library; never connects to a linked/cloud database.
All test identities, codes and products are synthetic; fixtures are removed.
A held transaction plus pg_stat_activity must prove a real lock wait in each
scenario before releasing the blocker (not merely near-simultaneous requests).
"""
from __future__ import annotations

import concurrent.futures
import json
import re
import subprocess
import sys
import time
from dataclasses import dataclass

CONTAINER = "supabase_db_Aisencore"
USERS = [f"14000000-0000-4000-8000-{i:012d}" for i in range(1, 9)]
ADMIN_A, ADMIN_B, RENEW, RACE_A, RACE_B, MEMBER, LIMIT_USER, MIX_USER = USERS
PRODUCT_A = "24000000-0000-4000-8000-000000000001"
PRODUCT_B = "24000000-0000-4000-8000-000000000002"
PRODUCT_KEY_A = "lck_product_a"
PRODUCT_KEY_B = "lck_product_b"
MA = "34000000-0000-4000-8000-000000000001"


@dataclass
class Result:
    status: int
    out: str
    err: str

    def json(self) -> dict:
        assert self.status == 0, (self.out, self.err)
        return json.loads(self.out.strip().splitlines()[-1])


def quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def psql(sql: str, timeout: int = 45) -> Result:
    proc = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-X", "-qAt", "-U", "postgres",
         "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
         "-c", sql],
        text=True, encoding="utf-8", errors="replace", capture_output=True,
        timeout=timeout,
    )
    return Result(proc.returncode, proc.stdout, proc.stderr)


def root(sql: str) -> str:
    result = psql(sql)
    if result.status != 0:
        raise AssertionError(f"SQL setup/query failed: {result.err}")
    return result.out.strip()


def as_user(actor: str, expression: str, *, aal: str = "aal1", app: str = "lck_plain") -> Result:
    assert re.fullmatch(r"[a-z0-9_]+", app)
    sql = (f"SET application_name={quote(app)};"
           "BEGIN;"
           "SET LOCAL ROLE authenticated;"
           f"SET LOCAL request.jwt.claim.sub={quote(actor)};"
           f"SET LOCAL request.jwt.claims={quote(json.dumps({'aal': aal}))};"
           f"SELECT {expression};"
           "COMMIT;")
    return psql(sql)


def expect_ok(result: Result, predicate, label: str) -> dict:
    payload = result.json()
    assert predicate(payload), f"{label}: unexpected payload {payload}"
    return payload


def expect_error(result: Result, states: tuple[str, ...], label: str) -> None:
    assert result.status != 0, f"{label}: should fail but succeeded: {result.out}"
    assert any(f"{state}:" in result.err for state in states), (
        f"{label}: wrong SQLSTATE (wanted {states}): {result.err}"
    )
    assert "40P01" not in result.err, f"{label}: deadlock detected"


class Holder:
    """Keeps one open PostgreSQL transaction and explicitly releases its lock."""

    def __init__(self, lock_sql: str):
        self.proc = subprocess.Popen(
            ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-qAt",
             "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", errors="replace", bufsize=1,
        )
        assert self.proc.stdin and self.proc.stdout
        self.proc.stdin.write(f"BEGIN;\n{lock_sql};\nSELECT 'LOCK_READY';\n")
        self.proc.stdin.flush()
        for _ in range(10):
            line = self.proc.stdout.readline()
            if "LOCK_READY" in line:
                break
            if self.proc.poll() is not None:
                raise AssertionError("holder failed before lock acquisition")
        else:
            raise AssertionError("holder did not confirm transaction lock")
        self.released = False

    def release(self):
        if not self.released:
            assert self.proc.stdin
            self.proc.stdin.write("COMMIT;\n\\q\n")
            self.proc.stdin.flush()
            _, err = self.proc.communicate(timeout=30)
            assert self.proc.returncode == 0, f"holder failed: {err}"
            self.released = True

    def close(self):
        if not self.released:
            try:
                self.release()
            except Exception:
                self.proc.kill()
                self.proc.wait(timeout=10)


def waiting(app_prefix: str, timeout: float = 16.0) -> None:
    # pg_stat_activity observes backend wait_event_type='Lock', not elapsed-time guessing.
    query = ("SELECT count(*) FROM pg_catalog.pg_stat_activity "
             f"WHERE application_name LIKE {quote(app_prefix + '%')} "
             "AND wait_event_type='Lock'")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if int(root(query)) > 0:
            return
        time.sleep(0.1)
    raise AssertionError(f"no real PostgreSQL lock wait observed for {app_prefix}")


def guarded(lock_sql: str, tasks: list[tuple[str, str, str, str]]) -> list[Result]:
    """task = (actor, SQL JSON expression, AAL, app name)."""
    holder = Holder(lock_sql)
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(tasks)) as pool:
            pending = [pool.submit(as_user, actor, expr, aal=aal, app=app)
                       for actor, expr, aal, app in tasks]
            try:
                waiting(tasks[0][3].rsplit("_", 1)[0])
            finally:
                holder.release()
            return [future.result(timeout=45) for future in pending]
    finally:
        holder.close()


def cleanup() -> None:
    uids = ",".join(quote(x) for x in USERS)
    # Explicit scoped deletes: never truncate the user's local database.
    root(f"""
    BEGIN;
    DELETE FROM public.admin_audit_log WHERE actor_user_id IN ({uids});
    DELETE FROM public.redemptions WHERE user_id IN ({uids});
    DELETE FROM public.entitlement_grants WHERE user_id IN ({uids});
    DELETE FROM public.redemption_codes WHERE created_by IN ({uids});
    DELETE FROM public.redemption_code_batches WHERE created_by IN ({uids});
    DELETE FROM public.redemption_rate_limits WHERE user_id IN ({uids});
    DELETE FROM public.membership_events WHERE membership_id IN
      (SELECT id FROM public.product_memberships WHERE user_id IN ({uids}));
    DELETE FROM public.product_memberships WHERE user_id IN ({uids});
    DELETE FROM public.platform_account_restrictions WHERE user_id IN ({uids});
    DELETE FROM public.platform_admins WHERE user_id IN ({uids});
    DELETE FROM public.products WHERE id IN ({quote(PRODUCT_A)},{quote(PRODUCT_B)});
    DELETE FROM auth.users WHERE id IN ({uids});
    COMMIT;
    """)


def seed() -> None:
    values = ",".join(f"({quote(uid)},{quote(f'lck-{i}@example.invalid')})"
                      for i, uid in enumerate(USERS, 1))
    root(f"""
    BEGIN;
    INSERT INTO auth.users(id,email) VALUES {values};
    INSERT INTO public.products(id,product_key,name,status) VALUES
      ({quote(PRODUCT_A)},'{PRODUCT_KEY_A}','LCK Product A','active'),
      ({quote(PRODUCT_B)},'{PRODUCT_KEY_B}','LCK Product B','active');
    INSERT INTO public.platform_admins(user_id,active) VALUES
      ({quote(ADMIN_A)},true),({quote(ADMIN_B)},true);
    INSERT INTO public.product_memberships(id,user_id,product_id,status) VALUES
      ({quote(MA)},{quote(MEMBER)},{quote(PRODUCT_A)},'left');
    COMMIT;
    """)


def issue(request_id: str, quantity: int, days: int = 30) -> list[str]:
    expr = ("public.admin_create_codes("
            f"{quote(PRODUCT_A)},'pro',{quantity},{days},false,1,NULL,"
            f"{quote(request_id)},NULL)")
    payload = expect_ok(as_user(ADMIN_A, expr, aal="aal2"),
                        lambda v: v["plaintext_available"] is True, "code issue")
    codes = payload["codes"]
    assert len(codes) == quantity and all(re.fullmatch(r"[A-Z2-7]{32}", c) for c in codes)
    return codes


def baseline_check() -> None:
    port = subprocess.run(["docker", "port", CONTAINER, "5432/tcp"],
                          capture_output=True, text=True, timeout=10)
    assert port.returncode == 0 and ":55322" in port.stdout, (
        "REFUSING: target is not AisenCore isolated local DB port 55322")
    assert root("SELECT current_database()") == "postgres"
    assert int(root("SELECT current_setting('server_version_num')")) >= 170000


def scenario_01():
    lock = "SELECT pg_catalog.pg_advisory_xact_lock(1000,1)"
    specs = [
        (ADMIN_A, f"public.admin_revoke_admin({quote(ADMIN_B)},'lck01')", "aal2", "lck01_a"),
        (ADMIN_B, f"public.admin_block_account({quote(ADMIN_A)},'lck01')", "aal2", "lck01_b"),
    ]
    outcomes = guarded(lock, specs)
    assert sum(x.status == 0 for x in outcomes) == 1, outcomes
    for x in outcomes:
        if x.status != 0:
            expect_error(x, ("PT403", "PT409"), "LCK-01 rejected admin")
    assert root(f"""SELECT count(*) FROM public.platform_admins a
      WHERE a.user_id IN ({quote(ADMIN_A)},{quote(ADMIN_B)})
        AND a.active AND NOT EXISTS
        (SELECT 1 FROM public.platform_account_restrictions r
          WHERE r.user_id=a.user_id AND r.kind='blocked')""") == "1"
    # Restore synthetic administrators without altering anyone else's row.
    root(f"""UPDATE public.platform_admins SET active=true WHERE user_id IN
      ({quote(ADMIN_A)},{quote(ADMIN_B)});
      DELETE FROM public.platform_account_restrictions WHERE user_id IN
      ({quote(ADMIN_A)},{quote(ADMIN_B)})""")
    print("LCK-01 PASS: L0 serializes admin loss; last eligible admin remains")


def scenario_02():
    codes = issue("lck02", 2)
    lock = f"SELECT pg_catalog.pg_advisory_xact_lock(1001, pg_catalog.hashtext({quote(RENEW)}))"
    specs = [(RENEW, f"public.redeem_code('{PRODUCT_KEY_A}',{quote(code)})",
              "aal1", f"lck02_{i}") for i, code in enumerate(codes)]
    outcomes = guarded(lock, specs)
    assert all(x.json().get("ok") is True for x in outcomes), outcomes
    assert root(f"""SELECT (
      count(*)=2 AND count(DISTINCT starts_at)=2
      AND max(ends_at)-min(starts_at)=interval '60 days')::text
      FROM public.entitlement_grants WHERE user_id={quote(RENEW)}""") == "true"
    print("LCK-02 PASS: two concurrent Pro renewals produce non-overlapping 60 days")


def scenario_03():
    code = issue("lck03", 1)[0]
    code_id = root(f"""SELECT id FROM public.redemption_codes
      WHERE code_hash=encode(extensions.digest({quote(code)},'sha256'),'hex')""")
    lock = f"SELECT id FROM public.redemption_codes WHERE id={quote(code_id)} FOR UPDATE"
    specs = [
        (RACE_A, f"public.redeem_code('{PRODUCT_KEY_A}',{quote(code)})", "aal1", "lck03_a"),
        (RACE_B, f"public.redeem_code('{PRODUCT_KEY_A}',{quote(code)})", "aal1", "lck03_b"),
    ]
    outcomes = [x.json() for x in guarded(lock, specs)]
    assert sorted(v.get("ok") for v in outcomes) == [False, True], outcomes
    assert sum(v.get("code") == "REDEEM_CODE_INVALID" for v in outcomes) == 1
    assert root(f"SELECT redeemed_count FROM public.redemption_codes WHERE id={quote(code_id)}") == "1"
    print("LCK-03 PASS: single-use code row lock permits exactly one redeemer")


def scenario_04():
    lock = f"SELECT pg_catalog.pg_advisory_xact_lock(1001,pg_catalog.hashtext({quote(MEMBER)}))"
    specs = [
        (ADMIN_A, f"public.admin_suspend_membership({quote(MA)},'lck04')", "aal2", "lck04_a"),
        (MEMBER, f"public.rejoin_product('{PRODUCT_KEY_A}')", "aal1", "lck04_b"),
    ]
    outcomes = guarded(lock, specs)
    assert outcomes[0].status == 0, outcomes
    if outcomes[1].status != 0:
        expect_error(outcomes[1], ("PT409",), "LCK-04 rejoin rejected")
    assert root(f"SELECT status FROM public.product_memberships WHERE id={quote(MA)}") == "suspended"
    print("LCK-04 PASS: suspension cannot be lost to concurrent rejoin")


def scenario_05():
    lock = f"SELECT pg_catalog.pg_advisory_xact_lock(1001,pg_catalog.hashtext({quote(LIMIT_USER)}))"
    specs = [(LIMIT_USER, f"public.redeem_code('{PRODUCT_KEY_A}','NO_SUCH_CODE_{i}')",
              "aal1", f"lck05_{i}") for i in range(12)]
    outcomes = [x.json() for x in guarded(lock, specs)]
    assert sum(v.get("code") == "REDEEM_CODE_INVALID" for v in outcomes) == 10, outcomes
    assert sum(v.get("code") == "RATE_LIMITED" for v in outcomes) == 2, outcomes
    assert root(f"SELECT array_length(failed_at,1) FROM public.redemption_rate_limits WHERE user_id={quote(LIMIT_USER)}") == "10"
    print("LCK-05 PASS: 12 concurrent failures persist exactly 10, 2 rate-limited")


def scenario_06():
    lock = "SELECT pg_catalog.pg_advisory_xact_lock(1000,1)"
    expr = (f"public.admin_create_codes({quote(PRODUCT_A)},'pro',1,30,"
            "false,1,NULL,'lck06-identical',NULL)")
    specs = [(ADMIN_A, expr, "aal2", "lck06_a"),
             (ADMIN_A, expr, "aal2", "lck06_b")]
    outcomes = [x.json() for x in guarded(lock, specs)]
    assert sorted(v["plaintext_available"] for v in outcomes) == [False, True], outcomes
    assert len(set(v["batch_id"] for v in outcomes)) == 1
    assert sum(len(v["codes"]) for v in outcomes) == 1
    assert root(f"SELECT count(*) FROM public.redemption_code_batches WHERE created_by={quote(ADMIN_A)} AND request_id='lck06-identical'") == "1"
    err = as_user(ADMIN_A, f"public.admin_create_codes({quote(PRODUCT_A)},'pro',2,30,"
                  "false,1,NULL,'lck06-identical',NULL)", aal="aal2")
    expect_error(err, ("PT409",), "LCK-06 different parameters")
    print("LCK-06 PASS: one issue, one secret-free replay, different params conflict")


def scenario_07():
    lock = f"SELECT pg_catalog.pg_advisory_xact_lock(1001,pg_catalog.hashtext({quote(MIX_USER)}))"
    grant = (f"public.admin_grant_entitlement({quote(MIX_USER)},{quote(PRODUCT_A)},"
             "'pro','duration',30,NULL,NULL,false,'lck07','lck07-grant')")
    specs = [
        (ADMIN_A, grant, "aal2", "lck07_a"),
        (MIX_USER, f"public.ensure_membership('{PRODUCT_KEY_A}')", "aal1", "lck07_b"),
    ]
    outcomes = guarded(lock, specs)
    assert all(x.status == 0 for x in outcomes), outcomes
    assert root(f"SELECT count(*) FROM public.entitlement_grants WHERE user_id={quote(MIX_USER)}") == "1"
    assert root(f"SELECT status FROM public.product_memberships WHERE user_id={quote(MIX_USER)}") == "active"

    # Product status UPDATE must conflict with normal L3 FOR SHARE, not KEY SHARE.
    holder = Holder(f"UPDATE public.products SET status='suspended' WHERE id={quote(PRODUCT_B)}")
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(as_user, RACE_B,
                                 f"public.ensure_membership('{PRODUCT_KEY_B}')",
                                 aal="aal1", app="lck07_product")
            try:
                waiting("lck07_product")
            finally:
                holder.release()
            expect_error(future.result(timeout=45), ("PT409",),
                         "LCK-07 product now suspended")
    finally:
        holder.close()
    assert root(f"SELECT count(*) FROM public.product_memberships WHERE user_id={quote(RACE_B)} AND product_id={quote(PRODUCT_B)}") == "0"
    assert root(f"SELECT status FROM public.products WHERE id={quote(PRODUCT_B)}") == "suspended"
    print("LCK-07 PASS: no deadlocks, L3 share waits for status update and rechecks")


def scenario_08():
    # R-16: real independent transactions race an Admin lifetime grant
    # against one redemption under the same L1/L7 locks. Either order
    # is legal, but the counter and Grant must match the winning order.
    code = issue("lck08-race", 1)[0]
    code_id = root(f"""SELECT id FROM public.redemption_codes
      WHERE code_hash=encode(extensions.digest({quote(code)},'sha256'),'hex')""")
    lock = f"SELECT pg_catalog.pg_advisory_xact_lock(1001,pg_catalog.hashtext({quote(MIX_USER)}))"
    grant = (f"public.admin_grant_entitlement({quote(MIX_USER)},{quote(PRODUCT_A)},"
             "'pro','explicit_window',NULL,transaction_timestamp()-interval '1 second',"
             "NULL,true,'lck08 lifetime','lck08-grant')")
    expr = f"public.redeem_code('{PRODUCT_KEY_A}',{quote(code)})"
    outcomes = guarded(lock, [
        (ADMIN_A, grant, "aal2", "lck08_grant"),
        (MIX_USER, expr, "aal1", "lck08_redeem"),
    ])
    assert outcomes[0].status == 0, outcomes
    redeemed = outcomes[1].json()
    assert redeemed.get("ok") is True or redeemed.get("code") == "REDEEM_LIFETIME_ACTIVE", redeemed
    expected = 1 if redeemed.get("ok") is True else 0
    assert root(f"SELECT redeemed_count FROM public.redemption_codes WHERE id={quote(code_id)}") == str(expected)
    assert root(f"SELECT count(*) FROM public.redemptions WHERE code_id={quote(code_id)}") == str(expected)
    assert root(f"""SELECT count(*) FROM public.entitlement_grants
      WHERE user_id={quote(MIX_USER)} AND product_id={quote(PRODUCT_A)}
        AND grant_mode='explicit_window' AND ends_at IS NULL
        AND revoked_at IS NULL""") == "1"

    # After the lifetime Grant commits, two genuinely concurrent different
    # code requests must both be rejected without changing either counter.
    more = issue("lck08-blocked", 2)
    blocked = guarded(lock, [
        (MIX_USER, f"public.redeem_code('{PRODUCT_KEY_A}',{quote(c)})",
         "aal1", f"lck08_blocked_{i}") for i, c in enumerate(more)
    ])
    assert all(x.json().get("code") == "REDEEM_LIFETIME_ACTIVE" for x in blocked), blocked
    for c in more:
        assert root(f"""SELECT redeemed_count FROM public.redemption_codes
          WHERE code_hash=encode(extensions.digest({quote(c)},'sha256'),'hex')""") == "0"
    print("LCK-08 PASS: permanent Grant race serializes, concurrent later codes not consumed")


def main() -> int:
    baseline_check()
    # Tests can be rerun after a previously interrupted run with just the
    # known synthetic IDs; unrelated rows are never touched.
    cleanup()
    try:
        seed()
        for fn in (scenario_01, scenario_02, scenario_03,
                   scenario_04, scenario_05, scenario_06, scenario_07, scenario_08):
            fn()
        print("D1-M4 concurrency PASS: LCK-01..08; PostgreSQL lock waits observed")
        return 0
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"D1-M4 concurrency FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
