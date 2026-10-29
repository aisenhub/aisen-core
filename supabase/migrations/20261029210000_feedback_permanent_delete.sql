-- FB-V4: no recycle bin, permanent feedback deletion with resumable private-object cleanup.
-- Local-only code. AAL2 current-admin required; storage deletion is executed by the trusted Edge.
ALTER TABLE public.user_feedback ADD COLUMN deletion_started_at timestamptz;
ALTER TABLE public.user_feedback ADD COLUMN deletion_token uuid;
ALTER TABLE public.user_feedback ADD COLUMN deletion_version integer;
ALTER TABLE public.user_feedback ADD CONSTRAINT feedback_deletion_intent_consistent CHECK (
  (deletion_started_at IS NULL AND deletion_token IS NULL AND deletion_version IS NULL)
  OR (deletion_started_at IS NOT NULL AND deletion_token IS NOT NULL AND deletion_version>0)
);
-- Old queue rows are preserved until an administrator explicitly deletes them.
-- All new queue moves to trash and any mutation after deletion begins are blocked.
GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE FUNCTION private.prevent_feedback_obsolete_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF OLD.deletion_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'DELETE_PENDING' USING ERRCODE='PT409';
  END IF;
  IF (OLD.queue_state<>'trashed' AND NEW.queue_state='trashed')
     OR (OLD.queue_state='trashed' AND NEW.queue_state<>OLD.queue_state)
     OR NEW.tags IS DISTINCT FROM OLD.tags
  THEN RAISE EXCEPTION 'OBSOLETE_FEEDBACK_ACTION' USING ERRCODE='PT409'; END IF;
  RETURN NEW;
END;$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;
CREATE TRIGGER prevent_feedback_obsolete_mutation
BEFORE UPDATE ON public.user_feedback FOR EACH ROW
EXECUTE FUNCTION private.prevent_feedback_obsolete_mutation();

-- A protected function can delete child records; JWT roles still have no DELETE.
GRANT DELETE ON public.user_feedback,public.feedback_attachments,public.feedback_events
  TO aisencore_rpc_executor;

GRANT CREATE ON SCHEMA private TO aisencore_rpc_executor;
SET ROLE aisencore_rpc_executor;
CREATE FUNCTION private.admin_prepare_feedback_delete_core(
  p_feedback_id uuid,p_expected_version integer,p_product_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid;v_owner uuid;v_fb public.user_feedback%ROWTYPE;
  v_keys jsonb;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor:=private.require_admin();
  IF p_feedback_id IS NULL OR (p_expected_version IS NOT NULL AND p_expected_version<1)
  THEN RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422'; END IF;
  SELECT user_id INTO v_owner FROM public.user_feedback WHERE id=p_feedback_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FEEDBACK_NOT_FOUND' USING ERRCODE='PT409'; END IF;
  PERFORM private.acquire_l1_user_lock(v_owner);
  SELECT * INTO v_fb FROM public.user_feedback WHERE id=p_feedback_id FOR UPDATE;
  IF NOT FOUND OR v_fb.user_id<>v_owner OR
     (p_product_id IS NOT NULL AND v_fb.product_id<>p_product_id)
  THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
  IF v_fb.deletion_token IS NULL THEN
    IF p_expected_version IS NULL OR v_fb.version<>p_expected_version
    THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
    UPDATE public.user_feedback SET deletion_token=pg_catalog.gen_random_uuid(),
      deletion_started_at=transaction_timestamp(),deletion_version=version,
      version=version+1 WHERE id=p_feedback_id RETURNING * INTO v_fb;
  ELSIF p_expected_version IS NOT NULL AND
        p_expected_version<>v_fb.deletion_version THEN
    RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(a.object_key ORDER BY a.slot),'[]'::jsonb)
    INTO v_keys FROM public.feedback_attachments a WHERE a.feedback_id=p_feedback_id;
  RETURN pg_catalog.jsonb_build_object('id',v_fb.id,'token',v_fb.deletion_token,
    'keys',v_keys,'product_id',v_fb.product_id);
END;$$;
REVOKE ALL ON FUNCTION private.admin_prepare_feedback_delete_core(uuid,integer,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.admin_prepare_feedback_delete_core(uuid,integer,uuid)
  TO authenticated;

CREATE FUNCTION private.admin_finish_feedback_delete_core(
  p_feedback_id uuid,p_token uuid,p_product_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid;v_owner uuid;v_fb public.user_feedback%ROWTYPE;
  v_images integer;
BEGIN
  PERFORM private.acquire_l0_admin_write_lock();
  v_actor:=private.require_admin();
  IF p_feedback_id IS NULL OR p_token IS NULL
  THEN RAISE EXCEPTION 'INVALID_ARGUMENT' USING ERRCODE='PT422'; END IF;
  SELECT user_id INTO v_owner FROM public.user_feedback WHERE id=p_feedback_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FEEDBACK_NOT_FOUND' USING ERRCODE='PT409'; END IF;
  PERFORM private.acquire_l1_user_lock(v_owner);
  SELECT * INTO v_fb FROM public.user_feedback WHERE id=p_feedback_id FOR UPDATE;
  IF NOT FOUND OR v_fb.user_id<>v_owner OR v_fb.deletion_started_at IS NULL OR
     v_fb.deletion_token IS DISTINCT FROM p_token OR
     (p_product_id IS NOT NULL AND v_fb.product_id<>p_product_id)
  THEN RAISE EXCEPTION 'STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
  SELECT count(*)::integer INTO v_images FROM public.feedback_attachments
    WHERE feedback_id=p_feedback_id;
  -- DB child rows and minimal content-free audit commit together.
  DELETE FROM public.feedback_events WHERE feedback_id=p_feedback_id;
  DELETE FROM public.feedback_attachments WHERE feedback_id=p_feedback_id;
  DELETE FROM public.user_feedback WHERE id=p_feedback_id;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,before,after)
    VALUES(v_actor,'feedback.permanent_delete','feedback',p_feedback_id,
      pg_catalog.jsonb_build_object('queue',v_fb.queue_state,'product_id',v_fb.product_id,
        'attachment_count',v_images),'{}'::jsonb);
  RETURN pg_catalog.jsonb_build_object('deleted',true,'id',p_feedback_id);
END;$$;
REVOKE ALL ON FUNCTION private.admin_finish_feedback_delete_core(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.admin_finish_feedback_delete_core(uuid,uuid,uuid)
  TO authenticated;

-- Only operational metadata: failed deletion attempts + pre-existing old trash rows.
CREATE FUNCTION private.admin_feedback_pending_deletes_core(
  p_product_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_data jsonb;
BEGIN
  PERFORM private.require_admin();
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',x.id,'feedback_no',x.feedback_no,'product_id',x.product_id,
    'pending',x.deletion_started_at IS NOT NULL,'version',x.version)
    ORDER BY x.deletion_started_at NULLS LAST,x.feedback_no),'[]'::jsonb) INTO v_data
  FROM (SELECT id,feedback_no,product_id,deletion_started_at,version
        FROM public.user_feedback
        WHERE (deletion_started_at IS NOT NULL OR queue_state='trashed')
          AND (p_product_id IS NULL OR product_id=p_product_id)
        ORDER BY deletion_started_at NULLS LAST,feedback_no LIMIT 20) x;
  RETURN v_data;
END;$$;
REVOKE ALL ON FUNCTION private.admin_feedback_pending_deletes_core(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.admin_feedback_pending_deletes_core(uuid)
  TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM aisencore_rpc_executor;

CREATE FUNCTION public.admin_prepare_feedback_delete(
  p_feedback_id uuid,p_expected_version integer DEFAULT NULL,p_product_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_prepare_feedback_delete_core($1,$2,$3); $$;
CREATE FUNCTION public.admin_finish_feedback_delete(
  p_feedback_id uuid,p_token uuid,p_product_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_finish_feedback_delete_core($1,$2,$3); $$;
CREATE FUNCTION public.admin_feedback_pending_deletes(p_product_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT private.admin_feedback_pending_deletes_core($1); $$;
REVOKE ALL ON FUNCTION public.admin_prepare_feedback_delete(uuid,integer,uuid),
  public.admin_finish_feedback_delete(uuid,uuid,uuid),
  public.admin_feedback_pending_deletes(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_prepare_feedback_delete(uuid,integer,uuid),
  public.admin_finish_feedback_delete(uuid,uuid,uuid),
  public.admin_feedback_pending_deletes(uuid) TO authenticated;

-- Pending removal must never be presented as a completed business record.
CREATE OR REPLACE VIEW public.admin_feedback_summaries WITH (security_invoker=true) AS
SELECT f.id,f.feedback_no,f.product_id,f.user_id,f.content,f.category,
 f.status,f.priority,f.assigned_to,f.version,f.created_at,f.updated_at,
 f.resolved_at,f.closed_at,
 (SELECT count(*)::integer FROM public.feedback_attachments a
   WHERE a.feedback_id=f.id) AS attachment_count,
 f.queue_state,f.read_at,f.triaged_at,f.is_starred,f.tags,
 f.archived_at,f.deleted_at,f.deleted_from,f.last_handled_by,f.contact_email
FROM public.user_feedback f WHERE f.deletion_started_at IS NULL;
NOTIFY pgrst,'reload schema';
