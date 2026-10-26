-- FB-V2: one feedback record, distinct inbox screening and workbench lifecycle.
-- Additive local migration, never resets the existing feedback data or R2 keys.
ALTER TABLE public.user_feedback
  ADD COLUMN queue_state text NOT NULL DEFAULT 'inbox',
  ADD COLUMN read_at timestamptz,
  ADD COLUMN triaged_at timestamptz,
  ADD COLUMN is_starred boolean NOT NULL DEFAULT false,
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_from text;

-- Never classify an untouched old "normal/new" default as real acceptance.
-- A documented Admin action (or a genuinely progressed status) is evidence
-- that the old feedback was in the processing lifecycle.
UPDATE public.user_feedback f SET
  queue_state='workbench', triaged_at=f.updated_at
WHERE f.status IN ('in_progress','waiting_user','resolved','closed')
   OR f.assigned_to IS NOT NULL
   OR EXISTS(SELECT 1 FROM public.feedback_events e
      WHERE e.feedback_id=f.id AND e.event_type IN
        ('status_changed','priority_changed','assigned','internal_note','public_reply'));
-- Never infer priority from the legacy "normal" default on untouched tickets.
UPDATE public.user_feedback SET priority=NULL,status=NULL
  WHERE queue_state='inbox';

ALTER TABLE public.user_feedback
 ALTER COLUMN priority DROP DEFAULT,
 ALTER COLUMN priority DROP NOT NULL,
 ALTER COLUMN status DROP DEFAULT,
 ALTER COLUMN status DROP NOT NULL;

ALTER TABLE public.user_feedback ADD CONSTRAINT user_feedback_queue_valid
 CHECK (queue_state IN ('inbox','workbench','archived','trashed'));
ALTER TABLE public.user_feedback ADD CONSTRAINT user_feedback_screening_boundary
 CHECK (
  (queue_state IN ('inbox','archived') AND priority IS NULL AND status IS NULL)
  OR (queue_state='workbench' AND priority IS NOT NULL AND status IS NOT NULL)
  OR (queue_state='trashed' AND deleted_from IN ('inbox','workbench','archived'))
 );
ALTER TABLE public.user_feedback ADD CONSTRAINT user_feedback_delete_boundary
 CHECK ((queue_state='trashed' AND deleted_at IS NOT NULL AND deleted_from IS NOT NULL)
     OR (queue_state<>'trashed' AND deleted_at IS NULL AND deleted_from IS NULL));
ALTER TABLE public.user_feedback ADD CONSTRAINT user_feedback_archive_boundary
 CHECK (queue_state<>'archived' OR archived_at IS NOT NULL);
ALTER TABLE public.user_feedback ADD CONSTRAINT user_feedback_tags_bound
 CHECK (cardinality(tags)<=8 AND array_position(tags,NULL) IS NULL);
ALTER TABLE public.user_feedback ADD CONSTRAINT user_feedback_triage_boundary
 CHECK (queue_state<>'workbench' OR triaged_at IS NOT NULL);
CREATE INDEX user_feedback_queue_created_idx
 ON public.user_feedback(queue_state,created_at DESC);
CREATE INDEX user_feedback_queue_product_updated_idx
 ON public.user_feedback(queue_state,product_id,updated_at DESC);

ALTER TABLE public.feedback_events DROP CONSTRAINT feedback_events_type_valid;
ALTER TABLE public.feedback_events ADD CONSTRAINT feedback_events_type_valid CHECK
(event_type IN ('created','status_changed','priority_changed','assigned',
 'internal_note','public_reply','user_reply',
 'triaged','archived','restored','soft_deleted','star_changed','tags_changed'));

-- Keep the original invoker RLS projection. Adding columns at the end preserves
-- the previously exposed field ordinal/type contract.
CREATE OR REPLACE VIEW public.admin_feedback_summaries
WITH (security_invoker=true) AS
SELECT
 f.id,f.feedback_no,f.product_id,f.user_id,f.content,f.category,
 f.status,f.priority,f.assigned_to,f.version,
 f.created_at,f.updated_at,f.resolved_at,f.closed_at,
 (SELECT count(*)::integer FROM public.feedback_attachments a
    WHERE a.feedback_id=f.id) AS attachment_count,
 f.queue_state,f.read_at,f.triaged_at,f.is_starred,f.tags,
 f.archived_at,f.deleted_at,f.deleted_from
FROM public.user_feedback f;
NOTIFY pgrst,'reload schema';
