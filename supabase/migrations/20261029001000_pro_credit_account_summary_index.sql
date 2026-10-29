-- PERF S4 / CORE-ENTITLEMENT-001: a balance summary must see both
-- consumed and remaining historical credits. The FIFO partial index
-- (remaining_seconds>0) cannot support that full-account aggregate.
--
-- Keep mutable consumed/remaining seconds out of this index so ordinary
-- settlement need not rewrite its leaf entries.
-- Preflight in scripts/experiments/pro-credit-scale-rollback.sql used
-- real PostgreSQL temp tables, 100/1k/10k rows, EXPLAIN ANALYZE and ROLLBACK.
-- This is NOT a production P75/P95 or end-to-end HTTP benchmark.
CREATE INDEX pro_credit_entries_account_summary_idx
  ON public.pro_credit_entries (user_id, product_id);
