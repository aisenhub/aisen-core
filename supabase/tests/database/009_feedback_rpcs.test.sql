-- FB-01B/C: transaction, authorization and privacy tests. Synthetic SQL claims,
-- not equivalent to signed GoTrue JWT/HTTP/Edge tests.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email) VALUES
 ('18000000-0000-4000-8000-000000000001','fb2-user-a@example.invalid'),
 ('18000000-0000-4000-8000-000000000002','fb2-user-b@example.invalid'),
 ('18000000-0000-4000-8000-000000000003','fb2-admin@example.invalid');
INSERT INTO public.platform_admins(user_id,active)
 VALUES('18000000-0000-4000-8000-000000000003',true);
INSERT INTO public.products(id,product_key,name,status)
 VALUES('28000000-0000-4000-8000-000000000001','fb2_product','FB2 product','active');

SELECT plan(60);
SELECT has_view('public','admin_feedback_summaries','AAL2 feedback summary is a view');
SELECT ok((SELECT c.reloptions @> ARRAY['security_invoker=true']
   FROM pg_class c WHERE c.oid='public.admin_feedback_summaries'::regclass),
  'Admin summary uses invoker RLS instead of definer bypass');
SELECT has_function('public','my_feedback',ARRAY['text','uuid'],'scoped self feedback list present');
SELECT has_function('public','my_feedback_events',ARRAY['uuid'],'public event list present');
SELECT has_function('public','reply_to_feedback',ARRAY['uuid','text','integer'],'self reply present');
SELECT has_function('public','admin_update_feedback',
  ARRAY['uuid','integer','text','text','text','text'],'admin write present');
SELECT has_function('public','feedback_submit_from_edge',
  ARRAY['uuid','text','uuid','text','text','jsonb'],'Edge commit present');
SELECT ok(NOT has_function_privilege('authenticated',
 'public.feedback_submit_from_edge(uuid,text,uuid,text,text,jsonb)','EXECUTE'),
 'authenticated cannot forge attachment keys');
SELECT ok(has_function_privilege('service_role',
 'public.feedback_submit_from_edge(uuid,text,uuid,text,text,jsonb)','EXECUTE'),
 'only service role can commit uploaded files');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc
  WHERE oid='public.admin_update_feedback(uuid,integer,text,text,text,text)'::regprocedure),
 'public Admin wrapper invoker');
SELECT is((SELECT proowner::regrole::text FROM pg_proc
  WHERE oid='private.admin_update_feedback_core(uuid,integer,text,text,text,text)'::regprocedure),
 'aisencore_rpc_executor','private core owned by NOLOGIN least-privilege role');

SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.feedback_submit_from_edge(
 '18000000-0000-4000-8000-000000000001','fb2_product',
 '48000000-0000-4000-8000-000000000001','hello','bug','[]'::jsonb)$$,'42501');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT is((public.feedback_submit_from_edge(
 '18000000-0000-4000-8000-000000000001','fb2_product',
 '48000000-0000-4000-8000-000000000001','hello','bug','[]'::jsonb)->>'status'),
 'received','Edge-created feedback starts in inbox');
SELECT is((public.feedback_submit_from_edge(
 '18000000-0000-4000-8000-000000000001','fb2_product',
 '48000000-0000-4000-8000-000000000001','hello','bug','[]'::jsonb)->>'replayed'),
 'true','same request is idempotent');
SELECT throws_ok($$SELECT public.feedback_submit_from_edge(
 '18000000-0000-4000-8000-000000000001','fb2_product',
 '48000000-0000-4000-8000-000000000001','changed','bug','[]'::jsonb)$$,'PT409');
SELECT throws_ok($$SELECT public.feedback_submit_from_edge(
 '18000000-0000-4000-8000-000000000001','absent_product',
 gen_random_uuid(),'hello','bug','[]'::jsonb)$$,'PT409');
SELECT throws_ok($$SELECT public.feedback_submit_from_edge(
 '18000000-0000-4000-8000-000000000001','fb2_product',
 gen_random_uuid(),'   ','bug','[]'::jsonb)$$,'PT422');
SELECT is((public.feedback_submit_from_edge(
 '18000000-0000-4000-8000-000000000002','fb2_product',
 '48000000-0000-4000-8000-000000000002','images','other',
 '[{"slot":1,"object_key":"feedback/28000000-0000-4000-8000-000000000001/18000000-0000-4000-8000-000000000002/48000000-0000-4000-8000-000000000002/1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png","mime_type":"image/png","size_bytes":123},{"slot":2,"object_key":"feedback/28000000-0000-4000-8000-000000000001/18000000-0000-4000-8000-000000000002/48000000-0000-4000-8000-000000000002/2-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp","mime_type":"image/webp","size_bytes":456}]'::jsonb)->>'status'),
 'received','two-image Edge commit stays untriaged');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','18000000-0000-4000-8000-000000000001',true);
CREATE TEMP TABLE fb_test_refs AS SELECT id FROM public.user_feedback
 WHERE request_id='48000000-0000-4000-8000-000000000001';
-- Legacy processing-RPC regression fixture: simulate an already-triaged item.
-- V2's new screening operation is independently covered in 010 tests.
UPDATE public.user_feedback SET queue_state='workbench',priority='normal',
 status='new',triaged_at=transaction_timestamp()
 WHERE id=(SELECT id FROM pg_temp.fb_test_refs);
GRANT SELECT ON pg_temp.fb_test_refs TO authenticated;

SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.my_feedback('fb2_product')),1,'owner may list only own feedback');
SELECT is(public.my_feedback('fb2_product')->0->>'version','1',
  'self feedback DTO includes optimistic reply version');
SELECT is((SELECT count(*)::integer FROM public.admin_feedback_summaries),0,
  'AAL1 ordinary user cannot enumerate Admin feedback summary');
SELECT is(jsonb_array_length(public.my_feedback_events(
 (SELECT id FROM pg_temp.fb_test_refs))),1,'owner can read public created event');
SELECT throws_ok($$SELECT public.admin_update_feedback(
 (SELECT id FROM pg_temp.fb_test_refs),1,'in_progress')$$,'PT403');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','18000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.my_feedback('fb2_product')),1,'different user sees only their own image feedback');
SELECT is(jsonb_array_length(public.my_feedback('fb2_product')->0->'attachments'),2,
  'self DTO contains two attachment IDs without storage keys');
SELECT ok(public.my_feedback('fb2_product')->0->'attachments'->0 ? 'id',
  'self DTO supplies attachment identifier for signed GET');
SELECT ok(NOT (public.my_feedback('fb2_product')->0->'attachments'->0 ? 'object_key'),
  'self DTO does not leak a storage object key');
SELECT throws_ok($$SELECT public.my_feedback_events(
 (SELECT id FROM pg_temp.fb_test_refs))$$,'PT403');
SELECT throws_ok($$SELECT public.reply_to_feedback(
 (SELECT id FROM pg_temp.fb_test_refs),'intrusion',1)$$,'PT403');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','18000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_update_feedback(
 (SELECT id FROM pg_temp.fb_test_refs),1,'in_progress')$$,'PT403');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.feedback_attachments
 WHERE feedback_id=(SELECT id FROM public.user_feedback WHERE
 request_id='48000000-0000-4000-8000-000000000002')),2,
 'two R2 metadata rows committed atomically');
SELECT is((SELECT attachment_count FROM public.admin_feedback_summaries
 WHERE user_id='18000000-0000-4000-8000-000000000002'),2,
 'Admin summary exposes server-calculated attachment count under Admin RLS');

SELECT is((public.admin_update_feedback(
 (SELECT id FROM pg_temp.fb_test_refs),1,'in_progress') ->> 'version'),
 '2','eligible AAL2 Admin may accept');
SELECT throws_ok($$SELECT public.admin_update_feedback(
 (SELECT id FROM pg_temp.fb_test_refs),1,'resolved',
 NULL,NULL,'done')$$,'PT409');
SELECT throws_ok($$SELECT public.admin_update_feedback(
 (SELECT id FROM pg_temp.fb_test_refs),2,'waiting_user')$$,'PT422');
SELECT is((public.admin_update_feedback(
 (SELECT id FROM pg_temp.fb_test_refs),2,'waiting_user',
 NULL,NULL,'Please send steps') ->>'status'),
 'waiting_user','waiting_user requires published question');
SELECT is((SELECT count(*)::text FROM public.admin_audit_log
 WHERE target_type='feedback' AND target_id=(SELECT id FROM pg_temp.fb_test_refs)),
 '2','two Admin changes yield two safe audit rows on this feedback');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','18000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT is((public.reply_to_feedback(
 (SELECT id FROM pg_temp.fb_test_refs),'repro steps',3)->>'status'),
 'in_progress','user reply reopens waiting_user');
SELECT is(jsonb_array_length(public.my_feedback_events(
 (SELECT id FROM pg_temp.fb_test_refs))),3,'owner gets only public events (created, question, reply)');
RESET ROLE;

SELECT has_function('public','admin_assign_feedback',ARRAY['uuid','integer','uuid'],
  'Admin assignment RPC exists');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_assign_feedback(
 (SELECT id FROM pg_temp.fb_test_refs),4,
 '18000000-0000-4000-8000-000000000003')$$,'PT403');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','18000000-0000-4000-8000-000000000003',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT is((public.admin_assign_feedback(
 (SELECT id FROM pg_temp.fb_test_refs),4,
 '18000000-0000-4000-8000-000000000003')->>'version'),
 '5','Admin can assign to a current eligible administrator');
SELECT throws_ok($$SELECT public.admin_assign_feedback(
 (SELECT id FROM pg_temp.fb_test_refs),5,
 '18000000-0000-4000-8000-000000000002')$$,
 'PT422','ASSIGNEE_NOT_ELIGIBLE','cannot assign to ordinary user');
SELECT is((public.admin_assign_feedback(
 (SELECT id FROM pg_temp.fb_test_refs),5,
 '18000000-0000-4000-8000-000000000003')->>'changed'),
 'false','same assignment remains idempotent');
SELECT is((public.admin_assign_feedback(
 (SELECT id FROM pg_temp.fb_test_refs),5,NULL)->>'version'),
 '6','Admin can unassign with optimistic concurrency');
SELECT is((SELECT count(*)::text FROM public.feedback_events
 WHERE feedback_id=(SELECT id FROM pg_temp.fb_test_refs) AND event_type='assigned'),
 '2','two assignment changes append only two internal events');
RESET ROLE;
SELECT has_function('public','feedback_submit_preflight',ARRAY['text','uuid'],
  'submission preflight is available');
SELECT ok(has_function_privilege('authenticated','public.feedback_submit_preflight(text,uuid)','EXECUTE'),
  'authenticated callers can perform bounded, permission-checked preflight');
SELECT set_config('request.jwt.claim.sub','18000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT is(public.feedback_submit_preflight('fb2_product')->>'allowed','true',
  'preflight allows under-quota verified identity');
SELECT is(public.feedback_submit_preflight('fb2_product')->>'product_id',
 '28000000-0000-4000-8000-000000000001',
 'narrow preflight returns verified product UUID to Edge without table SELECT');
SELECT ok(NOT has_table_privilege('authenticated','public.products','SELECT'),
 'feedback integration does not grant broad product table access');
RESET ROLE;
-- Seed four more historical-looking synthetic reports. The earlier feedback
-- from user A makes five; the database itself must enforce the sixth denial.
INSERT INTO public.user_feedback(user_id,product_id,content,category,request_id)
 SELECT '18000000-0000-4000-8000-000000000001'::uuid,
 '28000000-0000-4000-8000-000000000001'::uuid,
 'local rate check','other',gen_random_uuid()
 FROM generate_series(1,4);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.feedback_submit_preflight('fb2_product')$$,
  'PT429','FEEDBACK_RATE_LIMITED','rate preflight blocks excess new reports');
SELECT is(public.feedback_submit_preflight('fb2_product',
 '48000000-0000-4000-8000-000000000001')->>'allowed','true',
 'matching request ID skips rate quota during safe replay');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.feedback_submit_from_edge(
 '18000000-0000-4000-8000-000000000001','fb2_product',
 gen_random_uuid(),'limit exceeded','other','[]'::jsonb)$$,
 'PT429','FEEDBACK_RATE_LIMITED','locked DB submission cannot bypass preflight');
SELECT is((public.feedback_submit_from_edge(
 '18000000-0000-4000-8000-000000000001','fb2_product',
 '48000000-0000-4000-8000-000000000001','hello','bug','[]'::jsonb)->>'replayed'),
 'true','successful original request may be safely replayed even at quota');
RESET ROLE;
-- Reference-aware orphan janitor is service-only and cannot be called with
-- browser JWTs. A fake object without DB row must NOT appear referenced.
SELECT ok(NOT has_function_privilege('authenticated',
 'public.feedback_referenced_keys(text[])','EXECUTE'),
 'ordinary user cannot inspect all feedback R2 object references');
SELECT ok(has_function_privilege('service_role',
 'public.feedback_referenced_keys(text[])','EXECUTE'),
 'trusted janitor can check at most 100 keys without direct table SELECT');
SELECT set_config('fb_test.existing_r2_key',
 (SELECT object_key FROM public.feedback_attachments
  WHERE feedback_id IN (SELECT id FROM public.user_feedback
    WHERE request_id='48000000-0000-4000-8000-000000000002')
  AND slot=1),true);
SET LOCAL ROLE service_role;
SELECT is(jsonb_array_length(public.feedback_referenced_keys(
 ARRAY[current_setting('fb_test.existing_r2_key')])),1,
 'janitor sees a live attachment key as referenced');
SELECT is(jsonb_array_length(public.feedback_referenced_keys(
 ARRAY['feedback/no-live-object-20261025'])),0,
 'janitor detects an unreferenced candidate without granting table read');
SELECT throws_ok($$SELECT public.feedback_referenced_keys(ARRAY['bogus'])$$,
 'PT422','INVALID_KEYS','janitor rejects any key outside feedback prefix');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;