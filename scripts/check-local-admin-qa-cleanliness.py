#!/usr/bin/env python3
"""Read-only preflight for the AisenCore local Core × Lens Admin E2E.

Checks the exact local container/port and shows aggregate QA residue.
No Auth credentials, secrets, writes, Docker container changes or migrations.
"""
from __future__ import annotations

import json
import re
import subprocess


def docker(*args: str) -> str:
    result = subprocess.run(
        ["docker", *args],
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        timeout=35,
        check=False,
    )
    if result.returncode:
        raise RuntimeError("Local Docker query failed: " + result.stderr[-230:])
    return result.stdout.strip()


def main() -> None:
    exposed = docker("port", "supabase_db_Aisencore", "5432/tcp")
    if not re.search(r":55322(?:\s|$)", exposed):
        raise RuntimeError("Unexpected DB container/port; read-only inspection refused")
    query = """BEGIN TRANSACTION READ ONLY;
    SELECT json_build_object(
      'auth_users', (SELECT count(*) FROM auth.users),
      'real_admins', (SELECT count(*) FROM auth.users WHERE email='admin@aisencore.test'),
      'active_admins', (SELECT count(*) FROM public.platform_admins WHERE active),
      'qa_admin_users', (SELECT count(*) FROM auth.users WHERE email LIKE 'admin-uiqa-%@aisencore.test'),
      'qa_ordinary_users', (SELECT count(*) FROM auth.users WHERE email LIKE 'ordinary-uiqa-%@aisencore.test'),
      'active_real_products', (SELECT count(*) FROM public.products
         WHERE product_key IN ('aisenhub','aisenlens') AND status='active'),
      'products_total', (SELECT count(*) FROM public.products),
      'qa_browser_products', (SELECT count(*) FROM public.products WHERE product_key LIKE 'qa_browser_%'),
      'memberships', (SELECT count(*) FROM public.product_memberships),
      'grants', (SELECT count(*) FROM public.entitlement_grants),
      'code_batches', (SELECT count(*) FROM public.redemption_code_batches),
      'codes', (SELECT count(*) FROM public.redemption_codes),
      'redemptions', (SELECT count(*) FROM public.redemptions),
      'admin_audits', (SELECT count(*) FROM public.admin_audit_log),
      'feedback', (SELECT count(*) FROM public.user_feedback),
      'attachments', (SELECT count(*) FROM public.feedback_attachments)
    );
    ROLLBACK;"""
    output = docker(
        "exec", "supabase_db_Aisencore", "psql",
        "-X", "-qAt", "-U", "postgres", "-d", "postgres",
        "-v", "ON_ERROR_STOP=1", "-c", query,
    )
    data = json.loads(output)
    clean = (
        data["auth_users"] == 1
        and data["real_admins"] == 1
        and data["active_admins"] == 1
        and data["active_real_products"] == 2
        and data["products_total"] == 2
        and all(data[key] == 0 for key in (
            "qa_admin_users", "qa_ordinary_users", "qa_browser_products",
            "memberships", "grants", "code_batches", "codes",
            "redemptions", "admin_audits", "feedback", "attachments",
        ))
    )
    print(json.dumps({"database": "local-only", "clean_for_e2e": clean, "counts": data},
                     sort_keys=True, indent=2))
    print("LOCAL_ADMIN_QA_BASELINE_PASS" if clean
          else "LOCAL_ADMIN_QA_BASELINE_DIRTY: see docs/Plans/aisenlens-aisencore-local-integration/2026-10-27-admin-uiqa-timeout-and-recovery.md")
    if not clean:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
