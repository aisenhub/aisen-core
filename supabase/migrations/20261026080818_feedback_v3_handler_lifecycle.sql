-- Removing an admin account must not be blocked by historical feedback.
-- Real actors remain in durable audit/events as permitted by their own policies.
ALTER TABLE public.user_feedback
  DROP CONSTRAINT user_feedback_last_handled_by_fkey,
  ADD CONSTRAINT user_feedback_last_handled_by_fkey
  FOREIGN KEY (last_handled_by) REFERENCES auth.users(id) ON DELETE SET NULL;
