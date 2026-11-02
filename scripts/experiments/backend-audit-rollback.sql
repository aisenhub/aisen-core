BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
INSERT INTO auth.users(id,email) VALUES
 ('f1000000-0000-4000-8000-000000000001','backend-audit-admin@example.invalid'),
 ('f1000000-0000-4000-8000-000000000002','backend-audit-owner@example.invalid');
INSERT INTO public.platform_admins(user_id,active)
 VALUES ('f1000000-0000-4000-8000-000000000001',true);
INSERT INTO public.products(id,product_key,name,status)
 VALUES ('f2000000-0000-4000-8000-000000000001','backend_audit_20261102','Audit QA','active');
INSERT INTO public.product_memberships(user_id,product_id,status)
 VALUES ('f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','active');
INSERT INTO public.user_feedback(id,product_id,user_id,request_id,content,contact_email)
 VALUES ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',
 'f1000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000001',
 'Synthetic rollback-only audit','audit@example.invalid');
INSERT INTO public.feedback_events(feedback_id,actor_user_id,event_type,visibility)
 VALUES ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','created','public');
INSERT INTO public.feedback_attachments(id,feedback_id,slot,object_key,mime_type,size_bytes)
 VALUES ('f5000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001',1,
 'feedback/f2000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000002/f4000000-0000-4000-8000-000000000001/1-'||repeat('a',64)||'.png',
 'image/png',1);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true) IS NOT NULL;
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true) IS NOT NULL;
SELECT 'REPRO_READ_INCREMENTS_VERSION',
 public.admin_mark_feedback_read('f3000000-0000-4000-8000-000000000001',1)->>'version';
SELECT public.admin_feedback_v3('f3000000-0000-4000-8000-000000000001',2,'triage','normal')->>'queue_state';
SELECT 'GRANT_FIRST_HAS_EFFECTIVE_END',public.admin_grant_entitlement(
 'f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001',
 'pro','duration',30,NULL,NULL,false,'Rollback-only audit','backend-audit-request') ? 'effective_ends_at';
SELECT 'REPRO_GRANT_REPLAY_MISSING_EFFECTIVE_END',public.admin_grant_entitlement(
 'f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001',
 'pro','duration',30,NULL,NULL,false,'Rollback-only audit','backend-audit-request') ? 'effective_ends_at';
SELECT set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true) IS NOT NULL;
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true) IS NOT NULL;
SELECT 'REPRO_WORKBENCH_STATUS_NULL',public.my_feedback('backend_audit_20261102',
 'f4000000-0000-4000-8000-000000000001')->0->>'status' IS NULL;
SELECT 'ORDINARY_DIRECT_TABLE_VISIBLE',count(*) FROM public.feedback_attachments
 WHERE id='f5000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true) IS NOT NULL;
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true) IS NOT NULL;
SELECT set_config('backend_audit.delete_token',public.admin_prepare_feedback_delete(
 'f3000000-0000-4000-8000-000000000001',3,'f2000000-0000-4000-8000-000000000001')->>'token',true) IS NOT NULL;
SELECT 'ADMIN_DIRECT_TOKEN_VISIBLE',deletion_token IS NOT NULL FROM public.user_feedback
 WHERE id='f3000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true) IS NOT NULL;
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',true) IS NOT NULL;
SELECT 'REPRO_PENDING_OWNER_CONTENT_VISIBLE',public.my_feedback('backend_audit_20261102',
 'f4000000-0000-4000-8000-000000000001')->0 ? 'content';
SELECT 'REPRO_PENDING_EVENTS_VISIBLE',jsonb_array_length(public.my_feedback_events(
 'f3000000-0000-4000-8000-000000000001'));
SELECT 'REPRO_PENDING_IMAGE_KEY_AVAILABLE',public.feedback_image_access(
 'f5000000-0000-4000-8000-000000000001') ? 'object_key';
SELECT set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true) IS NOT NULL;
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true) IS NOT NULL;
SELECT 'REPRO_DIRECT_FINISH_WITHOUT_STORAGE_CALL',public.admin_finish_feedback_delete(
 'f3000000-0000-4000-8000-000000000001',
 current_setting('backend_audit.delete_token')::uuid,'f2000000-0000-4000-8000-000000000001')->>'deleted';
RESET ROLE;
SAVEPOINT column_privileges;
REVOKE SELECT ON public.user_feedback FROM authenticated;
SELECT format('GRANT SELECT (%s) ON public.user_feedback TO authenticated;',
 string_agg(quote_ident(attname),',' ORDER BY attnum)) FROM pg_attribute
 WHERE attrelid='public.user_feedback'::regclass AND attnum>0 AND NOT attisdropped
 AND attname NOT IN ('deletion_started_at','deletion_token','deletion_version')
\gexec
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 PERFORM count(*) FROM public.admin_feedback_summaries;
 RAISE EXCEPTION 'Invoker view unexpectedly succeeded without required filter-column privilege';
EXCEPTION WHEN insufficient_privilege THEN
 RAISE NOTICE 'REPRO_REVOKE_FILTER_COLUMN_BREAKS_VIEW: SQLSTATE 42501';
END;
$$;
ROLLBACK TO SAVEPOINT column_privileges;
ROLLBACK;
