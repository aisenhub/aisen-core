-- FB-03: secure server-side attachment count without PostgREST aggregate exposure.
-- Explicit INVOKER semantics preserve all three underlying table RLS policies.
CREATE VIEW public.admin_feedback_summaries
WITH (security_invoker = true) AS
SELECT
 f.id, f.feedback_no, f.product_id, f.user_id, f.content, f.category,
 f.status, f.priority, f.assigned_to, f.version,
 f.created_at, f.updated_at, f.resolved_at, f.closed_at,
 (SELECT count(*)::integer FROM public.feedback_attachments a
    WHERE a.feedback_id = f.id) AS attachment_count
FROM public.user_feedback f;
REVOKE ALL ON public.admin_feedback_summaries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_feedback_summaries TO authenticated;
NOTIFY pgrst, 'reload schema';
