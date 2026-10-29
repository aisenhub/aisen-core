BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email) VALUES
 ('1e000000-0000-4000-8000-000000000001','contact-owner@example.invalid'),
 ('1e000000-0000-4000-8000-000000000002','contact-admin@example.invalid');
INSERT INTO public.platform_admins(user_id,active) VALUES ('1e000000-0000-4000-8000-000000000002',true);
INSERT INTO public.products(id,product_key,name,status)
 VALUES ('2e000000-0000-4000-8000-000000000001','contact_qa','Contact QA','active');
SELECT plan(15);
SET LOCAL ROLE service_role;
SELECT is(public.feedback_submit_from_edge(
 '1e000000-0000-4000-8000-000000000001','contact_qa',
 '3e000000-0000-4000-8000-000000000001','Contact test','suggestion','[]',
 ' Reply.User@example.com ')->>'replayed','false','first commit persists independent contact');
SELECT is(public.feedback_submit_from_edge(
 '1e000000-0000-4000-8000-000000000001','contact_qa',
 '3e000000-0000-4000-8000-000000000001','Contact test','suggestion','[]',
 'Reply.User@example.com')->>'replayed','true','same normalized contact replays');
SELECT throws_ok($$SELECT public.feedback_submit_from_edge(
 '1e000000-0000-4000-8000-000000000001','contact_qa',
 '3e000000-0000-4000-8000-000000000001','Contact test','suggestion','[]',
 'different@example.com')$$,'PT409','REQUEST_CONFLICT','same UUID cannot change contact');
SELECT throws_ok($$SELECT public.feedback_submit_from_edge(
 '1e000000-0000-4000-8000-000000000001','contact_qa',
 '3e000000-0000-4000-8000-000000000001','Contact test','bug','[]',
 'Reply.User@example.com')$$,'PT409','REQUEST_CONFLICT','same UUID cannot change category');
SELECT throws_ok($$SELECT public.feedback_submit_from_edge(
 '1e000000-0000-4000-8000-000000000001','contact_qa',
 gen_random_uuid(),'Contact test','other','[]',NULL)$$,'PT422','INVALID_ARGUMENT','null contact rejected');
SELECT throws_ok($$SELECT public.feedback_submit_from_edge(
 '1e000000-0000-4000-8000-000000000001','contact_qa',
 gen_random_uuid(),'Contact test','other','[]','a,b@example.com')$$,'PT422','INVALID_ARGUMENT','multi-address rejected');
SELECT throws_ok($$SELECT public.feedback_submit_from_edge(
 '1e000000-0000-4000-8000-000000000001','contact_qa',
 gen_random_uuid(),'Contact test','other','[]',repeat('a',244)||'@example.com')$$,'PT422','INVALID_ARGUMENT','overlong contact rejected');
RESET ROLE;
SELECT is((SELECT contact_email FROM public.user_feedback WHERE product_id='2e000000-0000-4000-8000-000000000001'),
 'Reply.User@example.com','contact is trimmed and preserves case');
SELECT is((SELECT email::text FROM auth.users WHERE id='1e000000-0000-4000-8000-000000000001'),
 'contact-owner@example.invalid','contact never changes Auth identity');
SELECT is((SELECT count(*)::integer FROM public.user_feedback WHERE product_id='2e000000-0000-4000-8000-000000000001'),1,'no duplicates');
SELECT is((SELECT count(*)::integer FROM public.product_memberships WHERE user_id='1e000000-0000-4000-8000-000000000001'),0,'feedback never joins product');
SELECT set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"1e000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.admin_feedback_summaries),0,'ordinary user cannot read contact projection');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"1e000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT contact_email FROM public.admin_feedback_summaries WHERE product_id='2e000000-0000-4000-8000-000000000001'),
 'Reply.User@example.com','current AAL2 admin can read contact');
RESET ROLE;
UPDATE public.platform_admins SET active=false WHERE user_id='1e000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.admin_feedback_summaries),0,'revoked admin cannot read contact');
RESET ROLE;
SELECT ok(to_regprocedure('public.feedback_submit_from_edge(uuid,text,uuid,text,text,jsonb)') IS NULL,'no old submit signature');
SELECT * FROM finish();
ROLLBACK;
