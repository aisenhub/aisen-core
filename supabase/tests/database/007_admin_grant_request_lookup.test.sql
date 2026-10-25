-- B1 protected request lookup: SQL/JWT simulation, rollback all test state.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email) VALUES
 ('16000000-0000-4000-8000-000000000001','b1-a@example.invalid'),
 ('16000000-0000-4000-8000-000000000002','b1-b@example.invalid'),
 ('16000000-0000-4000-8000-000000000003','b1-target@example.invalid'),
 ('16000000-0000-4000-8000-000000000004','b1-ordinary@example.invalid');
INSERT INTO public.platform_admins(user_id,active) VALUES
 ('16000000-0000-4000-8000-000000000001',true),
 ('16000000-0000-4000-8000-000000000002',true);
INSERT INTO public.products(id,product_key,name,status) VALUES
 ('26000000-0000-4000-8000-000000000001','b1_lookup_test','B1 lookup','active');
INSERT INTO public.entitlement_grants(
 user_id,product_id,source_type,source_ref,grant_mode,requested_duration_days,
 starts_at,ends_at,created_by,grant_reason)
VALUES (
 '16000000-0000-4000-8000-000000000003','26000000-0000-4000-8000-000000000001',
 'admin','admin:16000000-0000-4000-8000-000000000001:original-b1',
 'duration',30,transaction_timestamp(),transaction_timestamp()+interval '30 days',
 '16000000-0000-4000-8000-000000000001','B1 initial operation');
SELECT plan(19);
SELECT has_function('public','admin_find_grant_request',ARRAY['text'],'bounded request lookup exists');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.admin_find_grant_request(text)'::regprocedure),'public invoker');
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid='private.admin_find_grant_request_core(text)'::regprocedure),'private definer');
SELECT is((SELECT proowner::regrole::text FROM pg_proc WHERE oid='private.admin_find_grant_request_core(text)'::regprocedure),'aisencore_rpc_executor','non-login owner');
SELECT ok(NOT has_function_privilege('anon','public.admin_find_grant_request(text)','EXECUTE'),'anonymous public denied');
SELECT ok(NOT has_function_privilege('anon','private.admin_find_grant_request_core(text)','EXECUTE'),'anonymous private denied');
SELECT ok(NOT has_column_privilege('authenticated','public.entitlement_grants','source_ref','SELECT'),'direct source ref hidden');
SELECT ok(NOT has_schema_privilege('aisencore_rpc_executor','private','CREATE'),'private CREATE revoked');

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.admin_find_grant_request('original-b1')$$,'42501');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000004',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_find_grant_request('original-b1')$$,'PT403');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_find_grant_request('original-b1')$$,'PT403');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT is((public.admin_find_grant_request('absent-b1')->>'found'),'false','absent request explicit');
SELECT is((public.admin_find_grant_request('original-b1')->>'found'),'true','original committed');
SELECT is((public.admin_find_grant_request('original-b1')->>'target_user_id'),'16000000-0000-4000-8000-000000000003','correct target');
SELECT is((public.admin_find_grant_request('original-b1')->>'duration_days'),'30','original duration');
SELECT ok(NOT public.admin_find_grant_request('original-b1') ? 'source_ref','source key not returned');
SELECT throws_ok($$SELECT public.admin_find_grant_request('   ')$$,'PT422');
SELECT throws_ok($$SELECT public.admin_find_grant_request(repeat('x',129))$$,'PT422');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT is((public.admin_find_grant_request('original-b1')->>'found'),'false','other admin sees no foreign actor request');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
