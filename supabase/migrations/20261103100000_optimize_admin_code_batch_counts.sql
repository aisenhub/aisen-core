-- Count both batch states in one scan after pagination. No data changes.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE OR REPLACE FUNCTION private.admin_code_batches_v2_core(
  p_product_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 20,
  p_request_id text DEFAULT NULL,
  p_batch_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_total bigint;
  v_items jsonb;
  v_now timestamptz:=transaction_timestamp();
BEGIN
  PERFORM private.require_admin();
  IF p_page NOT BETWEEN 1 AND 100000 OR p_per_page NOT BETWEEN 1 AND 100
    OR (p_request_id IS NOT NULL AND length(p_request_id)>128)
    OR (p_product_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM public.products WHERE id=p_product_id))
  THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422';
  END IF;

  SELECT count(*) INTO v_total FROM public.redemption_code_batches b
    WHERE (p_product_id IS NULL OR b.product_id=p_product_id)
      AND (p_request_id IS NULL OR b.request_id=p_request_id)
      AND (p_batch_id IS NULL OR b.id=p_batch_id);
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC,t.id DESC),'[]'::jsonb)
    INTO v_items
  FROM (
    SELECT b.id,b.product_id,b.request_id,b.quantity,b.grant_duration_days,
      b.code_expires_at,b.note,b.created_at,b.created_by,
      p.status AS product_status,
      coalesce(counts.used_count,0)::integer AS used_count,
      coalesce(counts.available_count,0)::integer AS available_count
    FROM public.redemption_code_batches b
    JOIN public.products p ON p.id=b.product_id
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE c.redeemed_count=1) AS used_count,
        count(*) FILTER (WHERE c.redeemed_count=0 AND c.revoked_at IS NULL
          AND (c.expires_at IS NULL OR c.expires_at>v_now)
          AND p.status='active') AS available_count
      FROM public.redemption_codes c
      WHERE c.batch_id=b.id
    ) counts ON true
    WHERE (p_product_id IS NULL OR b.product_id=p_product_id)
      AND (p_request_id IS NULL OR b.request_id=p_request_id)
      AND (p_batch_id IS NULL OR b.id=p_batch_id)
    ORDER BY b.created_at DESC,b.id DESC
    LIMIT p_per_page OFFSET (p_page-1)*p_per_page
  ) t;
  RETURN jsonb_build_object('items',v_items,'total',v_total);
END;
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
