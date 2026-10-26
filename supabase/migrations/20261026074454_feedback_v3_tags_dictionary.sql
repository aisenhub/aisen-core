-- Distinct Admin-only tag options across ALL accessible feedback, not first-page sampling.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE FUNCTION private.admin_feedback_tags_core(p_product_id uuid DEFAULT NULL)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_labels text[];
BEGIN
  PERFORM private.require_admin();
  SELECT coalesce(array_agg(tag ORDER BY tag),ARRAY[]::text[]) INTO v_labels
  FROM (
    SELECT DISTINCT btrim(x.tag) AS tag
    FROM public.user_feedback f CROSS JOIN LATERAL unnest(f.tags) AS x(tag)
    WHERE (p_product_id IS NULL OR f.product_id=p_product_id)
      AND char_length(btrim(x.tag))>0
  ) q;
  RETURN v_labels;
END;$$;
REVOKE ALL ON FUNCTION private.admin_feedback_tags_core(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.admin_feedback_tags_core(uuid) TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;

CREATE FUNCTION public.admin_feedback_tags(p_product_id uuid DEFAULT NULL)
RETURNS text[] LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$SELECT private.admin_feedback_tags_core($1);$$;
REVOKE ALL ON FUNCTION public.admin_feedback_tags(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_feedback_tags(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
