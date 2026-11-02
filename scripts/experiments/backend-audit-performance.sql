BEGIN;
SET LOCAL statement_timeout='120s';
INSERT INTO public.products(id,product_key,name,status)
 VALUES('f6000000-0000-4000-8000-000000000001','backend_perf','Backend performance QA','active');
INSERT INTO auth.users(id,email)
 SELECT md5('backend-perf-'||n)::uuid,'backend-perf-'||n||'@example.invalid' FROM generate_series(1,10000) n;
INSERT INTO public.product_memberships(user_id,product_id,status)
 SELECT md5('backend-perf-'||n)::uuid,'f6000000-0000-4000-8000-000000000001','active' FROM generate_series(1,10000) n;
INSERT INTO public.entitlement_grants(id,user_id,product_id,source_type,source_ref,grant_mode,requested_duration_days,starts_at,ends_at)
 SELECT md5('backend-perf-grant-'||n)::uuid,md5('backend-perf-'||n)::uuid,'f6000000-0000-4000-8000-000000000001',
 'admin','backend-perf-'||n,'duration',30,transaction_timestamp(),transaction_timestamp()+interval '30 days' FROM generate_series(1,10000) n;
INSERT INTO public.pro_credit_accounts(user_id,product_id,settled_at)
 SELECT md5('backend-perf-'||n)::uuid,'f6000000-0000-4000-8000-000000000001',transaction_timestamp() FROM generate_series(1,10000) n;
INSERT INTO public.pro_credit_entries(grant_id,user_id,product_id,credited_seconds,remaining_seconds)
 SELECT md5('backend-perf-grant-'||n)::uuid,md5('backend-perf-'||n)::uuid,'f6000000-0000-4000-8000-000000000001',30*86400,30*86400 FROM generate_series(1,10000) n;
ANALYZE public.product_memberships;
ANALYZE public.pro_credit_accounts;
ANALYZE public.pro_credit_entries;
ANALYZE public.entitlement_grants;
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM public.platform_admins WHERE active LIMIT 1),true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE started timestamptz; result jsonb; quantity integer; batch uuid; iteration integer;
BEGIN
 FOR iteration IN 1..3 LOOP
  started:=clock_timestamp();
  result:=public.admin_dashboard_metrics('f6000000-0000-4000-8000-000000000001');
  IF (result->>'pro_members')::integer<>10000 THEN RAISE EXCEPTION 'Wrong dashboard total'; END IF;
  RAISE NOTICE 'DASHBOARD_10K sample=% elapsed_ms=%',iteration,extract(epoch FROM clock_timestamp()-started)*1000;
 END LOOP;
 FOREACH quantity IN ARRAY ARRAY[1,100,1000] LOOP
  started:=clock_timestamp();
  result:=public.admin_create_codes('f6000000-0000-4000-8000-000000000001','pro',quantity,30,false,1,NULL,'backend-perf-'||quantity,NULL);
  RAISE NOTICE 'ISSUE quantity=% elapsed_ms=%',quantity,extract(epoch FROM clock_timestamp()-started)*1000;
  batch:=(result->>'batch_id')::uuid;
  started:=clock_timestamp();
  result:=public.admin_revoke_batch(batch,'Rollback-only performance QA');
  IF (result->>'revoked_codes')::integer<>quantity THEN RAISE EXCEPTION 'Wrong revoked total'; END IF;
  RAISE NOTICE 'REVOKE quantity=% elapsed_ms=%',quantity,extract(epoch FROM clock_timestamp()-started)*1000;
 END LOOP;
END;$$;
RESET ROLE;
ROLLBACK;
