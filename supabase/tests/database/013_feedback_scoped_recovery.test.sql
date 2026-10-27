-- F06: scoped self-read and durable request recovery, SQL/JWT simulation.
-- Rollback-only QA data; no existing feedback or users are touched.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email) VALUES
 ('1a000000-0000-4000-8000-000000000001','f06-owner@example.invalid'),
 ('1a000000-0000-4000-8000-000000000002','f06-outsider@example.invalid');
INSERT INTO public.products(id,product_key,name,status) VALUES
 ('2a000000-0000-4000-8000-000000000001','f06_alpha','F06 Alpha','active'),
 ('2a000000-0000-4000-8000-000000000002','f06_beta','F06 Beta','active');
INSERT INTO public.user_feedback(id,user_id,product_id,request_id,content,created_at)
 VALUES
 ('3a000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000001',
  '2a000000-0000-4000-8000-000000000001','4a000000-0000-4000-8000-000000000001',
  'original alpha',transaction_timestamp()-interval '3 days'),
 ('3a000000-0000-4000-8000-000000000002','1a000000-0000-4000-8000-000000000001',
  '2a000000-0000-4000-8000-000000000001','4a000000-0000-4000-8000-000000000002',
  'alpha in trash',transaction_timestamp()-interval '2 days'),
 ('3a000000-0000-4000-8000-000000000003','1a000000-0000-4000-8000-000000000001',
  '2a000000-0000-4000-8000-000000000002','4a000000-0000-4000-8000-000000000001',
  'beta same request UUID',transaction_timestamp()-interval '2 days');
UPDATE public.user_feedback
  SET queue_state='trashed',deleted_from='inbox',
      deleted_at=transaction_timestamp()
 WHERE id='3a000000-0000-4000-8000-000000000002';
-- More than 100 recent records on Beta must never evict an Alpha entry.
INSERT INTO public.user_feedback(user_id,product_id,request_id,content,created_at)
 SELECT '1a000000-0000-4000-8000-000000000001'::uuid,
 '2a000000-0000-4000-8000-000000000002'::uuid,
 gen_random_uuid(),'beta traffic '||n,
 transaction_timestamp()-interval '1 day'+n*interval '1 second'
 FROM generate_series(1,105) AS n;

SELECT plan(24);
SELECT ok(to_regclass('public.user_feedback_user_product_created_idx') IS NOT NULL,
 'F06 scoped owner/product list has a supporting index');

SELECT has_function('public','my_feedback',ARRAY['text','uuid'],
  'F06 new product-scoped self query signature');
SELECT ok(to_regprocedure('public.my_feedback(uuid)') IS NULL,
  'F06 old unscoped public signature absent');
SELECT ok(to_regprocedure('private.my_feedback_core(uuid)') IS NULL,
  'F06 old private unscoped entry absent');
SELECT ok(NOT has_function_privilege('anon','public.my_feedback(text,uuid)','EXECUTE'),
  'F06 anonymous RPC invocation forbidden');
SELECT ok((SELECT NOT prosecdef FROM pg_proc WHERE oid=
  'public.my_feedback(text,uuid)'::regprocedure),
  'F06 public wrapper uses invoker permissions');

SELECT set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.my_feedback('f06_alpha')),1,
 'F06 Alpha list excludes trashed and 106 Beta records');
SELECT is(public.my_feedback('f06_alpha')->0->>'id',
 '3a000000-0000-4000-8000-000000000001',
 'F06 Alpha record is not evicted by cross-product activity');
SELECT is(jsonb_array_length(public.my_feedback('f06_beta')),100,
 'F06 Beta list stays bounded to 100 within that product');
SELECT is(public.my_feedback('f06_alpha','4a000000-0000-4000-8000-000000000001')->0->>'id',
 '3a000000-0000-4000-8000-000000000001',
 'F06 exact request resolves Alpha despite duplicate UUID on Beta');
SELECT is(public.my_feedback('f06_beta','4a000000-0000-4000-8000-000000000001')->0->>'id',
 '3a000000-0000-4000-8000-000000000003',
 'F06 exact request resolves the independent Beta record beyond list cap');
SELECT is(jsonb_array_length(public.my_feedback('f06_alpha',
 '4a000000-0000-4000-8000-000000000002')),1,
 'F06 soft-deleted original still has a recovery proof');
SELECT is(public.my_feedback('f06_alpha','4a000000-0000-4000-8000-000000000002')
 ->0->>'recovery_only','true',
 'F06 trash reply indicates recovery-only without exposing queue');
SELECT ok(NOT (public.my_feedback('f06_alpha','4a000000-0000-4000-8000-000000000002')
 ->0 ? 'queue_state') AND NOT
 (public.my_feedback('f06_alpha','4a000000-0000-4000-8000-000000000002')
 ->0 ? 'content'),
 'F06 soft-deleted record hides queue and original content in recovery proof');
SELECT is(jsonb_array_length(public.my_feedback('f06_beta',
 '4a000000-0000-4000-8000-000000000002')),0,
 'F06 no cross-product recovery proof for an Alpha-only request');
SELECT is(jsonb_array_length(public.my_feedback('not_a_product')),0,
 'F06 unknown but valid product does not enumerate existence');
SELECT throws_ok($$SELECT public.my_feedback('')$$,'PT422','INVALID_ARGUMENT',
 'F06 blank product rejected');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(public.my_feedback('f06_alpha',
 '4a000000-0000-4000-8000-000000000001')),0,
 'F06 another user cannot see exact request or existence');
RESET ROLE;
-- An accepted report may be moved to trash while the original HTTP
-- response is lost. Identical replay must find it, not create a second row.
SET LOCAL ROLE service_role;
SELECT is((public.feedback_submit_from_edge(
 '1a000000-0000-4000-8000-000000000001','f06_alpha',
 '4a000000-0000-4000-8000-000000000002','alpha in trash','other',
 '[]'::jsonb)->>'replayed'),'true',
 'F06 service-side exact replay survives trash and does not invent new feedback');
SELECT throws_ok($$SELECT public.feedback_submit_from_edge(
 '1a000000-0000-4000-8000-000000000001','f06_alpha',
 '4a000000-0000-4000-8000-000000000002','altered content','other',
 '[]'::jsonb)$$,'PT409','REQUEST_CONFLICT',
 'F06 conflicting retry never silently replaces a trashed original');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.user_feedback
 WHERE user_id='1a000000-0000-4000-8000-000000000001'
   AND product_id='2a000000-0000-4000-8000-000000000001'
   AND request_id='4a000000-0000-4000-8000-000000000002'),1,
 'F06 replay and conflicting retry preserve exactly one original');
INSERT INTO public.platform_account_restrictions(user_id,kind,reason_code,created_by)
 VALUES('1a000000-0000-4000-8000-000000000001','blocked','F06 test',
 '1a000000-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.my_feedback('f06_alpha')$$,'PT403','ACCOUNT_RESTRICTED',
 'F06 blocked owner cannot read even own recovery proof');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.my_feedback('f06_alpha')$$,'PT401','AUTH_REQUIRED',
 'F06 missing user claim cannot read feedback');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.user_feedback),0,
 'F06 ordinary owner cannot inspect underlying feedback rows directly');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
