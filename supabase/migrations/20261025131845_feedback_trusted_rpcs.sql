-- FB-01B/C: trusted feedback functions. Runtime API uses existing Supabase
-- Edge/Auth + public SECURITY INVOKER wrappers, private limited-definer cores.
-- Only the Edge service role can commit metadata for uploaded R2 objects.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
GRANT USAGE, SELECT ON SEQUENCE public.user_feedback_feedback_no_seq TO aisencore_rpc_executor;
GRANT EXECUTE ON FUNCTION private.require_admin(),
 private.acquire_l0_admin_write_lock(), private.acquire_l1_user_lock(uuid)
 TO aisencore_rpc_executor;
GRANT INSERT ON public.admin_audit_log TO aisencore_rpc_executor;
GRANT SELECT ON public.platform_admins, public.platform_account_restrictions,
 public.products TO aisencore_rpc_executor;

SET ROLE aisencore_rpc_executor;

-- A service credential is never sent to the client. Edge must verify JWT
-- with Auth.getUser before supplying this p_user_id. Ordinary clients cannot
-- call this wrapper or private core.
CREATE FUNCTION private.feedback_submit_core(
 p_user_id uuid, p_product_key text, p_request_id uuid,
 p_content text, p_category text, p_attachments jsonb, p_contact_email text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_product public.products%ROWTYPE;
 v_item jsonb;
 v_existing public.user_feedback%ROWTYPE;
 v_created public.user_feedback%ROWTYPE;
 v_count int;
BEGIN
 IF p_user_id IS NULL OR p_request_id IS NULL OR
    p_contact_email IS NULL OR octet_length(btrim(p_contact_email)) NOT BETWEEN 1 AND 254 OR
    btrim(p_contact_email) !~ '^[A-Za-z0-9.!#$%&''*+/=?^_{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$' OR
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
   IF v_existing.contact_email IS DISTINCT FROM btrim(p_contact_email) OR
      v_existing.content<>p_content OR v_existing.category<>p_category OR
      (SELECT count(*) FROM public.feedback_attachments
        WHERE feedback_id=v_existing.id)<>jsonb_array_length(p_attachments) THEN
     RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';
   END IF;
   RETURN jsonb_build_object('id',v_existing.id,'feedback_no',v_existing.feedback_no,
     'status',v_existing.status,'created_at',v_existing.created_at,'replayed',true);
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
 INSERT INTO public.user_feedback(user_id,product_id,content,category,request_id,contact_email)
 VALUES(p_user_id,v_product.id,p_content,p_category,p_request_id,btrim(p_contact_email))
 RETURNING * INTO v_created;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_attachments) LOOP
   IF (v_item->>'object_key') NOT LIKE
       ('feedback/'||v_product.id::text||'/'||v_created.id::text||'/%') THEN
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
   'status',v_created.status,'created_at',v_created.created_at,'replayed',false);
END; $$;
REVOKE ALL ON FUNCTION private.feedback_submit_core(uuid,text,uuid,text,text,jsonb,text)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.feedback_submit_core(uuid,text,uuid,text,text,jsonb,text)
 TO service_role;

-- Strict user-facing DTO: never include attachment object_key, internal note,
-- assignee, or actor details. Ordinary users only receive their own records.
CREATE FUNCTION private.my_feedback_core(p_request_id uuid DEFAULT NULL)
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
     'content',f.content,'category',f.category,'status',f.status,
     'created_at',f.created_at,'updated_at',f.updated_at,
     'request_id',f.request_id,'attachment_count',(
       SELECT count(*) FROM public.feedback_attachments a WHERE a.feedback_id=f.id)
   ) ORDER BY f.created_at DESC)
   FROM (SELECT * FROM public.user_feedback
      WHERE user_id=v_user AND (p_request_id IS NULL OR request_id=p_request_id)
      ORDER BY created_at DESC LIMIT 100) f), '[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION private.my_feedback_core(uuid)
 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.my_feedback_core(uuid) TO authenticated;

CREATE FUNCTION private.my_feedback_events_core(p_feedback_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_user uuid:=auth.uid();
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_account_restrictions
    WHERE user_id=v_user AND kind='blocked') THEN
   RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='PT403';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_feedback
    WHERE id=p_feedback_id AND user_id=v_user) THEN
   RAISE EXCEPTION 'FEEDBACK_NOT_FOUND' USING ERRCODE='PT403';
 END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',e.id,'event_type',e.event_type,'message',e.message,
   'to_status',e.to_status,'created_at',e.created_at) ORDER BY e.created_at)
  FROM public.feedback_events e WHERE e.feedback_id=p_feedback_id
    AND e.visibility='public'), '[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION private.my_feedback_events_core(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.my_feedback_events_core(uuid) TO authenticated;

CREATE FUNCTION private.reply_to_feedback_core(
 p_feedback_id uuid, p_message text, p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_user uuid:=auth.uid(); v_fb public.user_feedback%ROWTYPE; v_status text;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401'; END IF;
 IF p_message IS NULL OR length(btrim(p_message)) NOT BETWEEN 1 AND 5000
    OR p_expected_version IS NULL OR p_expected_version<1 THEN
   RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
 END IF;
 PERFORM private.acquire_l1_user_lock(v_user);
 IF EXISTS(SELECT 1 FROM public.platform_account_restrictions
   WHERE user_id=v_user AND kind='blocked') THEN
   RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='PT403';
 END IF;
 SELECT * INTO v_fb FROM public.user_feedback WHERE id=p_feedback_id FOR UPDATE;
 IF NOT FOUND OR v_fb.user_id<>v_user THEN
   RAISE EXCEPTION 'FEEDBACK_NOT_FOUND' USING ERRCODE='PT403';
 END IF;
 IF v_fb.version<>p_expected_version THEN
   RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409';
 END IF;
 v_status:=CASE WHEN v_fb.status='waiting_user' THEN 'in_progress' ELSE v_fb.status END;
 UPDATE public.user_feedback SET status=v_status,version=version+1,
   updated_at=transaction_timestamp(),
   resolved_at=CASE WHEN v_status='in_progress' THEN NULL ELSE resolved_at END,
   closed_at=CASE WHEN v_status='in_progress' THEN NULL ELSE closed_at END
 WHERE id=v_fb.id;
 INSERT INTO public.feedback_events(
    feedback_id,actor_user_id,event_type,visibility,from_status,to_status,message)
 VALUES(v_fb.id,v_user,'user_reply','public',v_fb.status,v_status,p_message);
 RETURN jsonb_build_object('id',v_fb.id,'status',v_status,'version',v_fb.version+1);
END; $$;
REVOKE ALL ON FUNCTION private.reply_to_feedback_core(uuid,text,integer)
 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.reply_to_feedback_core(uuid,text,integer)
 TO authenticated;

CREATE FUNCTION private.admin_update_feedback_core(
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
REVOKE ALL ON FUNCTION private.admin_update_feedback_core(
 uuid,integer,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_update_feedback_core(
 uuid,integer,text,text,text,text) TO authenticated;

-- Used by Edge to check image ownership on every read request.
CREATE FUNCTION private.feedback_image_access_core(p_attachment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_actor uuid:=auth.uid();v_row record;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_account_restrictions
    WHERE user_id=v_actor AND kind='blocked') THEN
   RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='PT403';
 END IF;
 SELECT a.object_key,a.mime_type,a.size_bytes,f.user_id INTO v_row
   FROM public.feedback_attachments a JOIN public.user_feedback f
    ON f.id=a.feedback_id WHERE a.id=p_attachment_id;
 IF NOT FOUND OR (v_row.user_id<>v_actor AND NOT private.is_platform_admin()) THEN
   RAISE EXCEPTION 'ATTACHMENT_FORBIDDEN' USING ERRCODE='PT403';
 END IF;
 RETURN jsonb_build_object('object_key',v_row.object_key,
   'mime_type',v_row.mime_type,'size_bytes',v_row.size_bytes);
END; $$;
REVOKE ALL ON FUNCTION private.feedback_image_access_core(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.feedback_image_access_core(uuid) TO authenticated;

RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
-- Public signatures: no direct client access to p_user_id or attachment keys.
CREATE FUNCTION public.feedback_submit_from_edge(
 p_user_id uuid,p_product_key text,p_request_id uuid,p_content text,
 p_category text,p_attachments jsonb, p_contact_email text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.feedback_submit_core(
 p_user_id,p_product_key,p_request_id,p_content,p_category,p_attachments,p_contact_email); $$;
REVOKE ALL ON FUNCTION public.feedback_submit_from_edge(uuid,text,uuid,text,text,jsonb,text)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_submit_from_edge(uuid,text,uuid,text,text,jsonb,text)
 TO service_role;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE FUNCTION public.my_feedback(p_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.my_feedback_core(p_request_id); $$;
CREATE FUNCTION public.my_feedback_events(p_feedback_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.my_feedback_events_core(p_feedback_id); $$;
CREATE FUNCTION public.reply_to_feedback(p_feedback_id uuid,p_message text,p_expected_version integer)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.reply_to_feedback_core(p_feedback_id,p_message,p_expected_version); $$;
CREATE FUNCTION public.admin_update_feedback(
 p_feedback_id uuid,p_expected_version integer,p_status text DEFAULT NULL,
 p_priority text DEFAULT NULL,p_internal_note text DEFAULT NULL,
 p_public_reply text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_update_feedback_core(
 p_feedback_id,p_expected_version,p_status,p_priority,p_internal_note,p_public_reply); $$;
CREATE FUNCTION public.feedback_image_access(p_attachment_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.feedback_image_access_core(p_attachment_id); $$;
REVOKE ALL ON FUNCTION public.my_feedback(uuid),
 public.my_feedback_events(uuid),public.reply_to_feedback(uuid,text,integer),
 public.admin_update_feedback(uuid,integer,text,text,text,text),
 public.feedback_image_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_feedback(uuid),
 public.my_feedback_events(uuid),public.reply_to_feedback(uuid,text,integer),
 public.admin_update_feedback(uuid,integer,text,text,text,text),
 public.feedback_image_access(uuid) TO authenticated;
