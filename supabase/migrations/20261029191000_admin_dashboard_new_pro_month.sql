-- ADMIN-DASH-20261029 incremental correction after installed 20261029190000.
-- 'This month's newly acquired Pro members' counts distinct users whose FIRST
-- ever Pro activation in the selected scope occurs during this calendar month.
-- Same-user renewals, additional grants, and for global scope a second product
-- must NOT inflate the acquisition cohort. Historical expirations/valid
-- revocations AFTER activation remain counted as historical acquisitions.
-- Never treat a grant scheduled for the future as an active acquisition.
-- All other existing metrics, AAL2 check, scope and month bounds are retained.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;

CREATE OR REPLACE FUNCTION private.admin_dashboard_metrics_core(p_product_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.transaction_timestamp();
  v_month_start timestamptz;
  v_next_month timestamptz;
  v_normal_users bigint;
  v_new_users bigint;
  v_pro_members bigint;
  v_open_feedback bigint;
  v_new_feedback bigint;
  v_new_pro bigint;
BEGIN
  PERFORM private.require_admin();
  IF p_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.id=p_product_id
  ) THEN RAISE EXCEPTION 'INVALID_PRODUCT' USING ERRCODE='PT422'; END IF;

  v_month_start := (pg_catalog.date_trunc('month',v_now AT TIME ZONE 'Asia/Shanghai')
     AT TIME ZONE 'Asia/Shanghai');
  v_next_month := ((pg_catalog.date_trunc('month',v_now AT TIME ZONE 'Asia/Shanghai')
     + interval '1 month') AT TIME ZONE 'Asia/Shanghai');

  -- Global normal = not blocked Auth account, even without membership.
  -- Scoped normal = active member of this product AND not globally blocked.
  -- Monthly new global = registered this month; scoped = first joined product
  -- this month (whether still active, left, or suspended).
  SELECT
    count(*) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM public.platform_account_restrictions r
      WHERE r.user_id=u.id AND r.kind='blocked'
    ) AND (p_product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.product_memberships pm
      WHERE pm.user_id=u.id AND pm.product_id=p_product_id
        AND pm.status='active'
    ))),
    count(*) FILTER (WHERE (
      (p_product_id IS NULL AND u.created_at>=v_month_start
        AND u.created_at<v_next_month)
      OR (p_product_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.product_memberships pm
        WHERE pm.user_id=u.id AND pm.product_id=p_product_id
          AND pm.joined_at>=v_month_start AND pm.joined_at<v_next_month
      ))
    ))
  INTO v_normal_users,v_new_users
  FROM auth.users u
  WHERE (p_product_id IS NULL OR EXISTS (
    SELECT 1 FROM public.product_memberships pm
    WHERE pm.user_id=u.id AND pm.product_id=p_product_id
  ));

  -- A Pro member is a distinct usable person, not a count of Grant rows.
  -- Evaluate the same current credit truth used by check_access/User360.
  SELECT count(DISTINCT m.user_id) INTO v_pro_members
  FROM public.product_memberships m
  JOIN public.products p ON p.id=m.product_id
  WHERE m.status='active' AND p.status='active'
    AND (p_product_id IS NULL OR m.product_id=p_product_id)
    AND NOT EXISTS (SELECT 1 FROM public.platform_account_restrictions r
      WHERE r.user_id=m.user_id AND r.kind='blocked')
    AND (private.pro_credit_summary(m.user_id,m.product_id,v_now)->>'pro_active')::boolean;

  -- Acquisition cohort rather than current active/renewed Grant count:
  -- one distinct user whose first valid Pro activation in this scope is
  -- within the current month. If a user was Pro in a different product in
  -- an earlier month, only the product-specific view may count them as new.
  SELECT count(*) INTO v_new_pro FROM (
    SELECT g.user_id
    FROM public.entitlement_grants g
    WHERE g.tier='pro'
      AND (p_product_id IS NULL OR g.product_id=p_product_id)
      AND g.starts_at<=v_now
      AND (g.revoked_at IS NULL OR g.revoked_at>g.starts_at)
    GROUP BY g.user_id
    HAVING min(greatest(g.created_at,g.starts_at))>=v_month_start
       AND min(greatest(g.created_at,g.starts_at))<v_next_month
  ) first_pro_members;

  -- Read the same visible feedback projection as Admin lists. The V4 view
  -- excludes deletion-in-progress rows; legacy trash is not a business queue.
  SELECT
    count(*) FILTER (WHERE f.queue_state IN ('inbox','workbench')),
    count(*) FILTER (WHERE f.queue_state='inbox')
  INTO v_open_feedback,v_new_feedback
  FROM public.admin_feedback_summaries f
  WHERE f.queue_state<>'trashed'
    AND (p_product_id IS NULL OR f.product_id=p_product_id);

  RETURN pg_catalog.jsonb_build_object(
    'normal_users',v_normal_users,
    'new_users_month',v_new_users,
    'pro_members',v_pro_members,
    'new_pro_month',v_new_pro,
    'open_feedback',v_open_feedback,
    'new_feedback',v_new_feedback,
    'month_start',v_month_start,
    'month_end',v_next_month
  );
END;
$$;

RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
-- The installed public SECURITY INVOKER wrapper and existing narrowed EXECUTE
-- grants remain unchanged. No new direct exposure of Auth or credit rows.
NOTIFY pgrst,'reload schema';
