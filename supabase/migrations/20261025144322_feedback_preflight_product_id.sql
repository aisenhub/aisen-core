-- FB: no direct products SELECT permission is granted through PostgREST.
-- Trusted preflight returns the minimum active product UUID needed for the
-- server-generated R2 key. Exact request replay bypasses only the rate quota.
-- This is a pre-production signature change; no production client exists.
DROP FUNCTION public.feedback_submit_preflight(text);
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
DROP FUNCTION private.feedback_submit_preflight_core(text);
CREATE FUNCTION private.feedback_submit_preflight_core(
 p_product_key text,p_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_user uuid:=auth.uid();
 v_product_id uuid;
BEGIN
 IF v_user IS NULL THEN
   RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401';
 END IF;
 IF p_product_key IS NULL OR length(btrim(p_product_key)) NOT BETWEEN 1 AND 64 THEN
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
END; $$;
REVOKE ALL ON FUNCTION private.feedback_submit_preflight_core(text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.feedback_submit_preflight_core(text,uuid)
 TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;

CREATE FUNCTION public.feedback_submit_preflight(
 p_product_key text,p_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.feedback_submit_preflight_core(p_product_key,p_request_id); $$;
REVOKE ALL ON FUNCTION public.feedback_submit_preflight(text,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.feedback_submit_preflight(text,uuid)
 TO authenticated;
NOTIFY pgrst,'reload schema';
