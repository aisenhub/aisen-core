-- Perf S4: statement-only benchmarks on TEMP copies of exact public schema.
-- Caller must use psql -f (backslash commands); no permanent QA identities.
-- 100/1000/10000 rows spread over 1000 accounts. Summary scans all
-- entries, including consumed rows (the FIFO partial index cannot satisfy it).
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL jit=off;
CREATE TEMP TABLE qa_credit_entries
 (LIKE public.pro_credit_entries INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE qa_credit_accounts
 (LIKE public.pro_credit_accounts INCLUDING ALL) ON COMMIT DROP;
\echo PERF_S4_100_ROWS
INSERT INTO qa_credit_entries(grant_id,user_id,product_id,credited_seconds,remaining_seconds)
SELECT gen_random_uuid(),md5((n%1000)::text)::uuid,
  '00000000-0000-4000-8000-000000000002'::uuid,86400,86400
FROM generate_series(1,100) n;
ANALYZE qa_credit_entries;
EXPLAIN (ANALYZE,BUFFERS,TIMING OFF)
 SELECT COALESCE(SUM(remaining_seconds),0) FROM qa_credit_entries
 WHERE user_id=md5('23')::uuid AND product_id='00000000-0000-4000-8000-000000000002'::uuid;
\echo PERF_S4_1000_ROWS
INSERT INTO qa_credit_entries(grant_id,user_id,product_id,credited_seconds,remaining_seconds)
SELECT gen_random_uuid(),md5((n%1000)::text)::uuid,
  '00000000-0000-4000-8000-000000000002'::uuid,86400,86400
FROM generate_series(101,1000) n;
ANALYZE qa_credit_entries;
EXPLAIN (ANALYZE,BUFFERS,TIMING OFF)
 SELECT COALESCE(SUM(remaining_seconds),0) FROM qa_credit_entries
 WHERE user_id=md5('23')::uuid AND product_id='00000000-0000-4000-8000-000000000002'::uuid;
\echo PERF_S4_10000_ROWS_BEFORE_INDEX
INSERT INTO qa_credit_entries(grant_id,user_id,product_id,credited_seconds,remaining_seconds)
SELECT gen_random_uuid(),md5((n%1000)::text)::uuid,
  '00000000-0000-4000-8000-000000000002'::uuid,86400,86400
FROM generate_series(1001,10000) n;
ANALYZE qa_credit_entries;
EXPLAIN (ANALYZE,BUFFERS,TIMING OFF)
 SELECT COALESCE(SUM(remaining_seconds),0) FROM qa_credit_entries
 WHERE user_id=md5('23')::uuid AND product_id='00000000-0000-4000-8000-000000000002'::uuid;
\echo PERF_S4_10000_ROWS_AFTER_ACCOUNT_INDEX
-- Keep mutable balance fields OUT of this index to avoid extra index writes
-- during every credit settlement. The equality prefix is what matters.
CREATE INDEX qa_credit_entries_account_summary ON qa_credit_entries(user_id,product_id);
ANALYZE qa_credit_entries;
EXPLAIN (ANALYZE,BUFFERS,TIMING OFF)
 SELECT COALESCE(SUM(remaining_seconds),0) FROM qa_credit_entries
 WHERE user_id=md5('23')::uuid AND product_id='00000000-0000-4000-8000-000000000002'::uuid;
\echo PERF_S4_ROLLBACK
ROLLBACK;
