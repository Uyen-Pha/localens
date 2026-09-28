-- Source: 20260925090000_personalized_deadlines.sql in localens-guide-release.
-- Additive compatibility for the research baseline through 20260924180000.
-- No historical business-row backfill. Existing timing values and NOT NULL
-- constraints are preserved; legacy list timing is derived without persistence.
BEGIN;

DO $$ BEGIN
 IF to_regclass('private.research_demo_requests') IS NULL
    OR to_regclass('private.research_demo_quotes') IS NULL
    OR to_regclass('private.research_demo_bookings') IS NULL
    OR to_regprocedure('public.research_demo_list(boolean)') IS NULL THEN
  RAISE EXCEPTION 'MISSING_RESEARCH_BASELINE';
 END IF;
END $$;

ALTER TABLE private.research_demo_requests
 ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
 ADD COLUMN IF NOT EXISTS processing_due_at timestamptz,
 ADD COLUMN IF NOT EXISTS processing_completed_at timestamptz;

-- Both original finite 48-hour quotes and later shorter quotes satisfy this.
-- Validation failure aborts the transaction rather than repairing old rows.
ALTER TABLE private.research_demo_quotes DROP CONSTRAINT IF EXISTS research_demo_quotes_check;
ALTER TABLE private.research_demo_quotes ADD CONSTRAINT research_demo_quotes_check
 CHECK (expires_at>created_at AND expires_at<=created_at+interval '48 hours');

CREATE OR REPLACE FUNCTION private.guard_personalized_request_deadline() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE departure timestamptz; instant timestamptz:=clock_timestamp(); is_submission boolean;
BEGIN
 is_submission:=TG_OP='INSERT';
 IF TG_OP='UPDATE' THEN
  is_submission:=NEW.status='pending_review'
   AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.revision_id IS DISTINCT FROM NEW.revision_id);
 END IF;
 IF is_submission THEN
  SELECT (request->>'startAt')::timestamptz INTO departure
   FROM private.research_demo_revisions WHERE id=NEW.revision_id AND owner_id=NEW.owner_id;
  IF departure IS NULL OR departure<instant+interval '72 hours' THEN
   RAISE EXCEPTION 'REQUEST_LEAD_72H';
  END IF;
  NEW.submitted_at:=instant;
  NEW.processing_due_at:=instant+interval '12 hours';
  NEW.processing_completed_at:=NULL;
 ELSIF NEW.status IN ('changes_requested','rejected') AND OLD.status IS DISTINCT FROM NEW.status
       AND NEW.submitted_at IS NOT NULL AND NEW.processing_due_at IS NOT NULL THEN
  -- An explicit new cycle may initialize a legacy request on resubmission.
  -- Returning/rejecting an untracked legacy cycle does not invent stored timing.
  NEW.processing_completed_at:=instant;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS personalized_request_deadline ON private.research_demo_requests;
CREATE TRIGGER personalized_request_deadline BEFORE INSERT OR UPDATE ON private.research_demo_requests
 FOR EACH ROW EXECUTE FUNCTION private.guard_personalized_request_deadline();

CREATE OR REPLACE FUNCTION private.guard_personalized_quote_deadline() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE departure timestamptz;
BEGIN
 SELECT (v.request->>'startAt')::timestamptz INTO departure
  FROM private.research_demo_requests r JOIN private.research_demo_revisions v ON v.id=r.revision_id
  WHERE r.id=NEW.request_id;
 NEW.expires_at:=least(NEW.created_at+interval '48 hours',departure-interval '24 hours');
 IF departure IS NULL OR NEW.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'QUOTE_DEADLINE_PASSED';
 END IF;
 -- Only a new action in a tracked cycle records completion. Legacy metadata
 -- remains null, and previously completed cycles are not rewritten.
 UPDATE private.research_demo_requests SET processing_completed_at=clock_timestamp()
  WHERE id=NEW.request_id AND submitted_at IS NOT NULL AND processing_due_at IS NOT NULL
   AND processing_completed_at IS NULL;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS personalized_quote_deadline ON private.research_demo_quotes;
CREATE TRIGGER personalized_quote_deadline BEFORE INSERT ON private.research_demo_quotes
 FOR EACH ROW EXECUTE FUNCTION private.guard_personalized_quote_deadline();
REVOKE ALL ON FUNCTION private.guard_personalized_request_deadline(),private.guard_personalized_quote_deadline()
 FROM PUBLIC,anon,authenticated,service_role;

-- Retain the source JSON shape and quote-status precedence. For legacy cycles,
-- project exactly the original backfill's event-derived timing, without UPDATE.
-- A tracked cycle's NULL completion remains authoritative (still processing).
CREATE OR REPLACE FUNCTION public.research_demo_list(p_admin boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.research_demo_actor(p_admin); result jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(item ORDER BY created DESC),'[]') INTO result FROM (
  SELECT r.created_at created,jsonb_build_object(
   'id',r.id,'ownerId',r.owner_id,'status',r.status,'revisionId',r.revision_id,
   'request',v.request,'plan',v.plan,'createdAt',r.created_at,
   'submittedAt',timing.submitted_at,
   'processingDueAt',coalesce(r.processing_due_at,timing.submitted_at+interval '12 hours'),
   'processingCompletedAt',CASE WHEN r.submitted_at IS NOT NULL THEN r.processing_completed_at
    ELSE coalesce(r.processing_completed_at,(
     SELECT min(e.created_at) FROM private.research_demo_request_events e
      WHERE e.request_id=r.id AND e.created_at>=timing.submitted_at
       AND e.status IN ('changes_requested','rejected','quote_active'))) END,
   'notes',r.notes,
   'quotes',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',q.id,'title',q.title,'amount',q.amount,'currency',q.currency,'conditions',q.conditions,
    'status',CASE
     WHEN EXISTS(SELECT 1 FROM private.research_demo_bookings b WHERE b.quote_id=q.id AND b.status='confirmed') THEN 'accepted'
     WHEN q.expires_at<=clock_timestamp() THEN 'expired'
     WHEN EXISTS(SELECT 1 FROM private.research_demo_bookings b WHERE b.quote_id=q.id AND b.checkout_details IS NOT NULL) THEN 'accepted'
     WHEN EXISTS(SELECT 1 FROM private.research_demo_bookings b WHERE b.quote_id=q.id) THEN 'checkout_pending'
     ELSE 'active' END,
    'createdAt',q.created_at,'expiresAt',q.expires_at) ORDER BY q.created_at DESC)
    FROM private.research_demo_quotes q WHERE q.request_id=r.id),'[]'),
   'history',coalesce((SELECT jsonb_agg(jsonb_build_object('status',e.status,'note',e.note,'at',e.created_at) ORDER BY e.id)
    FROM private.research_demo_request_events e WHERE e.request_id=r.id),'[]')) item
  FROM private.research_demo_requests r
  JOIN private.research_demo_revisions v ON v.id=r.revision_id
  CROSS JOIN LATERAL (SELECT coalesce(r.submitted_at,(
   SELECT max(e.created_at) FROM private.research_demo_request_events e
    WHERE e.request_id=r.id AND e.status='pending_review'),r.created_at) AS submitted_at) timing
  WHERE p_admin OR r.owner_id=actor
 ) rows;
 RETURN result;
END $$;

COMMIT;
