-- CORE-USER-ARCH-001 / CORE-ENTITLEMENT-001: one restricted user-centre
-- RPC prevents N+1 entitlement probes. Never accepts arbitrary caller access:
-- it rechecks AAL2 + platform admin using the same private.require_admin.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE FUNCTION private.admin_get_user_pro_entitlements_core(p_target_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_actor uuid; v_data jsonb;
BEGIN
  v_actor:=private.require_admin();
  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_target_user_id) THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE='PT404';
  END IF;
  SELECT COALESCE(jsonb_agg(private.pro_credit_summary(
    p_target_user_id,p.id,transaction_timestamp()) ||
    jsonb_build_object('product_id',p.id,'product_name',p.name,
      'product_status',p.status,'membership_status',m.status,
      'account_blocked',EXISTS(SELECT 1 FROM public.platform_account_restrictions r
        WHERE r.user_id=p_target_user_id AND r.kind='blocked'))
    ORDER BY p.product_key),'[]'::jsonb)
  INTO v_data FROM public.product_memberships m
    JOIN public.products p ON p.id=m.product_id
    WHERE m.user_id=p_target_user_id;
  RETURN jsonb_build_object('items',v_data);
END;
$$;
REVOKE ALL ON FUNCTION private.admin_get_user_pro_entitlements_core(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.admin_get_user_pro_entitlements_core(uuid) TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
CREATE FUNCTION public.admin_get_user_pro_entitlements(p_target_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_get_user_pro_entitlements_core(p_target_user_id); $$;
REVOKE ALL ON FUNCTION public.admin_get_user_pro_entitlements(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_pro_entitlements(uuid) TO authenticated;
