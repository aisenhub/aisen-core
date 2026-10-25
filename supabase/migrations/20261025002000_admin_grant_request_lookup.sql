-- Phase 1 B1: readonly outcome lookup, never a retrying write.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE FUNCTION private.admin_find_grant_request_core(p_request_id text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_actor uuid;
  v_grant public.entitlement_grants%ROWTYPE;
BEGIN
  v_actor := private.require_admin();
  IF p_request_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_request_id)) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  SELECT * INTO v_grant FROM public.entitlement_grants
   WHERE source_type='admin' AND created_by=v_actor
     AND source_ref='admin:' || v_actor::text || ':' || p_request_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('found',false);
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'found',true,'grant_id',v_grant.id,
    'target_user_id',v_grant.user_id,'product_id',v_grant.product_id,
    'tier',v_grant.tier,'mode',v_grant.grant_mode,
    'duration_days',v_grant.requested_duration_days,
    'starts_at',v_grant.starts_at,'ends_at',v_grant.ends_at,
    'reason',v_grant.grant_reason,'revoked_at',v_grant.revoked_at);
END;
$$;
-- The owner must revoke its own default PUBLIC EXECUTE BEFORE RESET ROLE.
-- Fresh migration replays are safe even before the later hardening migration.
REVOKE ALL ON FUNCTION private.admin_find_grant_request_core(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.admin_find_grant_request_core(text)
  TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
CREATE FUNCTION public.admin_find_grant_request(p_request_id text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_find_grant_request_core(p_request_id); $$;
REVOKE ALL ON FUNCTION public.admin_find_grant_request(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_find_grant_request(text) TO authenticated;
