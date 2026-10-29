-- V3 lightweight feedback workflow. Existing legacy RPCs remain for compatibility.
-- All new writes use a protected, versioned, audited atomic operation.
ALTER TABLE public.user_feedback DROP CONSTRAINT user_feedback_screening_boundary;
ALTER TABLE public.user_feedback ADD CONSTRAINT user_feedback_screening_boundary CHECK (
  (queue_state='workbench' AND triaged_at IS NOT NULL)
  OR queue_state IN ('inbox','archived')
  OR (queue_state='trashed' AND deleted_from IN ('inbox','workbench','archived'))
);
ALTER TABLE public.user_feedback ADD COLUMN last_handled_by uuid
  REFERENCES auth.users(id) ON DELETE RESTRICT;

GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE FUNCTION private.admin_feedback_v3_core(
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
     OR p_action NOT IN ('save','triage','archive','trash','restore','reopen')
     OR (p_priority IS NOT NULL AND p_priority NOT IN ('low','normal','high','urgent'))
     OR (p_internal_note IS NOT NULL AND char_length(btrim(p_internal_note)) NOT BETWEEN 1 AND 5000)
     OR (p_tags IS NOT NULL AND (cardinality(p_tags)>8 OR
         EXISTS(SELECT 1 FROM unnest(p_tags) AS x(t)
           WHERE x.t IS NULL OR char_length(btrim(x.t)) NOT BETWEEN 1 AND 32)
         OR (SELECT count(DISTINCT t) FROM unnest(p_tags) AS x(t))<>cardinality(p_tags)))
  THEN RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422'; END IF;
  SELECT user_id INTO v_owner FROM public.user_feedback WHERE id=p_feedback_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FEEDBACK_NOT_FOUND' USING ERRCODE='PT409'; END IF;
  PERFORM private.acquire_l1_user_lock(v_owner);
  SELECT * INTO v_fb FROM public.user_feedback WHERE id=p_feedback_id FOR UPDATE;
  IF NOT FOUND OR v_fb.version<>p_expected_version OR v_fb.user_id<>v_owner
  THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;

  v_queue:=v_fb.queue_state; v_prior:=coalesce(p_priority,v_fb.priority);
  v_tags:=coalesce(p_tags,v_fb.tags); v_star:=coalesce(p_is_starred,v_fb.is_starred);
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
  ELSIF p_action='trash' THEN
    IF v_queue='trashed' THEN RAISE EXCEPTION 'ALREADY_TRASHED' USING ERRCODE='PT409'; END IF;
    v_origin:=v_queue;v_queue:='trashed';v_deleted:=transaction_timestamp();
  ELSIF p_action='restore' THEN
    IF v_queue<>'trashed' OR v_origin NOT IN ('inbox','workbench','archived')
    THEN RAISE EXCEPTION 'INVALID_RESTORE_STATE' USING ERRCODE='PT409'; END IF;
    v_queue:=v_origin;v_origin:=NULL;v_deleted:=NULL;
  ELSIF p_action='reopen' THEN
    IF v_queue<>'archived' THEN RAISE EXCEPTION 'NOT_ARCHIVED' USING ERRCODE='PT409'; END IF;
    v_queue:='workbench';v_archive:=NULL;
  END IF;
  IF p_action NOT IN ('save','triage') AND
     (p_priority IS NOT NULL OR p_tags IS NOT NULL OR p_is_starred IS NOT NULL OR p_internal_note IS NOT NULL)
  THEN RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422'; END IF;

  v_changed:=v_queue IS DISTINCT FROM v_fb.queue_state
    OR v_prior IS DISTINCT FROM v_fb.priority OR v_tags IS DISTINCT FROM v_fb.tags
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
  IF v_tags IS DISTINCT FROM v_fb.tags THEN
    INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility,message)
    VALUES(v_fb.id,v_actor,'tags_changed','internal',array_to_string(v_tags,', '));
  END IF;
  IF v_star IS DISTINCT FROM v_fb.is_starred THEN
    INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility,message)
    VALUES(v_fb.id,v_actor,'star_changed','internal',CASE WHEN v_star THEN 'starred' ELSE 'unstarred' END);
  END IF;
  IF v_queue IS DISTINCT FROM v_fb.queue_state THEN
    v_event:=CASE p_action WHEN 'triage' THEN 'triaged' WHEN 'archive' THEN 'archived'
      WHEN 'trash' THEN 'soft_deleted' WHEN 'restore' THEN 'restored'
      ELSE 'restored' END;
    INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility,message)
    VALUES(v_fb.id,v_actor,v_event,'internal',NULL);
  END IF;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,before,after)
  VALUES(v_actor,'feedback.v3.'||p_action,'feedback',v_fb.id,
    jsonb_build_object('queue',v_fb.queue_state,'priority',v_fb.priority,'star',v_fb.is_starred,'tags',v_fb.tags),
    jsonb_build_object('queue',v_queue,'priority',v_prior,'star',v_star,'tags',v_tags));
  RETURN jsonb_build_object('id',v_fb.id,'version',v_fb.version+1,'changed',true,'queue_state',v_queue);
END;$$;
REVOKE ALL ON FUNCTION private.admin_feedback_v3_core(uuid,integer,text,text,text[],boolean,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.admin_feedback_v3_core(uuid,integer,text,text,text[],boolean,text)
  TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;

CREATE FUNCTION public.admin_feedback_v3(
  p_feedback_id uuid,p_expected_version integer,p_action text,
  p_priority text DEFAULT NULL,p_tags text[] DEFAULT NULL,
  p_is_starred boolean DEFAULT NULL,p_internal_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_feedback_v3_core($1,$2,$3,$4,$5,$6,$7); $$;
REVOKE ALL ON FUNCTION public.admin_feedback_v3(uuid,integer,text,text,text[],boolean,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_feedback_v3(uuid,integer,text,text,text[],boolean,text)
  TO authenticated;

CREATE OR REPLACE VIEW public.admin_feedback_summaries WITH (security_invoker=true) AS
SELECT f.id,f.feedback_no,f.product_id,f.user_id,f.content,f.category,
 f.status,f.priority,f.assigned_to,f.version,f.created_at,f.updated_at,
 f.resolved_at,f.closed_at,
 (SELECT count(*)::integer FROM public.feedback_attachments a
   WHERE a.feedback_id=f.id) AS attachment_count,
 f.queue_state,f.read_at,f.triaged_at,f.is_starred,f.tags,
 f.archived_at,f.deleted_at,f.deleted_from,f.last_handled_by,f.contact_email
FROM public.user_feedback f;
NOTIFY pgrst,'reload schema';
