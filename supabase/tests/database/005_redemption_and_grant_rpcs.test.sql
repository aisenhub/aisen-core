-- D1-M3: local SQL-role/JWT-claim simulation, not signed HTTP JWT/MFA
-- Synthetic plaintext is held only in local transaction session settings.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email) VALUES
 ('13000000-0000-4000-8000-000000000001','m3-admin@example.invalid'),
 ('13000000-0000-4000-8000-000000000002','m3-user-a@example.invalid'),
 ('13000000-0000-4000-8000-000000000003','m3-user-b@example.invalid'),
 ('13000000-0000-4000-8000-000000000004','m3-user-c@example.invalid'),
 ('13000000-0000-4000-8000-000000000005','m3-user-d@example.invalid'),
 ('13000000-0000-4000-8000-000000000006','m3-lifetime@example.invalid'),
 ('13000000-0000-4000-8000-000000000007','m3-future@example.invalid'),
 ('13000000-0000-4000-8000-000000000008','m3-revoked@example.invalid'),
 ('13000000-0000-4000-8000-000000000009','m3-other-product@example.invalid'),
 ('13000000-0000-4000-8000-000000000010','m3-finite@example.invalid');
INSERT INTO public.platform_admins(user_id,active) VALUES
 ('13000000-0000-4000-8000-000000000001',true);
INSERT INTO public.products(id,product_key,name,status) VALUES
 ('23000000-0000-4000-8000-000000000001','m3_alpha','M3 Alpha','active'),
 ('23000000-0000-4000-8000-000000000002','m3_beta','M3 Beta','active');
INSERT INTO public.product_memberships(user_id,product_id,status)
VALUES ('13000000-0000-4000-8000-000000000004','23000000-0000-4000-8000-000000000001','left');

SELECT plan(93);
SELECT has_function('public','redeem_code',ARRAY['text','text'],'two-argument redemption only');
SELECT hasnt_function('public','redeem_code',ARRAY['text'],'old one-argument redemption absent');
SELECT has_function('public','admin_create_codes',ARRAY['uuid','text','integer','integer','boolean','integer','timestamp with time zone','text','text'],'issuance RPC exists');
SELECT ok((SELECT NOT prosecdef FROM pg_proc WHERE oid='public.redeem_code(text,text)'::regprocedure),'public redemption invoker');
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid='private.redeem_code_core(text,text)'::regprocedure),'private redemption definer');
SELECT ok(NOT has_column_privilege('authenticated','public.redemption_codes','code_hash','SELECT'),'code hash still hidden');
SELECT ok(NOT has_table_privilege('authenticated','public.redemption_rate_limits','SELECT'),'failure state still hidden');
SELECT ok(NOT has_table_privilege('authenticated','public.redemption_codes','UPDATE'),'clients cannot change code counters');
SELECT ok(NOT has_function_privilege('anon','public.redeem_code(text,text)','EXECUTE'),'anon cannot redeem');
SELECT ok(NOT has_function_privilege('anon','public.admin_create_codes(uuid,text,integer,integer,boolean,integer,timestamptz,text,text)','EXECUTE'),'anon cannot issue codes');

SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.redeem_code('m3_alpha','NONEXISTENT')$$,'42501');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_create_codes(
  '23000000-0000-4000-8000-000000000001','pro',1,30,false,1,NULL,'forbidden',NULL)$$,'PT403');
SELECT throws_ok($$SELECT private.admin_grant_entitlement_core(
  '13000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000001',
  'pro','duration',30,NULL,NULL,false,'forbidden','request')$$,'PT403');
RESET ROLE;

-- Admin issues one 160-bit Base32 code for alpha; no plaintext is persisted.
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM set_config('m3.first_batch',public.admin_create_codes(
    '23000000-0000-4000-8000-000000000001','pro',1,30,false,1,
    transaction_timestamp()+interval '365 days','alpha-first',NULL)::text,true);
END;
$$;
SELECT is(current_setting('m3.first_batch')::jsonb->>'idempotent_replay','false','first issue not replay');
SELECT is(current_setting('m3.first_batch')::jsonb->>'plaintext_available','true','plaintext only first response');
SELECT is(pg_catalog.jsonb_array_length(current_setting('m3.first_batch')::jsonb->'codes'),1,'issued exactly one code');
SELECT ok((current_setting('m3.first_batch')::jsonb->'codes'->>0) ~ '^[A-Z2-7]{32}$','issued Base32 is 160 bits');
SELECT is((SELECT code_prefix FROM public.redemption_codes WHERE batch_id=(current_setting('m3.first_batch')::jsonb->>'batch_id')::uuid),
  pg_catalog.substr(current_setting('m3.first_batch')::jsonb->'codes'->>0,1,8),'only safe prefix persists');
SELECT is((public.admin_create_codes(
  '23000000-0000-4000-8000-000000000001','pro',1,30,false,1,
  transaction_timestamp()+interval '365 days','alpha-first',NULL)->>'idempotent_replay'),'true','same request id replays');
SELECT is(pg_catalog.jsonb_array_length(public.admin_create_codes(
  '23000000-0000-4000-8000-000000000001','pro',1,30,false,1,
  transaction_timestamp()+interval '365 days','alpha-first',NULL)->'codes'),0,'replay does not reveal code');
SELECT throws_ok($$SELECT public.admin_create_codes(
 '23000000-0000-4000-8000-000000000001','pro',2,30,false,1,
 transaction_timestamp()+interval '365 days','alpha-first',NULL)$$,'PT409');
SELECT throws_ok($$SELECT public.admin_create_codes(
 '23000000-0000-4000-8000-000000000001','pro',1,NULL,true,1,
 NULL,'lifetime-unapproved',NULL)$$,'PT422');
SELECT throws_ok($$SELECT public.admin_create_codes(
 '23000000-0000-4000-8000-000000000001','free',1,30,false,1,
 NULL,'free-disallowed',NULL)$$,'PT422');
RESET ROLE;

-- A has no member row; valid redemption atomically creates member, grant and record.
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT is(public.check_access('m3_alpha')->>'reason','MEMBERSHIP_REQUIRED','pre-redeem membership missing');
DO $$
BEGIN
  PERFORM set_config('m3.first_redemption',public.redeem_code(
    'm3_alpha',current_setting('m3.first_batch')::jsonb->'codes'->>0)::text,true);
END;
$$;
SELECT is(current_setting('m3.first_redemption')::jsonb->>'ok','true','redeem succeeds');
SELECT is(public.check_access('m3_alpha')->>'tier','pro','new Pro visible immediately');
SELECT is((SELECT count(*)::integer FROM public.redemptions),1,'own redemption visible');
SELECT is((public.redeem_code('m3_alpha',
  current_setting('m3.first_batch')::jsonb->'codes'->>0)->>'code'),'REDEEM_ALREADY_USED','own replay detected before code exhausted');
SELECT is((SELECT count(*)::integer FROM public.entitlement_grants),1,'repeat does not duplicate Grant');
RESET ROLE;

SELECT is((SELECT count(*)::integer FROM public.product_memberships WHERE user_id='13000000-0000-4000-8000-000000000002'),1,'redeem joined missing member');
SELECT is((SELECT count(*)::integer FROM public.membership_events WHERE actor_user_id='13000000-0000-4000-8000-000000000002' AND action='join'),1,'joined exactly one event');
SELECT is((SELECT redeemed_count FROM public.redemption_codes WHERE batch_id=(current_setting('m3.first_batch')::jsonb->>'batch_id')::uuid),1,'single-use test counter atomically incremented');
SELECT is((SELECT count(*)::integer FROM public.redemptions WHERE user_id='13000000-0000-4000-8000-000000000002' AND product_id='23000000-0000-4000-8000-000000000001'),1,'only one test redemption fact');

-- C is left: invalid/real code both return MEMBERSHIP_LEFT before hash lookup.
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000004',true);
SET LOCAL ROLE authenticated;
SELECT is((public.redeem_code('m3_alpha','BAD-CODE')->>'code'),'MEMBERSHIP_LEFT','left unknown code is opaque');
SELECT is((public.redeem_code('m3_alpha',
  current_setting('m3.first_batch')::jsonb->'codes'->>0)->>'code'),'MEMBERSHIP_LEFT','left valid code has same result');
SELECT is((SELECT count(*)::integer FROM public.redemptions),0,'left user sees no redemptions');
RESET ROLE;
SELECT is((SELECT pg_catalog.array_length(failed_at,1) FROM public.redemption_rate_limits WHERE user_id='13000000-0000-4000-8000-000000000004'),2,'left failures persist');
SELECT is((SELECT status FROM public.product_memberships WHERE user_id='13000000-0000-4000-8000-000000000004'),'left','failed redeem never rejoined');

-- B sends 10 distinct invalid attempts and is rate-limited on the 11th.
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE i integer; v jsonb;
BEGIN
  FOR i IN 1..10 LOOP
    v := public.redeem_code('m3_alpha','BADCODE'||i::text);
    IF v->>'code'<>'REDEEM_CODE_INVALID' THEN
      RAISE EXCEPTION 'unexpected rejection %',v->>'code';
    END IF;
  END LOOP;
END;
$$;
SELECT is((public.redeem_code('m3_alpha','BADCODE11')->>'code'),'RATE_LIMITED','11th failure rate limited');
SELECT ok((public.redeem_code('m3_alpha','BADCODE12')->>'retry_after_seconds')::integer>0,'rate limit returns positive wait');
RESET ROLE;
SELECT is((SELECT pg_catalog.array_length(failed_at,1) FROM public.redemption_rate_limits WHERE user_id='13000000-0000-4000-8000-000000000003'),10,'exact 10 attempts retained');
SELECT is((SELECT count(*)::integer FROM public.product_memberships WHERE user_id='13000000-0000-4000-8000-000000000003'),0,'failed attempts never join user');

-- Admin duration grant starts at the latest finite unrevoked expiry.
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM set_config('m3.direct_grant',public.admin_grant_entitlement(
    '13000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000001',
    'pro','duration',30,NULL,NULL,false,'renewal','grant-a')::text,true);
END;
$$;
SELECT is(current_setting('m3.direct_grant')::jsonb->>'idempotent_replay','false','first grant creates');
SELECT is((public.admin_grant_entitlement(
  '13000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000001',
  'pro','duration',30,NULL,NULL,false,'renewal','grant-a')->>'idempotent_replay'),'true','same grant replays');
SELECT throws_ok($$SELECT public.admin_grant_entitlement(
  '13000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000001',
  'pro','duration',365,NULL,NULL,false,'renewal','grant-a')$$,'PT409');
SELECT is(
  (SELECT starts_at FROM public.entitlement_grants WHERE id=(current_setting('m3.direct_grant')::jsonb->>'grant_id')::uuid),
  (SELECT ends_at FROM public.entitlement_grants WHERE id=(current_setting('m3.first_redemption')::jsonb->>'grant_id')::uuid),
  'duration renewal starts exactly at future end, no overlap');
SELECT ok(
  (SELECT ends_at-starts_at=interval '30 days' FROM public.entitlement_grants
    WHERE id=(current_setting('m3.direct_grant')::jsonb->>'grant_id')::uuid),
  'renewed duration ends at start plus 30 days');
SELECT throws_ok($$SELECT public.admin_grant_entitlement(
  '13000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000001',
  'pro','duration',30,transaction_timestamp(),NULL,false,'bad','grant-invalid1')$$,'PT422');
SELECT throws_ok($$SELECT public.admin_grant_entitlement(
  '13000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000001',
  'pro','explicit_window',NULL,transaction_timestamp(),NULL,false,'bad','grant-invalid2')$$,'PT422');
SELECT throws_ok($$SELECT public.admin_grant_entitlement(
  '13000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000001',
  'free','duration',30,NULL,NULL,false,'bad','grant-invalid3')$$,'PT422');
SELECT is((public.admin_grant_entitlement(
  '13000000-0000-4000-8000-000000000003','23000000-0000-4000-8000-000000000002',
  'pro','explicit_window',NULL,transaction_timestamp(),NULL,true,'permanent','grant-lifetime')->>'idempotent_replay'),'false','explicit lifetime grant allowed');
SELECT is((SELECT count(*)::integer FROM public.product_memberships WHERE user_id='13000000-0000-4000-8000-000000000003'),0,'admin direct grant does not autojoin');

-- Revoking a used code cannot revoke historical Grant. Full batch revoke
-- removes only future redemption ability, never already successful grants.
SELECT is((public.admin_revoke_code((SELECT id FROM public.redemption_codes WHERE batch_id=(current_setting('m3.first_batch')::jsonb->>'batch_id')::uuid),
  'rotate')->>'changed'),'true','revoke issued test code');
SELECT is((public.admin_revoke_code((SELECT id FROM public.redemption_codes WHERE batch_id=(current_setting('m3.first_batch')::jsonb->>'batch_id')::uuid),
  'again')->>'changed'),'false','revoke same test code idempotent');
DO $$
BEGIN
  PERFORM set_config('m3.second_batch',public.admin_create_codes(
    '23000000-0000-4000-8000-000000000002','pro',2,365,false,1,
    NULL,'beta-issued','beta')::text,true);
END;
$$;
SELECT is((SELECT count(*)::integer FROM public.redemption_codes
  WHERE batch_id=(current_setting('m3.second_batch')::jsonb->>'batch_id')::uuid),2,'second batch has two codes');
SELECT is((public.admin_revoke_batch(
  (current_setting('m3.second_batch')::jsonb->>'batch_id')::uuid,'withdraw')->>'revoked_codes'),'2','batch revoke affects both');
SELECT is((public.admin_revoke_batch(
  (current_setting('m3.second_batch')::jsonb->>'batch_id')::uuid,'again')->>'changed'),'false','batch revoke idempotent');
SELECT is((public.admin_revoke_grant(
  (current_setting('m3.direct_grant')::jsonb->>'grant_id')::uuid,'refund')->>'changed'),'true','revoke direct grant');
SELECT is((public.admin_revoke_grant(
  (current_setting('m3.direct_grant')::jsonb->>'grant_id')::uuid,'again')->>'changed'),'false','revoke grant idempotent');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT is(public.check_access('m3_alpha')->>'tier','pro','code Grant survives code revocation');
SELECT is((public.redeem_code('m3_alpha',
  current_setting('m3.first_batch')::jsonb->'codes'->>0)->>'code'),'REDEEM_ALREADY_USED','own redemption still recognized after code revoked');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000005',true);
SET LOCAL ROLE authenticated;
SELECT is((public.redeem_code('m3_beta',
  current_setting('m3.second_batch')::jsonb->'codes'->>0)->>'code'),'REDEEM_CODE_INVALID','batch-revoked code cannot be redeemed');
SELECT is((public.redeem_code('m3_alpha',
  current_setting('m3.second_batch')::jsonb->'codes'->>0)->>'code'),'REDEEM_CODE_INVALID','cross-product code is not usable');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT is((public.admin_revoke_grant(
  (current_setting('m3.first_redemption')::jsonb->>'grant_id')::uuid,'refund')->>'changed'),'true','revoke original redemption Grant');
SELECT is((SELECT count(*)::integer FROM public.redemption_codes WHERE redeemed_count>max_redemptions),0,'no overredeemed code');
SELECT is((SELECT count(*)::integer FROM public.admin_audit_log WHERE action='code.create' AND actor_user_id='13000000-0000-4000-8000-000000000001'),2,'one test audit per initial batch');
SELECT is((SELECT count(*)::integer FROM public.admin_audit_log WHERE action='grant.create' AND actor_user_id='13000000-0000-4000-8000-000000000001'),2,'only two test admin grant audits');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT is(public.check_access('m3_alpha')->>'tier','free','last Grant revoked naturally returns Free');
RESET ROLE;

-- R-16: keep the lifetime guard inside the renewal lock, after same-code
-- replay and code validity checks. Synthetic lifetime code is test-only
-- because normal Admin lifetime-code issuance is not enabled.
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.admin_grant_entitlement(
    '13000000-0000-4000-8000-000000000006','23000000-0000-4000-8000-000000000001',
    'pro','explicit_window',NULL,transaction_timestamp()-interval '1 day',NULL,true,
    'R-16 active lifetime','r16-active');
  PERFORM set_config('m3.r16_batch',public.admin_create_codes(
    '23000000-0000-4000-8000-000000000001','pro',1,30,false,10,
    NULL,'r16-duration',NULL)::text,true);
END;
$$;
RESET ROLE;
INSERT INTO public.entitlement_grants(user_id,product_id,tier,source_type,source_ref,
  grant_mode,requested_duration_days,starts_at,ends_at,revoked_at,revoked_by,revoke_reason)
VALUES
 ('13000000-0000-4000-8000-000000000007','23000000-0000-4000-8000-000000000001',
  'pro','admin','r16-future','explicit_window',NULL,transaction_timestamp()+interval '1 day',NULL,NULL,NULL,NULL),
 ('13000000-0000-4000-8000-000000000008','23000000-0000-4000-8000-000000000001',
  'pro','admin','r16-revoked','explicit_window',NULL,transaction_timestamp()-interval '1 day',NULL,
  transaction_timestamp(),'13000000-0000-4000-8000-000000000001','R-16 fixture'),
 ('13000000-0000-4000-8000-000000000009','23000000-0000-4000-8000-000000000002',
  'pro','admin','r16-other-product','explicit_window',NULL,transaction_timestamp()-interval '1 day',NULL,NULL,NULL,NULL),
 ('13000000-0000-4000-8000-000000000010','23000000-0000-4000-8000-000000000001',
  'pro','admin','r16-finite','duration',30,transaction_timestamp()-interval '1 day',
  transaction_timestamp()+interval '29 days',NULL,NULL,NULL);
INSERT INTO public.redemption_code_batches(id,product_id,tier,created_by,request_id,
  quantity,is_lifetime,max_redemptions_per_code)
VALUES('33000000-0000-4000-8000-000000000016',
  '23000000-0000-4000-8000-000000000001','pro',
  '13000000-0000-4000-8000-000000000001','r16-lifetime',1,true,2);
INSERT INTO public.redemption_codes(batch_id,batch_ordinal,code_hash,code_prefix,
  product_id,tier,is_lifetime,max_redemptions,created_by)
VALUES('33000000-0000-4000-8000-000000000016',1,
  pg_catalog.encode(extensions.digest('M3LIFETIMESYNTHETIC','sha256'),'hex'),'M3LIFET',
  '23000000-0000-4000-8000-000000000001','pro',true,2,
  '13000000-0000-4000-8000-000000000001');

SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000006',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT is((public.redeem_code('m3_alpha',
  current_setting('m3.r16_batch')::jsonb->'codes'->>0)->>'code'),'REDEEM_LIFETIME_ACTIVE',
  'R-16 active lifetime rejects different duration code');
SELECT is((public.redeem_code('m3_alpha','M3-LIFETIME-SYNTHETIC')->>'code'),
  'REDEEM_LIFETIME_ACTIVE','R-16 active lifetime rejects different lifetime code');
SELECT is((public.redeem_code('m3_alpha','not-a-code')->>'code'),
  'REDEEM_CODE_INVALID','R-16 unrecognized code remains opaque');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.product_memberships
  WHERE user_id='13000000-0000-4000-8000-000000000006'),0,'R-16 rejection does not join member');
SELECT is((SELECT count(*)::integer FROM public.redemptions
  WHERE user_id='13000000-0000-4000-8000-000000000006'),0,'R-16 rejection writes no redemption');
SELECT is((SELECT count(*)::integer FROM public.entitlement_grants
  WHERE user_id='13000000-0000-4000-8000-000000000006'),1,'R-16 rejection writes no extra Grant');
SELECT is((SELECT redeemed_count FROM public.redemption_codes
  WHERE batch_id=(current_setting('m3.r16_batch')::jsonb->>'batch_id')::uuid),0,
  'R-16 rejected duration code not consumed');
SELECT is((SELECT redeemed_count FROM public.redemption_codes
  WHERE batch_id='33000000-0000-4000-8000-000000000016'),0,
  'R-16 rejected lifetime code not consumed');

SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000007',true);
SET LOCAL ROLE authenticated;
SELECT is((public.redeem_code('m3_alpha',
  current_setting('m3.r16_batch')::jsonb->'codes'->>0)->>'ok'),'true',
  'R-16 future lifetime does not block redemption');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000008',true);
SET LOCAL ROLE authenticated;
SELECT is((public.redeem_code('m3_alpha',
  current_setting('m3.r16_batch')::jsonb->'codes'->>0)->>'ok'),'true',
  'R-16 revoked lifetime does not block redemption');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000009',true);
SET LOCAL ROLE authenticated;
SELECT is((public.redeem_code('m3_alpha',
  current_setting('m3.r16_batch')::jsonb->'codes'->>0)->>'ok'),'true',
  'R-16 different-product lifetime does not block redemption');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000010',true);
SET LOCAL ROLE authenticated;
SELECT is((public.redeem_code('m3_alpha',
  current_setting('m3.r16_batch')::jsonb->'codes'->>0)->>'ok'),'true',
  'R-16 finite duration Pro can extend');
RESET ROLE;
SELECT is((SELECT redeemed_count FROM public.redemption_codes
  WHERE batch_id=(current_setting('m3.r16_batch')::jsonb->>'batch_id')::uuid),4,
  'R-16 permitted redemptions consume exactly four uses');
SELECT is((SELECT count(*)::integer FROM public.redemptions
  WHERE code_id=(SELECT id FROM public.redemption_codes
    WHERE batch_id=(current_setting('m3.r16_batch')::jsonb->>'batch_id')::uuid)),4,
  'R-16 redemption facts match code counter');

SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT is((public.admin_grant_entitlement(
  '13000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000001',
  'pro','explicit_window',NULL,transaction_timestamp()-interval '1 day',NULL,true,
  'R-16 admin direct grant','r16-original')->>'idempotent_replay'),'false',
  'R-16 Admin direct lifetime grant is independent');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT is((public.redeem_code('m3_alpha',
  current_setting('m3.first_batch')::jsonb->'codes'->>0)->>'code'),'REDEEM_ALREADY_USED',
  'R-16 already-redeemed same code precedes lifetime guard');
RESET ROLE;


-- Technical failures must roll back *all* writes. An audit/insert failure
-- cannot be reclassified as a successful business rejection or consume a code.
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM set_config('m3.rollback_batch',public.admin_create_codes(
    '23000000-0000-4000-8000-000000000001','pro',1,30,false,1,
    NULL,'rollback-test',NULL)::text,true);
END;
$$;
RESET ROLE;

CREATE FUNCTION pg_temp.reject_test_redemption() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic redemption storage error' USING ERRCODE='P0001'; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.reject_test_redemption() TO aisencore_rpc_executor;
CREATE TRIGGER m3_fail_redemption BEFORE INSERT ON public.redemptions
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_redemption();
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000005',true);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(pg_catalog.format('SELECT public.redeem_code(''m3_alpha'',%L)',
  current_setting('m3.rollback_batch')::jsonb->'codes'->>0),'P0001');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.redemptions WHERE user_id='13000000-0000-4000-8000-000000000005'),0,'technical failure leaves no redemption');
SELECT is((SELECT count(*)::integer FROM public.entitlement_grants WHERE user_id='13000000-0000-4000-8000-000000000005'),0,'technical failure leaves no Grant');
SELECT is((SELECT count(*)::integer FROM public.product_memberships WHERE user_id='13000000-0000-4000-8000-000000000005'),0,'technical failure rolls back implicit membership');
SELECT is((SELECT redeemed_count FROM public.redemption_codes
  WHERE batch_id=(current_setting('m3.rollback_batch')::jsonb->>'batch_id')::uuid),0,'technical failure does not consume code');
SELECT is((SELECT pg_catalog.array_length(failed_at,1) FROM public.redemption_rate_limits
  WHERE user_id='13000000-0000-4000-8000-000000000005'),2,'technical failure does not record a new bad attempt');
DROP TRIGGER m3_fail_redemption ON public.redemptions;

CREATE FUNCTION pg_temp.reject_test_audit() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit storage error' USING ERRCODE='P0001'; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.reject_test_audit() TO aisencore_rpc_executor;
CREATE TRIGGER m3_fail_admin_audit BEFORE INSERT ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_audit();
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.admin_grant_entitlement(
  '13000000-0000-4000-8000-000000000005','23000000-0000-4000-8000-000000000001',
  'pro','duration',30,NULL,NULL,false,'synthetic','audit-rollback')$$,'P0001');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.entitlement_grants
  WHERE source_type='admin' AND source_ref='admin:13000000-0000-4000-8000-000000000001:audit-rollback'),0,
  'failed admin audit rolls back newly inserted Grant');
SELECT is((SELECT count(*)::integer FROM public.admin_audit_log
  WHERE action='grant.create' AND target_type='grant' AND reason='synthetic'),0,
  'failed admin audit is never recorded as success');
DROP TRIGGER m3_fail_admin_audit ON public.admin_audit_log;

SELECT * FROM finish();
ROLLBACK;
