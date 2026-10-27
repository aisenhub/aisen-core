-- R-16: reject additional redemption while lifetime Pro is effective.
-- CREATE OR REPLACE preserves the existing non-login owner/permissions.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE OR REPLACE FUNCTION private.redeem_code_core(p_product_key text, p_code text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_now timestamptz := transaction_timestamp();
  v_failures timestamptz[];
  v_product public.products%ROWTYPE;
  v_member public.product_memberships%ROWTYPE;
  v_code public.redemption_codes%ROWTYPE;
  v_code_hash text;
  v_anchor timestamptz;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_mode text;
  v_grant_id uuid;
  v_window_end timestamptz;
  v_retry integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401';
  END IF;
  PERFORM private.acquire_l1_user_lock(v_user);
  IF EXISTS (SELECT 1 FROM public.platform_account_restrictions
    WHERE user_id=v_user AND kind='blocked') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','ACCOUNT_RESTRICTED');
  END IF;

  -- L2: one locked failure window per user; prune old entries persistently.
  INSERT INTO public.redemption_rate_limits(user_id) VALUES(v_user)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT failed_at INTO v_failures
    FROM public.redemption_rate_limits WHERE user_id=v_user FOR UPDATE;
  SELECT coalesce(pg_catalog.array_agg(t ORDER BY t),ARRAY[]::timestamptz[])
    INTO v_failures
    FROM pg_catalog.unnest(v_failures) AS t
    WHERE t > v_now - interval '15 minutes';
  UPDATE public.redemption_rate_limits
    SET failed_at=v_failures,updated_at=v_now WHERE user_id=v_user;
  IF coalesce(pg_catalog.array_length(v_failures,1),0)>=10 THEN
    SELECT min(t)+interval '15 minutes' INTO v_window_end
      FROM pg_catalog.unnest(v_failures) t;
    v_retry := greatest(1,pg_catalog.ceil(
      extract(epoch FROM (v_window_end-v_now)))::integer);
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','RATE_LIMITED',
      'retry_after_seconds',v_retry);
  END IF;

  -- L3 locks the *declared* product, never the product learned from the code.
  SELECT * INTO v_product FROM public.products WHERE product_key=p_product_key FOR SHARE;
  IF NOT FOUND OR v_product.status<>'active' THEN
    UPDATE public.redemption_rate_limits
      SET failed_at=pg_catalog.array_append(v_failures,v_now),updated_at=v_now WHERE user_id=v_user;
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','PRODUCT_UNAVAILABLE');
  END IF;

  -- L5 left/suspended decisions happen before *any* code lookup or hash.
  SELECT * INTO v_member FROM public.product_memberships
    WHERE user_id=v_user AND product_id=v_product.id FOR UPDATE;
  IF v_member.id IS NOT NULL AND v_member.status IN ('left','suspended') THEN
    UPDATE public.redemption_rate_limits
      SET failed_at=pg_catalog.array_append(v_failures,v_now),updated_at=v_now WHERE user_id=v_user;
    RETURN pg_catalog.jsonb_build_object('ok',false,'code',
      CASE WHEN v_member.status='left' THEN 'MEMBERSHIP_LEFT' ELSE 'MEMBERSHIP_SUSPENDED' END);
  END IF;

  -- A bounded normalization converts the issued Base32 to a deterministic hash.
  IF p_code IS NULL OR pg_catalog.char_length(p_code)>256 THEN
    UPDATE public.redemption_rate_limits
      SET failed_at=pg_catalog.array_append(v_failures,v_now),updated_at=v_now WHERE user_id=v_user;
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','REDEEM_CODE_INVALID');
  END IF;
  v_code_hash := pg_catalog.encode(extensions.digest(
    pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(p_code),'[[:space:]-]','','g')),
    'sha256'),'hex');
  -- L6: a code found by hash is not yet authorized; lock and revalidate.
  SELECT * INTO v_code FROM public.redemption_codes
    WHERE code_hash=v_code_hash FOR UPDATE;
  IF NOT FOUND OR v_code.product_id<>v_product.id OR v_code.tier<>'pro' THEN
    UPDATE public.redemption_rate_limits
      SET failed_at=pg_catalog.array_append(v_failures,v_now),updated_at=v_now WHERE user_id=v_user;
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','REDEEM_CODE_INVALID');
  END IF;
  IF EXISTS (SELECT 1 FROM public.redemptions
    WHERE code_id=v_code.id AND user_id=v_user) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','REDEEM_ALREADY_USED');
  END IF;
  IF v_code.revoked_at IS NOT NULL
    OR (v_code.expires_at IS NOT NULL AND v_code.expires_at<=v_now)
    OR v_code.redeemed_count >= v_code.max_redemptions THEN
    UPDATE public.redemption_rate_limits
      SET failed_at=pg_catalog.array_append(v_failures,v_now),updated_at=v_now WHERE user_id=v_user;
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','REDEEM_CODE_INVALID');
  END IF;

  -- L7: never use a lifetime Grant as an infinite period anchor. Periods
  -- start at max(now, latest unrevoked finite period end) to avoid overlap.
  PERFORM private.acquire_l7_pro_renewal_lock(v_user,v_product.id);
  -- An active, unrevoked permanent Grant on this product blocks all
  -- different codes, checked under the shared user/product renewal lock.
  IF EXISTS (
    SELECT 1 FROM public.entitlement_grants
    WHERE user_id=v_user AND product_id=v_product.id AND tier='pro'
      AND grant_mode='explicit_window' AND starts_at<=v_now
      AND ends_at IS NULL AND revoked_at IS NULL
  ) THEN
    UPDATE public.redemption_rate_limits
      SET failed_at=pg_catalog.array_append(v_failures,v_now),updated_at=v_now WHERE user_id=v_user;
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','REDEEM_LIFETIME_ACTIVE');
  END IF;
  IF v_code.is_lifetime THEN
    v_mode := 'explicit_window';
    v_starts_at := v_now;
    v_ends_at := NULL;
  ELSE
    SELECT max(ends_at) INTO v_anchor FROM public.entitlement_grants
      WHERE user_id=v_user AND product_id=v_product.id AND tier='pro'
        AND grant_mode='duration' AND revoked_at IS NULL AND ends_at>v_now;
    v_starts_at := greatest(v_now,coalesce(v_anchor,v_now));
    v_ends_at := v_starts_at + pg_catalog.make_interval(days=>v_code.grant_duration_days);
    v_mode := 'duration';
  END IF;

  -- L8: membership may be created only after all validation succeeds.
  IF v_member.id IS NULL THEN
    INSERT INTO public.product_memberships(user_id,product_id,status)
      VALUES(v_user,v_product.id,'active') RETURNING * INTO v_member;
    INSERT INTO public.membership_events(
      membership_id,action,from_status,to_status,actor_type,actor_user_id)
      VALUES(v_member.id,'join',NULL,'active','user',v_user);
  END IF;
  INSERT INTO public.entitlement_grants(user_id,product_id,tier,source_type,
    source_ref,grant_mode,requested_duration_days,starts_at,ends_at)
  VALUES(v_user,v_product.id,'pro','redeem_code',
    'code:'||v_code.id::text||':user:'||v_user::text,
    v_mode,CASE WHEN v_mode='duration' THEN v_code.grant_duration_days ELSE NULL END,
    v_starts_at,v_ends_at)
  RETURNING id INTO v_grant_id;
  INSERT INTO public.redemptions(code_id,user_id,product_id,grant_id)
    VALUES(v_code.id,v_user,v_product.id,v_grant_id);
  UPDATE public.redemption_codes SET redeemed_count=redeemed_count+1 WHERE id=v_code.id;
  RETURN pg_catalog.jsonb_build_object('ok',true,'grant_id',v_grant_id,
    'product_key',v_product.product_key,'tier','pro','starts_at',v_starts_at,
    'ends_at',v_ends_at,'is_lifetime',v_code.is_lifetime);
END;
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
