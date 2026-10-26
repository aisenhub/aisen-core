-- FB-V2: authenticated, audited, versioned inbox screening.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE FUNCTION private.admin_screen_feedback_core(
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
   UPDATE public.user_feedback SET read_at=transaction_timestamp(),
     version=version+1 WHERE id=v_fb.id;
   RETURN jsonb_build_object('id',v_fb.id,'queue_state','inbox',
     'version',v_fb.version+1,'changed',true);
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
REVOKE ALL ON FUNCTION private.admin_screen_feedback_core(uuid,integer,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.admin_screen_feedback_core(uuid,integer,text,text)
 TO authenticated;
CREATE FUNCTION private.admin_attention_feedback_core(
 p_feedback_id uuid,p_expected_version integer,
 p_is_starred boolean DEFAULT NULL,p_tags text[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_admin uuid;v_user uuid;v_fb public.user_feedback%ROWTYPE;
 v_star boolean;v_tags text[];
BEGIN
 PERFORM private.acquire_l0_admin_write_lock();v_admin:=private.require_admin();
 IF p_feedback_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
 OR (p_is_starred IS NULL AND p_tags IS NULL)
 OR (p_tags IS NOT NULL AND
   (cardinality(p_tags)>8 OR EXISTS
     (SELECT 1 FROM unnest(p_tags) AS x(t) WHERE x.t IS NULL
       OR char_length(btrim(x.t)) NOT BETWEEN 1 AND 32)
    OR (SELECT count(DISTINCT t) FROM unnest(p_tags) AS x(t))<>cardinality(p_tags)))
 THEN RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422'; END IF;
 SELECT user_id INTO v_user FROM public.user_feedback WHERE id=p_feedback_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'FEEDBACK_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 PERFORM private.acquire_l1_user_lock(v_user);
 SELECT * INTO v_fb FROM public.user_feedback WHERE id=p_feedback_id FOR UPDATE;
 IF NOT FOUND OR v_fb.user_id<>v_user OR v_fb.version<>p_expected_version
 THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
 IF v_fb.queue_state<>'workbench'
 THEN RAISE EXCEPTION 'NOT_IN_WORKBENCH' USING ERRCODE='PT409'; END IF;
 v_star:=coalesce(p_is_starred,v_fb.is_starred);
 v_tags:=coalesce(p_tags,v_fb.tags);
 IF v_star IS NOT DISTINCT FROM v_fb.is_starred
 AND v_tags IS NOT DISTINCT FROM v_fb.tags THEN
  RETURN jsonb_build_object('id',v_fb.id,'version',v_fb.version,'changed',false);
 END IF;
 UPDATE public.user_feedback SET is_starred=v_star,tags=v_tags,
   version=version+1,updated_at=transaction_timestamp() WHERE id=v_fb.id;
 IF v_star IS DISTINCT FROM v_fb.is_starred THEN
   INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility,message)
   VALUES(v_fb.id,v_admin,'star_changed','internal',
       CASE WHEN v_star THEN 'starred' ELSE 'unstarred' END);
 END IF;
 IF v_tags IS DISTINCT FROM v_fb.tags THEN
   INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility,message)
   VALUES(v_fb.id,v_admin,'tags_changed','internal',array_to_string(v_tags,', '));
 END IF;
 INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,before,after)
 VALUES(v_admin,'feedback.attention','feedback',v_fb.id,
  jsonb_build_object('starred',v_fb.is_starred,'tag_count',cardinality(v_fb.tags)),
  jsonb_build_object('starred',v_star,'tag_count',cardinality(v_tags)));
 RETURN jsonb_build_object('id',v_fb.id,'version',v_fb.version+1,
   'is_starred',v_star,'tags',v_tags,'changed',true);
END; $$;
REVOKE ALL ON FUNCTION private.admin_attention_feedback_core(uuid,integer,boolean,text[])
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.admin_attention_feedback_core(uuid,integer,boolean,text[])
 TO authenticated;

-- Existing single-source protected cores updated for new stage contract.
CREATE OR REPLACE FUNCTION private.feedback_submit_core(
 p_user_id uuid, p_product_key text, p_request_id uuid,
 p_content text, p_category text, p_attachments jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_product public.products%ROWTYPE;
 v_item jsonb;
 v_existing public.user_feedback%ROWTYPE;
 v_created public.user_feedback%ROWTYPE;
BEGIN
 IF p_user_id IS NULL OR p_request_id IS NULL OR
    p_content IS NULL OR length(btrim(p_content)) NOT BETWEEN 1 AND 5000 OR
    p_category IS NULL OR p_category NOT IN
      ('bug','account','experience','suggestion','other') OR
    p_attachments IS NULL OR jsonb_typeof(p_attachments)<>'array' OR
    jsonb_array_length(p_attachments)>2 THEN
   RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
 END IF;
 PERFORM private.acquire_l1_user_lock(p_user_id);
 IF EXISTS(SELECT 1 FROM public.platform_account_restrictions
   WHERE user_id=p_user_id AND kind='blocked') THEN
   RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='PT403';
 END IF;
 SELECT * INTO v_product FROM public.products
   WHERE product_key=p_product_key FOR SHARE;
 IF NOT FOUND OR v_product.status<>'active' THEN
   RAISE EXCEPTION 'PRODUCT_UNAVAILABLE' USING ERRCODE='PT409';
 END IF;
 SELECT * INTO v_existing FROM public.user_feedback
   WHERE user_id=p_user_id AND product_id=v_product.id AND request_id=p_request_id;
 IF FOUND THEN
   IF v_existing.content<>p_content OR v_existing.category<>p_category OR
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'slot',a.slot,'object_key',a.object_key,'mime_type',a.mime_type,'size_bytes',a.size_bytes)
        ORDER BY a.slot),'[]'::jsonb)
       FROM public.feedback_attachments a WHERE a.feedback_id=v_existing.id)
      IS DISTINCT FROM
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'slot',(x.value->>'slot')::smallint,'object_key',x.value->>'object_key',
        'mime_type',x.value->>'mime_type','size_bytes',(x.value->>'size_bytes')::bigint)
        ORDER BY (x.value->>'slot')::smallint),'[]'::jsonb)
       FROM jsonb_array_elements(p_attachments) AS x(value)) THEN
     RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';
   END IF;
   RETURN jsonb_build_object('id',v_existing.id,'feedback_no',v_existing.feedback_no,
     'status',coalesce(v_existing.status,'received'),'created_at',v_existing.created_at,'replayed',true);
 END IF;
 -- Development threshold: 5 fresh submissions per user/hour, adjustable by a
 -- later reviewed migration. This check is inside the same L1 user lock and
 -- is skipped for exact idempotent replays.
 IF (SELECT count(*) FROM public.user_feedback
      WHERE user_id=p_user_id AND created_at>transaction_timestamp()-interval '1 hour')>=5 THEN
   RAISE EXCEPTION 'FEEDBACK_RATE_LIMITED' USING ERRCODE='PT429';
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_attachments) LOOP
   IF jsonb_typeof(v_item)<>'object' OR
      NOT (v_item ? 'slot' AND v_item ? 'object_key'
           AND v_item ? 'mime_type' AND v_item ? 'size_bytes') OR
      jsonb_typeof(v_item->'slot')<>'number' OR
      jsonb_typeof(v_item->'size_bytes')<>'number' OR
      NOT (v_item->>'slot' IN ('1','2')) OR
      v_item->>'mime_type' NOT IN ('image/jpeg','image/png','image/webp') OR
      (v_item->>'size_bytes')::bigint NOT BETWEEN 1 AND 3145728 OR
      length(v_item->>'object_key') NOT BETWEEN 18 AND 512 THEN
     RAISE EXCEPTION 'INVALID_ATTACHMENT' USING ERRCODE='PT422';
   END IF;
 END LOOP;
 INSERT INTO public.user_feedback(user_id,product_id,content,category,request_id)
 VALUES(p_user_id,v_product.id,p_content,p_category,p_request_id)
 RETURNING * INTO v_created;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_attachments) LOOP
   IF (v_item->>'object_key') !~
       ('^feedback/'||v_product.id::text||'/'||p_user_id::text||'/'||
        p_request_id::text||'/'||(v_item->>'slot')||
        '-[0-9a-f]{64}[.](png|jpg|webp)$') THEN
     RAISE EXCEPTION 'INVALID_ATTACHMENT_KEY' USING ERRCODE='PT422';
   END IF;
   INSERT INTO public.feedback_attachments
     (feedback_id,slot,object_key,mime_type,size_bytes)
   VALUES(v_created.id,(v_item->>'slot')::smallint,v_item->>'object_key',
          v_item->>'mime_type',(v_item->>'size_bytes')::bigint);
 END LOOP;
 INSERT INTO public.feedback_events
   (feedback_id,actor_user_id,event_type,visibility,message)
 VALUES(v_created.id,p_user_id,'created','public',NULL);
 RETURN jsonb_build_object('id',v_created.id,'feedback_no',v_created.feedback_no,
   'status','received','created_at',v_created.created_at,'replayed',false);
END; $$;

CREATE OR REPLACE FUNCTION private.my_feedback_core(p_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401'; END IF;
 IF EXISTS (SELECT 1 FROM public.platform_account_restrictions
    WHERE user_id=v_user AND kind='blocked') THEN
    RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='PT403';
 END IF;
 RETURN coalesce((
   SELECT jsonb_agg(jsonb_build_object(
     'id',f.id,'feedback_no',f.feedback_no,'product_id',f.product_id,
     'content',f.content,'category',f.category,'status',CASE WHEN f.queue_state='inbox' THEN 'received' WHEN f.queue_state='archived' THEN 'recorded' ELSE f.status END,
     'created_at',f.created_at,'updated_at',f.updated_at,
     'version',f.version,
     'request_id',f.request_id,'attachment_count',(
       SELECT count(*) FROM public.feedback_attachments a WHERE a.feedback_id=f.id),
     'attachments',(
       SELECT coalesce(jsonb_agg(jsonb_build_object(
         'id',a.id,'slot',a.slot,'mime_type',a.mime_type,'size_bytes',a.size_bytes)
         ORDER BY a.slot),'[]'::jsonb)
       FROM public.feedback_attachments a WHERE a.feedback_id=f.id)
   ) ORDER BY f.created_at DESC)
   FROM (SELECT * FROM public.user_feedback
      WHERE user_id=v_user AND queue_state<>'trashed' AND (p_request_id IS NULL OR request_id=p_request_id)
      ORDER BY created_at DESC LIMIT 100) f), '[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION private.admin_update_feedback_core(
 p_feedback_id uuid, p_expected_version integer,
 p_status text DEFAULT NULL, p_priority text DEFAULT NULL,
 p_internal_note text DEFAULT NULL, p_public_reply text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_admin uuid;
 v_user uuid;
 v_fb public.user_feedback%ROWTYPE;
 v_status text; v_priority text; v_change boolean;
BEGIN
 -- Existing global L0 before target user L1. Recheck current Admin after lock.
 PERFORM private.acquire_l0_admin_write_lock();
 v_admin:=private.require_admin();
 IF p_feedback_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR
    (p_status IS NOT NULL AND p_status NOT IN
       ('new','in_progress','waiting_user','resolved','closed')) OR
    (p_priority IS NOT NULL AND p_priority NOT IN ('low','normal','high','urgent')) OR
    (p_internal_note IS NOT NULL AND length(btrim(p_internal_note)) NOT BETWEEN 1 AND 5000) OR
    (p_public_reply IS NOT NULL AND length(btrim(p_public_reply)) NOT BETWEEN 1 AND 5000) THEN
   RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
 END IF;
 SELECT user_id INTO v_user FROM public.user_feedback WHERE id=p_feedback_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'FEEDBACK_NOT_FOUND' USING ERRCODE='PT409'; END IF;
 PERFORM private.acquire_l1_user_lock(v_user);
 SELECT * INTO v_fb FROM public.user_feedback WHERE id=p_feedback_id FOR UPDATE;
 IF NOT FOUND OR v_fb.version<>p_expected_version OR v_fb.user_id<>v_user THEN
   RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409';
 END IF;
 IF v_fb.queue_state<>'workbench' THEN
   RAISE EXCEPTION 'NOT_IN_WORKBENCH' USING ERRCODE='PT409';
 END IF;
 v_status:=coalesce(p_status,v_fb.status);
 v_priority:=coalesce(p_priority,v_fb.priority);
 IF v_status<>v_fb.status AND NOT (
   (v_fb.status='new' AND v_status='in_progress') OR
   (v_fb.status='in_progress' AND v_status IN ('waiting_user','resolved')) OR
   (v_fb.status='waiting_user' AND v_status IN ('in_progress','resolved')) OR
   (v_fb.status='resolved' AND v_status IN ('closed','in_progress')) OR
   (v_fb.status='closed' AND v_status='in_progress')) THEN
   RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='PT409';
 END IF;
 IF v_status='waiting_user' AND v_status<>v_fb.status AND p_public_reply IS NULL THEN
   RAISE EXCEPTION 'PUBLIC_REPLY_REQUIRED' USING ERRCODE='PT422';
 END IF;
 IF v_status='resolved' AND v_status<>v_fb.status AND p_public_reply IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.feedback_events
     WHERE feedback_id=v_fb.id AND event_type='public_reply') THEN
   RAISE EXCEPTION 'PUBLIC_REPLY_REQUIRED' USING ERRCODE='PT422';
 END IF;
 v_change:=(v_status<>v_fb.status OR v_priority<>v_fb.priority OR
   p_internal_note IS NOT NULL OR p_public_reply IS NOT NULL);
 IF NOT v_change THEN
   RETURN jsonb_build_object('id',v_fb.id,'status',v_status,
     'version',v_fb.version,'changed',false);
 END IF;
 UPDATE public.user_feedback SET status=v_status,priority=v_priority,
   version=version+1,updated_at=transaction_timestamp(),
   resolved_at=CASE WHEN v_status='resolved' THEN
      CASE WHEN v_fb.status='resolved' THEN resolved_at ELSE transaction_timestamp() END
      WHEN v_status='in_progress' THEN NULL ELSE resolved_at END,
   closed_at=CASE WHEN v_status='closed' THEN transaction_timestamp()
      WHEN v_status='in_progress' THEN NULL ELSE closed_at END
 WHERE id=v_fb.id;
 IF v_status<>v_fb.status THEN
   INSERT INTO public.feedback_events
     (feedback_id,actor_user_id,event_type,visibility,from_status,to_status)
   VALUES(v_fb.id,v_admin,'status_changed','internal',v_fb.status,v_status);
 END IF;
 IF v_priority<>v_fb.priority THEN
   INSERT INTO public.feedback_events
    (feedback_id,actor_user_id,event_type,visibility,message)
   VALUES(v_fb.id,v_admin,'priority_changed','internal',v_priority);
 END IF;
 IF p_internal_note IS NOT NULL THEN
   INSERT INTO public.feedback_events
    (feedback_id,actor_user_id,event_type,visibility,message)
   VALUES(v_fb.id,v_admin,'internal_note','internal',p_internal_note);
 END IF;
 IF p_public_reply IS NOT NULL THEN
   INSERT INTO public.feedback_events
    (feedback_id,actor_user_id,event_type,visibility,message)
   VALUES(v_fb.id,v_admin,'public_reply','public',p_public_reply);
 END IF;
 INSERT INTO public.admin_audit_log
   (actor_user_id,action,target_type,target_id,before,after)
 VALUES(v_admin,'feedback.update','feedback',v_fb.id,
   jsonb_build_object('status',v_fb.status,'priority',v_fb.priority),
   jsonb_build_object('status',v_status,'priority',v_priority));
 RETURN jsonb_build_object('id',v_fb.id,'status',v_status,'priority',v_priority,
   'version',v_fb.version+1,'changed',true);
END; $$;

CREATE OR REPLACE FUNCTION private.admin_assign_feedback_core(
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
 IF v_before.queue_state<>'workbench' THEN
   RAISE EXCEPTION 'NOT_IN_WORKBENCH' USING ERRCODE='PT409';
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

RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;

CREATE FUNCTION public.admin_screen_feedback(
 p_feedback_id uuid,p_expected_version integer,
 p_action text,p_priority text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_screen_feedback_core(
  p_feedback_id,p_expected_version,p_action,p_priority); $$;
REVOKE ALL ON FUNCTION public.admin_screen_feedback(uuid,integer,text,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_screen_feedback(uuid,integer,text,text)
 TO authenticated;

CREATE FUNCTION public.admin_attention_feedback(
 p_feedback_id uuid,p_expected_version integer,
 p_is_starred boolean DEFAULT NULL,p_tags text[] DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_attention_feedback_core(
  p_feedback_id,p_expected_version,p_is_starred,p_tags); $$;
REVOKE ALL ON FUNCTION public.admin_attention_feedback(uuid,integer,boolean,text[])
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_attention_feedback(uuid,integer,boolean,text[])
 TO authenticated;
NOTIFY pgrst,'reload schema';
