-- FB-02 recovery guard: check orphan candidates against live committed rows.
-- Caller needs trusted service role; no client SELECT or delete RPC.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE FUNCTION private.feedback_referenced_keys_core(p_keys text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF p_keys IS NULL OR cardinality(p_keys) NOT BETWEEN 1 AND 100
    OR EXISTS (SELECT 1 FROM unnest(p_keys) AS k(item)
       WHERE item IS NULL OR length(item) NOT BETWEEN 18 AND 512
          OR item NOT LIKE 'feedback/%') THEN
   RAISE EXCEPTION 'INVALID_KEYS' USING ERRCODE='PT422';
 END IF;
 RETURN coalesce((SELECT jsonb_agg(a.object_key ORDER BY a.object_key)
   FROM public.feedback_attachments a WHERE a.object_key=ANY(p_keys)),'[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION private.feedback_referenced_keys_core(text[])
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.feedback_referenced_keys_core(text[])
 TO service_role;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
CREATE FUNCTION public.feedback_referenced_keys(p_keys text[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.feedback_referenced_keys_core(p_keys); $$;
REVOKE ALL ON FUNCTION public.feedback_referenced_keys(text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_referenced_keys(text[]) TO service_role;
NOTIFY pgrst,'reload schema';
