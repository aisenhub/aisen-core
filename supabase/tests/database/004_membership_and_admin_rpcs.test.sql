-- D1-M2 tested against local PostgreSQL using synthetic SQL session claims.
-- NOT a real signed GoTrue JWT, MFA, HTTP, or two-connection LCK test.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email) VALUES
 ('12000000-0000-4000-8000-000000000001','m2-user-a@example.invalid'),
 ('12000000-0000-4000-8000-000000000002','m2-user-b@example.invalid'),
 ('12000000-0000-4000-8000-000000000003','m2-admin-a@example.invalid'),
 ('12000000-0000-4000-8000-000000000004','m2-admin-b@example.invalid'),
 ('12000000-0000-4000-8000-000000000005','m2-user-new@example.invalid');
INSERT INTO public.products(id,product_key,name,status) VALUES
 ('22000000-0000-4000-8000-000000000001','m2_active','M2 Active','active'),
 ('22000000-0000-4000-8000-000000000002','m2_draft','M2 Draft','draft');
INSERT INTO public.platform_admins(user_id,active,granted_by) VALUES
 ('12000000-0000-4000-8000-000000000003',true,NULL),
 ('12000000-0000-4000-8000-000000000004',true,NULL);
INSERT INTO public.product_memberships(id,user_id,product_id,status) VALUES
 ('32000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','active'),
 ('32000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000001','left');
INSERT INTO public.entitlement_grants
 (id,user_id,product_id,source_type,source_ref,grant_mode,requested_duration_days,starts_at,ends_at)
VALUES
 ('42000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001','admin','m2-grant-now','duration',30,
  transaction_timestamp()-interval '1 day',transaction_timestamp()+interval '29 days'),
 ('42000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000001','admin','m2-grant-future','duration',30,
  transaction_timestamp()+interval '5 days',transaction_timestamp()+interval '35 days');

SELECT plan(70);
-- Public wrapper signatures and execution barriers, including direct private calls.
SELECT has_function('public','check_access',ARRAY['text'],'one-parameter check_access exists');
SELECT hasnt_function('public','check_access',ARRAY['text','text'],'no capability argument');
SELECT has_function('public','ensure_membership',ARRAY['text'],'user ensure exists');
SELECT has_function('public','admin_revoke_admin',ARRAY['uuid','text'],'admin revoke exists');
SELECT ok((SELECT prosecdef=false FROM pg_catalog.pg_proc WHERE oid='public.check_access(text)'::regprocedure),'public check_access is invoker');
SELECT ok((SELECT prosecdef=false FROM pg_catalog.pg_proc WHERE oid='public.admin_revoke_admin(uuid,text)'::regprocedure),'admin wrapper is invoker');
SELECT ok((SELECT prosecdef=true FROM pg_catalog.pg_proc WHERE oid='private.change_my_membership_core(text,text)'::regprocedure),'private core is definer');
SELECT ok((SELECT rolcanlogin=false AND rolbypassrls=false FROM pg_catalog.pg_roles WHERE rolname='aisencore_rpc_executor'),'executor is no-login no-bypassrls');
SELECT ok(has_schema_privilege('authenticated','private','USAGE'),'wrapper can resolve private schema');
SELECT ok(NOT has_function_privilege('anon','public.check_access(text)','EXECUTE'),'anon cannot invoke access RPC');
SELECT ok(NOT has_function_privilege('anon','private.change_my_membership_core(text,text)','EXECUTE'),'anon cannot invoke core');
SELECT ok(NOT has_function_privilege('authenticated','private.acquire_l0_admin_write_lock()','EXECUTE'),'advisory lock helper not public API');
SELECT ok(NOT has_table_privilege('authenticated','public.platform_admins','UPDATE'),'ordinary JWT cannot update roster');
SELECT ok(NOT has_table_privilege('authenticated','public.product_memberships','INSERT'),'ordinary JWT cannot insert members');

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.check_access('m2_active')$$,'42501');
SELECT throws_ok($$SELECT public.ensure_membership('m2_active')$$,'42501');
RESET ROLE;

-- A is an active member and Pro, other products are unavailable.
SELECT set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT is(public.check_access('m2_active')->>'reason','OK','active member is allowed');
SELECT is(public.check_access('m2_active')->>'tier','pro','active grant derives Pro');
SELECT is(public.check_access('m2_active')->>'is_lifetime','false','ordinary grant has end');
SELECT is(public.check_access('m2_draft')->>'reason','PRODUCT_UNAVAILABLE','draft product rejects');
SELECT is(public.check_access('missing')->>'reason','PRODUCT_UNAVAILABLE','unknown product rejects');
SELECT is((public.get_my_products()->0->>'product_key'),'m2_active','product list returns own product');
SELECT is((public.admin_check_access()->>'allowed'),'false','ordinary user not admin');
SELECT is((public.ensure_membership('m2_active')->>'created'),'false','ensure existing active is idempotent');
SELECT throws_ok($$SELECT public.admin_block_account('12000000-0000-4000-8000-000000000002','test')$$,'PT403');
SELECT throws_ok($$SELECT private.admin_change_account_core('12000000-0000-4000-8000-000000000002','block','test')$$,'PT403');
SELECT throws_ok($$SELECT private.acquire_l0_admin_write_lock()$$,'42501');
RESET ROLE;

-- Left cannot silently rejoin through Ensure; only explicit Rejoin is legal.
SELECT set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT is(public.check_access('m2_active')->>'reason','MEMBERSHIP_LEFT','left rejects before future Pro');
SELECT throws_ok($$SELECT public.ensure_membership('m2_active')$$,'PT409');
SELECT is((public.rejoin_product('m2_active')->>'changed'),'true','explicit rejoin succeeds');
SELECT is((public.rejoin_product('m2_active')->>'changed'),'false','rejoin idempotent');
SELECT is(public.check_access('m2_active')->>'tier','free','future grant does not count as current Pro');
SELECT is((public.leave_product('m2_active')->>'changed'),'true','leave changes status');
SELECT is((public.leave_product('m2_active')->>'changed'),'false','leave idempotent');
SELECT is(public.check_access('m2_active')->>'reason','MEMBERSHIP_LEFT','left denies access after leave');
RESET ROLE;

-- Unknown member creates exactly one active row + join audit.
SELECT set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000005',true);
SET LOCAL ROLE authenticated;
SELECT is(public.check_access('m2_active')->>'reason','MEMBERSHIP_REQUIRED','no membership');
SELECT throws_ok($$SELECT public.ensure_membership('m2_draft')$$,'PT409');
SELECT is((public.ensure_membership('m2_active')->>'created'),'true','first ensure creates');
SELECT is((public.ensure_membership('m2_active')->>'created'),'false','second ensure no-ops');
SELECT is(public.check_access('m2_active')->>'tier','free','no Grant means Free');
SELECT is((public.get_my_products()->0->>'product_key'),'m2_active','new member listed');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.membership_events WHERE actor_user_id='12000000-0000-4000-8000-000000000005' AND action='join'),1,'first join event exactly once');
SELECT is((SELECT count(*)::integer FROM public.membership_events WHERE actor_user_id='12000000-0000-4000-8000-000000000002' AND action IN ('leave','rejoin')),2,'one leave and one rejoin event');

-- Even a listed admin with an aal1 claim has no write or read privileges.
SELECT set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT is(public.admin_check_access()->>'allowed','false','aal1 admin denied');
SELECT throws_ok($$SELECT public.admin_create_product('m2_new','New Product')$$,'PT403');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT is(public.admin_check_access()->>'allowed','true','aal2 admin allowed');
SELECT is((public.admin_create_product('m2_new','New Product')->>'status'),'draft','new product starts draft');
SELECT is((public.admin_set_product_status(
  (SELECT id FROM public.products WHERE product_key='m2_new'),'active','go live')->>'changed'),'true','admin can activate product');
SELECT is((public.admin_set_product_status(
  (SELECT id FROM public.products WHERE product_key='m2_new'),'active','repeat')->>'changed'),'false','same status does not audit again');
SELECT throws_ok($$SELECT public.admin_set_product_status(
  (SELECT id FROM public.products WHERE product_key='m2_new'),'invalid','bad')$$,'PT422');
SELECT is((public.admin_suspend_membership('32000000-0000-4000-8000-000000000002','policy')->>'status'),'suspended','admin suspends left member');
SELECT is((public.admin_suspend_membership('32000000-0000-4000-8000-000000000002','duplicate')->>'changed'),'false','suspend idempotent preserves prestate');
SELECT is((public.admin_restore_membership('32000000-0000-4000-8000-000000000002','reviewed')->>'status'),'left','restore honors left before suspend');
SELECT is((public.admin_restore_membership('32000000-0000-4000-8000-000000000002','duplicate')->>'changed'),'false','restore idempotent');
SELECT is((public.admin_block_account('12000000-0000-4000-8000-000000000005','block')->>'changed'),'true','block other user');
SELECT is((public.admin_block_account('12000000-0000-4000-8000-000000000005','same')->>'changed'),'false','block idempotent');
SELECT is((public.admin_unblock_account('12000000-0000-4000-8000-000000000005','restore')->>'changed'),'true','unblock other user');
SELECT is((public.admin_revoke_admin('12000000-0000-4000-8000-000000000004','review')->>'changed'),'true','revoke second admin');
-- Isolate M1 last-admin invariant from durable local fixture administrators
-- inside a SAVEPOINT. Uncommitted test override is rolled back immediately.
RESET ROLE;
SAVEPOINT m2_test_last_admin;
UPDATE public.platform_admins SET active=false
 WHERE user_id NOT IN ('12000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000004') AND active;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_revoke_admin('12000000-0000-4000-8000-000000000003','must keep one')$$,'PT409');
SELECT throws_ok($$SELECT public.admin_block_account('12000000-0000-4000-8000-000000000003','must keep one')$$,'PT409');
ROLLBACK TO SAVEPOINT m2_test_last_admin;
SET LOCAL ROLE authenticated;
SELECT is((public.admin_grant_admin('12000000-0000-4000-8000-000000000004','restore')->>'changed'),'true','regrant second admin');
SELECT is((public.admin_block_account('12000000-0000-4000-8000-000000000004','policy')->>'changed'),'true','block second admin while first remains');
SELECT is((public.admin_unblock_account('12000000-0000-4000-8000-000000000004','restored')->>'changed'),'true','restore second admin');
RESET ROLE;

SELECT is((SELECT status FROM public.product_memberships WHERE id='32000000-0000-4000-8000-000000000002'),'left','left survives suspend/restore');
SELECT is((SELECT pre_suspend_status FROM public.product_memberships WHERE id='32000000-0000-4000-8000-000000000002'),NULL::text,'prestate is cleared');
SELECT is((SELECT count(*)::integer FROM public.membership_events WHERE membership_id='32000000-0000-4000-8000-000000000002' AND action IN ('suspend','restore')),2,'one suspend and one restore event');
SELECT is((SELECT count(*)::integer FROM public.platform_admins WHERE active AND user_id='12000000-0000-4000-8000-000000000003'),1,'last admin kept active by rollback');
SELECT is((SELECT count(*)::integer FROM public.platform_account_restrictions WHERE user_id='12000000-0000-4000-8000-000000000003'),0,'last admin not blocked after rejection');
SELECT is((SELECT count(*)::integer FROM public.admin_audit_log WHERE action='product.status' AND actor_user_id='12000000-0000-4000-8000-000000000003'),1,'idempotent test product update writes one audit');
SELECT is((SELECT count(*)::integer FROM public.admin_audit_log WHERE action='account.revoke_admin' AND actor_user_id='12000000-0000-4000-8000-000000000003'),1,'rejected self-revoke writes no extra test audit');

SELECT * FROM finish();
ROLLBACK;
