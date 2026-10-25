-- D1-M1: Pro grants, redemption issuance and redemption records.
-- All writes remain unavailable to Data API roles until protected RPCs ship.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Verified JWT claims, current roster, account restrictions and MFA level.
CREATE FUNCTION private.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND coalesce(
      nullif(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'aal', ''),
      nullif(current_setting('request.jwt.claim.aal', true), '')
    ) = 'aal2'
    AND EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = auth.uid() AND pa.active = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.platform_account_restrictions r
      WHERE r.user_id = auth.uid() AND r.kind = 'blocked'
    );
$$;
REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC, anon, authenticated;
-- This exact function is referenced by RLS; private is not a Data API schema.
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated;

CREATE TABLE public.entitlement_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  tier text NOT NULL DEFAULT 'pro' CONSTRAINT entitlement_grants_tier_pro_only CHECK (tier = 'pro'),
  source_type text NOT NULL CONSTRAINT entitlement_grants_source_type_valid
    CHECK (source_type IN ('redeem_code', 'admin')),
  source_ref text NOT NULL,
  grant_mode text NOT NULL CONSTRAINT entitlement_grants_mode_valid
    CHECK (grant_mode IN ('duration', 'explicit_window')),
  requested_duration_days integer,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  grant_reason text,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT entitlement_grants_source_unique UNIQUE (source_type, source_ref),
  CONSTRAINT entitlement_grants_duration_valid CHECK (
    (grant_mode = 'duration' AND requested_duration_days IS NOT NULL
      AND requested_duration_days > 0 AND ends_at IS NOT NULL)
    OR (grant_mode = 'explicit_window' AND requested_duration_days IS NULL)
  ),
  CONSTRAINT entitlement_grants_window_valid CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT entitlement_grants_revoke_valid CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoke_reason IS NOT NULL
      AND char_length(btrim(revoke_reason)) BETWEEN 1 AND 200)
  )
);
CREATE INDEX entitlement_grants_active_user_product_idx
  ON public.entitlement_grants(user_id, product_id, tier) WHERE revoked_at IS NULL;

CREATE TABLE public.redemption_code_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  tier text NOT NULL DEFAULT 'pro' CHECK (tier = 'pro'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id text NOT NULL CHECK (char_length(btrim(request_id)) BETWEEN 1 AND 128),
  quantity integer NOT NULL CHECK (quantity > 0),
  grant_duration_days integer,
  is_lifetime boolean NOT NULL DEFAULT false,
  max_redemptions_per_code integer NOT NULL DEFAULT 1 CHECK (max_redemptions_per_code > 0),
  code_expires_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT redemption_code_batches_request_unique UNIQUE (created_by, request_id),
  CONSTRAINT redemption_code_batches_duration_valid CHECK (
    (is_lifetime = true AND grant_duration_days IS NULL)
    OR (is_lifetime = false AND grant_duration_days IS NOT NULL AND grant_duration_days > 0)
  )
);

CREATE TABLE public.redemption_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.redemption_code_batches(id) ON DELETE RESTRICT,
  batch_ordinal integer NOT NULL CHECK (batch_ordinal >= 1),
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  code_prefix text NOT NULL CHECK (char_length(code_prefix) BETWEEN 4 AND 12),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  tier text NOT NULL DEFAULT 'pro' CHECK (tier = 'pro'),
  grant_duration_days integer,
  is_lifetime boolean NOT NULL DEFAULT false,
  max_redemptions integer NOT NULL DEFAULT 1 CHECK (max_redemptions > 0),
  redeemed_count integer NOT NULL DEFAULT 0
    CHECK (redeemed_count >= 0 AND redeemed_count <= max_redemptions),
  expires_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  revoke_reason text,
  CONSTRAINT redemption_codes_batch_ordinal_unique UNIQUE (batch_id, batch_ordinal),
  CONSTRAINT redemption_codes_duration_valid CHECK (
    (is_lifetime = true AND grant_duration_days IS NULL)
    OR (is_lifetime = false AND grant_duration_days IS NOT NULL AND grant_duration_days > 0)
  ),
  CONSTRAINT redemption_codes_revoke_valid CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoke_reason IS NOT NULL
      AND char_length(btrim(revoke_reason)) BETWEEN 1 AND 200)
  )
);
CREATE INDEX redemption_codes_product_idx ON public.redemption_codes(product_id);

CREATE TABLE public.redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES public.redemption_codes(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  grant_id uuid NOT NULL UNIQUE REFERENCES public.entitlement_grants(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT redemptions_code_user_unique UNIQUE (code_id, user_id)
);
CREATE INDEX redemptions_user_product_idx ON public.redemptions(user_id, product_id);

-- Redeem RPC will prune the 15-minute window and return expected failure
-- results without rollback. No plaintext or hashed attempted codes are stored.
CREATE TABLE public.redemption_rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  failed_at timestamptz[] NOT NULL DEFAULT '{}'::timestamptz[],
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT redemption_rate_limits_count_valid
    CHECK (coalesce(array_length(failed_at, 1), 0) <= 10)
);

ALTER TABLE public.entitlement_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemption_code_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemption_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemption_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.entitlement_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.redemption_code_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.redemption_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.redemptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.redemption_rate_limits FROM PUBLIC, anon, authenticated;

-- RLS cannot hide individual columns: only grant known-safe columns.
GRANT SELECT (id, user_id, product_id, tier, source_type, grant_mode,
  requested_duration_days, starts_at, ends_at, revoked_at, created_at)
  ON public.entitlement_grants TO authenticated;
CREATE POLICY entitlement_grants_self_or_admin_read ON public.entitlement_grants
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_platform_admin()));

GRANT SELECT (id, product_id, tier, created_by, request_id, quantity,
  grant_duration_days, is_lifetime, max_redemptions_per_code,
  code_expires_at, note, created_at)
  ON public.redemption_code_batches TO authenticated;
CREATE POLICY redemption_code_batches_admin_read ON public.redemption_code_batches
  FOR SELECT TO authenticated USING ((SELECT private.is_platform_admin()));

GRANT SELECT (id, batch_id, batch_ordinal, code_prefix, product_id, tier,
  grant_duration_days, is_lifetime, max_redemptions, redeemed_count,
  expires_at, created_by, created_at, revoked_at, revoked_by, revoke_reason)
  ON public.redemption_codes TO authenticated;
CREATE POLICY redemption_codes_admin_read ON public.redemption_codes
  FOR SELECT TO authenticated USING ((SELECT private.is_platform_admin()));

GRANT SELECT (id, code_id, user_id, product_id, grant_id, created_at)
  ON public.redemptions TO authenticated;
CREATE POLICY redemptions_self_or_admin_read ON public.redemptions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_platform_admin()));

-- SELECT * via this security-invoker view never includes a secret hash.
CREATE VIEW public.admin_redemption_code_summaries
  WITH (security_invoker = true) AS
  SELECT id, batch_id, batch_ordinal, code_prefix, product_id, tier,
    grant_duration_days, is_lifetime, max_redemptions, redeemed_count,
    expires_at, created_by, created_at, revoked_at, revoked_by, revoke_reason
  FROM public.redemption_codes;
REVOKE ALL ON public.admin_redemption_code_summaries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_redemption_code_summaries TO authenticated;

-- Additional read access for active, unblocked aal2 platform admins only.
GRANT SELECT (created_at, updated_at) ON public.products TO authenticated;
CREATE POLICY products_platform_admin_read ON public.products
  FOR SELECT TO authenticated USING ((SELECT private.is_platform_admin()));
CREATE POLICY product_memberships_platform_admin_read ON public.product_memberships
  FOR SELECT TO authenticated USING ((SELECT private.is_platform_admin()));

GRANT SELECT (id, membership_id, action, from_status, to_status, actor_type,
  actor_user_id, reason_code, created_at) ON public.membership_events TO authenticated;
CREATE POLICY membership_events_platform_admin_read ON public.membership_events
  FOR SELECT TO authenticated USING ((SELECT private.is_platform_admin()));

GRANT SELECT (user_id, active, granted_by, created_at, updated_at)
  ON public.platform_admins TO authenticated;
CREATE POLICY platform_admins_admin_read ON public.platform_admins
  FOR SELECT TO authenticated USING ((SELECT private.is_platform_admin()));

GRANT SELECT (user_id, kind, reason_code, created_by, created_at)
  ON public.platform_account_restrictions TO authenticated;
CREATE POLICY platform_account_restrictions_admin_read ON public.platform_account_restrictions
  FOR SELECT TO authenticated USING ((SELECT private.is_platform_admin()));

GRANT SELECT (id, actor_user_id, action, target_type, target_id, before, after,
  reason, created_at) ON public.admin_audit_log TO authenticated;
CREATE POLICY admin_audit_log_admin_read ON public.admin_audit_log
  FOR SELECT TO authenticated USING ((SELECT private.is_platform_admin()));
