BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
INSERT INTO auth.users(id,email)
 SELECT md5('audit-metric-'||n)::uuid,'audit-metric-'||n||'@example.invalid' FROM generate_series(1,8) n;
INSERT INTO public.products(id,product_key,name,status) VALUES
 ('f7000000-0000-4000-8000-000000000001','audit_metrics_one','Metrics one','active'),
 ('f7000000-0000-4000-8000-000000000002','audit_metrics_two','Metrics two','active');
INSERT INTO public.platform_admins(user_id,active) VALUES(md5('audit-metric-8')::uuid,true);
INSERT INTO public.product_memberships(user_id,product_id,status)
 SELECT md5('audit-metric-'||n)::uuid,'f7000000-0000-4000-8000-000000000001',
 CASE WHEN n=6 THEN 'left' ELSE 'active' END FROM generate_series(1,7) n;
INSERT INTO public.product_memberships(user_id,product_id,status)
 VALUES(md5('audit-metric-1')::uuid,'f7000000-0000-4000-8000-000000000002','active');
INSERT INTO public.entitlement_grants(id,user_id,product_id,source_type,source_ref,grant_mode,requested_duration_days,starts_at,ends_at)
 SELECT md5('audit-metric-grant-'||n)::uuid,md5('audit-metric-'||n)::uuid,'f7000000-0000-4000-8000-000000000001',
 'admin','audit-metric-'||n,'duration',30,transaction_timestamp(),transaction_timestamp()+interval '30 days' FROM generate_series(1,7) n;
INSERT INTO public.entitlement_grants(user_id,product_id,source_type,source_ref,grant_mode,starts_at,ends_at)
 VALUES(md5('audit-metric-3')::uuid,'f7000000-0000-4000-8000-000000000001','admin','audit-permanent','explicit_window',transaction_timestamp(),NULL);
INSERT INTO public.pro_credit_accounts(user_id,product_id,settled_at)
 SELECT md5('audit-metric-'||n)::uuid,'f7000000-0000-4000-8000-000000000001',transaction_timestamp()-interval '1 day' FROM generate_series(1,7) n;
INSERT INTO public.pro_credit_entries(grant_id,user_id,product_id,credited_seconds,consumed_seconds,revoked_seconds,remaining_seconds)
 SELECT md5('audit-metric-grant-'||n)::uuid,md5('audit-metric-'||n)::uuid,'f7000000-0000-4000-8000-000000000001',30*86400,
 CASE WHEN n=2 THEN 29*86400 ELSE 0 END,CASE WHEN n=4 THEN 30*86400 ELSE 0 END,
 CASE WHEN n=2 THEN 86400 WHEN n=4 THEN 0 ELSE 30*86400 END FROM generate_series(1,7) n;
INSERT INTO public.platform_account_restrictions(user_id,reason_code,created_by)
 VALUES(md5('audit-metric-5')::uuid,'Audit',md5('audit-metric-8')::uuid);
SELECT set_config('request.jwt.claim.sub',md5('audit-metric-8')::uuid::text,true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SELECT no_plan();
SET LOCAL ROLE authenticated;
SELECT is((public.admin_dashboard_metrics('f7000000-0000-4000-8000-000000000001')->>'pro_members')::integer,3,
 'dashboard counts finite, permanent and eligible members, excludes expired revoked blocked left');
RESET ROLE;
SET LOCAL ROLE aisencore_rpc_executor;
CREATE TEMP TABLE expected_dashboard AS SELECT count(DISTINCT m.user_id)::integer AS total
 FROM public.product_memberships m JOIN public.products p ON p.id=m.product_id
 WHERE m.status='active' AND p.status='active' AND NOT EXISTS(
 SELECT 1 FROM public.platform_account_restrictions r WHERE r.user_id=m.user_id)
 AND (private.pro_credit_summary(m.user_id,m.product_id,transaction_timestamp())->>'pro_active')::boolean;
GRANT SELECT ON expected_dashboard TO authenticated;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT is((public.admin_dashboard_metrics()->>'pro_members')::integer,(SELECT total FROM expected_dashboard),
 'global set-based metric agrees with authoritative per-account summary');
SELECT is((public.admin_dashboard_metrics('f7000000-0000-4000-8000-000000000001')->>'normal_users')::integer,5,
 'product normal users exclude blocked and left');
SELECT is((public.admin_dashboard_metrics('f7000000-0000-4000-8000-000000000001')->>'new_users_month')::integer,7,
 'monthly joins include historical left and blocked memberships');
RESET ROLE;
UPDATE public.products SET status='suspended' WHERE id='f7000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT is((public.admin_dashboard_metrics('f7000000-0000-4000-8000-000000000001')->>'pro_members')::integer,0,
 'suspended product has no usable Pro members');
RESET ROLE;
INSERT INTO public.redemption_code_batches(id,product_id,tier,created_by,request_id,quantity,grant_duration_days,is_lifetime,max_redemptions_per_code)
 VALUES('f8000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','pro',md5('audit-metric-8')::uuid,'audit-batch',1,30,false,1);
SELECT throws_ok($$INSERT INTO public.redemption_codes(batch_id,batch_ordinal,product_id,tier,code_hash,code_prefix,grant_duration_days,is_lifetime,max_redemptions,created_by)
 VALUES('f8000000-0000-4000-8000-000000000001',1,'f7000000-0000-4000-8000-000000000002','pro',repeat('a',64),'AUDIT',30,false,1,md5('audit-metric-8')::uuid)$$,'23503',NULL,'code product must match batch');
INSERT INTO public.redemption_codes(id,batch_id,batch_ordinal,product_id,tier,code_hash,code_prefix,grant_duration_days,is_lifetime,max_redemptions,created_by)
 VALUES('f9000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000001',1,
 'f7000000-0000-4000-8000-000000000001','pro',repeat('b',64),'AUDIT',30,false,1,md5('audit-metric-8')::uuid);
SELECT throws_ok($$INSERT INTO public.redemptions(code_id,user_id,product_id,grant_id)
 VALUES('f9000000-0000-4000-8000-000000000001',md5('audit-metric-1')::uuid,'f7000000-0000-4000-8000-000000000002',md5('audit-metric-grant-1')::uuid)$$,'23503',NULL,'redemption cannot cross products');
SELECT throws_ok($$INSERT INTO public.redemptions(code_id,user_id,product_id,grant_id)
 VALUES('f9000000-0000-4000-8000-000000000001',md5('audit-metric-2')::uuid,'f7000000-0000-4000-8000-000000000001',md5('audit-metric-grant-1')::uuid)$$,'23503',NULL,'redemption grant must belong to same user');
SELECT * FROM finish();
ROLLBACK;
