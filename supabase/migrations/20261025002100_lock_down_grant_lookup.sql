-- Security fix: revoke default PUBLIC EXECUTE as the FUNCTION OWNER.
-- A postgres migration role cannot revoke a grant attributed to the
-- NOLOGIN owner after RESET ROLE. The public invoker RPC stays separate.
SET ROLE aisencore_rpc_executor;
REVOKE ALL ON FUNCTION private.admin_find_grant_request_core(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.admin_find_grant_request_core(text)
  TO authenticated;
RESET ROLE;
