-- F06: current-user feedback reads are product-scoped. Exact original
-- request recovery remains visible after soft delete, without leaking the
-- private queue, content or internal state. No compat/unscoped RPC remains.
-- Fresh installs apply this after the previous feedback migrations.
-- Scoped descending list lookup avoids scanning hundreds of unrelated
-- same-user product reports before applying the list cap.
CREATE INDEX user_feedback_user_product_created_idx
 ON public.user_feedback(user_id,product_id,created_at DESC,id DESC);
DROP FUNCTION public.my_feedback(uuid);
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
DROP FUNCTION private.my_feedback_core(uuid);

CREATE FUNCTION private.my_feedback_core(
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
    IF v_feedback.queue_state='trashed' THEN
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
      'status',CASE WHEN f.queue_state='inbox' THEN 'received'
        WHEN f.queue_state='archived' THEN 'recorded' ELSE f.status END,
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
        AND queue_state<>'trashed'
        AND (p_request_id IS NULL OR request_id=p_request_id)
      ORDER BY created_at DESC,id DESC LIMIT 100) f
  ),'[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION private.my_feedback_core(text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.my_feedback_core(text,uuid) TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;

CREATE FUNCTION public.my_feedback(p_product_key text,p_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.my_feedback_core(p_product_key,p_request_id); $$;
REVOKE ALL ON FUNCTION public.my_feedback(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_feedback(text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
