-- FB-V2: inbox -> triage -> workbench, archive/recover, soft delete,
-- private attention and original-owner isolation. SQL claim simulation only.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email) VALUES
 ('19000000-0000-4000-8000-000000000001','fbv2-owner@example.invalid'),
 ('19000000-0000-4000-8000-000000000002','fbv2-outsider@example.invalid'),
 ('19000000-0000-4000-8000-000000000003','fbv2-admin@example.invalid');
INSERT INTO public.platform_admins(user_id,active)
 VALUES('19000000-0000-4000-8000-000000000003',true);
INSERT INTO public.products(id,product_key,name,status)
 VALUES('29000000-0000-4000-8000-000000000001','fbv2_test','FBV2','active');
INSERT INTO public.user_feedback(id,user_id,product_id,content,request_id)
VALUES ('39000000-0000-4000-8000-000000000001',
 '19000000-0000-4000-8000-000000000001',
 '29000000-0000-4000-8000-000000000001',
 'Question about sync','49000000-0000-4000-8000-000000000001');
INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility)
 VALUES('39000000-0000-4000-8000-000000000001',
 '19000000-0000-4000-8000-000000000001','created','public');

SELECT plan(32);
SELECT has_function('public','admin_screen_feedback',
 ARRAY['uuid','integer','text','text'],'screening RPC is available');
SELECT has_function('public','admin_attention_feedback',
 ARRAY['uuid','integer','boolean','text[]'],'workbench attention RPC is available');
SELECT ok(NOT has_function_privilege('anon',
 'public.admin_screen_feedback(uuid,integer,text,text)','EXECUTE'),
 'anonymous client cannot use screening API');
SELECT ok((SELECT queue_state='inbox' AND priority IS NULL AND status IS NULL
 FROM public.user_feedback WHERE id='39000000-0000-4000-8000-000000000001'),
 'new feedback begins in inbox without priority or processing status');
SELECT throws_ok($$UPDATE public.user_feedback
 SET queue_state='workbench',priority=NULL,status='new'
 WHERE id='39000000-0000-4000-8000-000000000001'$$,'23514');

SELECT set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT is(public.my_feedback()->0->>'status','received',
 'owner sees received without internal screening details');
SELECT throws_ok($$SELECT public.admin_screen_feedback(
 '39000000-0000-4000-8000-000000000001',1,'triage','high')$$,'PT403');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000003',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_screen_feedback(
 '39000000-0000-4000-8000-000000000001',1,'triage','high')$$,'PT403');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_update_feedback(
 '39000000-0000-4000-8000-000000000001',1,'in_progress')$$,
 'PT409','NOT_IN_WORKBENCH','old processing RPC must not bypass inbox');
SELECT throws_ok($$SELECT public.admin_attention_feedback(
 '39000000-0000-4000-8000-000000000001',1,true,NULL)$$,
 'PT409','NOT_IN_WORKBENCH','star is workbench-only');
SELECT is((public.admin_screen_feedback(
 '39000000-0000-4000-8000-000000000001',1,'read')->>'version'),
 '1','first read only marks read_at; does not invalidate triage version');
SELECT is((public.admin_screen_feedback(
 '39000000-0000-4000-8000-000000000001',1,'read')->>'changed'),
 'false','reopening an already read item creates no new event');
SELECT is((public.admin_screen_feedback(
 '39000000-0000-4000-8000-000000000001',1,'archive')->>'version'),
 '2','inbox can archive without creating workbench entry');
SELECT throws_ok($$SELECT public.admin_screen_feedback(
 '39000000-0000-4000-8000-000000000001',2,'triage','urgent')$$,'PT409');
SELECT is((public.admin_screen_feedback(
 '39000000-0000-4000-8000-000000000001',2,'restore')->>'queue_state'),
 'inbox','archive restore returns to untriaged inbox');
SELECT throws_ok($$SELECT public.admin_screen_feedback(
 '39000000-0000-4000-8000-000000000001',3,'triage',NULL)$$,'PT422');
SELECT is((public.admin_screen_feedback(
 '39000000-0000-4000-8000-000000000001',3,'triage','high')->>'version'),
 '4','explicit priority promotes inbox to workbench');
SELECT ok((SELECT queue_state='workbench' AND priority='high' AND status='new'
 AND triaged_at IS NOT NULL FROM public.user_feedback
 WHERE id='39000000-0000-4000-8000-000000000001'),
 'workbench row requires explicit priority and initial new processing status');
SELECT throws_ok($$SELECT public.admin_screen_feedback(
 '39000000-0000-4000-8000-000000000001',4,'archive')$$,'PT409');
SELECT is((public.admin_attention_feedback(
 '39000000-0000-4000-8000-000000000001',4,true,NULL)->>'version'),
 '5','workbench can star a feedback');
SELECT is((public.admin_attention_feedback(
 '39000000-0000-4000-8000-000000000001',5,NULL,ARRAY['同步','稳定性'])->>'version'),
 '6','workbench tags can be saved');
SELECT throws_ok($$SELECT public.admin_attention_feedback(
 '39000000-0000-4000-8000-000000000001',6,NULL,ARRAY['重复','重复'])$$,'PT422');
SELECT is((public.admin_attention_feedback(
 '39000000-0000-4000-8000-000000000001',6,true,NULL)->>'changed'),
 'false','setting existing star is idempotent');
SELECT is((public.admin_update_feedback(
 '39000000-0000-4000-8000-000000000001',6,'in_progress')->>'version'),
 '7','existing business status RPC works on workbench after triage');
SELECT is((public.admin_screen_feedback(
 '39000000-0000-4000-8000-000000000001',7,'trash')->>'version'),
 '8','soft delete preserves workbench state for recovery');
SELECT throws_ok($$SELECT public.admin_update_feedback(
 '39000000-0000-4000-8000-000000000001',8,'resolved')$$,
 'PT409','NOT_IN_WORKBENCH','trash is hidden from processing mutations');
SELECT is((public.admin_screen_feedback(
 '39000000-0000-4000-8000-000000000001',8,'restore')->>'queue_state'),
 'workbench','restore from trash returns to prior workbench stage');
SELECT ok((SELECT status='in_progress' AND priority='high' AND is_starred
 AND tags=ARRAY['同步','稳定性']::text[] AND deleted_at IS NULL
 FROM public.user_feedback WHERE id='39000000-0000-4000-8000-000000000001'),
 'restore preserves workbench status, priority, star and tags');
SELECT is((SELECT count(*)::text FROM public.feedback_events WHERE
 feedback_id='39000000-0000-4000-8000-000000000001' AND
 event_type='triaged'),'1','only one durable triage event is appended');
SELECT is((SELECT count(*)::text FROM public.admin_audit_log
 WHERE target_type='feedback' AND target_id='39000000-0000-4000-8000-000000000001'
 AND action='feedback.triaged'),'1','screening change leaves minimal Admin audit');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.my_feedback_events(
 '39000000-0000-4000-8000-000000000001')),1,
 'owner receives only public created event, no triage/tags/stars');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.my_feedback()),0,
 'unrelated user cannot see original or processed feedback');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
