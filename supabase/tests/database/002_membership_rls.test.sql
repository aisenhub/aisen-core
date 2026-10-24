-- Test local SQL privilege + RLS behavior using synthetic users.
-- Does not constitute a GoTrue-signed JWT or network Auth/MFA E2E test.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email) VALUES
  ('10000000-0000-4000-8000-000000000101','aisencore-d1-user-a@example.invalid'),
  ('10000000-0000-4000-8000-000000000102','aisencore-d1-user-b@example.invalid');
INSERT INTO public.products(id,product_key,name,status) VALUES
  ('20000000-0000-4000-8000-000000000101','d1_product_a','Synthetic Active Product','active'),
  ('20000000-0000-4000-8000-000000000102','d1_product_b','Synthetic Draft Product','draft');
INSERT INTO public.product_memberships(user_id,product_id,status) VALUES
  ('10000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000101','active'),
  ('10000000-0000-4000-8000-000000000102','20000000-0000-4000-8000-000000000101','left');

SELECT plan(10);

-- Anonymous identity: directory only, no membership data.
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.products), 1, 'anon sees only active product');
SELECT throws_ok('SELECT id FROM public.product_memberships', '42501');
RESET ROLE;

-- Signed-claim simulation: PostgreSQL sees only the selected subject.
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000101', true);
SET LOCAL ROLE authenticated;
SELECT is(auth.uid(), '10000000-0000-4000-8000-000000000101'::uuid, 'auth.uid resolves to synthetic user A');
SELECT is((SELECT count(*)::integer FROM public.product_memberships), 1, 'authenticated user A sees exactly own membership');
SELECT is((SELECT count(*)::integer FROM public.product_memberships WHERE user_id='10000000-0000-4000-8000-000000000102'), 0, 'authenticated user A cannot read user B membership');
SELECT throws_ok('UPDATE public.product_memberships SET status = ''left''', '42501');
SELECT throws_ok('SELECT user_id FROM public.platform_admins', '42501');
SELECT throws_ok('INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id) VALUES (auth.uid(),''forged'',''product'',gen_random_uuid())', '42501');
RESET ROLE;

-- Flipping the simulated auth claim changes the RLS visible record.
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000102', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.product_memberships WHERE user_id='10000000-0000-4000-8000-000000000102'), 1, 'authenticated user B sees own membership');
SELECT is((SELECT count(*)::integer FROM public.product_memberships WHERE user_id='10000000-0000-4000-8000-000000000101'), 0, 'authenticated user B cannot read user A membership');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
