-- ADMIN-REDEEM-SINGLE-20261029. New-project single-use model.
-- No deletion of real data; reject legacy multiredemption rows instead of
-- silently collapsing any historical redemption facts.
ALTER TABLE public.redemption_code_batches ADD CONSTRAINT batch_code_single_use
  CHECK (max_redemptions_per_code = 1);
ALTER TABLE public.redemption_codes ADD CONSTRAINT redemption_code_single_use
  CHECK (max_redemptions = 1 AND redeemed_count IN (0,1));
ALTER TABLE public.redemptions ADD CONSTRAINT redemption_one_success_per_code
  UNIQUE (code_id);
CREATE INDEX IF NOT EXISTS redemption_codes_batch_state_idx
  ON public.redemption_codes (batch_id,batch_ordinal);
CREATE INDEX IF NOT EXISTS redemptions_code_created_idx
  ON public.redemptions (code_id,created_at);

GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
-- Replace the authoritative private generator, not only its public wrapper:
-- authenticated users have historically been granted access to the private
-- function via the existing Supabase RPC bridge.
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
     OR p_max_redemptions_per_code IS NULL OR p_max_redemptions_per_code<>1
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

CREATE FUNCTION private.admin_code_batches_v2_core(
  p_product_id uuid DEFAULT NULL,p_page integer DEFAULT 1,p_per_page integer DEFAULT 20,
  p_request_id text DEFAULT NULL,p_batch_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_total bigint;v_items jsonb;v_now timestamptz:=transaction_timestamp();
BEGIN
  PERFORM private.require_admin();
  IF p_page NOT BETWEEN 1 AND 100000 OR p_per_page NOT BETWEEN 1 AND 100
    OR (p_request_id IS NOT NULL AND length(p_request_id)>128)
    OR (p_product_id IS NOT NULL AND NOT EXISTS
        (SELECT 1 FROM public.products WHERE id=p_product_id))
  THEN RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422'; END IF;

  SELECT count(*) INTO v_total FROM public.redemption_code_batches b
    WHERE (p_product_id IS NULL OR b.product_id=p_product_id)
      AND (p_request_id IS NULL OR b.request_id=p_request_id)
      AND (p_batch_id IS NULL OR b.id=p_batch_id);
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC,t.id DESC),'[]'::jsonb)
    INTO v_items FROM (
    SELECT b.id,b.product_id,b.request_id,b.quantity,b.grant_duration_days,
      b.code_expires_at,b.note,b.created_at,b.created_by,
      p.status AS product_status,
      (SELECT count(*) FROM public.redemption_codes c
       WHERE c.batch_id=b.id AND c.redeemed_count=1)::integer AS used_count,
      (SELECT count(*) FROM public.redemption_codes c
       WHERE c.batch_id=b.id AND c.redeemed_count=0 AND c.revoked_at IS NULL
         AND (c.expires_at IS NULL OR c.expires_at>v_now)
         AND p.status='active')::integer AS available_count
    FROM public.redemption_code_batches b
    JOIN public.products p ON p.id=b.product_id
    WHERE (p_product_id IS NULL OR b.product_id=p_product_id)
      AND (p_request_id IS NULL OR b.request_id=p_request_id)
      AND (p_batch_id IS NULL OR b.id=p_batch_id)
    ORDER BY b.created_at DESC,b.id DESC
    LIMIT p_per_page OFFSET (p_page-1)*p_per_page
  ) t;
  RETURN jsonb_build_object('items',v_items,'total',v_total);
END;$$;
REVOKE ALL ON FUNCTION private.admin_code_batches_v2_core(uuid,integer,integer,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.admin_code_batches_v2_core(uuid,integer,integer,text,uuid) TO authenticated;

CREATE FUNCTION private.admin_batch_codes_v2_core(
  p_batch_id uuid,p_product_id uuid DEFAULT NULL,p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 20,p_status text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_batch public.redemption_code_batches%ROWTYPE;
  v_product_status text;v_total bigint;v_items jsonb;v_now timestamptz:=transaction_timestamp();
BEGIN
  PERFORM private.require_admin();
  IF p_batch_id IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_per_page NOT BETWEEN 1 AND 100
    OR (p_status IS NOT NULL AND p_status NOT IN
      ('available','redeemed','expired','revoked','product_unavailable'))
  THEN RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422'; END IF;
  SELECT b.* INTO v_batch FROM public.redemption_code_batches b
    WHERE b.id=p_batch_id;
  IF FOUND THEN
    SELECT p.status INTO v_product_status FROM public.products p
      WHERE p.id=v_batch.product_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='PT404'; END IF;
  IF p_product_id IS NOT NULL AND p_product_id<>v_batch.product_id
    THEN RAISE EXCEPTION 'SCOPE_MISMATCH' USING ERRCODE='PT403'; END IF;
  SELECT count(*) INTO v_total FROM public.redemption_codes c
   WHERE c.batch_id=p_batch_id
     AND (p_status IS NULL OR
       (CASE WHEN c.redeemed_count=1 THEN 'redeemed'
        WHEN c.revoked_at IS NOT NULL THEN 'revoked'
        WHEN c.expires_at IS NOT NULL AND c.expires_at<=v_now THEN 'expired'
        WHEN v_product_status<>'active' THEN 'product_unavailable'
        ELSE 'available' END)=p_status);
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.batch_ordinal),'[]'::jsonb) INTO v_items FROM (
    SELECT c.id,c.batch_ordinal,c.code_prefix,c.expires_at,c.revoked_at,
      c.redeemed_count,r.user_id AS redeemed_by,r.grant_id,r.created_at AS redeemed_at,
      (CASE WHEN c.redeemed_count=1 THEN 'redeemed'
        WHEN c.revoked_at IS NOT NULL THEN 'revoked'
        WHEN c.expires_at IS NOT NULL AND c.expires_at<=v_now THEN 'expired'
        WHEN v_product_status<>'active' THEN 'product_unavailable'
        ELSE 'available' END) AS status
    FROM public.redemption_codes c
      LEFT JOIN public.redemptions r ON r.code_id=c.id
    WHERE c.batch_id=p_batch_id
      AND (p_status IS NULL OR (CASE WHEN c.redeemed_count=1 THEN 'redeemed'
        WHEN c.revoked_at IS NOT NULL THEN 'revoked'
        WHEN c.expires_at IS NOT NULL AND c.expires_at<=v_now THEN 'expired'
        WHEN v_product_status<>'active' THEN 'product_unavailable'
        ELSE 'available' END)=p_status)
    ORDER BY c.batch_ordinal ASC LIMIT p_per_page OFFSET (p_page-1)*p_per_page
  )t;
  RETURN jsonb_build_object('items',v_items,'total',v_total,'batch_id',p_batch_id);
END;$$;
REVOKE ALL ON FUNCTION private.admin_batch_codes_v2_core(uuid,uuid,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.admin_batch_codes_v2_core(uuid,uuid,integer,integer,text) TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;

CREATE FUNCTION public.admin_code_batches_v2(
  p_product_id uuid DEFAULT NULL,p_page integer DEFAULT 1,p_per_page integer DEFAULT 20,
  p_request_id text DEFAULT NULL,p_batch_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.admin_code_batches_v2_core(p_product_id,p_page,p_per_page,p_request_id,p_batch_id); $$;
REVOKE ALL ON FUNCTION public.admin_code_batches_v2(uuid,integer,integer,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_code_batches_v2(uuid,integer,integer,text,uuid) TO authenticated;

CREATE FUNCTION public.admin_batch_codes_v2(
  p_batch_id uuid,p_product_id uuid DEFAULT NULL,p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 20,p_status text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.admin_batch_codes_v2_core(p_batch_id,p_product_id,p_page,p_per_page,p_status); $$;
REVOKE ALL ON FUNCTION public.admin_batch_codes_v2(uuid,uuid,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_batch_codes_v2(uuid,uuid,integer,integer,text) TO authenticated;
NOTIFY pgrst,'reload schema';