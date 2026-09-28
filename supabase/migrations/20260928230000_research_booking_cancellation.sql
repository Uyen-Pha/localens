-- Requires the research baseline through 20260924180000. That baseline is
-- currently fixture-only on this branch: this is NOT a fresh-release-ready migration.
-- Apply in one transaction. No legacy rows, quote rules or approval rules are rewritten.
DO $$ BEGIN
 IF to_regclass('private.research_demo_bookings') IS NULL
    OR to_regprocedure('public.research_demo_checkout(uuid,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'MISSING_RESEARCH_BASELINE';
 END IF;
END $$;

ALTER TABLE private.research_demo_bookings DROP CONSTRAINT IF EXISTS research_demo_bookings_status_check;
ALTER TABLE private.research_demo_bookings ADD CONSTRAINT research_demo_bookings_status_check
 CHECK (status IN ('pending_payment','confirmed','expired','cancelled'));

CREATE TABLE IF NOT EXISTS private.research_demo_booking_cancellations (
 booking_id uuid PRIMARY KEY REFERENCES private.research_demo_bookings(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 cancelled_at timestamptz NOT NULL CHECK (isfinite(cancelled_at)),
 idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
 previous_status text NOT NULL CHECK (previous_status IN ('pending_payment','confirmed')),
 UNIQUE (actor_id,idempotency_key)
);
ALTER TABLE private.research_demo_booking_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.research_demo_booking_cancellations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.research_demo_booking_cancellations FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS research_cancellation_immutable ON private.research_demo_booking_cancellations;
CREATE TRIGGER research_cancellation_immutable BEFORE UPDATE OR DELETE ON private.research_demo_booking_cancellations
 FOR EACH ROW EXECUTE FUNCTION private.reject_research_demo_catalog_mutation();
DROP TRIGGER IF EXISTS no_truncate ON private.research_demo_booking_cancellations;
CREATE TRIGGER no_truncate BEFORE TRUNCATE ON private.research_demo_booking_cancellations
 FOR EACH STATEMENT EXECUTE FUNCTION private.reject_research_demo_catalog_mutation();

CREATE OR REPLACE FUNCTION private.research_demo_cancellation_allowed(
 p_status text,p_payment_status text,p_expires_at timestamptz,p_trip_start_at timestamptz,p_authority_time timestamptz
) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(isfinite(p_authority_time) AND CASE
  WHEN p_status='pending_payment' AND p_payment_status IN ('pending','failed')
   THEN isfinite(p_expires_at) AND p_authority_time<p_expires_at
  WHEN p_status='confirmed' AND p_payment_status='paid'
   THEN isfinite(p_trip_start_at) AND p_trip_start_at-p_authority_time>=interval '48 hours'
  ELSE false END,false)
$$;

-- Accept explicit ISO timestamps with zones, never relative/session-dependent text.
-- Malformed historical revision data is projected as null and fails paid policy closed.
CREATE OR REPLACE FUNCTION private.research_demo_trip_start(p_booking private.research_demo_bookings)
 RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE raw text; instant timestamptz;
BEGIN
 SELECT v.request->>'startAt' INTO raw FROM private.research_demo_revisions v
 WHERE v.id=p_booking.revision_id AND v.owner_id=p_booking.owner_id;
 IF raw IS NULL OR raw !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$' THEN RETURN NULL;END IF;
 BEGIN instant:=raw::timestamptz;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;END;
 IF NOT isfinite(instant) THEN RETURN NULL;END IF;
 RETURN instant;
END $$;

CREATE OR REPLACE FUNCTION private.research_demo_booking_payload(p_booking private.research_demo_bookings)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT to_jsonb(p_booking)||jsonb_build_object(
  'cancelled_at',(SELECT c.cancelled_at FROM private.research_demo_booking_cancellations c WHERE c.booking_id=p_booking.id),
  'trip_start_at',private.research_demo_trip_start(p_booking))
$$;
REVOKE ALL ON FUNCTION private.research_demo_cancellation_allowed(text,text,timestamptz,timestamptz,timestamptz),
 private.research_demo_trip_start(private.research_demo_bookings),
 private.research_demo_booking_payload(private.research_demo_bookings) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.research_demo_cancel_booking(p_booking uuid,p_idempotency_key text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' SET statement_timeout='10s' AS $$
DECLARE actor uuid:=private.research_demo_actor(false); b private.research_demo_bookings;
 request_id uuid; prior_booking uuid; instant timestamptz;
BEGIN
 IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
 END IF;
 -- Order: actor/key advisory lock -> request row -> booking row.
 -- Checkout already takes request -> booking through research_demo_booking(false).
 PERFORM pg_advisory_xact_lock(hashtextextended('research-cancel:'||actor::text||':'||p_idempotency_key,0));
 SELECT b0.request_id INTO request_id FROM private.research_demo_bookings b0 WHERE b0.id=p_booking AND b0.owner_id=actor;
 IF request_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 PERFORM 1 FROM private.research_demo_requests r WHERE r.id=request_id AND r.owner_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO b FROM private.research_demo_bookings b0 WHERE b0.id=p_booking AND b0.owner_id=actor FOR UPDATE;
 IF b.id IS NULL OR b.request_id<>request_id THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 -- Ownership precedes conflict/replay; cross-booking key conflict precedes replay.
 SELECT c.booking_id INTO prior_booking FROM private.research_demo_booking_cancellations c
 WHERE c.actor_id=actor AND c.idempotency_key=p_idempotency_key;
 IF prior_booking IS NOT NULL AND prior_booking<>b.id THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';END IF;
 IF b.status='cancelled' THEN RETURN private.research_demo_booking_payload(b);END IF;
 instant:=clock_timestamp();
 IF NOT private.research_demo_cancellation_allowed(b.status,b.payment_status,b.expires_at,private.research_demo_trip_start(b),instant) THEN
  RAISE EXCEPTION 'CANCELLATION_UNAVAILABLE';
 END IF;
 INSERT INTO private.research_demo_booking_cancellations(booking_id,actor_id,cancelled_at,idempotency_key,previous_status)
 VALUES(b.id,actor,instant,p_idempotency_key,b.status);
 UPDATE private.research_demo_bookings SET status='cancelled' WHERE id=b.id RETURNING * INTO b;
 RETURN private.research_demo_booking_payload(b);
END $$;
REVOKE ALL ON FUNCTION public.research_demo_cancel_booking(uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.research_demo_cancel_booking(uuid,text) TO authenticated;

-- Original baseline definitions, with only four RETURN projections replaced.
-- Request/booking locking and all payment validation/expiry behavior stay intact.
CREATE OR REPLACE FUNCTION public.research_demo_booking(p_quote uuid,p_create boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.research_demo_actor(false);q private.research_demo_quotes;r private.research_demo_requests;v private.research_demo_revisions;b private.research_demo_bookings;
BEGIN
 SELECT * INTO q FROM private.research_demo_quotes WHERE id=p_quote;
 SELECT * INTO r FROM private.research_demo_requests WHERE id=q.request_id AND owner_id=actor FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO b FROM private.research_demo_bookings WHERE quote_id=q.id FOR UPDATE;
 IF b.id IS NOT NULL THEN
 IF b.status='pending_payment' AND b.expires_at<=clock_timestamp() THEN UPDATE private.research_demo_bookings SET status='expired' WHERE id=b.id RETURNING * INTO b;END IF;
 RETURN private.research_demo_booking_payload(b);END IF;
 IF NOT p_create THEN RETURN NULL;END IF;
 SELECT * INTO v FROM private.research_demo_revisions WHERE id=r.revision_id;
 IF r.status<>'approved' OR q.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'QUOTE_UNAVAILABLE';END IF;
 IF (v.request->>'startAt')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'DEPARTURE_PASSED';END IF;
 INSERT INTO private.research_demo_bookings(quote_id,request_id,revision_id,owner_id,amount,currency,party_size,expires_at)
 VALUES(q.id,r.id,r.revision_id,actor,q.amount,q.currency,(v.request->>'partySize')::int,q.expires_at) RETURNING * INTO b;
 INSERT INTO private.research_demo_request_events(request_id,actor_id,status,note) VALUES(r.id,actor,'booking_pending',b.id::text);
 RETURN private.research_demo_booking_payload(b);
END $$;
CREATE OR REPLACE FUNCTION public.research_demo_checkout(p_quote uuid,p_details jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.research_demo_actor(false);b private.research_demo_bookings;r private.research_demo_requests;v private.research_demo_revisions;
BEGIN
 PERFORM public.research_demo_booking(p_quote,false);
 SELECT * INTO b FROM private.research_demo_bookings WHERE quote_id=p_quote AND owner_id=actor FOR UPDATE;
 IF b.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF b.status<>'pending_payment' THEN RETURN private.research_demo_booking_payload(b);END IF;
 SELECT * INTO r FROM private.research_demo_requests WHERE id=b.request_id;
 SELECT * INTO v FROM private.research_demo_revisions WHERE id=b.revision_id;
 IF b.expires_at<=clock_timestamp() OR (v.request->>'startAt')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'QUOTE_UNAVAILABLE';END IF;
 IF r.status<>'approved' OR r.revision_id<>b.revision_id THEN RAISE EXCEPTION 'REQUEST_CHANGED';END IF;
 IF jsonb_typeof(p_details) IS DISTINCT FROM 'object' OR jsonb_typeof(p_details->'travelers') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_TRAVELERS';END IF;
 IF jsonb_array_length(p_details->'travelers')<>b.party_size THEN RAISE EXCEPTION 'INVALID_TRAVELERS';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_details->'travelers') t WHERE jsonb_typeof(t) IS DISTINCT FROM 'object' OR length(btrim(coalesce(t->>'name',''))) NOT BETWEEN 1 AND 80 OR coalesce(t->>'country','') !~ '^[A-Z]{2}$' OR coalesce(t->>'phone','') !~ '^\+[0-9]{7,15}$' OR length(coalesce(t->>'email',''))>254 OR coalesce(t->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') THEN RAISE EXCEPTION 'INVALID_TRAVELERS';END IF;
 IF coalesce(p_details->>'outcome','') NOT IN ('success','declined') THEN RAISE EXCEPTION 'INVALID_PAYMENT';END IF;
 UPDATE private.research_demo_bookings SET checkout_details=p_details-'outcome',payment_status=CASE WHEN p_details->>'outcome'='success' THEN 'paid' ELSE 'failed' END,status=CASE WHEN p_details->>'outcome'='success' THEN 'confirmed' ELSE 'pending_payment' END,paid_at=CASE WHEN p_details->>'outcome'='success' THEN clock_timestamp() ELSE NULL END WHERE id=b.id RETURNING * INTO b;
 INSERT INTO private.research_demo_request_events(request_id,actor_id,status,note) VALUES(b.request_id,actor,CASE WHEN b.status='confirmed' THEN 'payment_paid' ELSE 'payment_failed' END,b.id::text);
 RETURN private.research_demo_booking_payload(b);
END $$;
REVOKE ALL ON FUNCTION public.research_demo_booking(uuid,boolean),public.research_demo_checkout(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.research_demo_booking(uuid,boolean),public.research_demo_checkout(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
