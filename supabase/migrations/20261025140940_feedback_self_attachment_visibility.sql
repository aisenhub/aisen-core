-- FB: secure per-owner feedback DTO now includes version for replies
-- and attachment IDs/slots for private per-image signing. Never R2 object keys.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
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
     'content',f.content,'category',f.category,'status',f.status,
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
      WHERE user_id=v_user AND (p_request_id IS NULL OR request_id=p_request_id)
      ORDER BY created_at DESC LIMIT 100) f), '[]'::jsonb);
END; $$;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
