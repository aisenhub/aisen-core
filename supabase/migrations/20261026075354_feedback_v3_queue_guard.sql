-- Enforce V3 queue semantics even if a deprecated V2 RPC is still invoked.
-- The existing optimistic-version and RLS boundaries are retained.
CREATE FUNCTION private.feedback_v3_queue_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF (OLD.queue_state='inbox' AND NEW.queue_state='archived')
     OR (OLD.queue_state='archived' AND NEW.queue_state='inbox')
     OR (OLD.queue_state='archived' AND NEW.queue_state='trashed')
  THEN
    RAISE EXCEPTION 'INVALID_QUEUE_ACTION' USING ERRCODE='PT409';
  END IF;
  RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION private.feedback_v3_queue_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER feedback_v3_queue_guard
BEFORE UPDATE OF queue_state ON public.user_feedback
FOR EACH ROW WHEN (OLD.queue_state IS DISTINCT FROM NEW.queue_state)
EXECUTE FUNCTION private.feedback_v3_queue_guard();
