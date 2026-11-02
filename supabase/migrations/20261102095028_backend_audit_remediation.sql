DROP VIEW public.admin_feedback_summaries;
DROP FUNCTION public.admin_feedback_v3(uuid,integer,text,text,text[],boolean,text);
DROP FUNCTION private.admin_feedback_v3_core(uuid,integer,text,text,text[],boolean,text);
DROP FUNCTION public.admin_prepare_feedback_delete(uuid,integer,uuid);
DROP FUNCTION public.admin_finish_feedback_delete(uuid,uuid,uuid);
DROP FUNCTION public.feedback_image_access(uuid);
DROP FUNCTION private.admin_prepare_feedback_delete_core(uuid,integer,uuid);
DROP FUNCTION private.admin_finish_feedback_delete_core(uuid,uuid,uuid);
DROP FUNCTION private.feedback_image_access_core(uuid);
DROP TRIGGER feedback_v3_queue_guard ON public.user_feedback;
DROP TRIGGER prevent_feedback_obsolete_mutation ON public.user_feedback;
DROP FUNCTION private.feedback_v3_queue_guard();
DROP FUNCTION private.prevent_feedback_obsolete_mutation();
ALTER TABLE public.user_feedback
 DROP COLUMN status,DROP COLUMN assigned_to,DROP COLUMN resolved_at,DROP COLUMN closed_at,
 DROP COLUMN tags,DROP COLUMN deleted_at,DROP COLUMN deleted_from;
ALTER TABLE public.user_feedback DROP CONSTRAINT user_feedback_queue_valid;
ALTER TABLE public.user_feedback ADD CONSTRAINT user_feedback_queue_valid
 CHECK(queue_state IN ('inbox','workbench','archived'));
ALTER TABLE public.user_feedback DROP CONSTRAINT feedback_deletion_intent_consistent;
ALTER TABLE public.user_feedback ADD CONSTRAINT feedback_deletion_intent_consistent CHECK(
 (deletion_started_at IS NULL AND deletion_token IS NULL AND deletion_version IS NULL)
 OR (deletion_started_at IS NOT NULL AND deletion_token IS NOT NULL AND deletion_version IS NOT NULL AND deletion_version>0));
ALTER TABLE public.user_feedback ADD CONSTRAINT user_feedback_contact_email_valid CHECK(
 contact_email IS NULL OR (octet_length(contact_email) BETWEEN 1 AND 254 AND
 contact_email=btrim(contact_email) AND contact_email ~ '^[A-Za-z0-9.!#$%&''*+/=?^_{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$'));
ALTER TABLE public.feedback_events DROP COLUMN from_status,DROP COLUMN to_status;
ALTER TABLE public.feedback_events DROP CONSTRAINT feedback_events_type_valid;
ALTER TABLE public.feedback_events ADD CONSTRAINT feedback_events_type_valid CHECK(
 event_type IN ('created','priority_changed','internal_note','triaged','archived','restored','star_changed'));
ALTER TABLE public.redemptions DROP CONSTRAINT redemptions_code_user_unique;
DROP INDEX public.redemptions_code_created_idx;
DROP INDEX public.redemption_codes_batch_state_idx;
CREATE INDEX redemption_batches_created_idx ON public.redemption_code_batches(created_at DESC,id DESC);
CREATE INDEX redemption_batches_product_created_idx ON public.redemption_code_batches(product_id,created_at DESC,id DESC);
ALTER TABLE public.redemption_code_batches ADD CONSTRAINT redemption_batches_product_identity UNIQUE(id,product_id);
ALTER TABLE public.redemption_codes ADD CONSTRAINT redemption_codes_product_identity UNIQUE(id,product_id);
ALTER TABLE public.redemption_codes DROP CONSTRAINT redemption_codes_batch_id_fkey,
 ADD CONSTRAINT redemption_codes_batch_product_fk FOREIGN KEY(batch_id,product_id)
 REFERENCES public.redemption_code_batches(id,product_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE public.redemptions DROP CONSTRAINT redemptions_code_id_fkey,
 DROP CONSTRAINT redemptions_grant_id_fkey,
 ADD CONSTRAINT redemptions_code_product_fk FOREIGN KEY(code_id,product_id)
 REFERENCES public.redemption_codes(id,product_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 ADD CONSTRAINT redemptions_grant_identity_fk FOREIGN KEY(grant_id,user_id,product_id)
 REFERENCES public.entitlement_grants(id,user_id,product_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER FUNCTION private.require_admin() STABLE;
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE FUNCTION private.require_feedback_admin(p_actor_id uuid,p_actor_aal text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401'; END IF;
 IF p_actor_aal IS DISTINCT FROM 'aal2'
  OR NOT EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=p_actor_id AND active)
  OR EXISTS(SELECT 1 FROM public.platform_account_restrictions WHERE user_id=p_actor_id AND kind='blocked')
 THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='PT403'; END IF;
 RETURN p_actor_id;
END;$$;
REVOKE ALL ON FUNCTION private.require_feedback_admin(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.guard_feedback_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF OLD.deletion_started_at IS NOT NULL THEN
  RAISE EXCEPTION 'DELETE_PENDING' USING ERRCODE='PT409';
 END IF;
 IF OLD.queue_state IS DISTINCT FROM NEW.queue_state AND NOT (
  (OLD.queue_state='inbox' AND NEW.queue_state='workbench')
  OR (OLD.queue_state='workbench' AND NEW.queue_state='archived')
  OR (OLD.queue_state='archived' AND NEW.queue_state='workbench')
 ) THEN RAISE EXCEPTION 'INVALID_QUEUE_ACTION' USING ERRCODE='PT409'; END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION private.guard_feedback_mutation() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.admin_mark_feedback_read_core(p_feedback_id uuid,p_expected_version integer)
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
  UPDATE public.user_feedback SET read_at=transaction_timestamp()
    WHERE id=p_feedback_id;
  RETURN jsonb_build_object('id',v_fb.id,'version',v_fb.version,'changed',true);
END;$$;

CREATE OR REPLACE FUNCTION private.admin_feedback_v3_core(
  p_feedback_id uuid,p_expected_version integer,p_action text,
  p_priority text DEFAULT NULL,
  p_is_starred boolean DEFAULT NULL,p_internal_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid; v_owner uuid; v_fb public.user_feedback%ROWTYPE;
  v_queue text; v_prior text; v_star boolean;
  v_archive timestamptz;
  v_triaged timestamptz; v_event text; v_changed boolean;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor:=private.require_admin();
  IF p_feedback_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
     OR (p_action IS NULL OR p_action NOT IN ('save','triage','archive','reopen'))
     OR (p_priority IS NOT NULL AND p_priority NOT IN ('low','normal','high','urgent'))
     OR (p_internal_note IS NOT NULL AND char_length(btrim(p_internal_note)) NOT BETWEEN 1 AND 5000)
  THEN RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422'; END IF;
  SELECT user_id INTO v_owner FROM public.user_feedback WHERE id=p_feedback_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FEEDBACK_NOT_FOUND' USING ERRCODE='PT409'; END IF;
  PERFORM private.acquire_l1_user_lock(v_owner);
  SELECT * INTO v_fb FROM public.user_feedback WHERE id=p_feedback_id FOR UPDATE;
  IF NOT FOUND OR v_fb.version<>p_expected_version OR v_fb.user_id<>v_owner OR v_fb.deletion_started_at IS NOT NULL
  THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;

  v_queue:=v_fb.queue_state; v_prior:=coalesce(p_priority,v_fb.priority);
  v_star:=coalesce(p_is_starred,v_fb.is_starred);
  v_archive:=v_fb.archived_at; v_triaged:=v_fb.triaged_at;
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
     (p_priority IS NOT NULL OR p_is_starred IS NOT NULL OR p_internal_note IS NOT NULL)
  THEN RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422'; END IF;

  v_changed:=v_queue IS DISTINCT FROM v_fb.queue_state
    OR v_prior IS DISTINCT FROM v_fb.priority
    OR v_star IS DISTINCT FROM v_fb.is_starred OR p_internal_note IS NOT NULL;
  IF NOT v_changed THEN
    RETURN jsonb_build_object('id',v_fb.id,'version',v_fb.version,'changed',false);
  END IF;
  UPDATE public.user_feedback SET queue_state=v_queue,priority=v_prior,
    is_starred=v_star,
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
    jsonb_build_object('queue',v_fb.queue_state,'priority',v_fb.priority,'star',v_fb.is_starred),
    jsonb_build_object('queue',v_queue,'priority',v_prior,'star',v_star));
  RETURN jsonb_build_object('id',v_fb.id,'version',v_fb.version+1,'changed',true,'queue_state',v_queue);
END;$$;

CREATE OR REPLACE FUNCTION private.my_feedback_core(
  p_product_key text,p_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_product_id uuid;
  v_feedback public.user_feedback%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401';
  END IF;
  IF p_product_key IS NULL OR
     p_product_key !~ '^[a-z][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  IF EXISTS(SELECT 1 FROM public.platform_account_restrictions
    WHERE user_id=v_user AND kind='blocked') THEN
    RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='PT403';
  END IF;

  -- Historical owner reads do not require an active product or membership.
  -- Unknown product names return [] without becoming an enumeration oracle.
  SELECT id INTO v_product_id FROM public.products
    WHERE product_key=p_product_key;
  IF v_product_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Exact request lookups are not a paginated listing and must survive a
  -- soft-delete. A trashed request returns only an ownership-bound proof,
  -- never its queue state, contents, attachments or internal reason.
  IF p_request_id IS NOT NULL THEN
    SELECT * INTO v_feedback FROM public.user_feedback
      WHERE user_id=v_user AND product_id=v_product_id
        AND request_id=p_request_id;
    IF NOT FOUND THEN
      RETURN '[]'::jsonb;
    END IF;
    IF v_feedback.deletion_started_at IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'id',v_feedback.id,'product_id',v_product_id,
        'request_id',v_feedback.request_id,'recovery_only',true));
    END IF;
  END IF;

  -- The 100-record cap applies AFTER product and owner filters. No
  -- caller-supplied user_id or object key is accepted.
  RETURN coalesce((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',f.id,'feedback_no',f.feedback_no,'product_id',f.product_id,
      'content',f.content,'category',f.category,
      'status','received',
      'created_at',f.created_at,'updated_at',f.updated_at,
      'version',f.version,
      'request_id',f.request_id,'attachment_count',(
        SELECT count(*) FROM public.feedback_attachments a WHERE a.feedback_id=f.id),
      'attachments',(
        SELECT coalesce(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id',a.id,'slot',a.slot,'mime_type',a.mime_type,'size_bytes',a.size_bytes)
          ORDER BY a.slot),'[]'::jsonb)
        FROM public.feedback_attachments a WHERE a.feedback_id=f.id)
      ) ORDER BY f.created_at DESC,f.id DESC)
    FROM (SELECT * FROM public.user_feedback
      WHERE user_id=v_user AND product_id=v_product_id
        AND deletion_started_at IS NULL
        AND (p_request_id IS NULL OR request_id=p_request_id)
      ORDER BY created_at DESC,id DESC LIMIT 100) f
  ),'[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION private.my_feedback_events_core(p_feedback_id uuid)
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
    WHERE id=p_feedback_id AND user_id=v_user AND deletion_started_at IS NULL) THEN
   RAISE EXCEPTION 'FEEDBACK_NOT_FOUND' USING ERRCODE='PT403';
 END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',e.id,'event_type',e.event_type,'message',e.message,
   'created_at',e.created_at) ORDER BY e.created_at)
  FROM public.feedback_events e WHERE e.feedback_id=p_feedback_id
    AND e.visibility='public'), '[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION private.feedback_image_access_core(p_actor_id uuid,p_actor_aal text,p_attachment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_actor uuid:=p_actor_id;v_row record;
BEGIN
 IF v_actor IS NULL OR p_actor_aal NOT IN ('aal1','aal2') OR p_actor_aal IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_account_restrictions
    WHERE user_id=v_actor AND kind='blocked') THEN
   RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='PT403';
 END IF;
 SELECT a.object_key,a.mime_type,a.size_bytes,f.user_id INTO v_row
   FROM public.feedback_attachments a JOIN public.user_feedback f
    ON f.id=a.feedback_id WHERE a.id=p_attachment_id AND f.deletion_started_at IS NULL;
 IF NOT FOUND OR (v_row.user_id<>v_actor AND NOT (p_actor_aal='aal2' AND EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=v_actor AND active))) THEN
   RAISE EXCEPTION 'ATTACHMENT_FORBIDDEN' USING ERRCODE='PT403';
 END IF;
 RETURN jsonb_build_object('object_key',v_row.object_key,
   'mime_type',v_row.mime_type,'size_bytes',v_row.size_bytes);
END; $$;

CREATE OR REPLACE FUNCTION private.feedback_submit_core(
 p_user_id uuid, p_product_key text, p_request_id uuid,
 p_content text, p_category text, p_attachments jsonb, p_contact_email text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_product public.products%ROWTYPE;
 v_item jsonb;
 v_existing public.user_feedback%ROWTYPE;
 v_created public.user_feedback%ROWTYPE;
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
   IF v_existing.deletion_started_at IS NOT NULL THEN
     RAISE EXCEPTION 'DELETE_PENDING' USING ERRCODE='PT409';
   END IF;
   IF v_existing.contact_email IS DISTINCT FROM btrim(p_contact_email) OR
      v_existing.content<>p_content OR v_existing.category<>p_category OR
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
     'status','received','created_at',v_existing.created_at,'replayed',true);
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
 INSERT INTO public.user_feedback(user_id,product_id,content,category,request_id,contact_email)
 VALUES(p_user_id,v_product.id,p_content,p_category,p_request_id,btrim(p_contact_email))
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

CREATE OR REPLACE FUNCTION private.admin_prepare_feedback_delete_core(
  p_actor_id uuid,p_actor_aal text,p_feedback_id uuid,p_expected_version integer,p_product_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_owner uuid;v_fb public.user_feedback%ROWTYPE;
  v_keys jsonb;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  PERFORM private.require_feedback_admin(p_actor_id,p_actor_aal);
  IF p_feedback_id IS NULL OR (p_expected_version IS NOT NULL AND p_expected_version<1)
  THEN RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422'; END IF;
  SELECT user_id INTO v_owner FROM public.user_feedback WHERE id=p_feedback_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FEEDBACK_NOT_FOUND' USING ERRCODE='PT409'; END IF;
  PERFORM private.acquire_l1_user_lock(v_owner);
  SELECT * INTO v_fb FROM public.user_feedback WHERE id=p_feedback_id FOR UPDATE;
  IF NOT FOUND OR v_fb.user_id<>v_owner OR
     (p_product_id IS NOT NULL AND v_fb.product_id<>p_product_id)
  THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
  IF v_fb.deletion_token IS NULL THEN
    IF p_expected_version IS NULL OR v_fb.version<>p_expected_version
    THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
    UPDATE public.user_feedback SET deletion_token=pg_catalog.gen_random_uuid(),
      deletion_started_at=transaction_timestamp(),deletion_version=version,
      version=version+1 WHERE id=p_feedback_id RETURNING * INTO v_fb;
  ELSIF p_expected_version IS NOT NULL AND
        p_expected_version<>v_fb.deletion_version THEN
    RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(a.object_key ORDER BY a.slot),'[]'::jsonb)
    INTO v_keys FROM public.feedback_attachments a WHERE a.feedback_id=p_feedback_id;
  RETURN pg_catalog.jsonb_build_object('id',v_fb.id,'token',v_fb.deletion_token,
    'keys',v_keys,'product_id',v_fb.product_id,'user_id',v_fb.user_id,'request_id',v_fb.request_id);
END;$$;

CREATE OR REPLACE FUNCTION private.admin_finish_feedback_delete_core(
  p_actor_id uuid,p_actor_aal text,p_feedback_id uuid,p_token uuid,p_product_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid;v_owner uuid;v_fb public.user_feedback%ROWTYPE;
  v_images integer;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor:=private.require_feedback_admin(p_actor_id,p_actor_aal);
  IF p_feedback_id IS NULL OR p_token IS NULL
  THEN RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422'; END IF;
  SELECT user_id INTO v_owner FROM public.user_feedback WHERE id=p_feedback_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FEEDBACK_NOT_FOUND' USING ERRCODE='PT409'; END IF;
  PERFORM private.acquire_l1_user_lock(v_owner);
  SELECT * INTO v_fb FROM public.user_feedback WHERE id=p_feedback_id FOR UPDATE;
  IF NOT FOUND OR v_fb.user_id<>v_owner OR v_fb.deletion_started_at IS NULL OR
     v_fb.deletion_token IS DISTINCT FROM p_token OR
     (p_product_id IS NOT NULL AND v_fb.product_id<>p_product_id)
  THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
  SELECT count(*)::integer INTO v_images FROM public.feedback_attachments
    WHERE feedback_id=p_feedback_id;
  -- DB child rows and minimal content-free audit commit together.
  DELETE FROM public.feedback_events WHERE feedback_id=p_feedback_id;
  DELETE FROM public.feedback_attachments WHERE feedback_id=p_feedback_id;
  DELETE FROM public.user_feedback WHERE id=p_feedback_id;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,before,after)
    VALUES(v_actor,'feedback.permanent_delete','feedback',p_feedback_id,
      pg_catalog.jsonb_build_object('queue',v_fb.queue_state,'product_id',v_fb.product_id,
        'attachment_count',v_images),'{}'::jsonb);
  RETURN pg_catalog.jsonb_build_object('deleted',true,'id',p_feedback_id);
END;$$;

CREATE OR REPLACE FUNCTION private.admin_feedback_pending_deletes_core(
  p_product_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_data jsonb;
BEGIN
  PERFORM private.require_admin();
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',x.id,'feedback_no',x.feedback_no,'product_id',x.product_id,
    'pending',x.deletion_started_at IS NOT NULL,'version',x.version)
    ORDER BY x.deletion_started_at NULLS LAST,x.feedback_no),'[]'::jsonb) INTO v_data
  FROM (SELECT id,feedback_no,product_id,deletion_started_at,version
        FROM public.user_feedback
        WHERE deletion_started_at IS NOT NULL
          AND (p_product_id IS NULL OR product_id=p_product_id)
        ORDER BY deletion_started_at NULLS LAST,feedback_no LIMIT 20) x;
  RETURN v_data;
END;$$;

CREATE OR REPLACE FUNCTION private.admin_grant_entitlement_core(
  p_target_user_id uuid,p_product_id uuid,p_tier text,p_mode text,
  p_duration_days integer,p_starts_at timestamptz,p_ends_at timestamptz,
  p_is_lifetime boolean,p_reason text,p_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_actor uuid;
  v_product public.products%ROWTYPE;
  v_grant public.entitlement_grants%ROWTYPE;
  v_source text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_now timestamptz;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor := private.require_admin();
  IF p_target_user_id IS NULL OR p_product_id IS NULL OR p_tier IS DISTINCT FROM 'pro'
     OR p_mode IS NULL OR p_mode NOT IN ('duration','explicit_window')
     OR p_is_lifetime IS NULL
     OR p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 1 AND 200
     OR p_request_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_request_id)) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  IF (p_mode='duration' AND
       (p_duration_days IS NULL OR p_duration_days<=0 OR p_starts_at IS NOT NULL
        OR p_ends_at IS NOT NULL OR p_is_lifetime))
    OR (p_mode='explicit_window' AND
       (NOT p_is_lifetime OR p_duration_days IS NOT NULL
        OR p_starts_at IS NOT NULL OR p_ends_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  PERFORM private.acquire_l1_user_lock(p_target_user_id);
  SELECT * INTO v_product FROM public.products WHERE id=p_product_id FOR SHARE;
  IF NOT FOUND OR v_product.status<>'active' THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE' USING ERRCODE='PT409';
  END IF;
  PERFORM private.acquire_l7_pro_renewal_lock(p_target_user_id,p_product_id);
  v_now := clock_timestamp();
  v_source := 'admin:'||v_actor::text||':'||p_request_id;
  SELECT * INTO v_grant FROM public.entitlement_grants
    WHERE source_type='admin' AND source_ref=v_source;
  IF FOUND THEN
    IF v_grant.user_id IS DISTINCT FROM p_target_user_id
      OR v_grant.product_id IS DISTINCT FROM p_product_id
      OR v_grant.tier IS DISTINCT FROM p_tier
      OR v_grant.grant_mode IS DISTINCT FROM p_mode
      OR v_grant.requested_duration_days IS DISTINCT FROM p_duration_days
      OR v_grant.grant_reason IS DISTINCT FROM p_reason
      OR (p_mode='explicit_window' AND v_grant.ends_at IS NOT NULL) THEN
      RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409';
    END IF;
    RETURN pg_catalog.jsonb_build_object('idempotent_replay',true,
      'grant_id',v_grant.id,'starts_at',v_grant.starts_at,'ends_at',v_grant.ends_at,
      'effective_ends_at',private.pro_credit_summary(p_target_user_id,p_product_id,v_now)->>'effective_ends_at');
  END IF;

  -- A human grant must not silently join an unrelated product.
  IF NOT EXISTS (
    SELECT 1 FROM public.product_memberships WHERE user_id=p_target_user_id
      AND product_id=p_product_id AND status='active'
  ) THEN
    RAISE EXCEPTION 'MEMBERSHIP_REQUIRED' USING ERRCODE='PT409';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.platform_account_restrictions
     WHERE user_id=p_target_user_id AND kind='blocked'
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='PT409';
  END IF;
  PERFORM private.pro_credit_settle(p_target_user_id,p_product_id,v_now);
  IF EXISTS (SELECT 1 FROM public.entitlement_grants
    WHERE user_id=p_target_user_id AND product_id=p_product_id AND tier='pro'
      AND grant_mode='explicit_window' AND ends_at IS NULL
      AND starts_at<=v_now AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'PERMANENT_ALREADY_ACTIVE' USING ERRCODE='PT409';
  END IF;
  v_starts_at := v_now;
  v_ends_at := CASE WHEN p_mode='duration'
    THEN v_now + (p_duration_days::double precision * interval '24 hours')
    ELSE NULL END;
  INSERT INTO public.entitlement_grants(user_id,product_id,tier,source_type,source_ref,
    grant_mode,requested_duration_days,starts_at,ends_at,created_by,grant_reason)
  VALUES(p_target_user_id,p_product_id,'pro','admin',v_source,p_mode,
    p_duration_days,v_starts_at,v_ends_at,v_actor,p_reason)
  RETURNING * INTO v_grant;
  IF p_mode='duration' THEN
    PERFORM private.pro_credit_add(v_grant.id,p_target_user_id,p_product_id,p_duration_days);
  END IF;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,after,reason)
    VALUES(v_actor,'grant.create','grant',v_grant.id,
      pg_catalog.jsonb_build_object('user_id',p_target_user_id,'product_id',p_product_id,
        'starts_at',v_starts_at,'ends_at',v_ends_at),p_reason);
  RETURN pg_catalog.jsonb_build_object('idempotent_replay',false,'grant_id',v_grant.id,
    'starts_at',v_starts_at,'ends_at',v_ends_at,
    'effective_ends_at',(private.pro_credit_summary(p_target_user_id,p_product_id,v_now)->>'effective_ends_at'));
END;
$$;

CREATE OR REPLACE FUNCTION private.redeem_code_core(p_product_key text, p_code text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_now timestamptz := transaction_timestamp();
  v_failures timestamptz[];
  v_product public.products%ROWTYPE;
  v_member public.product_memberships%ROWTYPE;
  v_code public.redemption_codes%ROWTYPE;
  v_code_hash text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_mode text;
  v_grant_id uuid;
  v_window_end timestamptz;
  v_retry integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401';
  END IF;
  PERFORM private.acquire_l1_user_lock(v_user);
  IF EXISTS (SELECT 1 FROM public.platform_account_restrictions
    WHERE user_id=v_user AND kind='blocked') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','ACCOUNT_RESTRICTED');
  END IF;

  -- L2: one locked failure window per user; prune old entries persistently.
  INSERT INTO public.redemption_rate_limits(user_id) VALUES(v_user)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT failed_at INTO v_failures
    FROM public.redemption_rate_limits WHERE user_id=v_user FOR UPDATE;
  SELECT coalesce(pg_catalog.array_agg(t ORDER BY t),ARRAY[]::timestamptz[])
    INTO v_failures
    FROM pg_catalog.unnest(v_failures) AS t
    WHERE t > v_now - interval '15 minutes';
  UPDATE public.redemption_rate_limits
    SET failed_at=v_failures,updated_at=v_now WHERE user_id=v_user;
  IF coalesce(pg_catalog.array_length(v_failures,1),0)>=10 THEN
    SELECT min(t)+interval '15 minutes' INTO v_window_end
      FROM pg_catalog.unnest(v_failures) t;
    v_retry := greatest(1,pg_catalog.ceil(
      extract(epoch FROM (v_window_end-v_now)))::integer);
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','RATE_LIMITED',
      'retry_after_seconds',v_retry);
  END IF;

  -- L3 locks the *declared* product, never the product learned from the code.
  SELECT * INTO v_product FROM public.products WHERE product_key=p_product_key FOR SHARE;
  IF NOT FOUND OR v_product.status<>'active' THEN
    UPDATE public.redemption_rate_limits
      SET failed_at=pg_catalog.array_append(v_failures,v_now),updated_at=v_now WHERE user_id=v_user;
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','PRODUCT_UNAVAILABLE');
  END IF;

  -- L5 left/suspended decisions happen before *any* code lookup or hash.
  SELECT * INTO v_member FROM public.product_memberships
    WHERE user_id=v_user AND product_id=v_product.id FOR UPDATE;
  IF v_member.id IS NOT NULL AND v_member.status IN ('left','suspended') THEN
    UPDATE public.redemption_rate_limits
      SET failed_at=pg_catalog.array_append(v_failures,v_now),updated_at=v_now WHERE user_id=v_user;
    RETURN pg_catalog.jsonb_build_object('ok',false,'code',
      CASE WHEN v_member.status='left' THEN 'MEMBERSHIP_LEFT' ELSE 'MEMBERSHIP_SUSPENDED' END);
  END IF;

  -- A bounded normalization converts the issued Base32 to a deterministic hash.
  IF p_code IS NULL OR pg_catalog.char_length(p_code)>256 THEN
    UPDATE public.redemption_rate_limits
      SET failed_at=pg_catalog.array_append(v_failures,v_now),updated_at=v_now WHERE user_id=v_user;
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','REDEEM_CODE_INVALID');
  END IF;
  v_code_hash := pg_catalog.encode(extensions.digest(
    pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(p_code),'[[:space:]-]','','g')),
    'sha256'),'hex');
  -- L6: a code found by hash is not yet authorized; lock and revalidate.
  SELECT * INTO v_code FROM public.redemption_codes
    WHERE code_hash=v_code_hash FOR UPDATE;
  IF NOT FOUND OR v_code.product_id<>v_product.id OR v_code.tier<>'pro' THEN
    UPDATE public.redemption_rate_limits
      SET failed_at=pg_catalog.array_append(v_failures,v_now),updated_at=v_now WHERE user_id=v_user;
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','REDEEM_CODE_INVALID');
  END IF;
  IF EXISTS (SELECT 1 FROM public.redemptions
    WHERE code_id=v_code.id AND user_id=v_user) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','REDEEM_ALREADY_USED');
  END IF;
  IF v_code.revoked_at IS NOT NULL
    OR (v_code.expires_at IS NOT NULL AND v_code.expires_at<=v_now)
    OR v_code.redeemed_count >= v_code.max_redemptions THEN
    UPDATE public.redemption_rate_limits
      SET failed_at=pg_catalog.array_append(v_failures,v_now),updated_at=v_now WHERE user_id=v_user;
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','REDEEM_CODE_INVALID');
  END IF;

  -- L7: serialize credit writes; an old finite coverage endpoint is NOT
  -- a credit anchor and must never control actual remaining balance.
  PERFORM private.acquire_l7_pro_renewal_lock(v_user,v_product.id);
  v_now := clock_timestamp();
  PERFORM private.pro_credit_settle(v_user,v_product.id,v_now);
  IF EXISTS (
    SELECT 1 FROM public.entitlement_grants
    WHERE user_id=v_user AND product_id=v_product.id AND tier='pro'
      AND grant_mode='explicit_window' AND starts_at<=v_now
      AND ends_at IS NULL AND revoked_at IS NULL
  ) THEN
    UPDATE public.redemption_rate_limits SET
      failed_at=pg_catalog.array_append(v_failures,v_now),updated_at=v_now WHERE user_id=v_user;
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','REDEEM_LIFETIME_ACTIVE');
  END IF;
  v_mode := CASE WHEN v_code.is_lifetime THEN 'explicit_window' ELSE 'duration' END;
  v_starts_at := v_now;
  v_ends_at := CASE WHEN v_code.is_lifetime THEN NULL
    ELSE v_now + (v_code.grant_duration_days::double precision * interval '24 hours') END;

  -- L8: membership may be created only after all validation succeeds.
  IF v_member.id IS NULL THEN
    INSERT INTO public.product_memberships(user_id,product_id,status)
      VALUES(v_user,v_product.id,'active') RETURNING * INTO v_member;
    INSERT INTO public.membership_events(
      membership_id,action,from_status,to_status,actor_type,actor_user_id)
      VALUES(v_member.id,'join',NULL,'active','user',v_user);
  END IF;
  INSERT INTO public.entitlement_grants(user_id,product_id,tier,source_type,
    source_ref,grant_mode,requested_duration_days,starts_at,ends_at)
  VALUES(v_user,v_product.id,'pro','redeem_code',
    'code:'||v_code.id::text||':user:'||v_user::text,
    v_mode,CASE WHEN v_mode='duration' THEN v_code.grant_duration_days ELSE NULL END,
    v_starts_at,v_ends_at)
  RETURNING id INTO v_grant_id;
  INSERT INTO public.redemptions(code_id,user_id,product_id,grant_id)
    VALUES(v_code.id,v_user,v_product.id,v_grant_id);
  UPDATE public.redemption_codes SET redeemed_count=redeemed_count+1 WHERE id=v_code.id;
  IF NOT v_code.is_lifetime THEN
    PERFORM private.pro_credit_add(v_grant_id,v_user,v_product.id,v_code.grant_duration_days);
  END IF;
  RETURN pg_catalog.jsonb_build_object('ok',true,'grant_id',v_grant_id,
    'product_key',v_product.product_key,'tier','pro','starts_at',v_starts_at,
    'ends_at',v_ends_at,'is_lifetime',v_code.is_lifetime,
    'effective_ends_at',(private.pro_credit_summary(v_user,v_product.id,v_now)->>'effective_ends_at'));
END;
$$;

CREATE OR REPLACE FUNCTION private.admin_get_pro_entitlement_core(
  p_target_user_id uuid,p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM private.require_admin();
  IF p_target_user_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_target_user_id)
    OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=p_product_id) THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE='PT404';
  END IF;
  v_result:=private.pro_credit_summary(p_target_user_id,p_product_id,transaction_timestamp());
  RETURN v_result || pg_catalog.jsonb_build_object(
    'target_user_id',p_target_user_id,'product_id',p_product_id,
    'membership_status',(SELECT status FROM public.product_memberships
      WHERE user_id=p_target_user_id AND product_id=p_product_id),
    'account_blocked',EXISTS(SELECT 1 FROM public.platform_account_restrictions
      WHERE user_id=p_target_user_id AND kind='blocked'));
END;
$$;

CREATE OR REPLACE FUNCTION private.admin_get_user_pro_entitlements_core(p_target_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_data jsonb;
BEGIN
  PERFORM private.require_admin();
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

CREATE FUNCTION private.admin_feedback_export_attachments_core(p_actor_id uuid,p_actor_aal text,p_feedback_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_data jsonb;
BEGIN
 PERFORM private.require_feedback_admin(p_actor_id,p_actor_aal);
 IF p_feedback_ids IS NULL OR cardinality(p_feedback_ids) NOT BETWEEN 1 AND 20
  OR array_position(p_feedback_ids,NULL) IS NOT NULL
  OR (SELECT count(DISTINCT x) FROM unnest(p_feedback_ids) x)<>cardinality(p_feedback_ids)
 THEN RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422'; END IF;
 IF (SELECT count(*) FROM public.user_feedback WHERE id=ANY(p_feedback_ids)
     AND deletion_started_at IS NULL)<>cardinality(p_feedback_ids)
 THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('feedback_id',a.feedback_id,'slot',a.slot,
  'mime_type',a.mime_type,'size_bytes',a.size_bytes,'object_key',a.object_key)
  ORDER BY a.feedback_id,a.slot),'[]'::jsonb) INTO v_data
 FROM public.feedback_attachments a WHERE a.feedback_id=ANY(p_feedback_ids);
 RETURN v_data;
END;$$;
REVOKE ALL ON FUNCTION private.admin_feedback_v3_core(uuid,integer,text,text,boolean,text),
 private.admin_prepare_feedback_delete_core(uuid,text,uuid,integer,uuid),
 private.admin_finish_feedback_delete_core(uuid,text,uuid,uuid,uuid),
 private.feedback_image_access_core(uuid,text,uuid),
 private.admin_feedback_export_attachments_core(uuid,text,uuid[])
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.admin_feedback_v3_core(uuid,integer,text,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.admin_prepare_feedback_delete_core(uuid,text,uuid,integer,uuid),
 private.admin_finish_feedback_delete_core(uuid,text,uuid,uuid,uuid),
 private.feedback_image_access_core(uuid,text,uuid),
 private.admin_feedback_export_attachments_core(uuid,text,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION private.guard_feedback_mutation() TO postgres;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
CREATE TRIGGER guard_feedback_mutation BEFORE UPDATE ON public.user_feedback FOR EACH ROW
 EXECUTE FUNCTION private.guard_feedback_mutation();
SET ROLE aisencore_rpc_executor;
REVOKE EXECUTE ON FUNCTION private.guard_feedback_mutation() FROM postgres;
RESET ROLE;
CREATE FUNCTION public.admin_feedback_v3(p_feedback_id uuid,p_expected_version integer,p_action text,
 p_priority text DEFAULT NULL,p_is_starred boolean DEFAULT NULL,p_internal_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_feedback_v3_core($1,$2,$3,$4,$5,$6); $$;
CREATE FUNCTION public.admin_prepare_feedback_delete(p_actor_id uuid,p_actor_aal text,p_feedback_id uuid,
 p_expected_version integer DEFAULT NULL,p_product_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_prepare_feedback_delete_core($1,$2,$3,$4,$5); $$;
CREATE FUNCTION public.admin_finish_feedback_delete(p_actor_id uuid,p_actor_aal text,p_feedback_id uuid,
 p_token uuid,p_product_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_finish_feedback_delete_core($1,$2,$3,$4,$5); $$;
CREATE FUNCTION public.feedback_image_access(p_actor_id uuid,p_actor_aal text,p_attachment_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.feedback_image_access_core($1,$2,$3); $$;
CREATE FUNCTION public.admin_feedback_export_attachments(p_actor_id uuid,p_actor_aal text,p_feedback_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_feedback_export_attachments_core($1,$2,$3); $$;
REVOKE ALL ON FUNCTION public.admin_feedback_v3(uuid,integer,text,text,boolean,text),
 public.admin_prepare_feedback_delete(uuid,text,uuid,integer,uuid),
 public.admin_finish_feedback_delete(uuid,text,uuid,uuid,uuid),
 public.feedback_image_access(uuid,text,uuid),
 public.admin_feedback_export_attachments(uuid,text,uuid[])
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_feedback_v3(uuid,integer,text,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prepare_feedback_delete(uuid,text,uuid,integer,uuid),
 public.admin_finish_feedback_delete(uuid,text,uuid,uuid,uuid),
 public.feedback_image_access(uuid,text,uuid),
 public.admin_feedback_export_attachments(uuid,text,uuid[]) TO service_role;
REVOKE SELECT ON public.user_feedback,public.feedback_attachments,public.feedback_events FROM authenticated;
GRANT SELECT(id,feedback_no,product_id,user_id,content,category,priority,request_id,version,created_at,updated_at,
 queue_state,read_at,triaged_at,is_starred,archived_at,last_handled_by,contact_email,deletion_started_at)
 ON public.user_feedback TO authenticated;
GRANT SELECT(id,feedback_id,slot,mime_type,size_bytes,created_at) ON public.feedback_attachments TO authenticated;
GRANT SELECT(id,feedback_id,actor_user_id,event_type,visibility,message,operation_id,created_at)
 ON public.feedback_events TO authenticated;
ALTER POLICY feedback_admin_read ON public.user_feedback
 USING ((SELECT private.is_platform_admin()) AND deletion_started_at IS NULL);
ALTER POLICY feedback_attachment_admin_read ON public.feedback_attachments
 USING ((SELECT private.is_platform_admin()) AND EXISTS(
 SELECT 1 FROM public.user_feedback f WHERE f.id=feedback_id AND f.deletion_started_at IS NULL));
ALTER POLICY feedback_events_admin_read ON public.feedback_events
 USING ((SELECT private.is_platform_admin()) AND EXISTS(
 SELECT 1 FROM public.user_feedback f WHERE f.id=feedback_id AND f.deletion_started_at IS NULL));
CREATE VIEW public.admin_feedback_summaries WITH(security_invoker=true) AS
SELECT f.id,f.feedback_no,f.product_id,f.user_id,f.content,f.category,
 f.priority,f.version,f.created_at,f.updated_at,
 (SELECT count(*)::integer FROM public.feedback_attachments a WHERE a.feedback_id=f.id) AS attachment_count,
 f.queue_state,f.read_at,f.triaged_at,f.is_starred,f.archived_at,f.last_handled_by,f.contact_email
FROM public.user_feedback f WHERE f.deletion_started_at IS NULL;
GRANT SELECT ON public.admin_feedback_summaries TO authenticated;
NOTIFY pgrst,'reload schema';

GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE OR REPLACE FUNCTION private.admin_dashboard_metrics_core(p_product_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.transaction_timestamp();
  v_month_start timestamptz;
  v_next_month timestamptz;
  v_normal_users bigint;
  v_new_users bigint;
  v_pro_members bigint;
  v_open_feedback bigint;
  v_new_feedback bigint;
  v_new_pro bigint;
BEGIN
  PERFORM private.require_admin();
  IF p_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.id=p_product_id
  ) THEN RAISE EXCEPTION 'INVALID_PRODUCT' USING ERRCODE='PT422'; END IF;

  v_month_start := (pg_catalog.date_trunc('month',v_now AT TIME ZONE 'Asia/Shanghai')
     AT TIME ZONE 'Asia/Shanghai');
  v_next_month := ((pg_catalog.date_trunc('month',v_now AT TIME ZONE 'Asia/Shanghai')
     + interval '1 month') AT TIME ZONE 'Asia/Shanghai');

  -- Global normal = not blocked Auth account, even without membership.
  -- Scoped normal = active member of this product AND not globally blocked.
  -- Monthly new global = registered this month; scoped = first joined product
  -- this month (whether still active, left, or suspended).
  IF p_product_id IS NULL THEN
    SELECT count(*) FILTER (WHERE NOT EXISTS(
      SELECT 1 FROM public.platform_account_restrictions r WHERE r.user_id=u.id AND r.kind='blocked')),
      count(*) FILTER(WHERE u.created_at>=v_month_start AND u.created_at<v_next_month)
    INTO v_normal_users,v_new_users FROM auth.users u;
  ELSE
    SELECT count(*) FILTER(WHERE m.status='active' AND NOT EXISTS(
      SELECT 1 FROM public.platform_account_restrictions r WHERE r.user_id=m.user_id AND r.kind='blocked')),
      count(*) FILTER(WHERE m.joined_at>=v_month_start AND m.joined_at<v_next_month)
    INTO v_normal_users,v_new_users FROM public.product_memberships m WHERE m.product_id=p_product_id;
  END IF;

  SELECT count(DISTINCT m.user_id) INTO v_pro_members
  FROM public.product_memberships m JOIN public.products p ON p.id=m.product_id
  LEFT JOIN public.pro_credit_accounts a ON a.user_id=m.user_id AND a.product_id=m.product_id
  LEFT JOIN (
    SELECT user_id,product_id,sum(remaining_seconds) AS remaining
    FROM public.pro_credit_entries WHERE p_product_id IS NULL OR product_id=p_product_id
    GROUP BY user_id,product_id
  ) e ON e.user_id=m.user_id AND e.product_id=m.product_id
  WHERE m.status='active' AND p.status='active'
    AND (p_product_id IS NULL OR m.product_id=p_product_id)
    AND NOT EXISTS(SELECT 1 FROM public.platform_account_restrictions r
      WHERE r.user_id=m.user_id AND r.kind='blocked')
    AND (EXISTS(SELECT 1 FROM public.entitlement_grants g
      WHERE g.user_id=m.user_id AND g.product_id=m.product_id AND g.tier='pro'
        AND g.grant_mode='explicit_window' AND g.ends_at IS NULL
        AND g.starts_at<=v_now AND g.revoked_at IS NULL)
      OR coalesce(e.remaining,0)>greatest(0,extract(epoch FROM v_now-coalesce(a.settled_at,v_now))));

  -- Acquisition cohort rather than current active/renewed Grant count:
  -- one distinct user whose first valid Pro activation in this scope is
  -- within the current month. If a user was Pro in a different product in
  -- an earlier month, only the product-specific view may count them as new.
  SELECT count(*) INTO v_new_pro FROM (
    SELECT g.user_id
    FROM public.entitlement_grants g
    WHERE g.tier='pro'
      AND (p_product_id IS NULL OR g.product_id=p_product_id)
      AND g.starts_at<=v_now
      AND (g.revoked_at IS NULL OR g.revoked_at>g.starts_at)
    GROUP BY g.user_id
    HAVING min(greatest(g.created_at,g.starts_at))>=v_month_start
       AND min(greatest(g.created_at,g.starts_at))<v_next_month
  ) first_pro_members;

  -- Read the same visible feedback projection as Admin lists. The V4 view
  -- excludes deletion-in-progress rows; legacy trash is not a business queue.
  SELECT
    count(*) FILTER (WHERE f.queue_state IN ('inbox','workbench')),
    count(*) FILTER (WHERE f.queue_state='inbox')
  INTO v_open_feedback,v_new_feedback
  FROM public.user_feedback f
  WHERE f.deletion_started_at IS NULL
    AND (p_product_id IS NULL OR f.product_id=p_product_id);

  RETURN pg_catalog.jsonb_build_object(
    'normal_users',v_normal_users,
    'new_users_month',v_new_users,
    'pro_members',v_pro_members,
    'new_pro_month',v_new_pro,
    'open_feedback',v_open_feedback,
    'new_feedback',v_new_feedback,
    'month_start',v_month_start,
    'month_end',v_next_month
  );
END;
$$;
CREATE OR REPLACE FUNCTION private.admin_create_codes_core(
  p_product_id uuid, p_tier text, p_quantity integer, p_grant_duration_days integer,
  p_is_lifetime boolean, p_max_redemptions_per_code integer, p_code_expires_at timestamptz,
  p_request_id text, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_actor uuid;
  v_product public.products%ROWTYPE;
  v_batch public.redemption_code_batches%ROWTYPE;
  v_codes text[] := ARRAY[]::text[];
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor := private.require_admin();
  IF p_product_id IS NULL OR p_tier IS DISTINCT FROM 'pro'
     OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 1000
     OR p_request_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_request_id)) NOT BETWEEN 1 AND 128
     OR p_max_redemptions_per_code IS NULL OR p_max_redemptions_per_code<>1
     OR p_is_lifetime IS NULL
     OR (p_is_lifetime=false AND (p_grant_duration_days IS NULL OR p_grant_duration_days<=0))
     OR (p_is_lifetime=true AND p_grant_duration_days IS NOT NULL)
     OR (p_code_expires_at IS NOT NULL AND p_code_expires_at<=transaction_timestamp()) THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  -- Permanent-code issuance is still an unapproved operator policy; only
  -- explicit fixed-duration Pro codes are admitted in this MVP substage.
  IF p_is_lifetime THEN
    RAISE EXCEPTION 'LIFETIME_CODES_NOT_ENABLED' USING ERRCODE='PT422';
  END IF;
  SELECT * INTO v_product FROM public.products WHERE id=p_product_id FOR SHARE;
  IF NOT FOUND OR v_product.status<>'active' THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE' USING ERRCODE='PT409';
  END IF;
  SELECT * INTO v_batch FROM public.redemption_code_batches
    WHERE created_by=v_actor AND request_id=p_request_id;
  IF FOUND THEN
    IF v_batch.product_id IS DISTINCT FROM p_product_id
      OR v_batch.tier IS DISTINCT FROM p_tier
      OR v_batch.quantity IS DISTINCT FROM p_quantity
      OR v_batch.grant_duration_days IS DISTINCT FROM p_grant_duration_days
      OR v_batch.is_lifetime IS DISTINCT FROM p_is_lifetime
      OR v_batch.max_redemptions_per_code IS DISTINCT FROM p_max_redemptions_per_code
      OR v_batch.code_expires_at IS DISTINCT FROM p_code_expires_at
      OR v_batch.note IS DISTINCT FROM p_note THEN
      RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409';
    END IF;
    RETURN pg_catalog.jsonb_build_object('batch_id',v_batch.id,'idempotent_replay',true,
      'plaintext_available',false,'codes',pg_catalog.to_jsonb(ARRAY[]::text[]));
  END IF;
  INSERT INTO public.redemption_code_batches(product_id,tier,created_by,request_id,
    quantity,grant_duration_days,is_lifetime,max_redemptions_per_code,code_expires_at,note)
  VALUES(p_product_id,'pro',v_actor,p_request_id,p_quantity,p_grant_duration_days,
    p_is_lifetime,p_max_redemptions_per_code,p_code_expires_at,p_note)
  RETURNING * INTO v_batch;
  WITH generated AS MATERIALIZED (
    SELECT ordinal,private.make_redemption_code() AS code
    FROM generate_series(1,p_quantity) ordinal
  ), inserted AS (
    INSERT INTO public.redemption_codes(batch_id,batch_ordinal,code_hash,code_prefix,
      product_id,tier,grant_duration_days,is_lifetime,max_redemptions,expires_at,created_by)
    SELECT v_batch.id,ordinal,pg_catalog.encode(extensions.digest(code,'sha256'),'hex'),
      pg_catalog.substr(code,1,8),p_product_id,'pro',p_grant_duration_days,
      p_is_lifetime,p_max_redemptions_per_code,p_code_expires_at,v_actor
    FROM generated ORDER BY ordinal RETURNING batch_ordinal
  )
  SELECT array_agg(g.code ORDER BY g.ordinal) INTO v_codes
    FROM generated g JOIN inserted i ON i.batch_ordinal=g.ordinal;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,after)
    VALUES(v_actor,'code.create','code_batch',v_batch.id,
      pg_catalog.jsonb_build_object('product_id',p_product_id,'quantity',p_quantity,
        'grant_duration_days',p_grant_duration_days));
  RETURN pg_catalog.jsonb_build_object('batch_id',v_batch.id,'idempotent_replay',false,
    'plaintext_available',true,'codes',pg_catalog.to_jsonb(v_codes));
END;
$$;
CREATE OR REPLACE FUNCTION private.admin_revoke_batch_core(p_batch_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_actor uuid;
  v_product_id uuid;
  v_count integer := 0;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor := private.require_admin();
  IF p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  SELECT product_id INTO v_product_id FROM public.redemption_code_batches WHERE id=p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
  PERFORM 1 FROM public.products WHERE id=v_product_id FOR SHARE;
  -- Obtain L6 code locks in stable UUID order; skip previously revoked codes.
  WITH locked AS MATERIALIZED (
    SELECT id FROM public.redemption_codes WHERE batch_id=p_batch_id AND revoked_at IS NULL
    ORDER BY id FOR UPDATE
  )
  UPDATE public.redemption_codes c SET revoked_at=transaction_timestamp(),revoked_by=v_actor,revoke_reason=p_reason
  FROM locked WHERE c.id=locked.id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count>0 THEN
    INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,after,reason)
      VALUES(v_actor,'code.batch_revoke','code_batch',p_batch_id,
        pg_catalog.jsonb_build_object('revoked_codes',v_count),p_reason);
  END IF;
  RETURN pg_catalog.jsonb_build_object('changed',v_count>0,'revoked_codes',v_count);
END;
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
NOTIFY pgrst,'reload schema';
