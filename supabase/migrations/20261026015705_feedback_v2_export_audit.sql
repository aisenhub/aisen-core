-- FB-V2 minimal audit for successfully prepared private ZIP exports.
-- Browser users cannot insert audit rows; only protected NOLOGIN core.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE FUNCTION private.admin_log_feedback_export_core(
 p_count integer,p_scope text,p_include_internal boolean,p_include_identity boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_admin uuid;
BEGIN
 PERFORM private.acquire_l0_admin_write_lock();
 v_admin:=private.require_admin();
 IF p_count IS NULL OR p_count NOT BETWEEN 1 AND 20
   OR p_scope NOT IN ('selected','filtered')
   OR p_include_internal IS NULL OR p_include_identity IS NULL THEN
   RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
 END IF;
 INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,before,after)
 VALUES(v_admin,'feedback.export_prepared','feedback_export',gen_random_uuid(),
  '{}'::jsonb,jsonb_build_object('count',p_count,'scope',p_scope,
    'internal_comments',p_include_internal,'user_identity',p_include_identity));
 RETURN jsonb_build_object('authorized',true);
END; $$;
REVOKE ALL ON FUNCTION private.admin_log_feedback_export_core(integer,text,boolean,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.admin_log_feedback_export_core(integer,text,boolean,boolean)
 TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;

CREATE FUNCTION public.admin_log_feedback_export(
 p_count integer,p_scope text,p_include_internal boolean,p_include_identity boolean)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_log_feedback_export_core(
 p_count,p_scope,p_include_internal,p_include_identity); $$;
REVOKE ALL ON FUNCTION public.admin_log_feedback_export(integer,text,boolean,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_log_feedback_export(integer,text,boolean,boolean)
 TO authenticated;
NOTIFY pgrst,'reload schema';
