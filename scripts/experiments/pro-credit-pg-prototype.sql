-- EXPERIMENT ONLY; transaction rolls back and objects stay session-local.
-- This is NOT an approved migration, a production function, or a replacement
-- for the service's AAL2/RLS, retry and cross-process concurrency gates.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE pro_qa_accounts (
  account text PRIMARY KEY,
  settled_at timestamptz NOT NULL,
  permanent_id text
) ON COMMIT DROP;
CREATE TEMP TABLE pro_qa_credits (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grant_id text NOT NULL UNIQUE,
  account text NOT NULL REFERENCES pro_qa_accounts(account),
  source_key text NOT NULL UNIQUE,
  credited_seconds bigint NOT NULL CHECK (credited_seconds>0),
  remaining_seconds bigint NOT NULL CHECK (remaining_seconds>=0),
  consumed_seconds bigint NOT NULL DEFAULT 0 CHECK (consumed_seconds>=0),
  revoked_seconds bigint NOT NULL DEFAULT 0 CHECK (revoked_seconds>=0),
  CHECK (remaining_seconds+consumed_seconds+revoked_seconds=credited_seconds)
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.qa_settle(p_account text,p_now timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_account record; v_credit record; v_elapsed bigint; v_take bigint;
BEGIN
  SELECT * INTO v_account FROM pro_qa_accounts
  WHERE account=p_account FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  IF p_now<v_account.settled_at THEN RAISE EXCEPTION 'EVENT_TIME_REVERSED'; END IF;
  v_elapsed:=floor(extract(epoch FROM (p_now-v_account.settled_at)))::bigint;
  IF v_account.permanent_id IS NULL THEN
    FOR v_credit IN SELECT sequence,remaining_seconds FROM pro_qa_credits
      WHERE account=p_account AND remaining_seconds>0 ORDER BY sequence FOR UPDATE
    LOOP
      EXIT WHEN v_elapsed=0;
      v_take:=least(v_elapsed,v_credit.remaining_seconds);
      UPDATE pro_qa_credits SET remaining_seconds=remaining_seconds-v_take,
        consumed_seconds=consumed_seconds+v_take
        WHERE sequence=v_credit.sequence;
      v_elapsed:=v_elapsed-v_take;
    END LOOP;
  END IF;
  UPDATE pro_qa_accounts SET settled_at=p_now WHERE account=p_account;
END;
$$;

CREATE FUNCTION pg_temp.qa_grant(p_account text,p_grant_id text,p_source text,
  p_days integer,p_at timestamptz) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_old record; v_lifetime text;
BEGIN
  IF p_days NOT BETWEEN 1 AND 36500 THEN RAISE EXCEPTION 'DURATION_INVALID'; END IF;
  INSERT INTO pro_qa_accounts(account,settled_at) VALUES(p_account,p_at)
    ON CONFLICT(account) DO NOTHING;
  PERFORM pg_temp.qa_settle(p_account,p_at);
  SELECT * INTO v_old FROM pro_qa_credits WHERE source_key=p_source;
  IF FOUND THEN
    IF v_old.grant_id<>p_grant_id OR v_old.account<>p_account
      OR v_old.credited_seconds<>(p_days::bigint*86400) THEN
      RAISE EXCEPTION 'SOURCE_CONFLICT';
    END IF;
    RETURN;
  END IF;
  SELECT permanent_id INTO v_lifetime FROM pro_qa_accounts WHERE account=p_account;
  IF v_lifetime IS NOT NULL THEN RAISE EXCEPTION 'PERMANENT_ALREADY_ACTIVE'; END IF;
  INSERT INTO pro_qa_credits(grant_id,account,source_key,credited_seconds,remaining_seconds)
    VALUES(p_grant_id,p_account,p_source,p_days::bigint*86400,p_days::bigint*86400);
END;
$$;

CREATE FUNCTION pg_temp.qa_revoke(p_grant_id text,p_at timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_account text;
BEGIN
  SELECT account INTO v_account FROM pro_qa_credits WHERE grant_id=p_grant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRANT_NOT_FOUND'; END IF;
  PERFORM pg_temp.qa_settle(v_account,p_at);
  UPDATE pro_qa_credits SET revoked_seconds=revoked_seconds+remaining_seconds,
    remaining_seconds=0 WHERE grant_id=p_grant_id;
END;
$$;

CREATE FUNCTION pg_temp.qa_permanent(p_account text,p_id text,p_at timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_current text;
BEGIN
  INSERT INTO pro_qa_accounts(account,settled_at) VALUES(p_account,p_at)
    ON CONFLICT(account) DO NOTHING;
  PERFORM pg_temp.qa_settle(p_account,p_at);
  SELECT permanent_id INTO v_current FROM pro_qa_accounts WHERE account=p_account;
  IF v_current IS NOT NULL THEN RAISE EXCEPTION 'PERMANENT_ALREADY_ACTIVE'; END IF;
  UPDATE pro_qa_accounts SET permanent_id=p_id WHERE account=p_account;
END;
$$;

CREATE FUNCTION pg_temp.qa_remove_permanent(p_account text,p_id text,p_at timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_current text;
BEGIN
  PERFORM pg_temp.qa_settle(p_account,p_at);
  SELECT permanent_id INTO v_current FROM pro_qa_accounts WHERE account=p_account;
  IF v_current IS DISTINCT FROM p_id THEN RAISE EXCEPTION 'PERMANENT_NOT_ACTIVE'; END IF;
  UPDATE pro_qa_accounts SET permanent_id=NULL WHERE account=p_account;
END;
$$;

CREATE FUNCTION pg_temp.qa_summary(p_account text,p_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_account record; v_balance bigint; v_ends timestamptz;
BEGIN
  SELECT * INTO v_account FROM pro_qa_accounts WHERE account=p_account;
  IF NOT FOUND OR p_at<v_account.settled_at THEN RAISE EXCEPTION 'ACCOUNT_OR_TIME_INVALID'; END IF;
  SELECT coalesce(sum(remaining_seconds),0)::bigint INTO v_balance
    FROM pro_qa_credits WHERE account=p_account;
  IF v_account.permanent_id IS NOT NULL THEN
    RETURN jsonb_build_object('kind','permanent','remaining_seconds',v_balance,'ends_at',NULL);
  END IF;
  v_balance:=greatest(0,v_balance-floor(extract(epoch FROM (p_at-v_account.settled_at)))::bigint);
  v_ends:=CASE WHEN v_balance>0 THEN p_at+make_interval(secs=>v_balance::double precision) ELSE NULL END;
  RETURN jsonb_build_object('kind',CASE WHEN v_balance>0 THEN 'finite' ELSE 'free' END,
    'remaining_seconds',v_balance,'ends_at',v_ends);
END;
$$;

DO $$
DECLARE t timestamptz:='2026-10-28 00:00:00+00'; v jsonb; mismatch_rejected boolean:=false;
BEGIN
  PERFORM pg_temp.qa_grant('test/lens','A','admin:request-A',30,t);
  PERFORM pg_temp.qa_grant('test/lens','B','code:request-B',30,t);
  v:=pg_temp.qa_summary('test/lens',t);
  IF (v->>'remaining_seconds')::bigint<>60*86400 THEN RAISE EXCEPTION 'NEW_CREDIT_NOT_SUMMED'; END IF;
  PERFORM pg_temp.qa_revoke('A',t+interval '20 days');
  v:=pg_temp.qa_summary('test/lens',t+interval '20 days');
  IF (v->>'remaining_seconds')::bigint<>30*86400
     OR (v->>'ends_at')::timestamptz<>t+interval '50 days' THEN
    RAISE EXCEPTION 'REVOKED_CREDIT_CREATED_A_GAP';
  END IF;
  PERFORM pg_temp.qa_grant('test/lens','C','admin:request-C',30,t+interval '40 days');
  v:=pg_temp.qa_summary('test/lens',t+interval '40 days');
  IF (v->>'ends_at')::timestamptz<>t+interval '80 days' THEN
    RAISE EXCEPTION 'CREDIT_EXTENSION_MISMATCH'; END IF;
  PERFORM pg_temp.qa_revoke('C',t+interval '40 days');
  PERFORM pg_temp.qa_permanent('test/lens','P',t+interval '45 days');
  v:=pg_temp.qa_summary('test/lens',t+interval '90 days');
  IF v->>'kind'<>'permanent' OR (v->>'remaining_seconds')::bigint<>5*86400
    THEN RAISE EXCEPTION 'PERMANENT_DID_NOT_FREEZE'; END IF;
  PERFORM pg_temp.qa_remove_permanent('test/lens','P',t+interval '100 days');
  v:=pg_temp.qa_summary('test/lens',t+interval '100 days');
  IF (v->>'ends_at')::timestamptz<>t+interval '105 days'
    THEN RAISE EXCEPTION 'PERMANENT_REVOKE_DID_NOT_RESUME'; END IF;
  PERFORM pg_temp.qa_grant('test/lens','A','admin:request-A',30,t+interval '100 days');
  v:=pg_temp.qa_summary('test/lens',t+interval '100 days');
  IF (v->>'remaining_seconds')::bigint<>5*86400
    THEN RAISE EXCEPTION 'IDEMPOTENT_REPLAY_DOUBLE_CREDIT'; END IF;
  BEGIN
    PERFORM pg_temp.qa_grant('test/lens','WRONG','admin:request-A',90,t+interval '100 days');
  EXCEPTION WHEN raise_exception THEN mismatch_rejected:=true;
  END;
  IF NOT mismatch_rejected THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT_NOT_REJECTED'; END IF;
  PERFORM pg_temp.qa_grant('test/hub','H','admin:hub',10,t);
  IF (pg_temp.qa_summary('test/hub',t)->>'remaining_seconds')::bigint<>10*86400
    OR (pg_temp.qa_summary('test/lens',t+interval '100 days')->>'remaining_seconds')::bigint<>5*86400
    THEN RAISE EXCEPTION 'PRODUCT_SCOPE_LEAK'; END IF;
  RAISE NOTICE 'CREDIT_PG_TEMP_PROTOTYPE_PASS: credit sum, FIFO, partial revoke, permanent freeze/resume, same-request replay, conflict rejection, two product scopes';
END
$$;
ROLLBACK;
