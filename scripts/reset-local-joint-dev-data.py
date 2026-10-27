#!/usr/bin/env python3
"""Clean only local AisenCore joint-development fixtures; preserve the real admin and platforms.

Dry-run by default. --apply requires a previously verified local pg_dump archive.
Never run against linked/cloud database, or another Supabase Docker project.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import re
import subprocess

CONTAINER="supabase_db_Aisencore"
ADMIN="admin@aisencore.test"
KEEP_KEYS=("aisenhub","aisenlens")
SQL = r"""
BEGIN;
SET LOCAL lock_timeout='7s';
SET LOCAL statement_timeout='90s';
DO $guard$
DECLARE keeper uuid;
BEGIN
 SELECT id INTO STRICT keeper FROM auth.users WHERE email='admin@aisencore.test';
 IF (SELECT count(*) FROM public.platform_admins
       WHERE user_id=keeper AND active) <> 1 THEN
  RAISE EXCEPTION 'Real local admin must have exactly one active grant';
 END IF;
 IF (SELECT count(*) FROM public.products
       WHERE product_key IN ('aisenhub','aisenlens')) <> 2 THEN
  RAISE EXCEPTION 'Real integrated platforms missing';
 END IF;
 IF EXISTS (SELECT 1 FROM public.products
       WHERE product_key NOT IN ('aisenhub','aisenlens')
         AND product_key NOT LIKE 'demo_%'
         AND product_key NOT LIKE 'fb_ui_%'
         AND product_key NOT LIKE 'qa_browser_%') THEN
  RAISE EXCEPTION 'An unknown product exists: manual review required';
 END IF;
 IF EXISTS (SELECT 1 FROM auth.users
      WHERE id<>keeper AND NOT (
       (email LIKE 'aisen-demo-%@aisencore.test'
        AND raw_user_meta_data->>'demo_fixture'='true')
       OR email LIKE 'fb-chrome-%@example.invalid'
       OR email LIKE 'fb-zip-%@example.invalid')) THEN
  RAISE EXCEPTION 'A non-demo user exists: do not delete it without review';
 END IF;
END $guard$;
-- Delete explicitly in dependency order, preserving current schema and migrations.
DELETE FROM public.feedback_attachments;
DELETE FROM public.feedback_events;
DELETE FROM public.user_feedback;
DELETE FROM public.redemptions;
DELETE FROM public.redemption_codes;
DELETE FROM public.redemption_code_batches;
DELETE FROM public.redemption_rate_limits;
DELETE FROM public.entitlement_grants;
DELETE FROM public.membership_events;
DELETE FROM public.product_memberships;
DELETE FROM public.platform_account_restrictions;
DELETE FROM public.admin_audit_log;
DELETE FROM public.platform_admins
 WHERE user_id<>(SELECT id FROM auth.users WHERE email='admin@aisencore.test');
-- Auth user deletes execute normal FK cascades for sessions, identities and MFA.
DELETE FROM auth.scim_users WHERE user_id IS NOT NULL
 AND user_id<>(SELECT id FROM auth.users WHERE email='admin@aisencore.test');
DELETE FROM auth.users WHERE email IS DISTINCT FROM 'admin@aisencore.test';
-- Remove ephemeral test-auth flow artifacts and audit, but keep auth schema,
-- provider configuration, administrator sessions and administrator MFA.
DELETE FROM auth.saml_relay_states;
DELETE FROM auth.flow_state;
DELETE FROM auth.oauth_client_states;
DELETE FROM auth.audit_log_entries;
DELETE FROM public.products WHERE product_key NOT IN ('aisenhub','aisenlens');
-- The joined AisenLens product must accept real development traffic.
UPDATE public.products SET status='active'
 WHERE product_key='aisenlens' AND status='draft';
DO $verify$
BEGIN
 IF (SELECT count(*) FROM auth.users)<>1 OR
    (SELECT count(*) FROM auth.users WHERE email='admin@aisencore.test')<>1 OR
    (SELECT count(*) FROM public.platform_admins WHERE active)<>1 OR
    (SELECT count(*) FROM public.platform_admins)<>1 OR
    (SELECT count(*) FROM public.products)<>2 OR
    EXISTS (SELECT 1 FROM public.products
      WHERE status<>'active' OR product_key NOT IN ('aisenhub','aisenlens')) OR
    (SELECT count(*) FROM public.product_memberships)<>0 OR
    (SELECT count(*) FROM public.entitlement_grants)<>0 OR
    (SELECT count(*) FROM public.redemptions)<>0 OR
    (SELECT count(*) FROM public.user_feedback)<>0 THEN
  RAISE EXCEPTION 'Post-cleanup invariants failed: transaction will roll back';
 END IF;
END $verify$;
SELECT 'RESULT','users',(SELECT count(*) FROM auth.users),'admins',
 (SELECT count(*) FROM public.platform_admins),'products',
 (SELECT string_agg(product_key||':'||status,',' ORDER BY product_key)
  FROM public.products);
"""

def invoke(*argv: str, input_text: str | None=None, timeout:int=110):
 result=subprocess.run(["docker",*argv],input=input_text,
  text=True,encoding="utf-8",capture_output=True,timeout=timeout)
 if result.returncode:
  raise RuntimeError("Docker command failed: "+result.stderr[-1400:])
 return result.stdout

def main()->None:
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument("--apply",action="store_true",help="commit the guarded cleanup")
 parser.add_argument("--backup",type=Path,help="existing verified off-repository pg_dump archive")
 args=parser.parse_args()
 port=invoke("port",CONTAINER,"5432/tcp",timeout=25)
 if not re.search(r":55322\b",port):
  raise RuntimeError("Not the verified local AisenCore 55322 database")
 if args.apply:
  if not args.backup or not args.backup.is_file() or args.backup.stat().st_size<10000:
   raise RuntimeError("A verified local pg_dump backup is mandatory for --apply")
  # The path must be outside the git checkout and in the dedicated backup folder.
  root=Path(__file__).resolve().parent.parent
  archive=args.backup.resolve()
  if archive.parent != root.parent/"Aisencore-local-backups" or not archive.name.endswith(".dump"):
   raise RuntimeError("Backup must be inside the sibling Aisencore-local-backups folder")
  with archive.open("rb") as data:
   check=subprocess.run(["docker","exec","-i",CONTAINER,"pg_restore","--list"],
    stdin=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=40)
  if check.returncode or b"TABLE DATA public products" not in check.stdout:
   raise RuntimeError("Invalid verified database archive")
 output=invoke("exec","-i",CONTAINER,"psql","-X","-qAt","-U","postgres",
  "-d","postgres","-v","ON_ERROR_STOP=1",input_text=SQL+
  ("COMMIT;\n" if args.apply else "ROLLBACK;\n"))
 print(output[-2600:])
 print("APPLIED" if args.apply else "DRY_RUN_ROLLED_BACK")

if __name__=="__main__":
 main()
