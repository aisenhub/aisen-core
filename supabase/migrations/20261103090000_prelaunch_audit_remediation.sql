-- Prelaunch audit remediation: permissions, stable validation errors and
-- read-only function declarations. No data changes.

REVOKE UPDATE ON SEQUENCE
  public.pro_credit_entries_sequence_seq,
  public.user_feedback_feedback_no_seq
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE
  public.pro_credit_entries_sequence_seq,
  public.user_feedback_feedback_no_seq
  TO aisencore_rpc_executor;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE
  public.admin_audit_log,
  public.entitlement_grants,
  public.feedback_attachments,
  public.feedback_events,
  public.membership_events,
  public.platform_account_restrictions,
  public.platform_admins,
  public.pro_credit_accounts,
  public.pro_credit_entries,
  public.product_memberships,
  public.products,
  public.redemption_code_batches,
  public.redemption_codes,
  public.redemption_rate_limits,
  public.redemptions,
  public.user_feedback
  FROM service_role;
GRANT SELECT (id, product_key, name, description, status)
  ON public.products TO anon;

REVOKE ALL ON TABLE
  public.admin_feedback_summaries,
  public.admin_redemption_code_summaries
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.admin_feedback_summaries,
  public.admin_redemption_code_summaries TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, service_role;

GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE OR REPLACE FUNCTION private.admin_create_product_core(
  p_product_key text, p_name text, p_description text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_product public.products%ROWTYPE;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor := private.require_admin();
  IF p_product_key IS NULL OR p_product_key !~ '^[a-z][a-z0-9_]{0,63}$'
     OR p_name IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_name)) NOT BETWEEN 1 AND 160
  THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE = 'PT422';
  END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE product_key = p_product_key) THEN
    RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE = 'PT409';
  END IF;
  INSERT INTO public.products(product_key,name,description,status)
    VALUES(p_product_key,pg_catalog.btrim(p_name),p_description,'draft')
    RETURNING * INTO v_product;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,after)
    VALUES(v_actor,'product.create','product',v_product.id,
      pg_catalog.jsonb_build_object('product_key',v_product.product_key,'status','draft'));
  RETURN pg_catalog.jsonb_build_object('id',v_product.id,'product_key',v_product.product_key,
    'status',v_product.status,'changed',true);
END;
$$;

CREATE OR REPLACE FUNCTION private.feedback_submit_preflight_core(
  p_product_key text, p_request_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_user uuid:=auth.uid();
  v_product_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401';
  END IF;
  IF p_product_key IS NULL OR p_product_key !~ '^[a-z][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  IF EXISTS(SELECT 1 FROM public.platform_account_restrictions
    WHERE user_id=v_user AND kind='blocked') THEN
    RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='PT403';
  END IF;
  SELECT p.id INTO v_product_id FROM public.products p
    WHERE p.product_key=p_product_key AND p.status='active';
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE' USING ERRCODE='PT409';
  END IF;
  IF (SELECT count(*) FROM public.user_feedback
      WHERE user_id=v_user AND created_at>transaction_timestamp()-interval '1 hour')>=5
    AND NOT EXISTS (SELECT 1 FROM public.user_feedback
      WHERE user_id=v_user AND product_id=v_product_id AND request_id=p_request_id) THEN
    RAISE EXCEPTION 'FEEDBACK_RATE_LIMITED' USING ERRCODE='PT429';
  END IF;
  RETURN jsonb_build_object('allowed',true,'product_id',v_product_id);
END;
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;

ALTER FUNCTION public.admin_find_grant_request(text) STABLE;
ALTER FUNCTION public.admin_lookup_users(uuid[],text,integer,integer) STABLE;
SET ROLE aisencore_rpc_executor;
ALTER FUNCTION private.admin_find_grant_request_core(text) STABLE;
ALTER FUNCTION private.admin_lookup_users_core(uuid[],text,integer,integer) STABLE;
RESET ROLE;

NOTIFY pgrst, 'reload schema';
