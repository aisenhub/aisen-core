-- Phase 1: close three independent PL/pgSQL lint warnings without
-- modifying existing business signatures, locks, permissions, or demo data.
-- private.require_admin() is VOLATILE; the identity lookup and its public
-- forwarding RPC must not advertise a STABLE authorization-dependent result.
-- The core functions are owned by a NOLOGIN role; the local migration
-- actor is a member, not their owner. Use the exact owner while altering.
SET ROLE aisencore_rpc_executor;
ALTER FUNCTION private.admin_lookup_users_core(uuid[],text,integer,integer) VOLATILE;
RESET ROLE;
ALTER FUNCTION public.admin_lookup_users(uuid[],text,integer,integer) VOLATILE;

-- Integer FOR loops introduce their own local loop variables; the previous
-- explicit DECLARE entries were shadowed and unused.
CREATE OR REPLACE FUNCTION private.make_redemption_code() RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $$
DECLARE
  v_random bytea := extensions.gen_random_bytes(20);
  v_chars constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  v_buffer bigint := 0;
  v_bits integer := 0;
  v_index integer;
  v_result text := '';
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

-- Preserve the SECURITY DEFINER owner. CREATE is held only inside this
-- migration and revoked before commit, as in the original schema migration.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE OR REPLACE FUNCTION private.admin_create_codes_core(
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
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
