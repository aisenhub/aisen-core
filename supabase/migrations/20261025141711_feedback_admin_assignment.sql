-- FB-01C/03: administrator assignment is an independent protected write.
-- Current Admin AAL2 + L0/L1 lock + optimistic version check + event/audit.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE FUNCTION private.admin_assign_feedback_core(
 p_feedback_id uuid, p_expected_version integer, p_assigned_to uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_actor uuid;
 v_target_user uuid;
 v_before public.user_feedback%ROWTYPE;
BEGIN
 PERFORM private.acquire_l0_admin_write_lock();
 v_actor:=private.require_admin();
 IF p_feedback_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 THEN
   RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
 END IF;
 SELECT user_id INTO v_target_user FROM public.user_feedback
 WHERE id=p_feedback_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'FEEDBACK_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 PERFORM private.acquire_l1_user_lock(v_target_user);
 SELECT * INTO v_before FROM public.user_feedback
 WHERE id=p_feedback_id FOR UPDATE;
 IF NOT FOUND OR v_before.user_id<>v_target_user OR
   v_before.version<>p_expected_version THEN
   RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409';
 END IF;
 IF p_assigned_to IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.platform_admins a
   WHERE a.user_id=p_assigned_to AND a.active=true
     AND NOT EXISTS(SELECT 1 FROM public.platform_account_restrictions r
       WHERE r.user_id=p_assigned_to AND r.kind='blocked')
 ) THEN
   RAISE EXCEPTION 'ASSIGNEE_NOT_ELIGIBLE' USING ERRCODE='PT422';
 END IF;
 IF v_before.assigned_to IS NOT DISTINCT FROM p_assigned_to THEN
   RETURN jsonb_build_object('id',v_before.id,'assigned_to',p_assigned_to,
     'version',v_before.version,'changed',false);
 END IF;
 UPDATE public.user_feedback SET assigned_to=p_assigned_to,
   version=version+1,updated_at=transaction_timestamp()
 WHERE id=p_feedback_id;
 INSERT INTO public.feedback_events(
   feedback_id,actor_user_id,event_type,visibility,message)
 VALUES(v_before.id,v_actor,'assigned','internal',
   CASE WHEN p_assigned_to IS NULL THEN 'unassigned'
    ELSE p_assigned_to::text END);
 INSERT INTO public.admin_audit_log(
   actor_user_id,action,target_type,target_id,before,after)
 VALUES(v_actor,'feedback.assigned','feedback',v_before.id,
   jsonb_build_object('assigned_to',v_before.assigned_to),
   jsonb_build_object('assigned_to',p_assigned_to));
 RETURN jsonb_build_object('id',v_before.id,'assigned_to',p_assigned_to,
   'version',v_before.version+1,'changed',true);
END; $$;
REVOKE ALL ON FUNCTION private.admin_assign_feedback_core(uuid,integer,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.admin_assign_feedback_core(uuid,integer,uuid)
 TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
CREATE FUNCTION public.admin_assign_feedback(
 p_feedback_id uuid,p_expected_version integer,p_assigned_to uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_assign_feedback_core(
 p_feedback_id,p_expected_version,p_assigned_to); $$;
REVOKE ALL ON FUNCTION public.admin_assign_feedback(uuid,integer,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_feedback(uuid,integer,uuid)
 TO authenticated;
