-- User Center v1: bounded real Auth user directory for verified AAL2 platform admins.
-- Unlike legacy admin_lookup_users, this dedicated command supports enumerating
-- ONLY for a currently-authorized platform administrator and only with strict
-- server pagination. It never grants direct auth.users access to authenticated.
-- The restricted NOLOGIN owner requires temporary CREATE on the private
-- schema only during ALTER OWNER; revoke it immediately after ownership.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
CREATE FUNCTION private.admin_list_users_core(
  p_product_id uuid DEFAULT NULL,
  p_email_exact text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_total integer;
  v_items jsonb;
BEGIN
  PERFORM private.require_admin();

  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 1000
    OR p_per_page IS NULL OR p_per_page NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;

  IF p_email_exact IS NOT NULL THEN
    v_email := pg_catalog.lower(pg_catalog.btrim(p_email_exact));
    IF pg_catalog.char_length(v_email) NOT BETWEEN 3 AND 320
       OR v_email NOT LIKE '%@%.%' THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
    END IF;
  END IF;

  IF p_product_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM public.products p WHERE p.id=p_product_id) THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;

  SELECT count(*) INTO v_total
  FROM auth.users u
  WHERE (v_email IS NULL OR pg_catalog.lower(u.email)=v_email)
    AND (p_product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.product_memberships pm
      WHERE pm.user_id=u.id AND pm.product_id=p_product_id
    ));

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',d.id,'email',d.email,'created_at',d.created_at,
    'email_confirmed_at',d.email_confirmed_at,
    'last_sign_in_at',d.last_sign_in_at,
    'membership_count',d.membership_count,
    'scope_membership_status',d.scope_membership_status,
    'account_blocked',d.account_blocked
  ) ORDER BY d.created_at DESC,d.id DESC),'[]'::jsonb)
  INTO v_items FROM (
    SELECT u.id,u.email,u.created_at,u.email_confirmed_at,u.last_sign_in_at,
      (SELECT count(*)::integer FROM public.product_memberships pm
        WHERE pm.user_id=u.id) AS membership_count,
      (SELECT pm.status FROM public.product_memberships pm
        WHERE pm.user_id=u.id AND pm.product_id=p_product_id
        LIMIT 1) AS scope_membership_status,
      EXISTS(SELECT 1 FROM public.platform_account_restrictions r
        WHERE r.user_id=u.id AND r.kind='blocked') AS account_blocked
    FROM auth.users u
    WHERE (v_email IS NULL OR pg_catalog.lower(u.email)=v_email)
      AND (p_product_id IS NULL OR EXISTS (
        SELECT 1 FROM public.product_memberships pm
        WHERE pm.user_id=u.id AND pm.product_id=p_product_id
      ))
    ORDER BY u.created_at DESC,u.id DESC
    LIMIT p_per_page OFFSET ((p_page-1)*p_per_page)
  ) d;

  RETURN pg_catalog.jsonb_build_object(
    'items',v_items,'total',v_total,'page',p_page,'per_page',p_per_page,
    'has_more',(v_total > p_page*p_per_page));
END;
$$;

REVOKE ALL ON FUNCTION private.admin_list_users_core(uuid,text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.admin_list_users_core(uuid,text,integer,integer)
  TO authenticated;
ALTER FUNCTION private.admin_list_users_core(uuid,text,integer,integer)
  OWNER TO aisencore_rpc_executor;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;

CREATE FUNCTION public.admin_list_users(
  p_product_id uuid DEFAULT NULL,
  p_email_exact text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 20)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_list_users_core(p_product_id,p_email_exact,p_page,p_per_page); $$;
REVOKE ALL ON FUNCTION public.admin_list_users(uuid,text,integer,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(uuid,text,integer,integer)
  TO authenticated;
