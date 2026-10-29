-- Test-only statements. Runner must wrap this file and its migration in
-- BEGIN / ROLLBACK on one connection; never run as persistent migration.
-- Auth schema owns the QA identity. Create it under the local DBA role, then
-- exercise trusted credit routines as their real restricted executor role.
DO $$
DECLARE v_user uuid:=gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,email) VALUES
    (v_user,'pro-credit-rollback-qa-'||v_user::text||'@aisencore.test');
  PERFORM set_config('test.credit_user',v_user::text,false);
END $$;
SET ROLE aisencore_rpc_executor;
DO $$
DECLARE
  v_user uuid:=current_setting('test.credit_user')::uuid;
  v_product uuid;
  v_a uuid:=gen_random_uuid();
  v_b uuid:=gen_random_uuid();
  v_p uuid:=gen_random_uuid();
  v_t timestamptz:=transaction_timestamp()+interval '1 minute';
  v_summary jsonb;
  v_existing bigint;
  v_conflict boolean:=false;
BEGIN
  SELECT id INTO STRICT v_product FROM public.products WHERE product_key='aisenlens';
  INSERT INTO public.product_memberships(user_id,product_id,status)
    VALUES(v_user,v_product,'active');

  PERFORM private.pro_credit_settle(v_user,v_product,v_t);
  INSERT INTO public.entitlement_grants(id,user_id,product_id,tier,source_type,
    source_ref,grant_mode,requested_duration_days,starts_at,ends_at)
  VALUES
    (v_a,v_user,v_product,'pro','admin','test:qa:'||v_a::text,
      'duration',30,v_t,v_t+interval '30 days'),
    (v_b,v_user,v_product,'pro','redeem_code','test:qa:'||v_b::text,
      'duration',30,v_t,v_t+interval '30 days');
  PERFORM private.pro_credit_add(v_a,v_user,v_product,30);
  PERFORM private.pro_credit_add(v_b,v_user,v_product,30);
  v_summary:=private.pro_credit_summary(v_user,v_product,v_t);
  IF v_summary->>'tier'<>'pro'
    OR (v_summary->>'remaining_credit_seconds')::numeric <> 60*86400
    OR (v_summary->>'effective_ends_at')::timestamptz <> v_t+interval '60 days'
  THEN RAISE EXCEPTION 'TWO_30D_GRANTS_NOT_60D'; END IF;

  -- The early Grant has used 20 days; cancel only 10 remaining.
  PERFORM private.pro_credit_settle(v_user,v_product,v_t+interval '20 days');
  UPDATE public.entitlement_grants SET revoked_at=v_t+interval '20 days',
    revoked_by=v_user,revoke_reason='QA rollback only' WHERE id=v_a;
  PERFORM private.pro_credit_revoke(v_a);
  v_summary:=private.pro_credit_summary(v_user,v_product,v_t+interval '20 days');
  IF (v_summary->>'remaining_credit_seconds')::numeric <> 30*86400 OR
     (v_summary->>'effective_ends_at')::timestamptz <> v_t+interval '50 days'
  THEN RAISE EXCEPTION 'REVOKE_OLD_GRANT_CREATED_GAP'; END IF;

  -- Freeze finite credit after 5 more days, then resume after 75 covered days.
  PERFORM private.pro_credit_settle(v_user,v_product,v_t+interval '25 days');
  INSERT INTO public.entitlement_grants(id,user_id,product_id,tier,source_type,
    source_ref,grant_mode,starts_at,ends_at)
  VALUES(v_p,v_user,v_product,'pro','admin','test:qa:'||v_p::text,
    'explicit_window',v_t+interval '25 days',NULL);
  v_summary:=private.pro_credit_summary(v_user,v_product,v_t+interval '90 days');
  IF v_summary->>'tier'<>'pro' OR v_summary->>'is_lifetime'<>'true'
    OR v_summary->>'effective_ends_at' IS NOT NULL
    OR (v_summary->>'remaining_credit_seconds')::numeric<>25*86400
  THEN RAISE EXCEPTION 'LIFETIME_DID_NOT_FREEZE_FINITE_CREDIT'; END IF;
  PERFORM private.pro_credit_settle(v_user,v_product,v_t+interval '100 days');
  UPDATE public.entitlement_grants SET revoked_at=v_t+interval '100 days',
    revoked_by=v_user,revoke_reason='QA rollback only' WHERE id=v_p;
  v_summary:=private.pro_credit_summary(v_user,v_product,v_t+interval '100 days');
  IF v_summary->>'is_lifetime'<>'false' OR
    (v_summary->>'effective_ends_at')::timestamptz <> v_t+interval '125 days'
  THEN RAISE EXCEPTION 'LIFETIME_REVOKE_DID_NOT_RESUME'; END IF;

  -- Strong audit/credit conservation constraint cannot be bypassed.
  BEGIN
    UPDATE public.pro_credit_entries SET remaining_seconds=remaining_seconds+1
      WHERE grant_id=v_b;
  EXCEPTION WHEN check_violation THEN
    v_conflict:=true;
  END;
  IF NOT v_conflict THEN RAISE EXCEPTION 'CREDIT_CONSERVATION_NOT_ENFORCED'; END IF;
  SELECT count(*) INTO v_existing FROM public.pro_credit_entries WHERE grant_id=v_a
    AND consumed_seconds=20*86400 AND revoked_seconds=10*86400
    AND remaining_seconds=0;
  IF v_existing<>1 THEN RAISE EXCEPTION 'GRANT_A_HISTORY_NOT_PRESERVED'; END IF;
  RAISE NOTICE 'REAL_PG_CREDIT_ENGINE_ROLLBACK_PASS';
END;
$$;
RESET ROLE;
