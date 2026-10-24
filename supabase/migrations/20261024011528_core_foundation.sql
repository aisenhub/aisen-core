-- AisenCore D1: initial trusted data foundation (2026-10-24).
-- This is an additive, NEW-project schema: no legacy plans, free feature/limit
-- columns, client-write APIs, seed administrator, or production credentials.
--
-- Security boundary for this first migration:
--   * authenticated end users can SELECT only their own membership row;
--   * anon/authenticated can SELECT only active product directory entries;
--   * no client role can INSERT/UPDATE/DELETE a business or audit table;
--   * admin read/write and product membership transitions will be added only
--     via separately tested, protected RPC functions. Fail closed meanwhile.
--
-- The migration requires Supabase Auth's auth.users schema to exist.
-- Authorization does not use client-supplied user IDs or user_metadata.

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT products_status_valid CHECK (status IN ('draft', 'active', 'suspended')),
  CONSTRAINT products_key_valid CHECK (
    char_length(product_key) BETWEEN 1 AND 64
    AND product_key ~ '^[a-z][a-z0-9_]*$'
  ),
  CONSTRAINT products_name_valid CHECK (char_length(btrim(name)) BETWEEN 1 AND 160)
);

CREATE TABLE public.product_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active',
  pre_suspend_status text,
  joined_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT product_memberships_user_product_uniq UNIQUE (user_id, product_id),
  CONSTRAINT product_memberships_valid_state CHECK (
    (status IN ('active', 'left') AND pre_suspend_status IS NULL)
    OR
    (status = 'suspended' AND pre_suspend_status IN ('active', 'left')
      AND pre_suspend_status IS NOT NULL)
  )
);

CREATE INDEX product_memberships_product_status_user_idx
  ON public.product_memberships(product_id, status, user_id);

CREATE TABLE public.membership_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.product_memberships(id) ON DELETE RESTRICT,
  action text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor_type text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason_code text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT membership_events_actor_valid CHECK (
    actor_type IN ('user', 'admin', 'system')
    AND (actor_type = 'system' OR actor_user_id IS NOT NULL)
  ),
  -- A SQL CHECK may accept UNKNOWN. Only join can omit the previous status.
  CONSTRAINT membership_events_previous_state_presence CHECK (
    (action = 'join' AND from_status IS NULL)
    OR (action <> 'join' AND from_status IS NOT NULL)
  ),
  CONSTRAINT membership_events_transition_valid CHECK (
    (action = 'join' AND from_status IS NULL AND to_status = 'active')
    OR (action = 'leave' AND from_status = 'active' AND to_status = 'left')
    OR (action = 'rejoin' AND from_status = 'left' AND to_status = 'active')
    OR (action = 'suspend' AND from_status IN ('active', 'left') AND to_status = 'suspended')
    OR (action = 'restore' AND from_status = 'suspended' AND to_status IN ('active', 'left'))
  )
);

CREATE INDEX membership_events_member_created_idx
  ON public.membership_events(membership_id, created_at DESC);

CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  granted_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE public.platform_account_restrictions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  kind text NOT NULL DEFAULT 'blocked',
  reason_code text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT platform_restriction_blocked_only CHECK (kind = 'blocked'),
  CONSTRAINT platform_restriction_reason_valid CHECK (char_length(btrim(reason_code)) BETWEEN 1 AND 120)
);

CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT admin_audit_action_valid CHECK (char_length(btrim(action)) BETWEEN 1 AND 100),
  CONSTRAINT admin_audit_target_valid CHECK (char_length(btrim(target_type)) BETWEEN 1 AND 100),
  CONSTRAINT admin_audit_json_valid CHECK (
    (before IS NULL OR jsonb_typeof(before) = 'object')
    AND (after IS NULL OR jsonb_typeof(after) = 'object')
  )
);

CREATE INDEX admin_audit_target_created_idx
  ON public.admin_audit_log(target_type, target_id, created_at DESC);

CREATE INDEX admin_audit_actor_created_idx
  ON public.admin_audit_log(actor_user_id, created_at DESC);

-- Never depend on a Supabase project default to expose newly created tables.
-- Even with table GRANT, RLS is an independent and mandatory boundary.
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_account_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.products FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.product_memberships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.membership_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.platform_account_restrictions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated;

-- Product directory facts are not account secrets; only active products show.
GRANT SELECT (id, product_key, name, description, status)
  ON public.products TO anon, authenticated;
CREATE POLICY products_active_directory_read
  ON public.products FOR SELECT TO anon, authenticated
  USING (status = 'active');

-- The database, not the front end, determines the user from the verified JWT.
GRANT SELECT (id, user_id, product_id, status, pre_suspend_status, joined_at, updated_at)
  ON public.product_memberships TO authenticated;
CREATE POLICY product_memberships_self_read
  ON public.product_memberships FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- No INSERT/UPDATE/DELETE policies or DML grants for client roles.
-- No platform-admin read policy until the MFA-aware, audited helper is
-- implemented and validated against real Supabase Auth sessions.
