-- D1-M1 data invariants, column grants and simulated-JWT RLS/MFA checks.
-- No real GoTrue/JWKS validation is implied by SET ROLE / set_config.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id, email) VALUES
  ('11000000-0000-4000-8000-000000000101','d1m1-a@example.invalid'),
  ('11000000-0000-4000-8000-000000000102','d1m1-b@example.invalid'),
  ('11000000-0000-4000-8000-000000000103','d1m1-admin@example.invalid');
INSERT INTO public.products(id, product_key, name, status) VALUES
  ('21000000-0000-4000-8000-000000000101','d1m1_active','Synthetic D1M1','active'),
  ('21000000-0000-4000-8000-000000000102','d1m1_draft','Synthetic Draft','draft');
INSERT INTO public.platform_admins(user_id, active) VALUES
  ('11000000-0000-4000-8000-000000000103',true);
INSERT INTO public.product_memberships(user_id, product_id, status) VALUES
  ('11000000-0000-4000-8000-000000000101','21000000-0000-4000-8000-000000000101','active'),
  ('11000000-0000-4000-8000-000000000102','21000000-0000-4000-8000-000000000101','left');
INSERT INTO public.entitlement_grants
  (id, user_id, product_id, source_type, source_ref, grant_mode, requested_duration_days, starts_at, ends_at)
VALUES
  ('31000000-0000-4000-8000-000000000101','11000000-0000-4000-8000-000000000101','21000000-0000-4000-8000-000000000101','redeem_code','test-code','duration',30,now(),now()+interval '30 days'),
  ('31000000-0000-4000-8000-000000000102','11000000-0000-4000-8000-000000000102','21000000-0000-4000-8000-000000000101','admin','test-admin','explicit_window',NULL,now(),NULL);
INSERT INTO public.redemption_code_batches
  (id, product_id, created_by, request_id, quantity, grant_duration_days)
VALUES
  ('41000000-0000-4000-8000-000000000101','21000000-0000-4000-8000-000000000101','11000000-0000-4000-8000-000000000103','test-request',1,30);
INSERT INTO public.redemption_codes
  (id,batch_id,batch_ordinal,code_hash,code_prefix,product_id,grant_duration_days,created_by)
VALUES
  ('51000000-0000-4000-8000-000000000101','41000000-0000-4000-8000-000000000101',1,repeat('a',64),'ABCD','21000000-0000-4000-8000-000000000101',30,'11000000-0000-4000-8000-000000000103');
INSERT INTO public.redemptions(code_id,user_id,product_id,grant_id)
VALUES
  ('51000000-0000-4000-8000-000000000101','11000000-0000-4000-8000-000000000101','21000000-0000-4000-8000-000000000101','31000000-0000-4000-8000-000000000101');
INSERT INTO public.redemption_rate_limits(user_id,failed_at)
VALUES ('11000000-0000-4000-8000-000000000101',ARRAY[now()]);

SELECT plan(57);

-- Schema exists, RLS is enabled on all five tables, and no secret-column path opens.
SELECT has_table('public','entitlement_grants','Pro Grant table exists');
SELECT has_table('public','redemption_code_batches','batch table exists');
SELECT has_table('public','redemption_codes','hashed codes table exists');
SELECT has_table('public','redemptions','redemption records exist');
SELECT has_table('public','redemption_rate_limits','private rate limit state exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='private'),'private schema exists');
SELECT is((SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('entitlement_grants','redemption_code_batches','redemption_codes','redemptions','redemption_rate_limits') AND c.relrowsecurity),5,'all five tables use RLS');
SELECT ok(has_schema_privilege('authenticated','private','USAGE'),'private schema is callable by exact wrapper grants but not exposed by Data API');
SELECT ok(NOT has_function_privilege('anon','private.is_platform_admin()','EXECUTE'),'anon cannot invoke admin guard');
SELECT ok(has_function_privilege('authenticated','private.is_platform_admin()','EXECUTE'),'authenticated RLS can invoke guard');
SELECT ok(NOT has_column_privilege('authenticated','public.redemption_codes','code_hash','SELECT'),'hash is never selected by Data API');
SELECT ok(NOT has_column_privilege('anon','public.redemption_codes','code_hash','SELECT'),'anon cannot read hash');
SELECT ok(NOT has_column_privilege('authenticated','public.entitlement_grants','source_ref','SELECT'),'Grant internal idempotency key is private');
SELECT ok(NOT has_table_privilege('authenticated','public.redemption_rate_limits','SELECT'),'rate limit state stays private');
SELECT ok(NOT has_table_privilege('authenticated','public.redemption_rate_limits','UPDATE'),'rate limit state cannot be forged');
SELECT ok(NOT has_table_privilege('authenticated','public.redemption_codes','INSERT'),'codes require protected issuance');
SELECT ok(NOT has_table_privilege('authenticated','public.entitlement_grants','UPDATE'),'grants require protected writes');
SELECT ok(has_table_privilege('authenticated','public.admin_redemption_code_summaries','SELECT'),'admin safe view is selectable');
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='admin_redemption_code_summaries' AND column_name='code_hash'),'admin safe view contains no hash');
SELECT ok((SELECT reloptions @> ARRAY['security_invoker=true']::text[] FROM pg_class WHERE oid='public.admin_redemption_code_summaries'::regclass),'view enforces invoker RLS');

-- Static integrity failures, including SQL CHECK UNKNOWN/NULL bypasses.
SELECT throws_ok($$INSERT INTO public.entitlement_grants(user_id,product_id,tier,source_type,source_ref,grant_mode,requested_duration_days,starts_at,ends_at) VALUES ('11000000-0000-4000-8000-000000000101','21000000-0000-4000-8000-000000000101','free','admin','bad-tier','duration',30,now(),now()+interval '30 days')$$,'23514');
SELECT throws_ok($$INSERT INTO public.entitlement_grants(user_id,product_id,source_type,source_ref,grant_mode,starts_at,ends_at) VALUES ('11000000-0000-4000-8000-000000000101','21000000-0000-4000-8000-000000000101','admin','bad-null-duration','duration',now(),now()+interval '30 days')$$,'23514');
SELECT throws_ok($$INSERT INTO public.entitlement_grants(user_id,product_id,source_type,source_ref,grant_mode,requested_duration_days,starts_at) VALUES ('11000000-0000-4000-8000-000000000101','21000000-0000-4000-8000-000000000101','admin','bad-no-end','duration',30,now())$$,'23514');
SELECT throws_ok($$INSERT INTO public.entitlement_grants(user_id,product_id,source_type,source_ref,grant_mode,requested_duration_days,starts_at) VALUES ('11000000-0000-4000-8000-000000000101','21000000-0000-4000-8000-000000000101','admin','bad-window','explicit_window',30,now())$$,'23514');
SELECT throws_ok($$INSERT INTO public.entitlement_grants(user_id,product_id,source_type,source_ref,grant_mode,starts_at,ends_at) VALUES ('11000000-0000-4000-8000-000000000101','21000000-0000-4000-8000-000000000101','admin','bad-order','explicit_window',now(),now())$$,'23514');
SELECT throws_ok($$UPDATE public.entitlement_grants SET revoked_at=now(),revoked_by='11000000-0000-4000-8000-000000000103',revoke_reason=NULL WHERE id='31000000-0000-4000-8000-000000000101'$$,'23514');
SELECT throws_ok($$UPDATE public.entitlement_grants SET revoked_at=now(),revoked_by='11000000-0000-4000-8000-000000000103',revoke_reason='   ' WHERE id='31000000-0000-4000-8000-000000000101'$$,'23514');
SELECT throws_ok($$INSERT INTO public.redemption_code_batches(product_id,created_by,request_id,quantity,is_lifetime,grant_duration_days) VALUES ('21000000-0000-4000-8000-000000000101','11000000-0000-4000-8000-000000000103','bad-lifetime',1,true,30)$$,'23514');
SELECT throws_ok($$INSERT INTO public.redemption_code_batches(product_id,created_by,request_id,quantity,grant_duration_days) VALUES ('21000000-0000-4000-8000-000000000101','11000000-0000-4000-8000-000000000103','test-request',1,30)$$,'23505');
SELECT throws_ok($$INSERT INTO public.redemption_codes(batch_id,batch_ordinal,code_hash,code_prefix,product_id,grant_duration_days,created_by) VALUES ('41000000-0000-4000-8000-000000000101',2,'not-sha256','XTEST','21000000-0000-4000-8000-000000000101',30,'11000000-0000-4000-8000-000000000103')$$,'23514');
SELECT throws_ok($$UPDATE public.redemption_codes SET redeemed_count=2 WHERE id='51000000-0000-4000-8000-000000000101'$$,'23514');
SELECT throws_ok($$UPDATE public.redemption_codes SET revoked_at=now(),revoked_by='11000000-0000-4000-8000-000000000103',revoke_reason=NULL WHERE id='51000000-0000-4000-8000-000000000101'$$,'23514');
SELECT throws_ok($$INSERT INTO public.redemption_rate_limits(user_id,failed_at) VALUES ('11000000-0000-4000-8000-000000000102',array_fill(now(), ARRAY[11]))$$,'23514');
SELECT throws_ok($$INSERT INTO public.redemptions(code_id,user_id,product_id,grant_id) VALUES ('51000000-0000-4000-8000-000000000101','11000000-0000-4000-8000-000000000101','21000000-0000-4000-8000-000000000101','31000000-0000-4000-8000-000000000101')$$,'23505');

SET LOCAL ROLE anon;
SELECT throws_ok('SELECT id FROM public.entitlement_grants','42501');
SELECT throws_ok('SELECT id FROM public.redemption_codes','42501');
SELECT throws_ok('SELECT id FROM public.admin_redemption_code_summaries','42501');
RESET ROLE;

-- User A with no MFA can read their own grants/redemptions, never code metadata.
SELECT set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.entitlement_grants),1,'user A can read only own Grant');
SELECT is((SELECT count(*)::integer FROM public.redemptions),1,'user A can read only own redemption');
SELECT is((SELECT count(*)::integer FROM public.redemption_codes),0,'user A cannot read codes');
SELECT is((SELECT count(*)::integer FROM public.redemption_code_batches),0,'user A cannot read batches');
SELECT is((SELECT count(*)::integer FROM public.admin_redemption_code_summaries),0,'user A cannot read admin view');
SELECT throws_ok('SELECT code_hash FROM public.redemption_codes','42501');
SELECT throws_ok('SELECT user_id FROM public.redemption_rate_limits','42501');
SELECT is(private.is_platform_admin(),false,'direct helper call does not grant admin privileges');
SELECT throws_ok('DELETE FROM public.entitlement_grants','42501');
RESET ROLE;

-- Admin with aal1 is denied; aal2 with active roster sees admin-only rows.
SELECT set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000103',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.platform_admins),0,'aal1 admin cannot read roster');
SELECT is((SELECT count(*)::integer FROM public.redemption_codes),0,'aal1 admin cannot list codes');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.platform_admins WHERE user_id='11000000-0000-4000-8000-000000000103'),1,'aal2 admin sees test roster');
SELECT is((SELECT count(*)::integer FROM public.entitlement_grants WHERE product_id='21000000-0000-4000-8000-000000000101'),2,'aal2 admin sees test grants');
SELECT is((SELECT count(*)::integer FROM public.redemption_codes WHERE product_id='21000000-0000-4000-8000-000000000101'),1,'aal2 admin sees test code metadata');
SELECT is((SELECT count(*)::integer FROM public.admin_redemption_code_summaries WHERE product_id='21000000-0000-4000-8000-000000000101'),1,'aal2 admin view sees test code');
SELECT is((SELECT count(*)::integer FROM public.product_memberships WHERE product_id='21000000-0000-4000-8000-000000000101'),2,'aal2 admin sees test memberships');
SELECT is((SELECT count(*)::integer FROM public.products WHERE product_key IN ('d1m1_active','d1m1_draft')),2,'aal2 admin sees test draft products');
SELECT throws_ok('SELECT code_hash FROM public.redemption_codes','42501');
RESET ROLE;

-- Current blocked status revokes admin reads even with an aal2 claim.
INSERT INTO public.platform_account_restrictions(user_id,kind,reason_code,created_by)
VALUES ('11000000-0000-4000-8000-000000000103','blocked','test-only','11000000-0000-4000-8000-000000000103');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.platform_admins),0,'blocked aal2 admin is not privileged');
SELECT is((SELECT count(*)::integer FROM public.redemption_codes),0,'blocked aal2 admin sees no codes');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
