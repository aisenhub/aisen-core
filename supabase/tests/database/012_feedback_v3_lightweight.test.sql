-- V4 workflow and retired V3-only tag/soft-delete mutation contract.
-- Synthetic AAL claim simulation; true JWT/Edge acceptance is separate.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email) VALUES
 ('1a000000-0000-4000-8000-000000000001','fbv4-owner@example.invalid'),
 ('1a000000-0000-4000-8000-000000000002','fbv4-admin@example.invalid');
INSERT INTO public.platform_admins(user_id,active)
 VALUES('1a000000-0000-4000-8000-000000000002',true);
INSERT INTO public.products(id,product_key,name,status)
 VALUES('2a000000-0000-4000-8000-000000000001','fbv4_test','FBV4','active');
INSERT INTO public.user_feedback(id,user_id,product_id,content,request_id)
VALUES
 ('3a000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000001',
 '2a000000-0000-4000-8000-000000000001','v4 triage','4a000000-0000-4000-8000-000000000001'),
 ('3a000000-0000-4000-8000-000000000002','1a000000-0000-4000-8000-000000000001',
 '2a000000-0000-4000-8000-000000000001','v4 second inbox','4a000000-0000-4000-8000-000000000002');
SELECT plan(28);
SELECT has_function('public','admin_feedback_v3',
 ARRAY['uuid','integer','text','text','boolean','text'],
 'V4 secured core currently exposed under existing function name');
SELECT ok(to_regprocedure('public.admin_feedback_tags(uuid)') IS NULL,
 'admin tag catalog retired');
SELECT ok(to_regprocedure('public.admin_attention_feedback(uuid,integer,boolean,text[])') IS NULL,
 'V2 star/tag mutation retired');
SELECT ok(NOT has_function_privilege('anon',
 'public.admin_feedback_v3(uuid,integer,text,text,boolean,text)','EXECUTE'),
 'anonymous client cannot execute admin mutations');
SELECT is((SELECT proowner::regrole::text FROM pg_proc
 WHERE oid='private.admin_feedback_v3_core(uuid,integer,text,text,boolean,text)'::regprocedure),
 'aisencore_rpc_executor','private protected core uses least privilege');

SELECT set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',1,'save','high')$$,'PT403');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',1,'save','high')$$,'PT403');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',1,'archive')$$,'PT409');
SELECT ok(to_regprocedure('public.admin_feedback_v3(uuid,integer,text,text,text[],boolean,text)') IS NULL,'obsolete tag signature absent');
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',1,'trash')$$,'PT422');
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',1,'restore')$$,'PT422');
SELECT is((public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',1,'save','high',
 true,'V4 private note')->>'version'),'2',
 'Inbox saves priority, star and internal note without tags');
SELECT ok((SELECT queue_state='inbox' AND priority='high' AND is_starred

 AND last_handled_by='1a000000-0000-4000-8000-000000000002'::uuid
 FROM public.user_feedback WHERE id='3a000000-0000-4000-8000-000000000001'),
 'Inbox prefill respects V4 three-queue and no-tags contract');
SELECT is((SELECT count(*)::text FROM public.feedback_events
 WHERE feedback_id='3a000000-0000-4000-8000-000000000001'
 AND event_type='internal_note'),'1','private note event appended once');
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',1,'triage')$$,'PT409');
SELECT is((public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',2,'triage')->>'queue_state'),
 'workbench','Triage transfers current priority/star');
SELECT ok((SELECT priority='high' AND is_starred
 FROM public.user_feedback WHERE id='3a000000-0000-4000-8000-000000000001'),
 'Triage retains only approved prefilled attributes');
SELECT is((public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',3,'archive')->>'queue_state'),
 'archived','Only workbench archives');
SELECT is((public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',4,'reopen')->>'queue_state'),
 'workbench','Archive reopens to workbench');
SELECT is((public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',5,'save')->>'changed'),'false',
 'unchanged write must not add a new audit or version');

SELECT is((public.admin_mark_feedback_read(
 '3a000000-0000-4000-8000-000000000002',1)->>'version'),'1',
 'second inbox independently marks read');
SELECT is((public.admin_mark_feedback_read(
 '3a000000-0000-4000-8000-000000000002',1)->>'changed'),'false',
 'second inbox repeated read is idempotent');
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000002',1,'triage')$$,'PT422');
SELECT is((public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000002',1,'save','normal')->>'version'),
 '2','second inbox may set valid normal priority');
SELECT is((public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000002',2,'triage')->>'version'),
 '3','second inbox moves to workbench after approved priority');
SELECT is((SELECT count(*)::text FROM public.user_feedback
 WHERE product_id='2a000000-0000-4000-8000-000000000001'
 AND queue_state='trashed'),'0','V4 cannot produce legacy trashed records');
SELECT is((SELECT count(*)::text FROM public.admin_audit_log
 WHERE target_id='3a000000-0000-4000-8000-000000000001'
 AND action LIKE 'feedback.v4.%'),'4','four first-feedback mutations audited');
SELECT is((SELECT count(*)::text FROM public.admin_audit_log
 WHERE target_id='3a000000-0000-4000-8000-000000000002'
 AND action LIKE 'feedback.v4.%'),'2','two second-feedback mutations audited');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
