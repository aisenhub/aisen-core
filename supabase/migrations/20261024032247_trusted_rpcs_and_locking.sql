-- D1-M2: authenticated, transactionally protected reads and membership writes.
-- Non-login owner has only the columns/tables needed by this milestone.
-- Public RPCs remain SECURITY INVOKER and never accept an actor ID.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'aisencore_rpc_executor') THEN
    CREATE ROLE aisencore_rpc_executor NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE;
  END IF;
END;
$$;
-- Postgres is deliberately not a superuser in Supabase. A non-login owner
-- transfer needs explicit SET membership and CREATE on the target schema.
GRANT aisencore_rpc_executor TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
-- The auth schema is owned by supabase_admin; postgres cannot delegate its
-- USAGE. Inherit the existing authenticated role's auth.uid() access instead.
GRANT authenticated TO aisencore_rpc_executor WITH INHERIT TRUE, SET FALSE;
GRANT USAGE ON SCHEMA public, private TO aisencore_rpc_executor;
-- PostgREST invoker wrappers need USAGE; private remains unexposed.
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT SELECT ON public.products, public.product_memberships,
  public.membership_events, public.platform_admins,
  public.platform_account_restrictions, public.admin_audit_log,
  public.entitlement_grants TO aisencore_rpc_executor;
GRANT INSERT, UPDATE ON public.product_memberships TO aisencore_rpc_executor;
GRANT INSERT ON public.membership_events, public.admin_audit_log,
  public.products, public.platform_account_restrictions, public.platform_admins TO aisencore_rpc_executor;
GRANT UPDATE ON public.products, public.platform_admins TO aisencore_rpc_executor;
GRANT DELETE ON public.platform_account_restrictions TO aisencore_rpc_executor;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO aisencore_rpc_executor;

-- This role is never a user JWT role, and cannot log in. Row policies limit
-- its operations to the exact trusted-function execution context.
CREATE POLICY rpc_executor_products ON public.products
  FOR ALL TO aisencore_rpc_executor USING (true) WITH CHECK (true);
CREATE POLICY rpc_executor_memberships ON public.product_memberships
  FOR ALL TO aisencore_rpc_executor USING (true) WITH CHECK (true);
CREATE POLICY rpc_executor_membership_events ON public.membership_events
  FOR ALL TO aisencore_rpc_executor USING (true) WITH CHECK (true);
CREATE POLICY rpc_executor_platform_admins ON public.platform_admins
  FOR ALL TO aisencore_rpc_executor USING (true) WITH CHECK (true);
CREATE POLICY rpc_executor_restrictions ON public.platform_account_restrictions
  FOR ALL TO aisencore_rpc_executor USING (true) WITH CHECK (true);
CREATE POLICY rpc_executor_audit ON public.admin_audit_log
  FOR ALL TO aisencore_rpc_executor USING (true) WITH CHECK (true);
CREATE POLICY rpc_executor_grants ON public.entitlement_grants
  FOR SELECT TO aisencore_rpc_executor USING (true);

-- PostgreSQL's global default EXECUTE grant needs a GLOBAL revoke.
-- Existing Supabase framework functions are not altered by this setting.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- Fixed (int4,int4) namespaces. 32-bit hashes may collide and merely
-- serialize unrelated keys; they cannot produce authorization or identity.
CREATE FUNCTION private.acquire_l0_admin_write_lock() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(1000, 1);
END;
$$;
CREATE FUNCTION private.acquire_l1_user_lock(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(1001, pg_catalog.hashtext(p_user_id::text));
END;
$$;
CREATE FUNCTION private.acquire_l7_pro_renewal_lock(p_user_id uuid, p_product_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    1007, pg_catalog.hashtext(p_user_id::text || ':' || p_product_id::text));
END;
$$;
REVOKE ALL ON FUNCTION private.acquire_l0_admin_write_lock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.acquire_l1_user_lock(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.acquire_l7_pro_renewal_lock(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.acquire_l0_admin_write_lock() TO aisencore_rpc_executor;
GRANT EXECUTE ON FUNCTION private.acquire_l1_user_lock(uuid) TO aisencore_rpc_executor;
GRANT EXECUTE ON FUNCTION private.acquire_l7_pro_renewal_lock(uuid,uuid) TO aisencore_rpc_executor;

CREATE FUNCTION private.require_admin() RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = 'PT403';
  END IF;
  RETURN auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION private.require_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.require_admin() TO aisencore_rpc_executor;

-- Access decisions have no side effects; SQL failures are never interpreted
-- as Free, and business denials return allowed=false rather than exceptions.
CREATE FUNCTION private.check_access_core(p_product_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_product public.products%ROWTYPE;
  v_status text;
  v_lifetime boolean;
  v_period_end timestamptz;
  v_now timestamptz := transaction_timestamp();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'PT401';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_account_restrictions
             WHERE user_id = v_user AND kind = 'blocked') THEN
    RETURN pg_catalog.jsonb_build_object('allowed',false,'reason','ACCOUNT_RESTRICTED',
      'evaluated_at',v_now);
  END IF;
  SELECT * INTO v_product FROM public.products WHERE product_key = p_product_key;
  IF NOT FOUND OR v_product.status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('allowed',false,'reason','PRODUCT_UNAVAILABLE',
      'product_status',v_product.status,'evaluated_at',v_now);
  END IF;
  SELECT status INTO v_status FROM public.product_memberships
    WHERE user_id = v_user AND product_id = v_product.id;
  IF v_status IS NULL OR v_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('allowed',false,
      'reason', CASE v_status
        WHEN 'left' THEN 'MEMBERSHIP_LEFT'
        WHEN 'suspended' THEN 'MEMBERSHIP_SUSPENDED'
        ELSE 'MEMBERSHIP_REQUIRED' END,
      'product_status',v_product.status,
      'membership_status',v_status,'evaluated_at',v_now);
  END IF;

  SELECT coalesce(bool_or(ends_at IS NULL),false), max(ends_at)
    INTO v_lifetime,v_period_end
    FROM public.entitlement_grants
    WHERE user_id = v_user AND product_id = v_product.id AND tier = 'pro'
      AND revoked_at IS NULL AND starts_at <= v_now
      AND (ends_at IS NULL OR ends_at > v_now);
  RETURN pg_catalog.jsonb_build_object(
    'allowed',true,'reason','OK','product_status',v_product.status,
    'membership_status',v_status,
    'tier',CASE WHEN v_lifetime OR v_period_end IS NOT NULL THEN 'pro' ELSE 'free' END,
    'pro_active',(v_lifetime OR v_period_end IS NOT NULL),
    'is_lifetime',v_lifetime,
    'current_period_ends_at',v_period_end,
    'effective_ends_at',CASE WHEN v_lifetime THEN NULL ELSE v_period_end END,
    'evaluated_at',v_now);
END;
$$;
REVOKE ALL ON FUNCTION private.check_access_core(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.check_access_core(text) TO authenticated;
ALTER FUNCTION private.check_access_core(text) OWNER TO aisencore_rpc_executor;

CREATE FUNCTION public.check_access(p_product_key text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.check_access_core(p_product_key); $$;
REVOKE ALL ON FUNCTION public.check_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_access(text) TO authenticated;

CREATE FUNCTION private.get_my_products_core() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'PT401';
  END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(
    private.check_access_core(p.product_key)
    || pg_catalog.jsonb_build_object('product_key',p.product_key)
    ORDER BY p.product_key), '[]'::jsonb)
  INTO v_result
  FROM public.product_memberships m
  JOIN public.products p ON p.id = m.product_id
  WHERE m.user_id = v_user;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION private.get_my_products_core() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_my_products_core() TO authenticated;
ALTER FUNCTION private.get_my_products_core() OWNER TO aisencore_rpc_executor;
CREATE FUNCTION public.get_my_products() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.get_my_products_core(); $$;
REVOKE ALL ON FUNCTION public.get_my_products() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_products() TO authenticated;

CREATE FUNCTION private.admin_check_access_core() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
SELECT pg_catalog.jsonb_build_object('allowed',private.is_platform_admin(),
  'reason',CASE WHEN private.is_platform_admin() THEN 'OK' ELSE 'ADMIN_REQUIRED' END);
$$;
REVOKE ALL ON FUNCTION private.admin_check_access_core() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.admin_check_access_core() TO authenticated;
ALTER FUNCTION private.admin_check_access_core() OWNER TO aisencore_rpc_executor;
CREATE FUNCTION public.admin_check_access() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_check_access_core(); $$;
REVOKE ALL ON FUNCTION public.admin_check_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_check_access() TO authenticated;

-- One shared lifecycle transaction preserves the existing membership ID.
-- L1 user lock -> L3 product FOR SHARE -> L5 member FOR UPDATE.
CREATE FUNCTION private.change_my_membership_core(p_product_key text, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_product public.products%ROWTYPE;
  v_member public.product_memberships%ROWTYPE;
  v_from text;
  v_to text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'PT401';
  END IF;
  IF p_action NOT IN ('ensure','leave','rejoin') OR p_action IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE = 'PT422';
  END IF;
  PERFORM private.acquire_l1_user_lock(v_user);
  IF EXISTS (SELECT 1 FROM public.platform_account_restrictions
    WHERE user_id=v_user AND kind='blocked') THEN
    RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE = 'PT403';
  END IF;
  SELECT * INTO v_product FROM public.products WHERE product_key = p_product_key FOR SHARE;
  IF NOT FOUND OR (p_action <> 'leave' AND v_product.status <> 'active') THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE' USING ERRCODE = 'PT409';
  END IF;
  SELECT * INTO v_member FROM public.product_memberships
    WHERE user_id=v_user AND product_id=v_product.id FOR UPDATE;

  IF p_action='ensure' AND NOT FOUND THEN
    INSERT INTO public.product_memberships(user_id,product_id,status)
      VALUES (v_user,v_product.id,'active') RETURNING * INTO v_member;
    INSERT INTO public.membership_events(membership_id,action,from_status,to_status,actor_type,actor_user_id)
      VALUES(v_member.id,'join',NULL,'active','user',v_user);
    RETURN pg_catalog.jsonb_build_object('membership_status','active','created',true,'changed',true);
  END IF;
  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_REQUIRED' USING ERRCODE = 'PT409';
  END IF;
  IF p_action='ensure' THEN
    IF v_member.status='active' THEN
      RETURN pg_catalog.jsonb_build_object('membership_status','active','created',false,'changed',false);
    END IF;
    RAISE EXCEPTION '%' ,CASE WHEN v_member.status='left' THEN 'MEMBERSHIP_LEFT'
      ELSE 'MEMBERSHIP_SUSPENDED' END USING ERRCODE = 'PT409';
  END IF;

  IF p_action='leave' AND v_member.status='left' THEN
    RETURN pg_catalog.jsonb_build_object('membership_status','left','changed',false);
  END IF;
  IF p_action='rejoin' AND v_member.status='active' THEN
    RETURN pg_catalog.jsonb_build_object('membership_status','active','changed',false);
  END IF;
  IF v_member.status='suspended' OR (p_action='rejoin' AND v_member.status<>'left')
    OR (p_action='leave' AND v_member.status<>'active') THEN
    RAISE EXCEPTION 'MEMBERSHIP_SUSPENDED' USING ERRCODE = 'PT409';
  END IF;
  v_from := v_member.status;
  v_to := CASE p_action WHEN 'leave' THEN 'left' ELSE 'active' END;
  UPDATE public.product_memberships SET status=v_to,updated_at=transaction_timestamp()
    WHERE id=v_member.id;
  INSERT INTO public.membership_events(membership_id,action,from_status,to_status,actor_type,actor_user_id)
    VALUES(v_member.id,p_action,v_from,v_to,'user',v_user);
  RETURN pg_catalog.jsonb_build_object('membership_status',v_to,'changed',true);
END;
$$;
REVOKE ALL ON FUNCTION private.change_my_membership_core(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.change_my_membership_core(text,text) TO authenticated;
ALTER FUNCTION private.change_my_membership_core(text,text) OWNER TO aisencore_rpc_executor;
CREATE FUNCTION public.ensure_membership(p_product_key text) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.change_my_membership_core(p_product_key,'ensure'); $$;
CREATE FUNCTION public.leave_product(p_product_key text) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.change_my_membership_core(p_product_key,'leave'); $$;
CREATE FUNCTION public.rejoin_product(p_product_key text) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.change_my_membership_core(p_product_key,'rejoin'); $$;
REVOKE ALL ON FUNCTION public.ensure_membership(text), public.leave_product(text),
  public.rejoin_product(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_membership(text), public.leave_product(text),
  public.rejoin_product(text) TO authenticated;

-- Every administrative write acquires the same L0 lock before checking current
-- aal2 + active + unblocked roster. Changes and audit rows share one transaction.
CREATE FUNCTION private.admin_create_product_core(p_product_key text, p_name text, p_description text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_product public.products%ROWTYPE;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor := private.require_admin();
  INSERT INTO public.products(product_key,name,description,status)
    VALUES(p_product_key,p_name,p_description,'draft') RETURNING * INTO v_product;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,after)
    VALUES(v_actor,'product.create','product',v_product.id,
      pg_catalog.jsonb_build_object('product_key',v_product.product_key,'status','draft'));
  RETURN pg_catalog.jsonb_build_object('id',v_product.id,'product_key',v_product.product_key,
    'status',v_product.status,'changed',true);
END;
$$;

CREATE FUNCTION private.admin_set_product_status_core(p_product_id uuid, p_status text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_before public.products%ROWTYPE;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor := private.require_admin();
  IF p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 1 AND 200
     OR p_status IS NULL OR p_status NOT IN ('draft','active','suspended') THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  SELECT * INTO v_before FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_UNAVAILABLE' USING ERRCODE='PT409'; END IF;
  IF v_before.status=p_status THEN
    RETURN pg_catalog.jsonb_build_object('changed',false,'status',p_status);
  END IF;
  UPDATE public.products SET status=p_status,updated_at=transaction_timestamp()
    WHERE id=p_product_id;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,before,after,reason)
    VALUES(v_actor,'product.status','product',p_product_id,
      pg_catalog.jsonb_build_object('status',v_before.status),
      pg_catalog.jsonb_build_object('status',p_status),p_reason);
  RETURN pg_catalog.jsonb_build_object('changed',true,'status',p_status);
END;
$$;

CREATE FUNCTION private.admin_change_membership_core(p_membership_id uuid, p_action text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_user uuid;
  v_member public.product_memberships%ROWTYPE;
  v_next text;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor := private.require_admin();
  IF p_action IS NULL OR p_action NOT IN ('suspend','restore')
    OR p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  -- Identify the target non-lockingly; it is re-read after L1 under L5.
  SELECT user_id INTO v_user FROM public.product_memberships WHERE id=p_membership_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBERSHIP_REQUIRED' USING ERRCODE='PT409'; END IF;
  PERFORM private.acquire_l1_user_lock(v_user);
  SELECT * INTO v_member FROM public.product_memberships
    WHERE id=p_membership_id FOR UPDATE;
  IF NOT FOUND OR v_member.user_id<>v_user THEN
    RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409';
  END IF;
  IF (p_action='suspend' AND v_member.status='suspended')
    OR (p_action='restore' AND v_member.status<>'suspended') THEN
    RETURN pg_catalog.jsonb_build_object('changed',false,'status',v_member.status);
  END IF;
  v_next := CASE WHEN p_action='suspend' THEN 'suspended'
    ELSE v_member.pre_suspend_status END;
  UPDATE public.product_memberships
    SET status=v_next,
      pre_suspend_status=CASE WHEN p_action='suspend' THEN v_member.status ELSE NULL END,
      updated_at=transaction_timestamp()
    WHERE id=p_membership_id;
  INSERT INTO public.membership_events(
    membership_id,action,from_status,to_status,actor_type,actor_user_id,reason_code)
    VALUES(p_membership_id,p_action,v_member.status,v_next,'admin',v_actor,p_reason);
  RETURN pg_catalog.jsonb_build_object('changed',true,'status',v_next);
END;
$$;

CREATE FUNCTION private.admin_change_account_core(p_target_user_id uuid, p_action text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_changed boolean := false;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor := private.require_admin();
  IF p_action IS NULL OR p_action NOT IN ('block','unblock','grant_admin','revoke_admin')
    OR p_target_user_id IS NULL
    OR p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  PERFORM private.acquire_l1_user_lock(p_target_user_id);
  IF p_action='block' THEN
    INSERT INTO public.platform_account_restrictions(user_id,kind,reason_code,created_by)
      VALUES(p_target_user_id,'blocked',p_reason,v_actor)
      ON CONFLICT (user_id) DO NOTHING;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
  ELSIF p_action='unblock' THEN
    DELETE FROM public.platform_account_restrictions
      WHERE user_id=p_target_user_id AND kind='blocked';
    GET DIAGNOSTICS v_changed = ROW_COUNT;
  ELSIF p_action='grant_admin' THEN
    IF EXISTS (SELECT 1 FROM public.platform_account_restrictions
      WHERE user_id=p_target_user_id AND kind='blocked') THEN
      RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='PT409';
    END IF;
    INSERT INTO public.platform_admins(user_id,active,granted_by)
      VALUES(p_target_user_id,true,v_actor)
      ON CONFLICT (user_id) DO UPDATE SET active=true,
        granted_by=EXCLUDED.granted_by,updated_at=transaction_timestamp()
        WHERE public.platform_admins.active=false;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
  ELSE
    UPDATE public.platform_admins SET active=false,updated_at=transaction_timestamp()
      WHERE user_id=p_target_user_id AND active=true;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
  END IF;

  -- A failed M1 invariant aborts the whole transaction, including any UPDATE.
  IF v_changed AND p_action IN ('block','revoke_admin')
    AND NOT EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.active=true
      AND NOT EXISTS (SELECT 1 FROM public.platform_account_restrictions r
        WHERE r.user_id=a.user_id AND r.kind='blocked')) THEN
    RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409';
  END IF;
  IF v_changed THEN
    INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,after,reason)
      VALUES(v_actor,'account.'||p_action,'user',p_target_user_id,
        pg_catalog.jsonb_build_object('changed',true),p_reason);
  END IF;
  RETURN pg_catalog.jsonb_build_object('changed',v_changed,'action',p_action);
END;
$$;

-- Install the non-login execution owner, then expose only precise signatures
-- through PostgREST invoker wrappers. Direct kernel invocation also rechecks
-- the JWT and administrator rights within each private definer function.
REVOKE ALL ON FUNCTION private.admin_create_product_core(text,text,text),
  private.admin_set_product_status_core(uuid,text,text),
  private.admin_change_membership_core(uuid,text,text),
  private.admin_change_account_core(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.admin_create_product_core(text,text,text),
  private.admin_set_product_status_core(uuid,text,text),
  private.admin_change_membership_core(uuid,text,text),
  private.admin_change_account_core(uuid,text,text) TO authenticated;
ALTER FUNCTION private.admin_create_product_core(text,text,text) OWNER TO aisencore_rpc_executor;
ALTER FUNCTION private.admin_set_product_status_core(uuid,text,text) OWNER TO aisencore_rpc_executor;
ALTER FUNCTION private.admin_change_membership_core(uuid,text,text) OWNER TO aisencore_rpc_executor;
ALTER FUNCTION private.admin_change_account_core(uuid,text,text) OWNER TO aisencore_rpc_executor;

CREATE FUNCTION public.admin_create_product(p_product_key text, p_name text, p_description text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_create_product_core(p_product_key,p_name,p_description); $$;
CREATE FUNCTION public.admin_set_product_status(p_product_id uuid, p_status text, p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_set_product_status_core(p_product_id,p_status,p_reason); $$;
CREATE FUNCTION public.admin_suspend_membership(p_membership_id uuid, p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_change_membership_core(p_membership_id,'suspend',p_reason); $$;
CREATE FUNCTION public.admin_restore_membership(p_membership_id uuid, p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_change_membership_core(p_membership_id,'restore',p_reason); $$;
CREATE FUNCTION public.admin_block_account(p_target_user_id uuid, p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_change_account_core(p_target_user_id,'block',p_reason); $$;
CREATE FUNCTION public.admin_unblock_account(p_target_user_id uuid, p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_change_account_core(p_target_user_id,'unblock',p_reason); $$;
CREATE FUNCTION public.admin_grant_admin(p_target_user_id uuid, p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_change_account_core(p_target_user_id,'grant_admin',p_reason); $$;
CREATE FUNCTION public.admin_revoke_admin(p_target_user_id uuid, p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_change_account_core(p_target_user_id,'revoke_admin',p_reason); $$;
REVOKE ALL ON FUNCTION public.admin_create_product(text,text,text),
  public.admin_set_product_status(uuid,text,text),
  public.admin_suspend_membership(uuid,text),
  public.admin_restore_membership(uuid,text),
  public.admin_block_account(uuid,text),
  public.admin_unblock_account(uuid,text),
  public.admin_grant_admin(uuid,text),
  public.admin_revoke_admin(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_product(text,text,text),
  public.admin_set_product_status(uuid,text,text),
  public.admin_suspend_membership(uuid,text),
  public.admin_restore_membership(uuid,text),
  public.admin_block_account(uuid,text),
  public.admin_unblock_account(uuid,text),
  public.admin_grant_admin(uuid,text),
  public.admin_revoke_admin(uuid,text) TO authenticated;

REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
-- Do not grant the browser any direct write access; only trusted functions
-- may use the non-login owner to modify business/audit rows.
