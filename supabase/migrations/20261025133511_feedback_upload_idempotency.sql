-- FB-02: the upload key is knowable BEFORE the feedback row exists.
-- Canonical R2 prefix uses product/user/request identity + slot + SHA-256.
-- A repeated submission must have byte-identical attachment metadata.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
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
   'status',v_created.status,'created_at',v_created.created_at,'replayed',false);
END; $$;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
