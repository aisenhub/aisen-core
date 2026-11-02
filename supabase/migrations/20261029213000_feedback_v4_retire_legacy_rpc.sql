-- W2 / V4: only current inbox/workbench/archived workflow may be written.
-- Forward-only migration: drop legacy writing functions; do not change existing feedback rows.
-- Existing read marker moves from V2 multi-action endpoint into its own AAL2-checked API.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE OR REPLACE FUNCTION private.admin_feedback_v3_core(
  p_feedback_id uuid,p_expected_version integer,p_action text,
  p_priority text DEFAULT NULL,p_tags text[] DEFAULT NULL,
  p_is_starred boolean DEFAULT NULL,p_internal_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid; v_owner uuid; v_fb public.user_feedback%ROWTYPE;
  v_queue text; v_prior text; v_tags text[]; v_star boolean;
  v_origin text; v_archive timestamptz; v_deleted timestamptz;
  v_triaged timestamptz; v_event text; v_changed boolean;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor:=private.require_admin();
  IF p_feedback_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
     OR (p_action IS NULL OR p_action NOT IN ('save','triage','archive','reopen'))
     OR (p_priority IS NOT NULL AND p_priority NOT IN ('low','normal','high','urgent'))
     OR (p_internal_note IS NOT NULL AND char_length(btrim(p_internal_note)) NOT BETWEEN 1 AND 5000)
     OR p_tags IS NOT NULL
  THEN RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422'; END IF;
  SELECT user_id INTO v_owner FROM public.user_feedback WHERE id=p_feedback_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FEEDBACK_NOT_FOUND' USING ERRCODE='PT409'; END IF;
  PERFORM private.acquire_l1_user_lock(v_owner);
  SELECT * INTO v_fb FROM public.user_feedback WHERE id=p_feedback_id FOR UPDATE;
  IF NOT FOUND OR v_fb.version<>p_expected_version OR v_fb.user_id<>v_owner
  THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;

  v_queue:=v_fb.queue_state; v_prior:=coalesce(p_priority,v_fb.priority);
  v_tags:=v_fb.tags; v_star:=coalesce(p_is_starred,v_fb.is_starred);
  v_origin:=v_fb.deleted_from; v_archive:=v_fb.archived_at;
  v_deleted:=v_fb.deleted_at; v_triaged:=v_fb.triaged_at;
  IF p_action IN ('save','triage') THEN
    IF v_queue NOT IN ('inbox','workbench') OR (p_action='triage' AND v_queue<>'inbox')
    THEN RAISE EXCEPTION 'INVALID_QUEUE_ACTION' USING ERRCODE='PT409'; END IF;
    IF p_action='triage' THEN
      IF v_prior IS NULL THEN RAISE EXCEPTION 'PRIORITY_REQUIRED' USING ERRCODE='PT422'; END IF;
      v_queue:='workbench';v_triaged:=transaction_timestamp();
    END IF;
  ELSIF p_action='archive' THEN
    IF v_queue<>'workbench' THEN RAISE EXCEPTION 'NOT_IN_WORKBENCH' USING ERRCODE='PT409'; END IF;
    v_queue:='archived';v_archive:=transaction_timestamp();
  ELSIF p_action='reopen' THEN
    IF v_queue<>'archived' THEN RAISE EXCEPTION 'NOT_ARCHIVED' USING ERRCODE='PT409'; END IF;
    v_queue:='workbench';v_archive:=NULL;
  END IF;
  IF p_action NOT IN ('save','triage') AND
     (p_priority IS NOT NULL OR p_tags IS NOT NULL OR p_is_starred IS NOT NULL OR p_internal_note IS NOT NULL)
  THEN RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422'; END IF;

  v_changed:=v_queue IS DISTINCT FROM v_fb.queue_state
    OR v_prior IS DISTINCT FROM v_fb.priority
    OR v_star IS DISTINCT FROM v_fb.is_starred OR p_internal_note IS NOT NULL;
  IF NOT v_changed THEN
    RETURN jsonb_build_object('id',v_fb.id,'version',v_fb.version,'changed',false);
  END IF;
  UPDATE public.user_feedback SET queue_state=v_queue,priority=v_prior,
    tags=v_tags,is_starred=v_star,deleted_from=v_origin,deleted_at=v_deleted,
    archived_at=v_archive,triaged_at=v_triaged,
    last_handled_by=v_actor,version=version+1,updated_at=transaction_timestamp()
  WHERE id=v_fb.id;
  IF p_internal_note IS NOT NULL THEN
    INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility,message)
    VALUES(v_fb.id,v_actor,'internal_note','internal',btrim(p_internal_note));
  END IF;
  IF v_prior IS DISTINCT FROM v_fb.priority THEN
    INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility,message)
    VALUES(v_fb.id,v_actor,'priority_changed','internal',v_prior);
  END IF;
  IF v_star IS DISTINCT FROM v_fb.is_starred THEN
    INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility,message)
    VALUES(v_fb.id,v_actor,'star_changed','internal',CASE WHEN v_star THEN 'starred' ELSE 'unstarred' END);
  END IF;
  IF v_queue IS DISTINCT FROM v_fb.queue_state THEN
    v_event:=CASE p_action WHEN 'triage' THEN 'triaged' WHEN 'archive' THEN 'archived'
      ELSE 'restored' END;
    INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility,message)
    VALUES(v_fb.id,v_actor,v_event,'internal',NULL);
  END IF;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,before,after)
  VALUES(v_actor,'feedback.v4.'||p_action,'feedback',v_fb.id,
    jsonb_build_object('queue',v_fb.queue_state,'priority',v_fb.priority,'star',v_fb.is_starred,'tags',v_fb.tags),
    jsonb_build_object('queue',v_queue,'priority',v_prior,'star',v_star,'tags',v_tags));
  RETURN jsonb_build_object('id',v_fb.id,'version',v_fb.version+1,'changed',true,'queue_state',v_queue);
END;$$;

-- View-only inbox read marker; no V2 screening / soft-delete entry point.
CREATE FUNCTION private.admin_mark_feedback_read_core(p_feedback_id uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_owner uuid; v_fb public.user_feedback%ROWTYPE;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  PERFORM private.require_admin();
  IF p_feedback_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
  THEN RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422'; END IF;
  SELECT user_id INTO v_owner FROM public.user_feedback WHERE id=p_feedback_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FEEDBACK_NOT_FOUND' USING ERRCODE='PT409'; END IF;
  PERFORM private.acquire_l1_user_lock(v_owner);
  SELECT * INTO v_fb FROM public.user_feedback WHERE id=p_feedback_id FOR UPDATE;
  IF NOT FOUND OR v_fb.user_id<>v_owner OR v_fb.version<>p_expected_version
    OR v_fb.deletion_started_at IS NOT NULL
  THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
  IF v_fb.queue_state<>'inbox'
  THEN RAISE EXCEPTION 'NOT_IN_INBOX' USING ERRCODE='PT409'; END IF;
  IF v_fb.read_at IS NOT NULL
  THEN RETURN jsonb_build_object('id',v_fb.id,'version',v_fb.version,'changed',false); END IF;
  UPDATE public.user_feedback SET read_at=transaction_timestamp(),version=version+1
    WHERE id=p_feedback_id;
  RETURN jsonb_build_object('id',v_fb.id,'version',v_fb.version+1,'changed',true);
END;$$;
REVOKE ALL ON FUNCTION private.admin_mark_feedback_read_core(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.admin_mark_feedback_read_core(uuid,integer) TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;

CREATE FUNCTION public.admin_mark_feedback_read(p_feedback_id uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_mark_feedback_read_core($1,$2); $$;
REVOKE ALL ON FUNCTION public.admin_mark_feedback_read(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_feedback_read(uuid,integer) TO authenticated;

-- Remove obsolete authenticated entry points; do not CASCADE or alter historical migrations.
DROP FUNCTION public.reply_to_feedback(uuid,text,integer);
DROP FUNCTION public.admin_update_feedback(uuid,integer,text,text,text,text);
DROP FUNCTION public.admin_assign_feedback(uuid,integer,uuid);
DROP FUNCTION public.admin_attention_feedback(uuid,integer,boolean,text[]);
DROP FUNCTION public.admin_screen_feedback(uuid,integer,text,text);
DROP FUNCTION public.admin_feedback_tags(uuid);
DROP FUNCTION private.reply_to_feedback_core(uuid,text,integer);
DROP FUNCTION private.admin_update_feedback_core(uuid,integer,text,text,text,text);
DROP FUNCTION private.admin_assign_feedback_core(uuid,integer,uuid);
DROP FUNCTION private.admin_attention_feedback_core(uuid,integer,boolean,text[]);
DROP FUNCTION private.admin_screen_feedback_core(uuid,integer,text,text);
DROP FUNCTION private.admin_feedback_tags_core(uuid);

NOTIFY pgrst,'reload schema';
