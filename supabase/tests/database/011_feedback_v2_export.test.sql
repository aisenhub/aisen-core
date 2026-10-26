-- FB-V2 isolated admin ZIP audit authorization, SQL role/JWT simulation.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email) VALUES
 ('1a000000-0000-4000-8000-000000000001','fbv2-export-normal@example.invalid'),
 ('1a000000-0000-4000-8000-000000000002','fbv2-export-admin@example.invalid');
INSERT INTO public.platform_admins(user_id,active)
 VALUES('1a000000-0000-4000-8000-000000000002',true);
SELECT plan(8);
SELECT has_function('public','admin_log_feedback_export',
 ARRAY['integer','text','boolean','boolean'],'ZIP audit RPC exists');
SELECT ok(NOT has_function_privilege('anon',
 'public.admin_log_feedback_export(integer,text,boolean,boolean)','EXECUTE'),
 'anonymous cannot call export authorization');
SELECT set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_log_feedback_export(1,'selected',false,false)$$,'PT403');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_log_feedback_export(1,'selected',false,false)$$,'PT403');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT is((public.admin_log_feedback_export(1,'selected',false,false)->>'authorized'),
 'true','current AAL2 admin can audit prepared ZIP');
SELECT is((SELECT count(*)::text FROM public.admin_audit_log
 WHERE action='feedback.export_prepared'
 AND actor_user_id='1a000000-0000-4000-8000-000000000002'),
 '1','export creates a single minimal admin audit record');
SELECT throws_ok($$SELECT public.admin_log_feedback_export(21,'selected',false,false)$$,
 'PT422','INVALID_ARGUMENT','export count strictly capped');
SELECT throws_ok($$SELECT public.admin_log_feedback_export(1,'all',false,false)$$,
 'PT422','INVALID_ARGUMENT','export scope validated');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
