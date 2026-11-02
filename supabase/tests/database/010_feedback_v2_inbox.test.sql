-- V4 inbox/workbench/archived, security and legacy-RPC retirement.
-- Synthetic SQL JWT context, not real GoTrue. Every row is rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email) VALUES
 ('19000000-0000-4000-8000-000000000001','fbv4-owner@example.invalid'),
 ('19000000-0000-4000-8000-000000000002','fbv4-outsider@example.invalid'),
 ('19000000-0000-4000-8000-000000000003','fbv4-admin@example.invalid');
INSERT INTO public.platform_admins(user_id,active)
 VALUES('19000000-0000-4000-8000-000000000003',true);
INSERT INTO public.products(id,product_key,name,status)
 VALUES('29000000-0000-4000-8000-000000000001','fbv4_test','FBV4','active');
INSERT INTO public.user_feedback(id,user_id,product_id,content,request_id)
VALUES ('39000000-0000-4000-8000-000000000001',
 '19000000-0000-4000-8000-000000000001',
 '29000000-0000-4000-8000-000000000001',
 'V4 isolated inbox','49000000-0000-4000-8000-000000000001');
INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility)
 VALUES('39000000-0000-4000-8000-000000000001',
 '19000000-0000-4000-8000-000000000001','created','public');

SELECT plan(30);
SELECT ok(to_regprocedure('public.admin_screen_feedback(uuid,integer,text,text)') IS NULL,
 'V2 screening endpoint is physically absent');
SELECT ok(to_regprocedure('public.admin_attention_feedback(uuid,integer,boolean,text[])') IS NULL,
 'V2 attention/tag edit endpoint is physically absent');
SELECT has_function('public','admin_mark_feedback_read',ARRAY['uuid','integer'],
 'V4 read marker has an independent endpoint');
SELECT has_function('public','admin_feedback_v3',
 ARRAY['uuid','integer','text','text','boolean','text'],
 'V4 keeps secured write entry with current actions');
SELECT ok(NOT has_function_privilege('anon',
 'public.admin_mark_feedback_read(uuid,integer)','EXECUTE'),
 'anonymous role cannot mark Admin inbox as read');
SELECT ok((SELECT queue_state='inbox' AND priority IS NULL
 FROM public.user_feedback WHERE id='39000000-0000-4000-8000-000000000001'),
 'new feedback is inbox with no admin-selected priority');
SELECT throws_ok($$UPDATE public.user_feedback SET queue_state='workbench',priority=NULL
 WHERE id='39000000-0000-4000-8000-000000000001'$$,'23514');

SELECT set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT is(public.my_feedback('fbv4_test')->0->>'status','received',
 'owner sees only received status');
SELECT throws_ok($$SELECT public.admin_mark_feedback_read(
 '39000000-0000-4000-8000-000000000001',1)$$,'PT403');
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '39000000-0000-4000-8000-000000000001',1,'save','high')$$,'PT403');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000003',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_mark_feedback_read(
 '39000000-0000-4000-8000-000000000001',1)$$,'PT403');
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '39000000-0000-4000-8000-000000000001',1,'triage','high')$$,'PT403');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '39000000-0000-4000-8000-000000000001',1,'archive')$$,'PT409');
SELECT is((public.admin_mark_feedback_read(
 '39000000-0000-4000-8000-000000000001',1)->>'version'),'1',
 'first read preserves version');
SELECT is(public.admin_mark_feedback_read('39000000-0000-4000-8000-000000000001',1)->>'changed','false','read is idempotent');
SELECT is((public.admin_mark_feedback_read(
 '39000000-0000-4000-8000-000000000001',1)->>'changed'),'false',
 'repeated read on matching version does not mutate');
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '39000000-0000-4000-8000-000000000001',1,'trash')$$,'PT422');
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '39000000-0000-4000-8000-000000000001',1,'restore')$$,'PT422');
SELECT ok(to_regprocedure('public.admin_feedback_v3(uuid,integer,text,text,text[],boolean,text)') IS NULL,'obsolete tag signature absent');
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '39000000-0000-4000-8000-000000000001',1,'triage')$$,'PT422');
SELECT is((public.admin_feedback_v3(
 '39000000-0000-4000-8000-000000000001',1,'save','high',true,
 'V4 private QA note')->>'version'),'2',
 'inbox saves priority/star/internal note');
SELECT ok((SELECT queue_state='inbox' AND priority='high' AND is_starred
 FROM public.user_feedback WHERE id='39000000-0000-4000-8000-000000000001'),
 'V4 does not resurrect old processing statuses or tags');
SELECT is((public.admin_feedback_v3(
 '39000000-0000-4000-8000-000000000001',2,'triage')->>'queue_state'),
 'workbench','triage promotes inbox to workbench');
SELECT is((public.admin_feedback_v3(
 '39000000-0000-4000-8000-000000000001',3,'archive')->>'queue_state'),
 'archived','only workbench can archive');
SELECT is((public.admin_feedback_v3(
 '39000000-0000-4000-8000-000000000001',4,'reopen')->>'queue_state'),
 'workbench','archived feedback can be reopened');
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '39000000-0000-4000-8000-000000000001',5,'restore')$$,'PT422');
SELECT is((SELECT count(*)::text FROM public.feedback_events
 WHERE feedback_id='39000000-0000-4000-8000-000000000001'
 AND event_type='triaged'),'1','one durable triage event');
SELECT is((SELECT count(*)::text FROM public.admin_audit_log
 WHERE target_type='feedback' AND target_id='39000000-0000-4000-8000-000000000001'
 AND action LIKE 'feedback.v4.%'),'4','four V4 mutations audited');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.my_feedback_events(
 '39000000-0000-4000-8000-000000000001')),1,
 'owner receives only public created event');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.my_feedback('fbv4_test')),0,
 'other user cannot see original feedback');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
