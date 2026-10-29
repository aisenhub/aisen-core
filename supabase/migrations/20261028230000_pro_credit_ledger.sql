-- CORE-ENTITLEMENT-001. One credit truth for redeem, Admin grant/revoke,
-- check_access, and restricted Admin preview. 24h UTC = 86400s.
-- Deliberately fail-closed for pre-launch legacy explicit/revoked ledgers;
-- never rewrite unknown human history without a proven conversion.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.entitlement_grants
    WHERE grant_mode<>'duration' OR revoked_at IS NOT NULL
      OR requested_duration_days IS NULL OR ends_at IS NULL
      OR ends_at IS DISTINCT FROM starts_at +
         (requested_duration_days::double precision * interval '24 hours')) THEN
    RAISE EXCEPTION 'CREDIT_LEGACY_CLASSIFICATION_REQUIRED';
  END IF;
END $$;

CREATE TABLE public.pro_credit_accounts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  settled_at timestamptz NOT NULL,
  PRIMARY KEY(user_id,product_id)
);
CREATE TABLE public.pro_credit_entries (
  grant_id uuid PRIMARY KEY REFERENCES public.entitlement_grants(id) ON DELETE RESTRICT,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  credited_seconds numeric(22,6) NOT NULL CHECK(credited_seconds>0),
  consumed_seconds numeric(22,6) NOT NULL DEFAULT 0 CHECK(consumed_seconds>=0),
  revoked_seconds numeric(22,6) NOT NULL DEFAULT 0 CHECK(revoked_seconds>=0),
  remaining_seconds numeric(22,6) NOT NULL CHECK(remaining_seconds>=0),
  CONSTRAINT credit_conservation CHECK(
    credited_seconds=consumed_seconds+revoked_seconds+remaining_seconds),
  FOREIGN KEY(user_id,product_id)
    REFERENCES public.pro_credit_accounts(user_id,product_id) ON DELETE RESTRICT
);
CREATE INDEX pro_credit_entries_fifo ON public.pro_credit_entries(user_id,product_id,sequence)
  WHERE remaining_seconds>0;
ALTER TABLE public.pro_credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_credit_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_credit_accounts,public.pro_credit_entries FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.pro_credit_accounts,public.pro_credit_entries
  TO aisencore_rpc_executor;
CREATE POLICY rpc_executor_credit_accounts ON public.pro_credit_accounts
  FOR ALL TO aisencore_rpc_executor USING(true) WITH CHECK(true);
CREATE POLICY rpc_executor_credit_entries ON public.pro_credit_entries
  FOR ALL TO aisencore_rpc_executor USING(true) WITH CHECK(true);

-- Safe local history conversion: one independent immutable Grant fact per
-- finite credit entry, with consumed time derived from its scheduled interval.
-- No old table is updated. The migration transaction time is the snapshot.
INSERT INTO public.pro_credit_accounts(user_id,product_id,settled_at)
SELECT DISTINCT user_id,product_id,transaction_timestamp()
FROM public.entitlement_grants;
INSERT INTO public.pro_credit_entries(grant_id,user_id,product_id,
  credited_seconds,consumed_seconds,remaining_seconds)
SELECT g.id,g.user_id,g.product_id,
  g.requested_duration_days::numeric*86400,
  LEAST(g.requested_duration_days::numeric*86400,
    GREATEST(0,EXTRACT(epoch FROM LEAST(a.settled_at,g.ends_at)-g.starts_at))),
  g.requested_duration_days::numeric*86400 -
    LEAST(g.requested_duration_days::numeric*86400,
      GREATEST(0,EXTRACT(epoch FROM LEAST(a.settled_at,g.ends_at)-g.starts_at)))
FROM public.entitlement_grants g JOIN public.pro_credit_accounts a
  ON a.user_id=g.user_id AND a.product_id=g.product_id
WHERE g.grant_mode='duration'
ORDER BY g.created_at,g.id;

GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;

CREATE FUNCTION private.pro_credit_settle(p_user uuid,p_product uuid,p_now timestamptz)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $$
DECLARE v_settled timestamptz; v_remaining numeric; v_credit record;
  v_take numeric; v_held boolean;
BEGIN
  -- Caller has L1 then L7; this row lock is additional transaction safety.
  INSERT INTO public.pro_credit_accounts(user_id,product_id,settled_at)
  VALUES(p_user,p_product,p_now) ON CONFLICT(user_id,product_id) DO NOTHING;
  SELECT settled_at INTO v_settled FROM public.pro_credit_accounts
    WHERE user_id=p_user AND product_id=p_product FOR UPDATE;
  IF p_now<v_settled THEN RAISE EXCEPTION 'CREDIT_TIME_ORDER' USING ERRCODE='PT409'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.entitlement_grants
    WHERE user_id=p_user AND product_id=p_product AND tier='pro'
      AND grant_mode='explicit_window' AND ends_at IS NULL
      AND starts_at<=p_now AND revoked_at IS NULL) INTO v_held;
  v_remaining:=EXTRACT(epoch FROM (p_now-v_settled));
  IF NOT v_held AND v_remaining>0 THEN
    FOR v_credit IN
      SELECT e.grant_id,e.remaining_seconds
      FROM public.pro_credit_entries e
      WHERE e.user_id=p_user AND e.product_id=p_product
        AND e.remaining_seconds>0
      ORDER BY e.sequence FOR UPDATE OF e
    LOOP
      EXIT WHEN v_remaining<=0;
      v_take:=LEAST(v_remaining,v_credit.remaining_seconds);
      UPDATE public.pro_credit_entries
        SET remaining_seconds=remaining_seconds-v_take,
            consumed_seconds=consumed_seconds+v_take
      WHERE grant_id=v_credit.grant_id;
      v_remaining:=v_remaining-v_take;
    END LOOP;
  END IF;
  UPDATE public.pro_credit_accounts SET settled_at=p_now
   WHERE user_id=p_user AND product_id=p_product;
END;
$$;

CREATE FUNCTION private.pro_credit_add(p_grant uuid,p_user uuid,p_product uuid,p_days integer)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $$
BEGIN
  IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 36500 THEN
    RAISE EXCEPTION 'INVALID_DURATION' USING ERRCODE='PT422';
  END IF;
  INSERT INTO public.pro_credit_entries(grant_id,user_id,product_id,
    credited_seconds,remaining_seconds)
  VALUES(p_grant,p_user,p_product,p_days::numeric*86400,p_days::numeric*86400);
END;
$$;

CREATE FUNCTION private.pro_credit_revoke(p_grant uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $$
BEGIN
  UPDATE public.pro_credit_entries
    SET revoked_seconds=revoked_seconds+remaining_seconds,remaining_seconds=0
    WHERE grant_id=p_grant;
  IF NOT FOUND THEN RAISE EXCEPTION 'CREDIT_GRANT_MISSING' USING ERRCODE='PT409'; END IF;
END;
$$;

CREATE FUNCTION private.pro_credit_summary(p_user uuid,p_product uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $$
DECLARE v_settled timestamptz; v_total numeric := 0; v_lifetime boolean;
  v_end timestamptz;
BEGIN
  SELECT settled_at INTO v_settled FROM public.pro_credit_accounts
   WHERE user_id=p_user AND product_id=p_product;
  SELECT COALESCE(SUM(remaining_seconds),0) INTO v_total FROM public.pro_credit_entries
   WHERE user_id=p_user AND product_id=p_product;
  SELECT EXISTS(SELECT 1 FROM public.entitlement_grants
    WHERE user_id=p_user AND product_id=p_product AND tier='pro'
      AND grant_mode='explicit_window' AND ends_at IS NULL
      AND starts_at<=p_now AND revoked_at IS NULL) INTO v_lifetime;
  IF NOT v_lifetime AND v_settled IS NOT NULL THEN
    v_total:=GREATEST(0,v_total-
      GREATEST(0,EXTRACT(epoch FROM (p_now-v_settled))));
  END IF;
  IF NOT v_lifetime AND v_total>0 THEN
    v_end:=p_now+(v_total::double precision * interval '1 second');
  END IF;
  RETURN pg_catalog.jsonb_build_object('pro_active',v_lifetime OR v_total>0,
    'tier',CASE WHEN v_lifetime OR v_total>0 THEN 'pro' ELSE 'free' END,
    'is_lifetime',v_lifetime,'effective_ends_at',v_end,
    'remaining_credit_seconds',v_total,'evaluated_at',p_now);
END;
$$;

CREATE OR REPLACE FUNCTION private.check_access_core(p_product_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_product public.products%ROWTYPE;
  v_status text;
  v_lifetime boolean;
  v_period_end timestamptz;
  v_credit jsonb;
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

  v_credit := private.pro_credit_summary(v_user,v_product.id,v_now);
  v_lifetime := (v_credit->>'is_lifetime')::boolean;
  v_period_end := (v_credit->>'effective_ends_at')::timestamptz;
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

CREATE OR REPLACE FUNCTION private.admin_grant_entitlement_core(
  p_target_user_id uuid,p_product_id uuid,p_tier text,p_mode text,
  p_duration_days integer,p_starts_at timestamptz,p_ends_at timestamptz,
  p_is_lifetime boolean,p_reason text,p_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_actor uuid;
  v_product public.products%ROWTYPE;
  v_grant public.entitlement_grants%ROWTYPE;
  v_source text;
  v_anchor timestamptz;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_now timestamptz;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor := private.require_admin();
  IF p_target_user_id IS NULL OR p_product_id IS NULL OR p_tier IS DISTINCT FROM 'pro'
     OR p_mode IS NULL OR p_mode NOT IN ('duration','explicit_window')
     OR p_is_lifetime IS NULL
     OR p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 1 AND 200
     OR p_request_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_request_id)) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  IF (p_mode='duration' AND
       (p_duration_days IS NULL OR p_duration_days<=0 OR p_starts_at IS NOT NULL
        OR p_ends_at IS NOT NULL OR p_is_lifetime))
    OR (p_mode='explicit_window' AND
       (NOT p_is_lifetime OR p_duration_days IS NOT NULL
        OR p_starts_at IS NOT NULL OR p_ends_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  PERFORM private.acquire_l1_user_lock(p_target_user_id);
  SELECT * INTO v_product FROM public.products WHERE id=p_product_id FOR SHARE;
  IF NOT FOUND OR v_product.status<>'active' THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE' USING ERRCODE='PT409';
  END IF;
  PERFORM private.acquire_l7_pro_renewal_lock(p_target_user_id,p_product_id);
  v_now := clock_timestamp();
  v_source := 'admin:'||v_actor::text||':'||p_request_id;
  SELECT * INTO v_grant FROM public.entitlement_grants
    WHERE source_type='admin' AND source_ref=v_source;
  IF FOUND THEN
    IF v_grant.user_id IS DISTINCT FROM p_target_user_id
      OR v_grant.product_id IS DISTINCT FROM p_product_id
      OR v_grant.tier IS DISTINCT FROM p_tier
      OR v_grant.grant_mode IS DISTINCT FROM p_mode
      OR v_grant.requested_duration_days IS DISTINCT FROM p_duration_days
      OR v_grant.grant_reason IS DISTINCT FROM p_reason
      OR (p_mode='explicit_window' AND v_grant.ends_at IS NOT NULL) THEN
      RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409';
    END IF;
    RETURN pg_catalog.jsonb_build_object('idempotent_replay',true,
      'grant_id',v_grant.id,'starts_at',v_grant.starts_at,'ends_at',v_grant.ends_at);
  END IF;

  -- A human grant must not silently join an unrelated product.
  IF NOT EXISTS (
    SELECT 1 FROM public.product_memberships WHERE user_id=p_target_user_id
      AND product_id=p_product_id AND status='active'
  ) THEN
    RAISE EXCEPTION 'MEMBERSHIP_REQUIRED' USING ERRCODE='PT409';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.platform_account_restrictions
     WHERE user_id=p_target_user_id AND kind='blocked'
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_RESTRICTED' USING ERRCODE='PT409';
  END IF;
  PERFORM private.pro_credit_settle(p_target_user_id,p_product_id,v_now);
  IF EXISTS (SELECT 1 FROM public.entitlement_grants
    WHERE user_id=p_target_user_id AND product_id=p_product_id AND tier='pro'
      AND grant_mode='explicit_window' AND ends_at IS NULL
      AND starts_at<=v_now AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'PERMANENT_ALREADY_ACTIVE' USING ERRCODE='PT409';
  END IF;
  v_starts_at := v_now;
  v_ends_at := CASE WHEN p_mode='duration'
    THEN v_now + (p_duration_days::double precision * interval '24 hours')
    ELSE NULL END;
  INSERT INTO public.entitlement_grants(user_id,product_id,tier,source_type,source_ref,
    grant_mode,requested_duration_days,starts_at,ends_at,created_by,grant_reason)
  VALUES(p_target_user_id,p_product_id,'pro','admin',v_source,p_mode,
    p_duration_days,v_starts_at,v_ends_at,v_actor,p_reason)
  RETURNING * INTO v_grant;
  IF p_mode='duration' THEN
    PERFORM private.pro_credit_add(v_grant.id,p_target_user_id,p_product_id,p_duration_days);
  END IF;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,after,reason)
    VALUES(v_actor,'grant.create','grant',v_grant.id,
      pg_catalog.jsonb_build_object('user_id',p_target_user_id,'product_id',p_product_id,
        'starts_at',v_starts_at,'ends_at',v_ends_at),p_reason);
  RETURN pg_catalog.jsonb_build_object('idempotent_replay',false,'grant_id',v_grant.id,
    'starts_at',v_starts_at,'ends_at',v_ends_at,
    'effective_ends_at',(private.pro_credit_summary(p_target_user_id,p_product_id,v_now)->>'effective_ends_at'));
END;
$$;

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

  -- L7: serialize credit writes; an old finite coverage endpoint is NOT
  -- a credit anchor and must never control actual remaining balance.
  PERFORM private.acquire_l7_pro_renewal_lock(v_user,v_product.id);
  v_now := clock_timestamp();
  PERFORM private.pro_credit_settle(v_user,v_product.id,v_now);
  IF EXISTS (
    SELECT 1 FROM public.entitlement_grants
    WHERE user_id=v_user AND product_id=v_product.id AND tier='pro'
      AND grant_mode='explicit_window' AND starts_at<=v_now
      AND ends_at IS NULL AND revoked_at IS NULL
  ) THEN
    UPDATE public.redemption_rate_limits SET
      failed_at=pg_catalog.array_append(v_failures,v_now),updated_at=v_now WHERE user_id=v_user;
    RETURN pg_catalog.jsonb_build_object('ok',false,'code','REDEEM_LIFETIME_ACTIVE');
  END IF;
  v_mode := CASE WHEN v_code.is_lifetime THEN 'explicit_window' ELSE 'duration' END;
  v_starts_at := v_now;
  v_ends_at := CASE WHEN v_code.is_lifetime THEN NULL
    ELSE v_now + (v_code.grant_duration_days::double precision * interval '24 hours') END;

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
  IF NOT v_code.is_lifetime THEN
    PERFORM private.pro_credit_add(v_grant_id,v_user,v_product.id,v_code.grant_duration_days);
  END IF;
  RETURN pg_catalog.jsonb_build_object('ok',true,'grant_id',v_grant_id,
    'product_key',v_product.product_key,'tier','pro','starts_at',v_starts_at,
    'ends_at',v_ends_at,'is_lifetime',v_code.is_lifetime,
    'effective_ends_at',(private.pro_credit_summary(v_user,v_product.id,v_now)->>'effective_ends_at'));
END;
$$;

CREATE OR REPLACE FUNCTION private.admin_revoke_grant_core(p_grant_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_actor uuid;
  v_user uuid;
  v_product uuid;
  v_grant public.entitlement_grants%ROWTYPE;
  v_now timestamptz;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor := private.require_admin();
  IF p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  SELECT user_id,product_id INTO v_user,v_product
    FROM public.entitlement_grants WHERE id=p_grant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
  PERFORM private.acquire_l1_user_lock(v_user);
  PERFORM private.acquire_l7_pro_renewal_lock(v_user,v_product);
  SELECT * INTO v_grant FROM public.entitlement_grants WHERE id=p_grant_id FOR UPDATE;
  IF NOT FOUND OR v_grant.user_id<>v_user OR v_grant.product_id<>v_product THEN
    RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409';
  END IF;
  IF v_grant.revoked_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('changed',false,'grant_id',p_grant_id);
  END IF;
  v_now:=clock_timestamp();
  PERFORM private.pro_credit_settle(v_user,v_product,v_now);
  UPDATE public.entitlement_grants SET revoked_at=v_now,
    revoked_by=v_actor,revoke_reason=p_reason WHERE id=p_grant_id;
  IF v_grant.grant_mode='duration' THEN
    PERFORM private.pro_credit_revoke(p_grant_id);
  END IF;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,reason)
    VALUES(v_actor,'grant.revoke','grant',p_grant_id,p_reason);
  RETURN pg_catalog.jsonb_build_object('changed',true,'grant_id',p_grant_id);
END;
$$;

CREATE FUNCTION private.admin_get_pro_entitlement_core(
  p_target_user_id uuid,p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_actor uuid; v_result jsonb;
BEGIN
  v_actor:=private.require_admin();
  IF p_target_user_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_target_user_id)
    OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=p_product_id) THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE='PT404';
  END IF;
  v_result:=private.pro_credit_summary(p_target_user_id,p_product_id,clock_timestamp());
  RETURN v_result || pg_catalog.jsonb_build_object(
    'target_user_id',p_target_user_id,'product_id',p_product_id,
    'membership_status',(SELECT status FROM public.product_memberships
      WHERE user_id=p_target_user_id AND product_id=p_product_id),
    'account_blocked',EXISTS(SELECT 1 FROM public.platform_account_restrictions
      WHERE user_id=p_target_user_id AND kind='blocked'));
END;
$$;
REVOKE ALL ON FUNCTION private.pro_credit_settle(uuid,uuid,timestamptz),
  private.pro_credit_add(uuid,uuid,uuid,integer),
  private.pro_credit_revoke(uuid),
  private.pro_credit_summary(uuid,uuid,timestamptz),
  private.admin_get_pro_entitlement_core(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.admin_get_pro_entitlement_core(uuid,uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION private.check_access_core(text),
  private.redeem_code_core(text,text),
  private.admin_grant_entitlement_core(uuid,uuid,text,text,integer,timestamptz,timestamptz,boolean,text,text),
  private.admin_revoke_grant_core(uuid,text)
  FROM PUBLIC,anon;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
CREATE FUNCTION public.admin_get_pro_entitlement(p_target_user_id uuid,p_product_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_get_pro_entitlement_core(p_target_user_id,p_product_id); $$;
REVOKE ALL ON FUNCTION public.admin_get_pro_entitlement(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_pro_entitlement(uuid,uuid) TO authenticated;
