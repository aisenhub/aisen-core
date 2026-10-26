-- V3 Admin-only queue and preliminary tagging. Synthetic SQL JWT claims.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email) VALUES
 ('1a000000-0000-4000-8000-000000000001','fbv3-owner@example.invalid'),
 ('1a000000-0000-4000-8000-000000000002','fbv3-admin@example.invalid');
INSERT INTO public.platform_admins(user_id,active)
 VALUES('1a000000-0000-4000-8000-000000000002',true);
INSERT INTO public.products(id,product_key,name,status)
 VALUES('2a000000-0000-4000-8000-000000000001','fbv3_test','FBV3','active');
INSERT INTO public.user_feedback(id,user_id,product_id,content,request_id)
VALUES
 ('3a000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000001',
 '2a000000-0000-4000-8000-000000000001','v3 triage','4a000000-0000-4000-8000-000000000001'),
 ('3a000000-0000-4000-8000-000000000002','1a000000-0000-4000-8000-000000000001',
 '2a000000-0000-4000-8000-000000000001','v3 inbox trash','4a000000-0000-4000-8000-000000000002');
SELECT plan(25);
SELECT has_function('public','admin_feedback_v3',
 ARRAY['uuid','integer','text','text','text[]','boolean','text'],'V3 write RPC');
SELECT has_function('public','admin_feedback_tags',ARRAY['uuid'],'Admin tag catalog RPC');
SELECT ok(NOT has_function_privilege('anon',
 'public.admin_feedback_v3(uuid,integer,text,text,text[],boolean,text)','EXECUTE'),
 'anonymous client cannot execute admin mutations');
SELECT is((SELECT proowner::regrole::text FROM pg_proc
 WHERE oid='private.admin_feedback_v3_core(uuid,integer,text,text,text[],boolean,text)'::regprocedure),
 'aisencore_rpc_executor','new private RPC uses least-privilege owner');
SELECT set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',1,'save','high')$$,'PT403');
SELECT throws_ok($$SELECT public.admin_feedback_tags(NULL)$$,'PT403');
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
SELECT is((public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',1,'save','high',
 ARRAY['登录','体验'],true,'初步判断')->>'version'),'2',
 'Inbox can save priority, tags, star and one private note');
SELECT ok((SELECT queue_state='inbox' AND priority='high' AND is_starred
  AND tags=ARRAY['登录','体验']::text[] AND status IS NULL
  AND last_handled_by='1a000000-0000-4000-8000-000000000002'::uuid
  FROM public.user_feedback WHERE id='3a000000-0000-4000-8000-000000000001'),
 'Inbox prefills are persisted without five-state workflow');
SELECT is((SELECT count(*)::text FROM public.feedback_events
 WHERE feedback_id='3a000000-0000-4000-8000-000000000001'
 AND event_type='internal_note'),'1','Inbox note is appended once');
SELECT ok('体验'=ANY(public.admin_feedback_tags(NULL)),'Tag catalog includes persisted labels');
SELECT is((public.admin_feedback_tags('2a000000-0000-4000-8000-000000000001'))[2],
 '登录','Product-scoped tags are sorted and complete');
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',1,'triage')$$,'PT409');
SELECT is((public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',2,'triage')->>'queue_state'),
 'workbench','Triage transfers all previously saved markers');
SELECT ok((SELECT priority='high' AND is_starred AND tags=ARRAY['登录','体验']::text[]
 FROM public.user_feedback WHERE id='3a000000-0000-4000-8000-000000000001'),
 'Triage retains all prefilled attributes');
SELECT is((public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',3,'archive')->>'queue_state'),
 'archived','Only workbench archives');
SELECT is((public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',4,'reopen')->>'queue_state'),
 'workbench','Archive can be reopened into workbench');
SELECT is((public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',5,'trash')->>'queue_state'),
 'trashed','Workbench can be deleted');
SELECT is((SELECT deleted_from FROM public.user_feedback
 WHERE id='3a000000-0000-4000-8000-000000000001'),
 'workbench','Trash retains original workbench location');
SELECT is((public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',6,'restore')->>'queue_state'),
 'workbench','Deleted workbench item restores to workbench');
SELECT is((public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000002',1,'trash')->>'queue_state'),
 'trashed','Inbox can be deleted');
SELECT is((public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000002',2,'restore')->>'queue_state'),
 'inbox','Deleted inbox item restores to inbox');
SELECT throws_ok($$SELECT public.admin_feedback_v3(
 '3a000000-0000-4000-8000-000000000001',7,'save',NULL,
 ARRAY['重复','重复'])$$,'PT422');
SELECT is((SELECT count(*)::text FROM public.admin_audit_log
 WHERE target_id='3a000000-0000-4000-8000-000000000001'
 AND action LIKE 'feedback.v3.%'),'6','All six mutations are audited');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
