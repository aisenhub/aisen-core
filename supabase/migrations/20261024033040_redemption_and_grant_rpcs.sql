-- D1-M3: self-service redeem and admin Pro issuance/revocation.
-- Private SECURITY DEFINER owner has a non-login role with explicit GRANT/RLS.
-- Needed during ownership transfers only; revoked at the end of the migration.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
GRANT USAGE ON SCHEMA extensions TO aisencore_rpc_executor;
GRANT SELECT, INSERT, UPDATE ON public.redemption_rate_limits TO aisencore_rpc_executor;
GRANT SELECT, INSERT, UPDATE ON public.redemption_codes TO aisencore_rpc_executor;
GRANT SELECT, INSERT ON public.redemption_code_batches TO aisencore_rpc_executor;
GRANT SELECT, INSERT ON public.redemptions TO aisencore_rpc_executor;
GRANT INSERT, UPDATE ON public.entitlement_grants TO aisencore_rpc_executor;
CREATE POLICY rpc_executor_rate_limits ON public.redemption_rate_limits
  FOR ALL TO aisencore_rpc_executor USING (true) WITH CHECK (true);
CREATE POLICY rpc_executor_codes ON public.redemption_codes
  FOR ALL TO aisencore_rpc_executor USING (true) WITH CHECK (true);
CREATE POLICY rpc_executor_batches ON public.redemption_code_batches
  FOR ALL TO aisencore_rpc_executor USING (true) WITH CHECK (true);
CREATE POLICY rpc_executor_redemptions ON public.redemptions
  FOR ALL TO aisencore_rpc_executor USING (true) WITH CHECK (true);
CREATE POLICY rpc_executor_grants_write ON public.entitlement_grants
  FOR ALL TO aisencore_rpc_executor USING (true) WITH CHECK (true);
-- D1-M2 supplied a read-only policy; ALL now subsumes it for this same
-- non-login owner. Remove the redundant permissive SELECT policy.
DROP POLICY rpc_executor_grants ON public.entitlement_grants;

-- Fixed 160-bit CSPRNG -> 32-char unpadded Base32 with no ambiguous glyphs.
-- Code plaintext exists only in first RPC response, not in the database.
CREATE FUNCTION private.make_redemption_code() RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $$
DECLARE
  v_random bytea := extensions.gen_random_bytes(20);
  v_chars constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  v_buffer bigint := 0;
  v_bits integer := 0;
  v_index integer;
  v_result text := '';
  v_byte integer;
BEGIN
  FOR v_byte IN 0..19 LOOP
    v_buffer := (v_buffer << 8) | pg_catalog.get_byte(v_random,v_byte);
    v_bits := v_bits + 8;
    WHILE v_bits >= 5 LOOP
      v_bits := v_bits - 5;
      v_index := ((v_buffer >> v_bits) & 31)::integer;
      v_result := v_result || pg_catalog.substr(v_chars,v_index + 1,1);
      v_buffer := v_buffer & ((1::bigint << v_bits) - 1);
    END LOOP;
  END LOOP;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION private.make_redemption_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.make_redemption_code() TO aisencore_rpc_executor;

-- Redeem failures are returned normally; the 15-minute failure window is
-- committed even when the presented code is invalid. Technical errors raise
-- and roll back every write in this transaction.
CREATE FUNCTION private.redeem_code_core(p_product_key text, p_code text) RETURNS jsonb
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
REVOKE ALL ON FUNCTION private.redeem_code_core(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.redeem_code_core(text,text) TO authenticated;
ALTER FUNCTION private.redeem_code_core(text,text) OWNER TO aisencore_rpc_executor;
CREATE FUNCTION public.redeem_code(p_product_key text,p_code text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT private.redeem_code_core(p_product_key,p_code); $$;
REVOKE ALL ON FUNCTION public.redeem_code(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_code(text,text) TO authenticated;

-- Initial response is the ONLY time the generated Base32 plaintext exists.
-- The persisted batch parameters provide strong actor-scoped idempotency.
CREATE FUNCTION private.admin_create_codes_core(
  p_product_id uuid, p_tier text, p_quantity integer, p_grant_duration_days integer,
  p_is_lifetime boolean, p_max_redemptions_per_code integer, p_code_expires_at timestamptz,
  p_request_id text, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_actor uuid;
  v_product public.products%ROWTYPE;
  v_batch public.redemption_code_batches%ROWTYPE;
  v_code text;
  v_codes text[] := ARRAY[]::text[];
  v_ordinal integer;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor := private.require_admin();
  IF p_product_id IS NULL OR p_tier IS DISTINCT FROM 'pro'
     OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 1000
     OR p_request_id IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_request_id)) NOT BETWEEN 1 AND 128
     OR p_max_redemptions_per_code IS NULL OR p_max_redemptions_per_code<=0
     OR p_is_lifetime IS NULL
     OR (p_is_lifetime=false AND (p_grant_duration_days IS NULL OR p_grant_duration_days<=0))
     OR (p_is_lifetime=true AND p_grant_duration_days IS NOT NULL)
     OR (p_code_expires_at IS NOT NULL AND p_code_expires_at<=transaction_timestamp()) THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  -- Permanent-code issuance is still an unapproved operator policy; only
  -- explicit fixed-duration Pro codes are admitted in this MVP substage.
  IF p_is_lifetime THEN
    RAISE EXCEPTION 'LIFETIME_CODES_NOT_ENABLED' USING ERRCODE='PT422';
  END IF;
  SELECT * INTO v_product FROM public.products WHERE id=p_product_id FOR SHARE;
  IF NOT FOUND OR v_product.status<>'active' THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE' USING ERRCODE='PT409';
  END IF;
  SELECT * INTO v_batch FROM public.redemption_code_batches
    WHERE created_by=v_actor AND request_id=p_request_id;
  IF FOUND THEN
    IF v_batch.product_id IS DISTINCT FROM p_product_id
      OR v_batch.tier IS DISTINCT FROM p_tier
      OR v_batch.quantity IS DISTINCT FROM p_quantity
      OR v_batch.grant_duration_days IS DISTINCT FROM p_grant_duration_days
      OR v_batch.is_lifetime IS DISTINCT FROM p_is_lifetime
      OR v_batch.max_redemptions_per_code IS DISTINCT FROM p_max_redemptions_per_code
      OR v_batch.code_expires_at IS DISTINCT FROM p_code_expires_at
      OR v_batch.note IS DISTINCT FROM p_note THEN
      RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409';
    END IF;
    RETURN pg_catalog.jsonb_build_object('batch_id',v_batch.id,'idempotent_replay',true,
      'plaintext_available',false,'codes',pg_catalog.to_jsonb(ARRAY[]::text[]));
  END IF;
  INSERT INTO public.redemption_code_batches(product_id,tier,created_by,request_id,
    quantity,grant_duration_days,is_lifetime,max_redemptions_per_code,code_expires_at,note)
  VALUES(p_product_id,'pro',v_actor,p_request_id,p_quantity,p_grant_duration_days,
    p_is_lifetime,p_max_redemptions_per_code,p_code_expires_at,p_note)
  RETURNING * INTO v_batch;
  FOR v_ordinal IN 1..p_quantity LOOP
    v_code := private.make_redemption_code();
    INSERT INTO public.redemption_codes(batch_id,batch_ordinal,code_hash,code_prefix,
      product_id,tier,grant_duration_days,is_lifetime,max_redemptions,
      expires_at,created_by)
    VALUES(v_batch.id,v_ordinal,pg_catalog.encode(extensions.digest(v_code,'sha256'),'hex'),
      pg_catalog.substr(v_code,1,8),p_product_id,'pro',p_grant_duration_days,
      p_is_lifetime,p_max_redemptions_per_code,p_code_expires_at,v_actor);
    v_codes := pg_catalog.array_append(v_codes,v_code);
  END LOOP;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,after)
    VALUES(v_actor,'code.create','code_batch',v_batch.id,
      pg_catalog.jsonb_build_object('product_id',p_product_id,'quantity',p_quantity,
        'grant_duration_days',p_grant_duration_days));
  RETURN pg_catalog.jsonb_build_object('batch_id',v_batch.id,'idempotent_replay',false,
    'plaintext_available',true,'codes',pg_catalog.to_jsonb(v_codes));
END;
$$;

CREATE FUNCTION private.admin_grant_entitlement_core(
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
  v_now timestamptz := transaction_timestamp();
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
       (p_duration_days IS NOT NULL OR p_starts_at IS NULL
        OR (p_is_lifetime AND p_ends_at IS NOT NULL)
        OR (NOT p_is_lifetime AND (p_ends_at IS NULL OR p_ends_at<=p_starts_at)))) THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  PERFORM private.acquire_l1_user_lock(p_target_user_id);
  SELECT * INTO v_product FROM public.products WHERE id=p_product_id FOR SHARE;
  IF NOT FOUND OR v_product.status<>'active' THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE' USING ERRCODE='PT409';
  END IF;
  PERFORM private.acquire_l7_pro_renewal_lock(p_target_user_id,p_product_id);
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
      OR (p_mode='explicit_window' AND
        (v_grant.starts_at IS DISTINCT FROM p_starts_at
         OR v_grant.ends_at IS DISTINCT FROM p_ends_at)) THEN
      RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409';
    END IF;
    RETURN pg_catalog.jsonb_build_object('idempotent_replay',true,
      'grant_id',v_grant.id,'starts_at',v_grant.starts_at,'ends_at',v_grant.ends_at);
  END IF;

  IF p_mode='duration' THEN
    SELECT max(ends_at) INTO v_anchor FROM public.entitlement_grants
      WHERE user_id=p_target_user_id AND product_id=p_product_id AND tier='pro'
        AND grant_mode='duration' AND revoked_at IS NULL AND ends_at>v_now;
    v_starts_at := greatest(v_now,coalesce(v_anchor,v_now));
    v_ends_at := v_starts_at + pg_catalog.make_interval(days=>p_duration_days);
  ELSE
    v_starts_at := p_starts_at;
    v_ends_at := p_ends_at;
  END IF;
  INSERT INTO public.entitlement_grants(user_id,product_id,tier,source_type,source_ref,
    grant_mode,requested_duration_days,starts_at,ends_at,created_by,grant_reason)
  VALUES(p_target_user_id,p_product_id,'pro','admin',v_source,p_mode,
    p_duration_days,v_starts_at,v_ends_at,v_actor,p_reason)
  RETURNING * INTO v_grant;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,after,reason)
    VALUES(v_actor,'grant.create','grant',v_grant.id,
      pg_catalog.jsonb_build_object('user_id',p_target_user_id,'product_id',p_product_id,
        'starts_at',v_starts_at,'ends_at',v_ends_at),p_reason);
  RETURN pg_catalog.jsonb_build_object('idempotent_replay',false,'grant_id',v_grant.id,
    'starts_at',v_starts_at,'ends_at',v_ends_at);
END;
$$;

CREATE FUNCTION private.admin_revoke_code_core(p_code_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_actor uuid;
  v_product_id uuid;
  v_code public.redemption_codes%ROWTYPE;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor := private.require_admin();
  IF p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  SELECT product_id INTO v_product_id FROM public.redemption_codes WHERE id=p_code_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
  PERFORM 1 FROM public.products WHERE id=v_product_id FOR SHARE;
  SELECT * INTO v_code FROM public.redemption_codes WHERE id=p_code_id FOR UPDATE;
  IF NOT FOUND OR v_code.product_id<>v_product_id THEN
    RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409';
  END IF;
  IF v_code.revoked_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('changed',false,'code_id',p_code_id);
  END IF;
  UPDATE public.redemption_codes SET revoked_at=transaction_timestamp(),
    revoked_by=v_actor,revoke_reason=p_reason WHERE id=p_code_id;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,reason)
    VALUES(v_actor,'code.revoke','code',p_code_id,p_reason);
  RETURN pg_catalog.jsonb_build_object('changed',true,'code_id',p_code_id);
END;
$$;

CREATE FUNCTION private.admin_revoke_batch_core(p_batch_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_actor uuid;
  v_product_id uuid;
  v_code public.redemption_codes%ROWTYPE;
  v_count integer := 0;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor := private.require_admin();
  IF p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;
  SELECT product_id INTO v_product_id FROM public.redemption_code_batches WHERE id=p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
  PERFORM 1 FROM public.products WHERE id=v_product_id FOR SHARE;
  -- Obtain L6 code locks in stable UUID order; skip previously revoked codes.
  FOR v_code IN SELECT * FROM public.redemption_codes
    WHERE batch_id=p_batch_id ORDER BY id FOR UPDATE LOOP
    IF v_code.revoked_at IS NULL THEN
      UPDATE public.redemption_codes SET revoked_at=transaction_timestamp(),
        revoked_by=v_actor,revoke_reason=p_reason WHERE id=v_code.id;
      v_count := v_count+1;
    END IF;
  END LOOP;
  IF v_count>0 THEN
    INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,after,reason)
      VALUES(v_actor,'code.batch_revoke','code_batch',p_batch_id,
        pg_catalog.jsonb_build_object('revoked_codes',v_count),p_reason);
  END IF;
  RETURN pg_catalog.jsonb_build_object('changed',v_count>0,'revoked_codes',v_count);
END;
$$;

CREATE FUNCTION private.admin_revoke_grant_core(p_grant_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_actor uuid;
  v_user uuid;
  v_product uuid;
  v_grant public.entitlement_grants%ROWTYPE;
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
  UPDATE public.entitlement_grants SET revoked_at=transaction_timestamp(),
    revoked_by=v_actor,revoke_reason=p_reason WHERE id=p_grant_id;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,reason)
    VALUES(v_actor,'grant.revoke','grant',p_grant_id,p_reason);
  RETURN pg_catalog.jsonb_build_object('changed',true,'grant_id',p_grant_id);
END;
$$;

-- No generic owner or auth bypass: only five typed, self-checking kernels
-- are callable, with a non-login definer and fixed search_path.
REVOKE ALL ON FUNCTION private.admin_create_codes_core(uuid,text,integer,integer,boolean,integer,timestamptz,text,text),
  private.admin_grant_entitlement_core(uuid,uuid,text,text,integer,timestamptz,timestamptz,boolean,text,text),
  private.admin_revoke_code_core(uuid,text),
  private.admin_revoke_batch_core(uuid,text),
  private.admin_revoke_grant_core(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.admin_create_codes_core(uuid,text,integer,integer,boolean,integer,timestamptz,text,text),
  private.admin_grant_entitlement_core(uuid,uuid,text,text,integer,timestamptz,timestamptz,boolean,text,text),
  private.admin_revoke_code_core(uuid,text),
  private.admin_revoke_batch_core(uuid,text),
  private.admin_revoke_grant_core(uuid,text) TO authenticated;
ALTER FUNCTION private.admin_create_codes_core(uuid,text,integer,integer,boolean,integer,timestamptz,text,text)
  OWNER TO aisencore_rpc_executor;
ALTER FUNCTION private.admin_grant_entitlement_core(uuid,uuid,text,text,integer,timestamptz,timestamptz,boolean,text,text)
  OWNER TO aisencore_rpc_executor;
ALTER FUNCTION private.admin_revoke_code_core(uuid,text) OWNER TO aisencore_rpc_executor;
ALTER FUNCTION private.admin_revoke_batch_core(uuid,text) OWNER TO aisencore_rpc_executor;
ALTER FUNCTION private.admin_revoke_grant_core(uuid,text) OWNER TO aisencore_rpc_executor;

CREATE FUNCTION public.admin_create_codes(p_product_id uuid,p_tier text,p_quantity integer,
  p_grant_duration_days integer,p_is_lifetime boolean,p_max_redemptions_per_code integer,
  p_code_expires_at timestamptz,p_request_id text,p_note text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_create_codes_core(p_product_id,p_tier,p_quantity,p_grant_duration_days,
  p_is_lifetime,p_max_redemptions_per_code,p_code_expires_at,p_request_id,p_note); $$;
CREATE FUNCTION public.admin_grant_entitlement(p_target_user_id uuid,p_product_id uuid,p_tier text,
  p_mode text,p_duration_days integer,p_starts_at timestamptz,p_ends_at timestamptz,
  p_is_lifetime boolean,p_reason text,p_request_id text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_grant_entitlement_core(p_target_user_id,p_product_id,p_tier,p_mode,
  p_duration_days,p_starts_at,p_ends_at,p_is_lifetime,p_reason,p_request_id); $$;
CREATE FUNCTION public.admin_revoke_code(p_code_id uuid,p_reason text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_revoke_code_core(p_code_id,p_reason); $$;
CREATE FUNCTION public.admin_revoke_batch(p_batch_id uuid,p_reason text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_revoke_batch_core(p_batch_id,p_reason); $$;
CREATE FUNCTION public.admin_revoke_grant(p_grant_id uuid,p_reason text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_revoke_grant_core(p_grant_id,p_reason); $$;
REVOKE ALL ON FUNCTION public.admin_create_codes(uuid,text,integer,integer,boolean,integer,timestamptz,text,text),
  public.admin_grant_entitlement(uuid,uuid,text,text,integer,timestamptz,timestamptz,boolean,text,text),
  public.admin_revoke_code(uuid,text),public.admin_revoke_batch(uuid,text),
  public.admin_revoke_grant(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_codes(uuid,text,integer,integer,boolean,integer,timestamptz,text,text),
  public.admin_grant_entitlement(uuid,uuid,text,text,integer,timestamptz,timestamptz,boolean,text,text),
  public.admin_revoke_code(uuid,text),public.admin_revoke_batch(uuid,text),
  public.admin_revoke_grant(uuid,text) TO authenticated;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
