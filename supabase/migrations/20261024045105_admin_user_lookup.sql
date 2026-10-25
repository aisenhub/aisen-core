-- D2-M2 DEC-06: bounded, read-only admin lookup of Supabase Auth identities.
-- No API user receives SELECT on auth.users. The scoped, NOLOGIN,
-- NOBYPASSRLS RPC owner alone gets a five-column allowlist plus its own RLS
-- policy. The owner's private function checks live aal2/admin/block state.
GRANT SELECT (id, email, created_at, email_confirmed_at, last_sign_in_at)
  ON auth.users TO aisencore_rpc_executor;
CREATE POLICY aisencore_admin_reader_select ON auth.users
  FOR SELECT TO aisencore_rpc_executor USING (true);

-- UUID lookups use the native auth.users primary key. Exact case-insensitive
-- email lookups do not permit LIKE wildcards; performance under real Auth scale
-- is a separate D2 HTTP/EXPLAIN exit gate. This migration deliberately does
-- not ALTER or index a Supabase Auth-owned internal table.

GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;

CREATE FUNCTION private.admin_lookup_users_core(
  p_user_ids uuid[] DEFAULT NULL,
  p_email_exact text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_total integer;
  v_items jsonb;
BEGIN
  -- Authorization must precede validation and access to auth.users.
  PERFORM private.require_admin();

  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 1000
     OR p_per_page IS NULL OR p_per_page NOT BETWEEN 1 AND 100
     OR (p_user_ids IS NULL AND p_email_exact IS NULL)
     OR (p_user_ids IS NOT NULL AND
        (pg_catalog.cardinality(p_user_ids) NOT BETWEEN 1 AND 100
         OR pg_catalog.array_position(p_user_ids,NULL::uuid) IS NOT NULL)) THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;

  IF p_email_exact IS NOT NULL THEN
    v_email := pg_catalog.lower(pg_catalog.btrim(p_email_exact));
    IF pg_catalog.char_length(v_email) NOT BETWEEN 3 AND 320 THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
    END IF;
  END IF;

  SELECT count(*) INTO v_total
    FROM auth.users AS u
    WHERE (p_user_ids IS NULL OR u.id = ANY(p_user_ids))
      AND (v_email IS NULL OR pg_catalog.lower(u.email) = v_email);

  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id',t.id,
      'email',t.email,
      'created_at',t.created_at,
      'email_confirmed_at',t.email_confirmed_at,
      'last_sign_in_at',t.last_sign_in_at)
      ORDER BY t.created_at DESC, t.id), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT u.id,u.email,u.created_at,u.email_confirmed_at,u.last_sign_in_at
    FROM auth.users AS u
    WHERE (p_user_ids IS NULL OR u.id = ANY(p_user_ids))
      AND (v_email IS NULL OR pg_catalog.lower(u.email) = v_email)
    ORDER BY u.created_at DESC,u.id
    LIMIT p_per_page OFFSET ((p_page - 1) * p_per_page)
  ) AS t;

  RETURN pg_catalog.jsonb_build_object(
    'items',v_items,'total',v_total,'page',p_page,'per_page',p_per_page,
    'has_more',(v_total > p_page * p_per_page),'search_incomplete',false);
END;
$$;

REVOKE ALL ON FUNCTION private.admin_lookup_users_core(uuid[],text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.admin_lookup_users_core(uuid[],text,integer,integer)
  TO authenticated;
ALTER FUNCTION private.admin_lookup_users_core(uuid[],text,integer,integer)
  OWNER TO aisencore_rpc_executor;

CREATE FUNCTION public.admin_lookup_users(
  p_user_ids uuid[] DEFAULT NULL,
  p_email_exact text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_lookup_users_core(p_user_ids,p_email_exact,p_page,p_per_page); $$;
REVOKE ALL ON FUNCTION public.admin_lookup_users(uuid[],text,integer,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_lookup_users(uuid[],text,integer,integer)
  TO authenticated;

REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
