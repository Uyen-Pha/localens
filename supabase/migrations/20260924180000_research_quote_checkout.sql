-- Restored from the verified localens-guide-release research baseline.
-- Historical prerequisite: do not replay against an already migrated hosted database.
BEGIN;
-- Persistent, isolated thesis-demo checkout. No real payment provider.
CREATE TABLE private.research_demo_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quote_id uuid NOT NULL UNIQUE REFERENCES private.research_demo_quotes(id),
 request_id uuid NOT NULL REFERENCES private.research_demo_requests(id), revision_id uuid NOT NULL REFERENCES private.research_demo_revisions(id),
 owner_id uuid NOT NULL REFERENCES auth.users(id), status text NOT NULL DEFAULT 'pending_payment' CHECK(status IN ('pending_payment','confirmed','expired')),
 payment_status text NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','failed','paid')),
 amount numeric NOT NULL, currency text NOT NULL, party_size integer NOT NULL CHECK(party_size>0),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), paid_at timestamptz, checkout_details jsonb
);
ALTER TABLE private.research_demo_bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.research_demo_bookings FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.research_demo_booking(p_quote uuid,p_create boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.research_demo_actor(false);q private.research_demo_quotes;r private.research_demo_requests;v private.research_demo_revisions;b private.research_demo_bookings;
BEGIN
 SELECT * INTO q FROM private.research_demo_quotes WHERE id=p_quote;
 SELECT * INTO r FROM private.research_demo_requests WHERE id=q.request_id AND owner_id=actor FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO b FROM private.research_demo_bookings WHERE quote_id=q.id FOR UPDATE;
 IF b.id IS NOT NULL THEN
 IF b.status='pending_payment' AND b.expires_at<=clock_timestamp() THEN UPDATE private.research_demo_bookings SET status='expired' WHERE id=b.id RETURNING * INTO b;END IF;
 RETURN to_jsonb(b);END IF;
 IF NOT p_create THEN RETURN NULL;END IF;
 SELECT * INTO v FROM private.research_demo_revisions WHERE id=r.revision_id;
 IF r.status<>'approved' OR q.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'QUOTE_UNAVAILABLE';END IF;
 IF (v.request->>'startAt')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'DEPARTURE_PASSED';END IF;
 INSERT INTO private.research_demo_bookings(quote_id,request_id,revision_id,owner_id,amount,currency,party_size,expires_at)
 VALUES(q.id,r.id,r.revision_id,actor,q.amount,q.currency,(v.request->>'partySize')::int,q.expires_at) RETURNING * INTO b;
 INSERT INTO private.research_demo_request_events(request_id,actor_id,status,note) VALUES(r.id,actor,'booking_pending',b.id::text);
 RETURN to_jsonb(b);
END $$;
CREATE FUNCTION public.research_demo_checkout(p_quote uuid,p_details jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.research_demo_actor(false);b private.research_demo_bookings;r private.research_demo_requests;v private.research_demo_revisions;
BEGIN
 PERFORM public.research_demo_booking(p_quote,false);
 SELECT * INTO b FROM private.research_demo_bookings WHERE quote_id=p_quote AND owner_id=actor FOR UPDATE;
 IF b.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF b.status<>'pending_payment' THEN RETURN to_jsonb(b);END IF;
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
 RETURN to_jsonb(b);
END $$;
REVOKE ALL ON FUNCTION public.research_demo_booking(uuid,boolean),public.research_demo_checkout(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.research_demo_booking(uuid,boolean),public.research_demo_checkout(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
