-- Align private R2 key path with a stable request_id known before DB commit.
-- The server-created feedback UUID does not exist while objects are uploaded.
-- R2 keys: feedback/{product_id}/{request_id}/{slot}-{random_uuid}.{ext}
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
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
 v_count int;
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
 INSERT INTO public.user_feedback(user_id,product_id,content,category,request_id)
 VALUES(p_user_id,v_product.id,p_content,p_category,p_request_id)
 RETURNING * INTO v_created;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_attachments) LOOP
   IF (v_item->>'object_key') NOT LIKE
       ('feedback/'||v_product.id::text||'/'||p_request_id::text||'/%') THEN
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
