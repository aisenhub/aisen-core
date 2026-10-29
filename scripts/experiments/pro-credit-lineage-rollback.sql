-- Only run in the same BEGIN/ROLLBACK session as the new FK migration.
-- Two temporary products must preexist, but only a generated QA Auth user,
-- two QA Grants and accounts are inserted, and the entire transaction rolls back.
DO $$
DECLARE
 v_user uuid:=gen_random_uuid();
 v_lens uuid; v_hub uuid;
 v_good uuid:=gen_random_uuid(); v_wrong uuid:=gen_random_uuid();
 v_denied boolean:=false;
BEGIN
 SELECT id INTO STRICT v_lens FROM public.products WHERE product_key='aisenlens';
 SELECT id INTO STRICT v_hub FROM public.products WHERE product_key='aisenhub';
 INSERT INTO auth.users(id,email)
   VALUES(v_user,'pro-credit-lineage-qa-'||v_user::text||'@aisencore.test');
 INSERT INTO public.pro_credit_accounts(user_id,product_id,settled_at)
   VALUES(v_user,v_lens,transaction_timestamp()),
         (v_user,v_hub,transaction_timestamp());
 INSERT INTO public.entitlement_grants(id,user_id,product_id,tier,
   source_type,source_ref,grant_mode,requested_duration_days,starts_at,ends_at)
 VALUES(v_good,v_user,v_lens,'pro','admin','qa:lineage:'||v_good,
     'duration',1,transaction_timestamp(),transaction_timestamp()+interval '24 hours'),
       (v_wrong,v_user,v_lens,'pro','admin','qa:lineage:'||v_wrong,
     'duration',1,transaction_timestamp(),transaction_timestamp()+interval '24 hours');
 INSERT INTO public.pro_credit_entries(grant_id,user_id,product_id,
   credited_seconds,remaining_seconds)
 VALUES(v_good,v_user,v_lens,86400,86400);
 IF NOT EXISTS(SELECT 1 FROM public.pro_credit_entries
   WHERE grant_id=v_good AND user_id=v_user AND product_id=v_lens) THEN
   RAISE EXCEPTION 'CREDIT_LINEAGE_VALID_WRITE_FAILED';
 END IF;
 BEGIN
   INSERT INTO public.pro_credit_entries(grant_id,user_id,product_id,
     credited_seconds,remaining_seconds)
   VALUES(v_wrong,v_user,v_hub,86400,86400);
 EXCEPTION WHEN foreign_key_violation THEN
   v_denied:=true;
 END;
 IF NOT v_denied THEN
   RAISE EXCEPTION 'CREDIT_LINEAGE_FORGED_PRODUCT_WAS_ACCEPTED';
 END IF;
 RAISE NOTICE 'PRO_CREDIT_GRANT_IDENTITY_FK_ROLLBACK_PASS';
END $$;
