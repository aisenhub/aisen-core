-- D2-M2 DEC-06 synthetic SQL identity tests; NOT signed JWT/HTTP.
-- These assertions roll back all seeded identity and admin state.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email,created_at,raw_user_meta_data) VALUES
 ('15000000-0000-4000-8000-000000000001','m2-admin@example.invalid',transaction_timestamp()-interval '6 days','{"private":"must-not-leak"}'),
 ('15000000-0000-4000-8000-000000000002','m2-user-a@example.invalid',transaction_timestamp()-interval '5 days','{"secret":"alpha"}'),
 ('15000000-0000-4000-8000-000000000003','m2-user-b@example.invalid',transaction_timestamp()-interval '4 days','{"secret":"beta"}'),
 ('15000000-0000-4000-8000-000000000004','m2-user-c@example.invalid',transaction_timestamp()-interval '3 days','{"secret":"gamma"}'),
 ('15000000-0000-4000-8000-000000000005','m2-other@example.invalid',transaction_timestamp()-interval '2 days','{"secret":"delta"}');
INSERT INTO public.platform_admins(user_id,active) VALUES
 ('15000000-0000-4000-8000-000000000001',true);

SELECT plan(47);
SELECT has_function('public','admin_lookup_users',
  ARRAY['uuid[]','text','integer','integer'],'bounded admin lookup exists');
SELECT hasnt_function('public','admin_lookup_users',ARRAY[]::text[],'no unscoped zero-argument signature');
SELECT ok((SELECT prosecdef = false FROM pg_proc WHERE oid =
  'public.admin_lookup_users(uuid[],text,integer,integer)'::regprocedure),
  'public boundary is invoker');
SELECT ok((SELECT prosecdef = true FROM pg_proc WHERE oid =
  'private.admin_lookup_users_core(uuid[],text,integer,integer)'::regprocedure),
  'private kernel is definer');
SELECT ok((SELECT rolcanlogin=false AND rolbypassrls=false FROM pg_roles
  WHERE rolname='aisencore_rpc_executor'),'executor has no LOGIN/BYPASSRLS');
SELECT ok(NOT has_function_privilege('anon','public.admin_lookup_users(uuid[],text,integer,integer)','EXECUTE'),
  'anon cannot invoke public lookup');
SELECT ok(NOT has_function_privilege('anon','private.admin_lookup_users_core(uuid[],text,integer,integer)','EXECUTE'),
  'anon cannot invoke private lookup');
SELECT ok(NOT has_table_privilege('authenticated','auth.users','SELECT'),
  'authenticated has no auth.users table SELECT');
SELECT ok(NOT has_column_privilege('authenticated','auth.users','email','SELECT'),
  'authenticated has no auth.users email SELECT');
SELECT ok(NOT has_column_privilege('authenticated','auth.users','encrypted_password','SELECT'),
  'authenticated cannot read password hash');
SELECT ok(has_column_privilege('aisencore_rpc_executor','auth.users','email','SELECT'),
  'trusted owner can read only allowed columns');
SELECT ok(NOT has_column_privilege('aisencore_rpc_executor','auth.users','encrypted_password','SELECT'),
  'trusted owner cannot read hashed passwords');
SELECT ok(NOT has_column_privilege('aisencore_rpc_executor','auth.users','raw_user_meta_data','SELECT'),
  'trusted owner cannot read metadata');
SELECT ok(NOT has_column_privilege('aisencore_rpc_executor','auth.users','confirmation_token','SELECT'),
  'trusted owner cannot read auth tokens');
SELECT ok((SELECT count(*)::integer FROM pg_policies WHERE schemaname='auth'
  AND tablename='users' AND policyname='aisencore_admin_reader_select'
  AND cmd='SELECT' AND roles::text LIKE '%aisencore_rpc_executor%')=1,
  'auth.users has a narrowly targeted reader policy');

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.admin_lookup_users(ARRAY['15000000-0000-4000-8000-000000000002'::uuid])$$,'42501');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_lookup_users(ARRAY['15000000-0000-4000-8000-000000000003'::uuid])$$,'PT403');
SELECT throws_ok($$SELECT private.admin_lookup_users_core(ARRAY['15000000-0000-4000-8000-000000000003'::uuid])$$,'PT403');
SELECT throws_ok('SELECT email FROM auth.users LIMIT 1','42501');
RESET ROLE;

-- A listed admin without actual SQL aal2 has no lookup ability.
SELECT set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_lookup_users(ARRAY['15000000-0000-4000-8000-000000000002'::uuid])$$,'PT403');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT is((public.admin_lookup_users(
  ARRAY['15000000-0000-4000-8000-000000000002'::uuid])->>'total'),'1',
  'qualified admin can look up a single UUID');
SELECT is((public.admin_lookup_users(
  ARRAY['15000000-0000-4000-8000-000000000002'::uuid])->'items'->0->>'email'),
  'm2-user-a@example.invalid','UUID match returns precise email');
SELECT is((public.admin_lookup_users(
  NULL,' M2-USER-B@EXAMPLE.INVALID ')->'items'->0->>'email'),
  'm2-user-b@example.invalid','case-insensitive exact email match');
SELECT is((public.admin_lookup_users(NULL,'not-matched@example.invalid')->>'total'),
  '0','unknown exact email does not enumerate other users');
SELECT is((public.admin_lookup_users(
 ARRAY['15000000-0000-4000-8000-000000000002'::uuid,
       '15000000-0000-4000-8000-000000000003'::uuid,
       '15000000-0000-4000-8000-000000000004'::uuid],NULL,1,2)->>'total'),
  '3','three UUIDs find three users');
SELECT is((public.admin_lookup_users(
 ARRAY['15000000-0000-4000-8000-000000000002'::uuid,
       '15000000-0000-4000-8000-000000000003'::uuid,
       '15000000-0000-4000-8000-000000000004'::uuid],NULL,1,2)->>'has_more'),
  'true','first page has more');
SELECT is(pg_catalog.jsonb_array_length(public.admin_lookup_users(
 ARRAY['15000000-0000-4000-8000-000000000002'::uuid,
       '15000000-0000-4000-8000-000000000003'::uuid,
       '15000000-0000-4000-8000-000000000004'::uuid],NULL,2,2)->'items'),
  1,'second page has one result');
SELECT is((public.admin_lookup_users(
 ARRAY['15000000-0000-4000-8000-000000000002'::uuid,
       '15000000-0000-4000-8000-000000000003'::uuid,
       '15000000-0000-4000-8000-000000000004'::uuid],
 'm2-user-b@example.invalid')->>'total'),'1','UUID filter intersects email');
SELECT is((public.admin_lookup_users(
 ARRAY['15000000-0000-4000-8000-000000000002'::uuid],
 'm2-user-c@example.invalid')->>'total'),'0','intersection cannot return nonmatching user');
SELECT is((public.admin_lookup_users(
 ARRAY['15000000-0000-4000-8000-000000000002'::uuid])->>'search_incomplete'),
 'false','finite SQL result marked complete');
SELECT is((SELECT count(*)::integer
  FROM pg_catalog.jsonb_object_keys(public.admin_lookup_users(
    ARRAY['15000000-0000-4000-8000-000000000002'::uuid])->'items'->0) AS k),5,
  'projection contains exactly five allowed keys');
SELECT ok(
 (public.admin_lookup_users(ARRAY['15000000-0000-4000-8000-000000000002'::uuid])
  ->'items'->0) ?& ARRAY['id','email','created_at','email_confirmed_at','last_sign_in_at'],
 'all five expected fields are present');
SELECT ok(NOT (
 (public.admin_lookup_users(ARRAY['15000000-0000-4000-8000-000000000002'::uuid])
  ->'items'->0) ?| ARRAY['encrypted_password','confirmation_token','recovery_token','raw_user_meta_data','raw_app_meta_data','is_super_admin']),
 'neither secrets nor extra auth fields returned');
SELECT throws_ok($$SELECT public.admin_lookup_users()$$,'PT422');
SELECT throws_ok($$SELECT public.admin_lookup_users(ARRAY[]::uuid[])$$,'PT422');
SELECT throws_ok($$SELECT public.admin_lookup_users(ARRAY[NULL::uuid])$$,'PT422');
SELECT throws_ok($$SELECT public.admin_lookup_users(
  pg_catalog.array_fill('15000000-0000-4000-8000-000000000002'::uuid,ARRAY[101]))$$,'PT422');
SELECT throws_ok($$SELECT public.admin_lookup_users(NULL,'    ')$$,'PT422');
SELECT throws_ok($$SELECT public.admin_lookup_users(NULL,'x')$$,'PT422');
SELECT throws_ok($$SELECT public.admin_lookup_users(NULL,'test@example.invalid',0,50)$$,'PT422');
SELECT throws_ok($$SELECT public.admin_lookup_users(NULL,'test@example.invalid',1,0)$$,'PT422');
SELECT throws_ok($$SELECT public.admin_lookup_users(NULL,'test@example.invalid',1,101)$$,'PT422');
SELECT throws_ok($$SELECT public.admin_lookup_users(NULL,'test@example.invalid',1001,100)$$,'PT422');
RESET ROLE;

-- A newly blocked admin loses lookup immediately despite identical AAL2.
INSERT INTO public.platform_account_restrictions(user_id,kind,reason_code,created_by)
 VALUES('15000000-0000-4000-8000-000000000001','blocked','test','15000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_lookup_users(NULL,'m2-user-a@example.invalid')$$,'PT403');
RESET ROLE;
DELETE FROM public.platform_account_restrictions
 WHERE user_id='15000000-0000-4000-8000-000000000001';
UPDATE public.platform_admins SET active=false
 WHERE user_id='15000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_lookup_users(NULL,'m2-user-a@example.invalid')$$,'PT403');
RESET ROLE;

SELECT is((SELECT count(*)::integer FROM public.admin_audit_log
 WHERE target_type='user' AND target_id='15000000-0000-4000-8000-000000000002'),0,
 'read-only lookup did not create audits');
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id::text LIKE '15000000-%'),5,
 'read-only lookup did not change Auth user rows');

SELECT * FROM finish();
ROLLBACK;
