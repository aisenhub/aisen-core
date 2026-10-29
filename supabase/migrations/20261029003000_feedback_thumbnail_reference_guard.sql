-- FB-01 P4: derived private thumbnails are deterministically stored at
-- <committed original object_key>.thumb.jpg. Orphan audits must treat the
-- derivative as referenced iff the matching ORIGINAL attachment is committed.
-- No public SELECT, delete, enumerate, or unscoped URL capability is added.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE OR REPLACE FUNCTION private.feedback_referenced_keys_core(p_keys text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF p_keys IS NULL OR cardinality(p_keys) NOT BETWEEN 1 AND 100
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_keys) AS k(item)
       WHERE item IS NULL OR length(item) NOT BETWEEN 18 AND 512
          OR item NOT LIKE 'feedback/%') THEN
   RAISE EXCEPTION 'INVALID_KEYS' USING ERRCODE='PT422';
 END IF;
 RETURN COALESCE((SELECT pg_catalog.jsonb_agg(item ORDER BY item)
   FROM (
     SELECT DISTINCT k.item
     FROM pg_catalog.unnest(p_keys) AS k(item)
     JOIN public.feedback_attachments a ON
       a.object_key=k.item OR
       (k.item LIKE '%.thumb.jpg' AND
        a.object_key=left(k.item,length(k.item)-10))
   ) AS matched),'[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION private.feedback_referenced_keys_core(text[])
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.feedback_referenced_keys_core(text[])
  TO service_role;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
NOTIFY pgrst,'reload schema';
