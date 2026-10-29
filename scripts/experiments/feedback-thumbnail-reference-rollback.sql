-- Must be run after thumbnail reference migration in the SAME BEGIN/ROLLBACK
-- session. Only synthetic QA auth/feedback/attachment rows are inserted.
DO $$
DECLARE v_user uuid:=gen_random_uuid();v_feedback uuid:=gen_random_uuid();
  v_product uuid;v_key text:='feedback/qa-thumb/'||gen_random_uuid()||'/1-original.png';
BEGIN
 SELECT id INTO STRICT v_product FROM public.products WHERE product_key='aisenlens';
 INSERT INTO auth.users(id,email) VALUES(v_user,'fb-thumb-rollback-'||v_user||'@aisencore.test');
 INSERT INTO public.user_feedback(id,product_id,user_id,content,request_id)
  VALUES(v_feedback,v_product,v_user,'QA thumbnail reference rollback only',gen_random_uuid());
 INSERT INTO public.feedback_attachments(feedback_id,slot,object_key,mime_type,size_bytes)
  VALUES(v_feedback,1,v_key,'image/png',300);
 PERFORM set_config('test.thumb_key',v_key,false);
END $$;
SET ROLE service_role;
DO $$
DECLARE v_key text:=current_setting('test.thumb_key');
  v_actual jsonb;v_expected jsonb;
BEGIN
 SELECT public.feedback_referenced_keys(
   ARRAY[v_key,v_key||'.thumb.jpg',v_key||'.alien.jpg'])
 INTO v_actual;
 v_expected:=jsonb_build_array(v_key,v_key||'.thumb.jpg');
 IF v_actual<>v_expected THEN
   RAISE EXCEPTION 'THUMB_REFERENCE_MISMATCH % expected %',v_actual,v_expected;
 END IF;
 IF has_function_privilege('authenticated','public.feedback_referenced_keys(text[])','EXECUTE') THEN
   RAISE EXCEPTION 'ORDINARY_USER_MAY_ENUMERATE_PRIVATE_KEYS';
 END IF;
 RAISE NOTICE 'THUMB_REFERENCE_ORIGINAL_AND_DERIVED_ROLLBACK_PASS';
END $$;
RESET ROLE;
