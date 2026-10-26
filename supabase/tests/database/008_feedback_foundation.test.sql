-- FB-01A: SQL-role and constraint simulation only; NOT real signed JWT HTTP E2E.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email) VALUES
 ('17000000-0000-4000-8000-000000000001','fb-admin@example.invalid'),
 ('17000000-0000-4000-8000-000000000002','fb-user@example.invalid');
INSERT INTO public.platform_admins(user_id,active)
  VALUES('17000000-0000-4000-8000-000000000001',true);
INSERT INTO public.products(id,product_key,name,status) VALUES
 ('27000000-0000-4000-8000-000000000001','fb_test_product','FB Test','active');
INSERT INTO public.user_feedback(
 id,user_id,product_id,content,category,request_id)
VALUES (
 '37000000-0000-4000-8000-000000000001',
 '17000000-0000-4000-8000-000000000002',
 '27000000-0000-4000-8000-000000000001',
 'A reproducible product issue','bug',
 '47000000-0000-4000-8000-000000000001');
INSERT INTO public.feedback_attachments(feedback_id,slot,object_key,mime_type,size_bytes)
VALUES
 ('37000000-0000-4000-8000-000000000001',1,'feedback/first/one.png','image/png',100),
 ('37000000-0000-4000-8000-000000000001',2,'feedback/first/two.webp','image/webp',120);
INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility,message)
VALUES ('37000000-0000-4000-8000-000000000001',
 '17000000-0000-4000-8000-000000000002','created','public','User submitted feedback');

SELECT plan(32);
SELECT has_table('public','user_feedback','feedback primary table exists');
SELECT has_table('public','feedback_attachments','feedback attachment table exists');
SELECT has_table('public','feedback_events','feedback event table exists');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.user_feedback'::regclass),'feedback RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.feedback_attachments'::regclass),'attachment RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.feedback_events'::regclass),'event RLS enabled');
SELECT ok(NOT has_table_privilege('authenticated','public.user_feedback','INSERT'),'no client feedback INSERT');
SELECT ok(NOT has_table_privilege('authenticated','public.feedback_attachments','INSERT'),'no client attachment INSERT');
SELECT ok(NOT has_table_privilege('authenticated','public.feedback_events','INSERT'),'no client event INSERT');
SELECT ok(NOT has_table_privilege('anon','public.user_feedback','SELECT'),'anonymous cannot read feedback');
SELECT ok(has_table_privilege('authenticated','public.user_feedback','SELECT'),'admin RLS-backed SELECT available');
SELECT ok(has_table_privilege('authenticated','public.feedback_attachments','SELECT'),'admin RLS-backed attachment SELECT');
SELECT ok(has_table_privilege('authenticated','public.feedback_events','SELECT'),'admin RLS-backed event SELECT');
SELECT ok((SELECT queue_state='inbox' AND status IS NULL AND priority IS NULL
 FROM public.user_feedback WHERE id='37000000-0000-4000-8000-000000000001'),
 'new feedback stays untriaged in inbox, without default priority/status');
SELECT throws_ok($$INSERT INTO public.feedback_attachments(feedback_id,slot,object_key,mime_type,size_bytes)
  VALUES ('37000000-0000-4000-8000-000000000001',2,'feedback/first/duplicate.png','image/png',10)$$,'23505');
SELECT throws_ok($$INSERT INTO public.feedback_attachments(feedback_id,slot,object_key,mime_type,size_bytes)
  VALUES ('37000000-0000-4000-8000-000000000001',3,'feedback/first/three.png','image/png',10)$$,'23514');
SELECT throws_ok($$INSERT INTO public.feedback_attachments(feedback_id,slot,object_key,mime_type,size_bytes)
  VALUES ('37000000-0000-4000-8000-000000000001',1,'feedback/first/svg.svg','image/svg+xml',10)$$,'23514');
SELECT throws_ok($$INSERT INTO public.user_feedback(user_id,product_id,content,request_id)
  VALUES ('17000000-0000-4000-8000-000000000002','27000000-0000-4000-8000-000000000001','   ','47000000-0000-4000-8000-000000000002')$$,'23514');
SELECT throws_ok($$INSERT INTO public.user_feedback(user_id,product_id,content,status,request_id)
  VALUES ('17000000-0000-4000-8000-000000000002','27000000-0000-4000-8000-000000000001','valid','triaged','47000000-0000-4000-8000-000000000002')$$,'23514');
SELECT throws_ok($$INSERT INTO public.user_feedback(user_id,product_id,content,priority,request_id)
  VALUES ('17000000-0000-4000-8000-000000000002','27000000-0000-4000-8000-000000000001','valid','critical','47000000-0000-4000-8000-000000000002')$$,'23514');
SELECT throws_ok($$INSERT INTO public.user_feedback(user_id,product_id,content,request_id)
  VALUES ('17000000-0000-4000-8000-000000000002','27000000-0000-4000-8000-000000000001','different','47000000-0000-4000-8000-000000000001')$$,'23505');
SELECT throws_ok($$INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility)
  VALUES ('37000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000002','invalid','public')$$,'23514');
SELECT throws_ok($$INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility)
  VALUES ('37000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000002','user_reply','world')$$,'23514');

-- Ordinary authenticated users see no row from Admin-only table surfaces.
SELECT set_config('request.jwt.claim.sub','17000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.user_feedback),0,'ordinary user no admin list');
SELECT throws_ok($$INSERT INTO public.user_feedback(user_id,product_id,content,request_id)
  VALUES (auth.uid(),'27000000-0000-4000-8000-000000000001','forgery',gen_random_uuid())$$,'42501');
SELECT throws_ok($$INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility)
  VALUES ('37000000-0000-4000-8000-000000000001',auth.uid(),'user_reply','public')$$,'42501');
SELECT throws_ok($$INSERT INTO public.feedback_attachments(feedback_id,slot,object_key,mime_type,size_bytes)
  VALUES ('37000000-0000-4000-8000-000000000001',1,'feedback/test/hack.png','image/png',123)$$,'42501');
RESET ROLE;

-- Listed admin with AAL1 is denied.
SELECT set_config('request.jwt.claim.sub','17000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.user_feedback),0,'AAL1 admin cannot inspect feedback');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.user_feedback WHERE
 product_id='27000000-0000-4000-8000-000000000001'),1,
 'AAL2 admin sees own isolated test feedback');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT count(*) FROM public.user_feedback$$,'42501');
RESET ROLE;
UPDATE public.platform_admins SET active=false
 WHERE user_id='17000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.user_feedback),0,'revoked AAL2 admin immediately loses SELECT');
RESET ROLE;
UPDATE public.platform_admins SET active=true
 WHERE user_id='17000000-0000-4000-8000-000000000001';
INSERT INTO public.platform_account_restrictions(user_id,kind,reason_code,created_by)
VALUES ('17000000-0000-4000-8000-000000000001','blocked','fb-test',
        '17000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.user_feedback),0,'blocked AAL2 admin cannot inspect feedback');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
