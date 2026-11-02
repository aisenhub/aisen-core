#!/usr/bin/env python3
"""Clear authorized local prelaunch data; preserve AisenLens and the local administrator.

Dry-run rolls back. --apply requires an off-repository pg_dump archive.
This does not reset schemas, apply migrations, or contact object storage.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import re
import subprocess

CONTAINER = "supabase_db_Aisencore"
SQL = r"""
BEGIN;
SET LOCAL lock_timeout='7s';
SET LOCAL statement_timeout='90s';
SELECT pg_advisory_xact_lock(1000,1);
LOCK TABLE public.products,public.platform_admins,public.product_memberships,
 public.membership_events,public.entitlement_grants,public.pro_credit_accounts,
 public.pro_credit_entries,public.redemption_code_batches,public.redemption_codes,
 public.redemptions,public.redemption_rate_limits,public.platform_account_restrictions,
 public.admin_audit_log,public.user_feedback,public.feedback_attachments,
 public.feedback_events,auth.users,auth.identities,auth.mfa_factors,auth.sessions,
 auth.refresh_tokens,auth.mfa_amr_claims IN SHARE ROW EXCLUSIVE MODE;
DO $guard$
DECLARE keeper uuid;
BEGIN
 SELECT id INTO STRICT keeper FROM auth.users WHERE email='admin@aisencore.test';
 IF (SELECT count(*) FROM public.platform_admins)<>1 OR
    NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id=keeper AND active) OR
    EXISTS (SELECT 1 FROM public.platform_account_restrictions WHERE user_id=keeper) THEN
  RAISE EXCEPTION 'Expected one unrestricted active local administrator';
 END IF;
 IF (SELECT count(*) FROM public.products
     WHERE product_key='aisenlens' AND status='active')<>1 THEN
  RAISE EXCEPTION 'Active AisenLens integration is missing';
 END IF;
 IF EXISTS (SELECT 1 FROM public.feedback_attachments) THEN
  RAISE EXCEPTION 'Attachment references require storage cleanup review before database deletion';
 END IF;
END $guard$;
CREATE TEMP VIEW cleanup_kept_state AS
 SELECT jsonb_build_object(
  'user',(SELECT to_jsonb(u) FROM auth.users u WHERE email='admin@aisencore.test'),
  'admin',(SELECT to_jsonb(a) FROM public.platform_admins a),
  'product',(SELECT to_jsonb(p) FROM public.products p WHERE product_key='aisenlens'),
  'identities',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM auth.identities i
    WHERE i.user_id=(SELECT user_id FROM public.platform_admins)),
  'factors',(SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM auth.mfa_factors f
    WHERE f.user_id=(SELECT user_id FROM public.platform_admins)),
  'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM auth.sessions s
    WHERE s.user_id=(SELECT user_id FROM public.platform_admins)),
  'refresh_tokens',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM auth.refresh_tokens t
    WHERE t.user_id=(SELECT user_id::text FROM public.platform_admins)),
  'amr_claims',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM auth.mfa_amr_claims c
    JOIN auth.sessions s ON s.id=c.session_id
    WHERE s.user_id=(SELECT user_id FROM public.platform_admins)),
  'migrations',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.version)
    FROM supabase_migrations.schema_migrations m)
 ) AS state;
CREATE TEMP TABLE cleanup_before ON COMMIT DROP AS SELECT state FROM cleanup_kept_state;
DELETE FROM public.feedback_attachments;
DELETE FROM public.feedback_events;
DELETE FROM public.user_feedback;
DELETE FROM public.redemptions;
DELETE FROM public.redemption_codes;
DELETE FROM public.redemption_code_batches;
DELETE FROM public.redemption_rate_limits;
DELETE FROM public.pro_credit_entries;
DELETE FROM public.pro_credit_accounts;
DELETE FROM public.entitlement_grants;
DELETE FROM public.membership_events;
DELETE FROM public.product_memberships;
DELETE FROM public.platform_account_restrictions;
DELETE FROM public.admin_audit_log;
DELETE FROM auth.scim_users WHERE user_id IS NULL
 OR user_id<>(SELECT user_id FROM public.platform_admins);
DELETE FROM auth.users WHERE id<>(SELECT user_id FROM public.platform_admins);
DELETE FROM auth.refresh_tokens
 WHERE user_id IS DISTINCT FROM (SELECT user_id::text FROM public.platform_admins);
DELETE FROM auth.saml_relay_states;
DELETE FROM auth.flow_state;
DELETE FROM auth.oauth_client_states;
DELETE FROM auth.audit_log_entries;
DELETE FROM auth.mfa_challenges;
DELETE FROM public.products WHERE product_key<>'aisenlens';
DO $verify$
BEGIN
 IF (SELECT state FROM cleanup_kept_state) IS DISTINCT FROM
    (SELECT state FROM cleanup_before) THEN
  RAISE EXCEPTION 'Administrator, AisenLens, or migration state changed';
 END IF;
 IF (SELECT count(*) FROM auth.users)<>1 OR
    (SELECT count(*) FROM public.products)<>1 OR
    EXISTS (SELECT 1 FROM public.product_memberships) OR
    EXISTS (SELECT 1 FROM public.membership_events) OR
    EXISTS (SELECT 1 FROM public.entitlement_grants) OR
    EXISTS (SELECT 1 FROM public.pro_credit_accounts) OR
    EXISTS (SELECT 1 FROM public.pro_credit_entries) OR
    EXISTS (SELECT 1 FROM public.redemption_code_batches) OR
    EXISTS (SELECT 1 FROM public.redemption_codes) OR
    EXISTS (SELECT 1 FROM public.redemptions) OR
    EXISTS (SELECT 1 FROM public.redemption_rate_limits) OR
    EXISTS (SELECT 1 FROM public.platform_account_restrictions) OR
    EXISTS (SELECT 1 FROM public.admin_audit_log) OR
    EXISTS (SELECT 1 FROM public.user_feedback) OR
    EXISTS (SELECT 1 FROM public.feedback_events) OR
    EXISTS (SELECT 1 FROM public.feedback_attachments) THEN
  RAISE EXCEPTION 'Post-cleanup invariants failed';
 END IF;
END $verify$;
SELECT jsonb_build_object('users',(SELECT count(*) FROM auth.users),
 'admins',(SELECT count(*) FROM public.platform_admins),
 'products',(SELECT jsonb_agg(jsonb_build_object('id',id,'key',product_key))
   FROM public.products),
 'administrator_and_integration_unchanged',true,'business_rows',0);
DROP VIEW cleanup_kept_state;
"""


def invoke(*argv: str, input_text: str | None = None, timeout: int = 110):
    result = subprocess.run(
        ["docker", *argv], input=input_text, text=True, encoding="utf-8",
        capture_output=True, timeout=timeout,
    )
    if result.returncode:
        raise RuntimeError("Docker command failed: " + result.stderr[-1400:])
    return result.stdout


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="commit the authorized cleanup")
    parser.add_argument("--backup", type=Path, help="verified off-repository pg_dump archive")
    args = parser.parse_args()
    port = invoke("port", CONTAINER, "5432/tcp", timeout=25)
    if not re.search(r":55322\b", port):
        raise RuntimeError("Not the verified local AisenCore 55322 database")
    root = Path(__file__).resolve().parent.parent
    expected = {path.name.split("_", 1)[0] for path in (root / "supabase/migrations").glob("*.sql")}
    installed = invoke(
        "exec", CONTAINER, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres",
        "-v", "ON_ERROR_STOP=1", "-c",
        "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;",
    )
    if set(installed.splitlines()) != expected:
        raise RuntimeError("Installed migration versions do not match the current checkout")
    if args.apply:
        if not args.backup or not args.backup.is_file() or args.backup.stat().st_size < 10000:
            raise RuntimeError("A verified local pg_dump backup is mandatory for --apply")
        archive = args.backup.resolve()
        if archive.parent != root.parent / "Aisencore-local-backups" or archive.suffix != ".dump":
            raise RuntimeError("Backup must be inside the sibling Aisencore-local-backups folder")
        with archive.open("rb") as data:
            check = subprocess.run(
                ["docker", "exec", "-i", CONTAINER, "pg_restore", "--list"],
                stdin=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=40,
            )
        if check.returncode or any(entry not in check.stdout for entry in (
            b"TABLE DATA public products", b"TABLE DATA auth users",
            b"TABLE DATA public platform_admins", b"TABLE DATA public pro_credit_entries",
        )):
            raise RuntimeError("Invalid database archive")
    output = invoke(
        "exec", "-i", CONTAINER, "psql", "-X", "-qAt", "-U", "postgres",
        "-d", "postgres", "-v", "ON_ERROR_STOP=1",
        input_text=SQL + ("COMMIT;\n" if args.apply else "ROLLBACK;\n"),
    )
    print(output[-2600:])
    print("APPLIED" if args.apply else "DRY_RUN_ROLLED_BACK")


if __name__ == "__main__":
    main()
