BEGIN;
SET LOCAL statement_timeout='30s';
INSERT INTO public.products(id,product_key,name,status) VALUES
 ('fa000000-0000-4000-8000-000000000001','audit_index_one','Index QA one','active'),
 ('fa000000-0000-4000-8000-000000000002','audit_index_two','Index QA two','active');
INSERT INTO public.redemption_code_batches(product_id,tier,created_by,request_id,quantity,grant_duration_days,is_lifetime,max_redemptions_per_code,created_at)
 SELECT CASE WHEN n%1000=0 THEN 'fa000000-0000-4000-8000-000000000001'::uuid ELSE 'fa000000-0000-4000-8000-000000000002'::uuid END,
 'pro',(SELECT user_id FROM public.platform_admins WHERE active LIMIT 1),'audit-index-'||n,1,30,false,1,
 transaction_timestamp()-n*interval '1 second' FROM generate_series(1,20000) n;
ANALYZE public.redemption_code_batches;
EXPLAIN(ANALYZE,BUFFERS) SELECT id FROM public.redemption_code_batches ORDER BY created_at DESC,id DESC LIMIT 20;
EXPLAIN(ANALYZE,BUFFERS) SELECT id FROM public.redemption_code_batches WHERE product_id='fa000000-0000-4000-8000-000000000001' ORDER BY created_at DESC,id DESC LIMIT 20;
CREATE INDEX redemption_batches_created_idx ON public.redemption_code_batches(created_at DESC,id DESC);
CREATE INDEX redemption_batches_product_created_idx ON public.redemption_code_batches(product_id,created_at DESC,id DESC);
EXPLAIN(ANALYZE,BUFFERS) SELECT id FROM public.redemption_code_batches ORDER BY created_at DESC,id DESC LIMIT 20;
EXPLAIN(ANALYZE,BUFFERS) SELECT id FROM public.redemption_code_batches WHERE product_id='fa000000-0000-4000-8000-000000000001' ORDER BY created_at DESC,id DESC LIMIT 20;
ROLLBACK;
