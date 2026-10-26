#!/usr/bin/env python3
"""FB local GoTrue/PostgREST smoke. Never contacts linked/cloud projects."""
import json
import secrets
import subprocess
import urllib.error
import urllib.parse
import urllib.request

ROOT = "http://127.0.0.1:55321"
def http(method, path, key, payload=None, token=None):
    headers = {"apikey": key, "Authorization": "Bearer " + (token or key)}
    body = json.dumps(payload).encode() if payload is not None else None
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(ROOT + path, headers=headers, data=body, method=method)
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            code, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        code, raw = error.code, error.read()
    try:
        data = json.loads(raw) if raw else None
    except (ValueError, TypeError):
        data = None
    return code, data

def main():
    result = subprocess.run(
        ["cmd.exe", "/d", "/s", "/c", "pnpm dlx supabase status --output json"],
        text=True, capture_output=True, check=True, timeout=30, encoding="utf-8",
    )
    conf = json.loads(result.stdout)
    if conf.get("API_URL") != ROOT:
        raise RuntimeError("Aborting: this is not the intended local 55321 Supabase instance")
    anon, service = conf["ANON_KEY"], conf["SERVICE_ROLE_KEY"]
    email = "feedback-qa-" + secrets.token_hex(9) + "@example.invalid"
    password = "FbQa-" + secrets.token_urlsafe(24) + "!9a"
    user_id = None
    tests = 0
    try:
        code, data = http("POST", "/auth/v1/admin/users", service,
            {"email": email, "password": password, "email_confirm": True})
        if code not in (200, 201) or not isinstance(data, dict) or not data.get("id"):
            raise RuntimeError("Creating temporary confirmed local test identity failed (HTTP %s)" % code)
        user_id = data["id"]
        code, login = http("POST", "/auth/v1/token?grant_type=password", anon,
            {"email": email, "password": password})
        if code != 200 or not isinstance(login, dict) or not login.get("access_token"):
            raise RuntimeError("Local Auth password login failed (HTTP %s)" % code)
        jwt = login["access_token"]
        print("AUTH confirmed temporary local user: PASS"); tests += 1

        code, rows = http("POST", "/rest/v1/rpc/my_feedback", anon, {}, jwt)
        assert code == 200 and rows == [], "own feedback must start empty and be readable"
        print("MY_FEEDBACK owned-only RPC: PASS"); tests += 1

        code, _ = http("POST", "/rest/v1/rpc/admin_update_feedback", anon,
            {"p_feedback_id": "11111111-1111-4111-8111-111111111111",
             "p_expected_version": 1, "p_status": "in_progress"}, jwt)
        assert code == 403, "AAL1 ordinary caller must be denied Admin writes"
        print("ADMIN_UPDATE_FEEDBACK unauthorized caller: PASS"); tests += 1

        code, _ = http("POST", "/rest/v1/rpc/feedback_submit_from_edge", anon,
            {"p_user_id": user_id, "p_product_key": "aisenlens",
             "p_request_id": "22222222-2222-4222-8222-222222222222",
             "p_content": "forgery", "p_category": "bug", "p_attachments": []}, jwt)
        assert code in (401, 403, 404), "client must not invoke service-only submit RPC"
        print("SERVICE_ONLY_SUBMIT direct client forbidden: PASS"); tests += 1

        code, items = http("GET", "/rest/v1/admin_feedback_summaries?select=id&limit=1",
            anon, None, jwt)
        assert code == 200 and items == [], "ordinary caller must see zero Admin records"
        print("ADMIN_SECURITY_INVOKER_VIEW ordinary user empty: PASS"); tests += 1

        code, products = http("GET",
            "/rest/v1/products?select=product_key&status=eq.active&limit=1",
            anon, None, jwt)
        if code == 200 and isinstance(products, list) and products:
            key = products[0]["product_key"]
            code, allowed = http("POST", "/rest/v1/rpc/feedback_submit_preflight",
                anon, {"p_product_key": key}, jwt)
            assert code == 200 and isinstance(allowed, dict) and allowed.get("allowed") is True, \
                "eligible verified non-member must pass feedback preflight"
            print("FEEDBACK_PREFLIGHT authenticated user: PASS"); tests += 1
        else:
            print("FEEDBACK_PREFLIGHT: NOT RUN (no active local product)")
        print("RESULT: %d signed-JWT HTTP assertions PASS" % tests)
    finally:
        if user_id:
            code, _ = http("DELETE", "/auth/v1/admin/users/" +
                urllib.parse.quote(user_id, safe=""), service)
            if code not in (200, 204):
                print("WARNING: QA user cleanup failed, HTTP %d" % code)
                raise RuntimeError("Temporary local Auth cleanup requires attention")
            print("Temporary Auth user cleanup: PASS")

if __name__ == "__main__":
    main()
