-- FB-V2: first read is a read marker, not a business state change.
-- Preserve expected_version during normal opening of an inbox ticket.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE OR REPLACE FUNCTION private.admin_screen_feedback_core(
 p_feedback_id uuid,p_expected_version integer,p_action text,p_priority text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_admin uuid;v_user uuid;v_fb public.user_feedback%ROWTYPE;
 v_q text;v_p text;v_s text;v_archive timestamptz;v_delete timestamptz;
 v_from text;v_triage timestamptz;v_event text;
BEGIN
 PERFORM private.acquire_l0_admin_write_lock();
 v_admin:=private.require_admin();
 IF p_feedback_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
 OR p_action IS NULL OR p_action NOT IN ('read','triage','archive','trash','restore')
 OR (p_action='triage' AND (p_priority IS NULL OR
    p_priority NOT IN ('low','normal','high','urgent')))
 OR (p_action<>'triage' AND p_priority IS NOT NULL) THEN
   RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
 END IF;
 SELECT user_id INTO v_user FROM public.user_feedback WHERE id=p_feedback_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'FEEDBACK_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 PERFORM private.acquire_l1_user_lock(v_user);
 SELECT * INTO v_fb FROM public.user_feedback WHERE id=p_feedback_id FOR UPDATE;
 IF NOT FOUND OR v_fb.user_id<>v_user OR v_fb.version<>p_expected_version THEN
   RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409';
 END IF;
 IF p_action='read' THEN
   IF v_fb.queue_state<>'inbox' THEN
     RAISE EXCEPTION 'NOT_IN_INBOX' USING ERRCODE='PT409';
   END IF;
   IF v_fb.read_at IS NOT NULL THEN
     RETURN jsonb_build_object('id',v_fb.id,'queue_state','inbox',
       'version',v_fb.version,'changed',false);
   END IF;
   UPDATE public.user_feedback SET read_at=transaction_timestamp() WHERE id=v_fb.id;
   RETURN jsonb_build_object('id',v_fb.id,'queue_state','inbox',
     'version',v_fb.version,'changed',true);
 END IF;
 v_q:=v_fb.queue_state;v_p:=v_fb.priority;v_s:=v_fb.status;
 v_archive:=v_fb.archived_at;v_delete:=v_fb.deleted_at;
 v_from:=v_fb.deleted_from;v_triage:=v_fb.triaged_at;
 IF p_action='triage' THEN
   IF v_q<>'inbox' THEN RAISE EXCEPTION 'NOT_IN_INBOX' USING ERRCODE='PT409'; END IF;
   v_q:='workbench';v_p:=p_priority;v_s:='new';
   v_triage:=transaction_timestamp();v_event:='triaged';
 ELSIF p_action='archive' THEN
   IF v_q<>'inbox' THEN RAISE EXCEPTION 'NOT_IN_INBOX' USING ERRCODE='PT409'; END IF;
   v_q:='archived';v_archive:=transaction_timestamp();v_event:='archived';
 ELSIF p_action='trash' THEN
   IF v_q='trashed' THEN
     RETURN jsonb_build_object('id',v_fb.id,'queue_state','trashed',
       'version',v_fb.version,'changed',false);
   END IF;
   v_from:=v_q;v_q:='trashed';v_delete:=transaction_timestamp();v_event:='soft_deleted';
 ELSIF p_action='restore' THEN
   IF v_q='archived' THEN v_q:='inbox';v_archive:=NULL;
   ELSIF v_q='trashed' THEN v_q:=v_from;v_from:=NULL;v_delete:=NULL;
   ELSE RAISE EXCEPTION 'INVALID_RESTORE_STATE' USING ERRCODE='PT409'; END IF;
   v_event:='restored';
 END IF;
 UPDATE public.user_feedback SET queue_state=v_q,priority=v_p,status=v_s,
   archived_at=v_archive,deleted_at=v_delete,deleted_from=v_from,
   triaged_at=v_triage,version=version+1,updated_at=transaction_timestamp()
 WHERE id=v_fb.id;
 INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility,message)
 VALUES(v_fb.id,v_admin,v_event,'internal',
   CASE WHEN v_event='triaged' THEN v_p ELSE NULL END);
 INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,before,after)
 VALUES(v_admin,'feedback.'||v_event,'feedback',v_fb.id,
  jsonb_build_object('queue_state',v_fb.queue_state,'priority',v_fb.priority),
  jsonb_build_object('queue_state',v_q,'priority',v_p));
 RETURN jsonb_build_object('id',v_fb.id,'queue_state',v_q,'status',v_s,
   'priority',v_p,'version',v_fb.version+1,'changed',true);
END; $$;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
