BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email) VALUES
 ('f1000000-0000-4000-8000-000000000001','backend-admin@example.invalid'),
 ('f1000000-0000-4000-8000-000000000002','backend-owner@example.invalid');
INSERT INTO public.platform_admins(user_id,active) VALUES
 ('f1000000-0000-4000-8000-000000000001',true);
INSERT INTO public.products(id,product_key,name,status) VALUES
 ('f2000000-0000-4000-8000-000000000001','backend_audit','Backend audit','active');
INSERT INTO public.product_memberships(user_id,product_id,status) VALUES
 ('f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','active');
INSERT INTO public.user_feedback(id,product_id,user_id,request_id,content) VALUES
 ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',
 'f1000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000001','Audit feedback');
INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility)
 VALUES ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','created','public');
INSERT INTO public.feedback_attachments(id,feedback_id,slot,object_key,mime_type,size_bytes)
 VALUES ('f5000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001',1,
 'feedback/f2000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000002/f4000000-0000-4000-8000-000000000001/1-'||repeat('a',64)||'.png','image/png',1);
SELECT no_plan();
SELECT set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT is(public.admin_mark_feedback_read('f3000000-0000-4000-8000-000000000001',1)->>'version','1','first read preserves business version');
SELECT lives_ok($$SELECT public.admin_feedback_v3('f3000000-0000-4000-8000-000000000001',
 (SELECT version FROM public.user_feedback WHERE id='f3000000-0000-4000-8000-000000000001'),'triage','normal')$$,'triage remains available');
SELECT ok(public.admin_grant_entitlement('f1000000-0000-4000-8000-000000000002',
 'f2000000-0000-4000-8000-000000000001','pro','duration',30,NULL,NULL,false,'Audit','backend-audit') ? 'effective_ends_at','first grant returns current expiry');
SELECT ok(public.admin_grant_entitlement('f1000000-0000-4000-8000-000000000002',
 'f2000000-0000-4000-8000-000000000001','pro','duration',30,NULL,NULL,false,'Audit','backend-audit') ? 'effective_ends_at','grant replay returns current expiry');
SELECT throws_ok($$SELECT object_key FROM public.feedback_attachments$$,'42501',NULL,'client cannot read object keys');
SELECT throws_ok($$SELECT deletion_token FROM public.user_feedback$$,'42501',NULL,'client cannot read deletion tokens');
SELECT lives_ok($$SELECT count(*) FROM public.admin_feedback_summaries$$,'invoker admin view still works');
SELECT throws_ok($$SELECT public.admin_finish_feedback_delete('f1000000-0000-4000-8000-000000000001','aal2',
 'f3000000-0000-4000-8000-000000000001',gen_random_uuid(),NULL)$$,'42501',NULL,'admin JWT cannot bypass trusted storage completion');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT is(public.my_feedback('backend_audit')->0->>'status','received','workbench is a submission confirmation, not a progress promise');
RESET ROLE;
UPDATE public.user_feedback SET deletion_started_at=transaction_timestamp(),deletion_token=gen_random_uuid(),deletion_version=version
 WHERE id='f3000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.my_feedback('backend_audit')),0,'pending deletion is hidden from owner list');
SELECT ok(public.my_feedback('backend_audit','f4000000-0000-4000-8000-000000000001')->0 @> '{"recovery_only":true}','pending exact recovery proves existence');
SELECT ok(NOT (public.my_feedback('backend_audit','f4000000-0000-4000-8000-000000000001')->0 ? 'content'),'pending recovery hides content');
SELECT throws_ok($$SELECT public.my_feedback_events('f3000000-0000-4000-8000-000000000001')$$,'PT403',NULL,'pending public events denied');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.feedback_image_access('f1000000-0000-4000-8000-000000000002','aal1',
 'f5000000-0000-4000-8000-000000000001')$$,'PT403',NULL,'pending image cannot receive a new signature');
SELECT throws_ok($$SELECT public.admin_finish_feedback_delete('f1000000-0000-4000-8000-000000000002','aal2',
 'f3000000-0000-4000-8000-000000000001',gen_random_uuid(),NULL)$$,'PT403',NULL,'trusted completion still checks current admin');
SELECT throws_ok($$SELECT public.admin_finish_feedback_delete('f1000000-0000-4000-8000-000000000001','aal1',
 'f3000000-0000-4000-8000-000000000001',gen_random_uuid(),NULL)$$,'PT403',NULL,'trusted completion requires verified AAL2');
RESET ROLE;
SELECT throws_ok($$INSERT INTO public.user_feedback(product_id,user_id,request_id,content,contact_email)
 VALUES('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002',gen_random_uuid(),'Invalid contact','invalid')$$,'23514',NULL,'table rejects malformed contact');
SELECT ok(NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_feedback'
 AND column_name IN ('status','assigned_to','resolved_at','closed_at','tags','deleted_at','deleted_from')),'V4 has one current schema');
SELECT * FROM finish();
ROLLBACK;
