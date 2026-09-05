BEGIN;

-- Task 19A reserves exactly four deterministic QA tuples. The registry stores
-- metadata only: seeding it never creates checkout, payment, cancellation,
-- planner-operation, run, or quota lifecycle rows.
CREATE TABLE private.thesis_demo_qa_slots (
  slot_id text PRIMARY KEY,
  dataset_version text NOT NULL,
  terminal_flow text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  departure_id uuid NOT NULL REFERENCES public.departures(id) ON DELETE RESTRICT,
  max_party_size integer NOT NULL,
  booking_id uuid NOT NULL UNIQUE,
  checkout_attempt_id uuid NOT NULL UNIQUE,
  checkout_idempotency_id uuid NOT NULL UNIQUE,
  capacity_hold_id uuid NOT NULL UNIQUE,
  simulated_payment_id uuid NOT NULL UNIQUE,
  cancellation_id uuid NOT NULL UNIQUE,
  booking_idempotency_key text NOT NULL UNIQUE,
  payment_idempotency_key text NOT NULL UNIQUE,
  cancellation_idempotency_key text NOT NULL UNIQUE,
  recommend_operation_id uuid NOT NULL UNIQUE,
  refine_operation_id uuid NOT NULL UNIQUE,
  CHECK (dataset_version = 'thesis-demo.v2'),
  CHECK (slot_id IN ('qa-01', 'qa-02', 'qa-03', 'qa-04')),
  CHECK (
    (slot_id = 'qa-01' AND terminal_flow = 'payment')
    OR (slot_id = 'qa-02' AND terminal_flow = 'cancellation')
    OR (slot_id IN ('qa-03', 'qa-04') AND terminal_flow = 'spare')
  ),
  CHECK (max_party_size = 2),
  CHECK (booking_idempotency_key = 'thesis-demo:v2:' || slot_id || ':booking'),
  CHECK (payment_idempotency_key = 'thesis-demo:v2:' || slot_id || ':payment'),
  CHECK (cancellation_idempotency_key = 'thesis-demo:v2:' || slot_id || ':cancel'),
  CHECK (recommend_operation_id <> refine_operation_id)
);

ALTER TABLE private.thesis_demo_qa_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.thesis_demo_qa_slots FORCE ROW LEVEL SECURITY;

CREATE POLICY thesis_demo_qa_slots_checkout_rpc_owner_select
  ON private.thesis_demo_qa_slots
  FOR SELECT TO localens_checkout_rpc_owner
  USING (current_user = 'localens_checkout_rpc_owner');
CREATE POLICY thesis_demo_qa_slots_simulated_payment_rpc_owner_select
  ON private.thesis_demo_qa_slots
  FOR SELECT TO localens_simulated_payment_rpc_owner
  USING (current_user = 'localens_simulated_payment_rpc_owner');
CREATE POLICY thesis_demo_qa_slots_cancellation_customer_rpc_owner_select
  ON private.thesis_demo_qa_slots
  FOR SELECT TO localens_cancellation_customer_rpc_owner
  USING (current_user = 'localens_cancellation_customer_rpc_owner');

REVOKE ALL ON TABLE private.thesis_demo_qa_slots FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT (slot_id, dataset_version, terminal_flow, owner_user_id, departure_id,
  max_party_size, booking_id, checkout_attempt_id, checkout_idempotency_id,
  capacity_hold_id, simulated_payment_id, cancellation_id,
  booking_idempotency_key, payment_idempotency_key, cancellation_idempotency_key,
  recommend_operation_id, refine_operation_id) ON TABLE private.thesis_demo_qa_slots TO localens_checkout_rpc_owner;
GRANT SELECT (slot_id, dataset_version, terminal_flow, owner_user_id, departure_id,
  max_party_size, booking_id, checkout_attempt_id, checkout_idempotency_id,
  capacity_hold_id, simulated_payment_id, cancellation_id,
  booking_idempotency_key, payment_idempotency_key, cancellation_idempotency_key,
  recommend_operation_id, refine_operation_id) ON TABLE private.thesis_demo_qa_slots TO localens_simulated_payment_rpc_owner;
GRANT SELECT (slot_id, dataset_version, terminal_flow, owner_user_id, departure_id,
  max_party_size, booking_id, checkout_attempt_id, checkout_idempotency_id,
  capacity_hold_id, simulated_payment_id, cancellation_id,
  booking_idempotency_key, payment_idempotency_key, cancellation_idempotency_key,
  recommend_operation_id, refine_operation_id) ON TABLE private.thesis_demo_qa_slots TO localens_cancellation_customer_rpc_owner;

GRANT CREATE ON SCHEMA private TO localens_checkout_rpc_owner;
SET LOCAL ROLE localens_checkout_rpc_owner;
CREATE OR REPLACE FUNCTION private.start_checkout_tx(
  p_source_kind text,
  p_source_id uuid,
  p_party_size integer,
  p_locale public.locale,
  p_idempotency_key text,
  p_canonical_request_hash text
)
RETURNS TABLE (
  booking_id uuid,
  attempt_id uuid,
  provider_idempotency_key text,
  amount_minor text,
  currency public.checkout_currency,
  hold_expires_at timestamptz,
  state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  actor_user_id uuid := NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
  idempotency_id uuid := pg_catalog.gen_random_uuid();
  new_booking_id uuid := pg_catalog.gen_random_uuid();
  new_attempt_id uuid := pg_catalog.gen_random_uuid();
  new_hold_id uuid := pg_catalog.gen_random_uuid();
  idempotency_row private.checkout_idempotency%ROWTYPE;
  booking_row public.bookings%ROWTYPE;
  retry_attempt_row private.checkout_attempts%ROWTYPE;
  departure_row public.departures%ROWTYPE;
  quote_row public.custom_quotes%ROWTYPE;
  request_row public.custom_requests%ROWTYPE;
  plan_row public.trip_plans%ROWTYPE;
  revision_row public.trip_plan_revisions%ROWTYPE;
  tour_version_row public.tour_versions%ROWTYPE;
  tour_row public.tours%ROWTYPE;
  tour_translation_row public.tour_version_translations%ROWTYPE;
  travel_snapshot_row public.travel_snapshots%ROWTYPE;
  confirmed_party integer;
  held_party integer;
  derived_party_size integer;
  created_time timestamptz;
  hold_end timestamptz;
  amount_value bigint;
  vnd_total bigint;
  canonical_hash text;
  inserted boolean;
  source_title_en text;
  source_title_vi text;
  source_meeting_point text;
  source_policy text;
  source_catalog_id uuid;
  source_travel_id uuid;
  source_tour_version_id uuid;
  source_quote_id uuid;
  source_departure_id uuid;
  source_fx_id uuid;
  source_fx numeric(20,8);
  checkout_currency_value public.checkout_currency;
  qa_slot private.thesis_demo_qa_slots%ROWTYPE;
  qa_departure boolean := false;
BEGIN
  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.user_roles WHERE user_id = actor_user_id AND role = 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION 'checkout authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_source_kind NOT IN ('departure', 'quote') OR p_source_id IS NULL OR p_party_size NOT BETWEEN 1 AND 100
     OR p_locale IS NULL OR p_idempotency_key IS NULL OR p_idempotency_key <> btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 255 OR p_idempotency_key ~ '[[:cntrl:]]'
     OR p_canonical_request_hash IS NULL OR p_canonical_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'checkout input rejected' USING ERRCODE = '22023';
  END IF;

  -- Recompute the request hash from the authenticated actor and every
  -- normalized source fact before consulting the idempotency receipt.  A
  -- retry that reuses the old hash with changed parameters must conflict even
  -- when the idempotency key itself is already present.
  canonical_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    private.checkout_canonical_payload(actor_user_id, p_source_kind, p_source_id, p_party_size, p_locale), 'UTF8'
  ), 'sha256'), 'hex');
  IF NOT private.checkout_hash_equal(canonical_hash, p_canonical_request_hash) THEN
    RAISE EXCEPTION 'checkout request hash mismatch' USING ERRCODE = 'P0001';
  END IF;

  -- A registered thesis-demo departure is a finite test surface. Resolve the
  -- exact actor/key tuple before the first durable write; unknown tuples fail
  -- closed instead of consuming a reserved identifier or capacity.
  IF p_source_kind = 'departure' THEN
    SELECT EXISTS (
      SELECT 1
      FROM private.thesis_demo_qa_slots AS registered
      WHERE registered.departure_id = p_source_id
    ) INTO qa_departure;
    IF qa_departure THEN
      SELECT *
      INTO qa_slot
      FROM private.thesis_demo_qa_slots AS registered
      WHERE registered.owner_user_id = actor_user_id
        AND registered.departure_id = p_source_id
        AND registered.booking_idempotency_key = p_idempotency_key;
      IF NOT FOUND OR p_party_size > qa_slot.max_party_size THEN
        RAISE EXCEPTION 'THESIS_DEMO_QA_SLOT_MISMATCH' USING ERRCODE = '22023';
      END IF;
      idempotency_id := qa_slot.checkout_idempotency_id;
      new_booking_id := qa_slot.booking_id;
      new_attempt_id := qa_slot.checkout_attempt_id;
      new_hold_id := qa_slot.capacity_hold_id;
    END IF;
  END IF;

  -- This insert is the first lock in every checkout path.  Target IDs are
  -- allocated before it so the immutable receipt is complete on first write.
  INSERT INTO private.checkout_idempotency (
    id, owner_user_id, idempotency_key, canonical_request_hash,
    booking_id, checkout_attempt_id, provider_idempotency_key
  ) VALUES (
    idempotency_id, actor_user_id, p_idempotency_key, p_canonical_request_hash,
    new_booking_id, new_attempt_id, 'localens:stripe-checkout:v1:' || new_attempt_id::text
  ) ON CONFLICT (owner_user_id, idempotency_key) DO NOTHING;
  inserted := FOUND;
  SELECT * INTO idempotency_row
  FROM private.checkout_idempotency
  WHERE owner_user_id = actor_user_id AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout idempotency unavailable' USING ERRCODE = 'P0001'; END IF;
  IF NOT private.checkout_hash_equal(idempotency_row.canonical_request_hash, p_canonical_request_hash) THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF NOT inserted THEN
    -- Preserve the common lock order on a retry: idempotency -> source ->
    -- booking -> attempt.  The source and attempt facts are then checked
    -- against the authenticated request before any durable response is
    -- replayed.
    IF p_source_kind = 'departure' THEN
      SELECT * INTO departure_row FROM public.departures WHERE id = p_source_id FOR UPDATE;
    ELSE
      SELECT * INTO quote_row FROM public.custom_quotes WHERE id = p_source_id FOR UPDATE;
    END IF;
    SELECT * INTO booking_row FROM public.bookings WHERE id = idempotency_row.booking_id FOR UPDATE;
    SELECT * INTO retry_attempt_row FROM private.checkout_attempts WHERE id = idempotency_row.checkout_attempt_id FOR UPDATE;
    IF NOT FOUND OR booking_row.owner_user_id IS DISTINCT FROM actor_user_id
       OR booking_row.source_kind IS DISTINCT FROM p_source_kind
       OR booking_row.source_id IS DISTINCT FROM p_source_id
       OR booking_row.party_size IS DISTINCT FROM p_party_size
       OR booking_row.language IS DISTINCT FROM p_locale
       OR retry_attempt_row.booking_id IS DISTINCT FROM booking_row.id
       OR retry_attempt_row.owner_user_id IS DISTINCT FROM actor_user_id
       OR retry_attempt_row.source_kind IS DISTINCT FROM p_source_kind
       OR (p_source_kind = 'departure' AND retry_attempt_row.departure_id IS DISTINCT FROM p_source_id)
       OR (p_source_kind = 'quote' AND retry_attempt_row.quote_id IS DISTINCT FROM p_source_id)
       OR retry_attempt_row.provider_idempotency_key IS DISTINCT FROM idempotency_row.provider_idempotency_key THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    canonical_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      private.checkout_canonical_payload(
        booking_row.owner_user_id, booking_row.source_kind, booking_row.source_id,
        booking_row.party_size, booking_row.language
      ), 'UTF8'
    ), 'sha256'), 'hex');
    IF NOT private.checkout_hash_equal(canonical_hash, idempotency_row.canonical_request_hash)
       OR NOT private.checkout_hash_equal(canonical_hash, p_canonical_request_hash) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    booking_id := booking_row.id;
    attempt_id := idempotency_row.checkout_attempt_id;
    provider_idempotency_key := idempotency_row.provider_idempotency_key;
    amount_minor := booking_row.checkout_amount_minor::text;
    currency := booking_row.checkout_currency;
    hold_expires_at := booking_row.hold_expires_at;
    state := 'resumed';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Lock the source before creating the booking.  Departure capacity is
  -- serialized by its row lock; quote checkouts intentionally take no hold.
  IF p_source_kind = 'departure' THEN
    SELECT * INTO departure_row FROM public.departures WHERE id = p_source_id FOR UPDATE;
    IF NOT FOUND OR departure_row.status <> 'scheduled'::public.departure_status THEN
      RAISE EXCEPTION 'departure unavailable' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO tour_version_row FROM public.tour_versions WHERE id = departure_row.tour_version_id FOR SHARE;
    IF NOT FOUND OR tour_version_row.status <> 'published'::public.tour_version_status THEN
      RAISE EXCEPTION 'tour unavailable' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO tour_row FROM public.tours WHERE id = tour_version_row.tour_id FOR SHARE;
    IF NOT FOUND OR tour_row.status <> 'published'::public.tour_status THEN
      RAISE EXCEPTION 'tour unavailable' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO tour_translation_row
    FROM public.tour_version_translations
    WHERE tour_version_id = tour_version_row.id AND locale = p_locale;
    IF NOT FOUND THEN RAISE EXCEPTION 'tour translation unavailable' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO travel_snapshot_row
    FROM public.travel_snapshots
    WHERE catalog_snapshot_id = tour_version_row.catalog_snapshot_id AND status = 'published'::public.snapshot_status
    ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'travel snapshot unavailable' USING ERRCODE = 'P0001'; END IF;
    -- Sample the database clock only after every source row is locked.  A
    -- wait on a departure lock must not shorten or bypass the hold window.
    created_time := pg_catalog.clock_timestamp();
    IF departure_row.start_at <= created_time THEN
      RAISE EXCEPTION 'departure unavailable' USING ERRCODE = 'P0001';
    END IF;
    SELECT COALESCE(sum(b.party_size), 0)::integer INTO confirmed_party
    FROM public.bookings AS b
    WHERE b.departure_id = departure_row.id AND b.status IN ('confirmed'::public.booking_status, 'completed'::public.booking_status);
    SELECT COALESCE(sum(h.party_size), 0)::integer INTO held_party
    FROM private.capacity_holds AS h
    JOIN public.bookings AS hb ON hb.id = h.booking_id
    WHERE h.departure_id = departure_row.id AND h.status = 'active'::public.hold_status AND h.expires_at > created_time
      AND hb.status NOT IN ('confirmed'::public.booking_status, 'completed'::public.booking_status);
    IF confirmed_party + held_party + p_party_size > departure_row.capacity THEN
      RAISE EXCEPTION 'departure sold out' USING ERRCODE = 'P0001';
    END IF;
    IF tour_version_row.price_vnd_per_person::numeric * p_party_size > 9007199254740991 THEN
      RAISE EXCEPTION 'checkout amount unsafe' USING ERRCODE = '22003';
    END IF;
    source_title_en := (SELECT title FROM public.tour_version_translations WHERE tour_version_id = tour_version_row.id AND locale = 'en'::public.locale);
    source_title_vi := (SELECT title FROM public.tour_version_translations WHERE tour_version_id = tour_version_row.id AND locale = 'vi'::public.locale);
    source_meeting_point := tour_translation_row.meeting_point;
    source_policy := tour_version_row.cancellation_policy;
    source_catalog_id := tour_version_row.catalog_snapshot_id;
    source_travel_id := travel_snapshot_row.id;
    source_tour_version_id := tour_version_row.id;
    source_departure_id := departure_row.id;
    source_quote_id := NULL;
    source_fx_id := NULL;
    source_fx := NULL;
    checkout_currency_value := 'vnd'::public.checkout_currency;
    derived_party_size := p_party_size;
    vnd_total := tour_version_row.price_vnd_per_person * p_party_size;
    amount_value := vnd_total;
  ELSE
    SELECT * INTO quote_row FROM public.custom_quotes WHERE id = p_source_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'quote unavailable' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO request_row FROM public.custom_requests WHERE id = quote_row.request_id FOR SHARE;
    IF NOT FOUND OR request_row.owner_user_id IS DISTINCT FROM actor_user_id THEN RAISE EXCEPTION 'quote unavailable' USING ERRCODE = '42501'; END IF;
    SELECT * INTO plan_row FROM public.trip_plans WHERE id = request_row.plan_id FOR SHARE;
    SELECT * INTO revision_row FROM public.trip_plan_revisions WHERE id = request_row.revision_id FOR SHARE;
    IF NOT FOUND OR plan_row.id IS NULL OR revision_row.plan_id IS DISTINCT FROM plan_row.id
       OR jsonb_typeof(revision_row.request_json->'partySize') IS DISTINCT FROM 'number'
       OR revision_row.request_json->>'partySize' !~ '^[1-9][0-9]{0,2}$' THEN
      RAISE EXCEPTION 'quote party size unavailable' USING ERRCODE = 'P0001';
    END IF;
    created_time := pg_catalog.clock_timestamp();
    derived_party_size := (revision_row.request_json->>'partySize')::integer;
    IF derived_party_size NOT BETWEEN 1 AND 100 OR p_party_size <> derived_party_size THEN
      RAISE EXCEPTION 'quote party size mismatch' USING ERRCODE = 'P0001';
    END IF;
    IF quote_row.status <> 'active'::public.quote_status OR quote_row.valid_until <= created_time THEN
      RAISE EXCEPTION 'quote expired' USING ERRCODE = 'P0001';
    END IF;
    source_title_en := quote_row.title_en;
    source_title_vi := quote_row.title_vi;
    source_meeting_point := 'To be confirmed by LocalLens';
    source_policy := quote_row.policy;
    source_catalog_id := quote_row.catalog_snapshot_id;
    source_travel_id := quote_row.travel_snapshot_id;
    source_tour_version_id := NULL;
    source_departure_id := NULL;
    source_quote_id := quote_row.id;
    source_fx_id := quote_row.fx_snapshot_id;
    source_fx := quote_row.fx_vnd_per_usd;
    checkout_currency_value := quote_row.checkout_currency;
    vnd_total := quote_row.amount_vnd_minor;
    amount_value := quote_row.checkout_amount_minor;
  END IF;

  canonical_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    private.checkout_canonical_payload(actor_user_id, p_source_kind, p_source_id, derived_party_size, p_locale), 'UTF8'
  ), 'sha256'), 'hex');
  IF NOT private.checkout_hash_equal(canonical_hash, p_canonical_request_hash) THEN
    RAISE EXCEPTION 'checkout request hash mismatch' USING ERRCODE = 'P0001';
  END IF;
  hold_end := created_time + interval '35 minutes';

  INSERT INTO public.bookings (
    id, owner_user_id, source_kind, source_id, departure_id, quote_id, status, tour_version_id,
    title_en, title_vi, cancellation_policy, catalog_snapshot_id, travel_snapshot_id,
    fx_snapshot_id, fx_vnd_per_usd, per_person_vnd_minor, total_vnd_minor,
    checkout_currency, checkout_amount_minor, party_size, language, meeting_point,
    hold_duration_seconds, hold_expires_at, created_at
  ) VALUES (
    new_booking_id, actor_user_id, p_source_kind, p_source_id, source_departure_id, source_quote_id,
    'pending_payment'::public.booking_status, source_tour_version_id, source_title_en, source_title_vi,
    source_policy, source_catalog_id, source_travel_id, source_fx_id, source_fx,
    CASE WHEN p_source_kind = 'departure' THEN tour_version_row.price_vnd_per_person ELSE NULL END,
    vnd_total, checkout_currency_value, amount_value, derived_party_size, p_locale,
    source_meeting_point, 2100, hold_end, created_time
  ) RETURNING * INTO booking_row;

  IF p_source_kind = 'quote' THEN
    PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
    PERFORM pg_catalog.set_config('localens.quote_transition', 'on', true);
    UPDATE public.custom_quotes SET status = 'checkout_pending'::public.quote_status WHERE id = quote_row.id;
  END IF;
  INSERT INTO private.checkout_attempts (
    id, booking_id, owner_user_id, source_kind, departure_id, quote_id, provider_idempotency_key, created_at, updated_at
  ) VALUES (
    new_attempt_id, new_booking_id, actor_user_id, p_source_kind, source_departure_id, source_quote_id,
    'localens:stripe-checkout:v1:' || new_attempt_id::text, created_time, created_time
  );
  INSERT INTO private.capacity_holds (id, booking_id, departure_id, party_size, status, expires_at, created_at)
  SELECT new_hold_id, new_booking_id, departure_row.id, derived_party_size, 'active'::public.hold_status, hold_end, created_time
  WHERE p_source_kind = 'departure';

  PERFORM private.record_checkout_audit_event(
    CASE WHEN p_source_kind = 'quote' THEN 'quote_checkout_started'::public.audit_event_type ELSE 'checkout_started'::public.audit_event_type END,
    actor_user_id, CASE WHEN p_source_kind = 'quote' THEN 'custom_quote'::public.audit_target_type ELSE 'checkout_attempt'::public.audit_target_type END,
    CASE WHEN p_source_kind = 'quote' THEN source_quote_id ELSE new_attempt_id END,
    CASE WHEN p_source_kind = 'quote' THEN 'active' ELSE NULL END,
    CASE WHEN p_source_kind = 'quote' THEN 'checkout_pending' ELSE 'created' END,
    'currency'::public.audit_metadata_key, booking_row.checkout_currency::text, NULL, NULL
  );
  booking_id := new_booking_id;
  attempt_id := new_attempt_id;
  provider_idempotency_key := 'localens:stripe-checkout:v1:' || new_attempt_id::text;
  amount_minor := amount_value::text;
  currency := booking_row.checkout_currency;
  hold_expires_at := hold_end;
  state := 'created';
  RETURN NEXT;
END;
$function$;
SET LOCAL ROLE postgres;

GRANT CREATE ON SCHEMA public TO localens_simulated_payment_rpc_owner;
SET LOCAL ROLE localens_simulated_payment_rpc_owner;
CREATE OR REPLACE FUNCTION public.complete_simulated_fixed_tour_payment(
  booking_id uuid,
  idempotency_key text
)
RETURNS SETOF public.simulated_payment_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  requested_booking_id uuid := $1;
  requested_idempotency_key text := $2;
  actor_user_id uuid;
  idempotency_row private.checkout_idempotency%ROWTYPE;
  routing_attempt private.checkout_attempts%ROWTYPE;
  attempt_row private.checkout_attempts%ROWTYPE;
  departure_row public.departures%ROWTYPE;
  booking_row public.bookings%ROWTYPE;
  hold_row private.capacity_holds%ROWTYPE;
  receipt_row private.simulated_payment_receipts%ROWTYPE;
  real_payment_id uuid;
  authority_time timestamptz;
  qa_slot private.thesis_demo_qa_slots%ROWTYPE;
  new_receipt_id uuid := pg_catalog.gen_random_uuid();
BEGIN
  actor_user_id := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(
      NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      'sub'
    )
  )::uuid;

  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM private.user_roles AS roles
    WHERE roles.user_id = actor_user_id
      AND roles.role = 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION 'simulated payment authentication required' USING ERRCODE = '42501';
  END IF;
  IF requested_booking_id IS NULL
     OR requested_idempotency_key IS NULL
     OR requested_idempotency_key <> btrim(requested_idempotency_key)
     OR length(requested_idempotency_key) NOT BETWEEN 1 AND 255
     OR requested_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$' THEN
    RAISE EXCEPTION 'simulated payment input rejected' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO qa_slot
  FROM private.thesis_demo_qa_slots AS registered
  WHERE registered.booking_id = requested_booking_id;
  IF FOUND THEN
    IF qa_slot.owner_user_id IS DISTINCT FROM actor_user_id
       OR qa_slot.terminal_flow IS DISTINCT FROM 'payment'
       OR qa_slot.payment_idempotency_key IS DISTINCT FROM requested_idempotency_key THEN
      RAISE EXCEPTION 'THESIS_DEMO_QA_SLOT_MISMATCH' USING ERRCODE = '22023';
    END IF;
    new_receipt_id := qa_slot.simulated_payment_id;
  END IF;

  SELECT * INTO idempotency_row
  FROM private.checkout_idempotency AS receipts
  WHERE receipts.booking_id = requested_booking_id
    AND receipts.owner_user_id = actor_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'simulated payment unavailable' USING ERRCODE = '42501';
  END IF;

  -- Serialize the same customer key even when two different booking rows are
  -- targeted concurrently. The durable row locks below keep the shared order.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_user_id::text || ':' || requested_idempotency_key, 0)
  );

  SELECT * INTO routing_attempt
  FROM private.checkout_attempts AS attempts
  WHERE attempts.id = idempotency_row.checkout_attempt_id;
  IF NOT FOUND OR routing_attempt.departure_id IS NULL OR routing_attempt.quote_id IS NOT NULL THEN
    RAISE EXCEPTION 'simulated payment unavailable' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO departure_row
  FROM public.departures AS departures
  WHERE departures.id = routing_attempt.departure_id
  FOR UPDATE;
  SELECT * INTO booking_row
  FROM public.bookings AS bookings
  WHERE bookings.id = requested_booking_id
  FOR UPDATE;
  IF NOT FOUND
     OR booking_row.owner_user_id IS DISTINCT FROM actor_user_id
     OR booking_row.source_kind IS DISTINCT FROM 'departure'
     OR booking_row.departure_id IS DISTINCT FROM routing_attempt.departure_id THEN
    RAISE EXCEPTION 'simulated payment unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO hold_row
  FROM private.capacity_holds AS holds
  WHERE holds.booking_id = booking_row.id
  ORDER BY holds.created_at DESC, holds.id DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'simulated payment hold unavailable' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO attempt_row
  FROM private.checkout_attempts AS attempts
  WHERE attempts.id = idempotency_row.checkout_attempt_id
  FOR UPDATE;
  IF NOT FOUND
     OR attempt_row.booking_id IS DISTINCT FROM booking_row.id
     OR attempt_row.owner_user_id IS DISTINCT FROM actor_user_id
     OR attempt_row.departure_id IS DISTINCT FROM booking_row.departure_id THEN
    RAISE EXCEPTION 'simulated payment unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT payments.id INTO real_payment_id
  FROM public.payments AS payments
  WHERE payments.booking_id = booking_row.id;
  IF real_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'REAL_PAYMENT_EXISTS' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO receipt_row
  FROM private.simulated_payment_receipts AS receipts
  WHERE receipts.booking_id = booking_row.id
     OR (receipts.owner_user_id = actor_user_id
         AND receipts.idempotency_key = requested_idempotency_key)
  ORDER BY CASE WHEN receipts.booking_id = booking_row.id THEN 0 ELSE 1 END
  LIMIT 1;
  IF FOUND THEN
    IF receipt_row.booking_id IS DISTINCT FROM booking_row.id
       OR receipt_row.owner_user_id IS DISTINCT FROM actor_user_id
       OR receipt_row.idempotency_key IS DISTINCT FROM requested_idempotency_key THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEXT (
      receipt_row.booking_id,
      receipt_row.result_booking_status,
      receipt_row.result_payment_status,
      receipt_row.simulated_at,
      'replayed'::text
    )::public.simulated_payment_result;
    RETURN;
  END IF;

  authority_time := pg_catalog.clock_timestamp();
  IF hold_row.expires_at <= authority_time
     OR hold_row.status = 'expired'::public.hold_status
     OR booking_row.status = 'expired'::public.booking_status THEN
    PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
    IF hold_row.status = 'active'::public.hold_status THEN
      UPDATE private.capacity_holds
      SET status = 'expired'::public.hold_status,
          released_at = authority_time
      WHERE id = hold_row.id;
    ELSIF hold_row.status <> 'expired'::public.hold_status THEN
      RAISE EXCEPTION 'simulated payment unavailable' USING ERRCODE = 'P0001';
    END IF;
    IF booking_row.status = 'pending_payment'::public.booking_status THEN
      UPDATE public.bookings
      SET status = 'expired'::public.booking_status
      WHERE id = booking_row.id;
    ELSIF booking_row.status <> 'expired'::public.booking_status THEN
      RAISE EXCEPTION 'simulated payment unavailable' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO private.simulated_payment_receipts (
      id, booking_id, owner_user_id, checkout_attempt_id, idempotency_key,
      result_booking_status, result_payment_status, amount_minor, currency,
      simulated_at, created_at
    ) VALUES (
      new_receipt_id, booking_row.id, actor_user_id, attempt_row.id, requested_idempotency_key,
      'expired'::public.booking_status, NULL, booking_row.checkout_amount_minor,
      booking_row.checkout_currency, authority_time, authority_time
    ) RETURNING * INTO receipt_row;
  ELSE
    IF booking_row.status <> 'pending_payment'::public.booking_status
       OR hold_row.status <> 'active'::public.hold_status
       OR attempt_row.status <> 'created'
       OR attempt_row.provider_session_id IS NOT NULL THEN
      RAISE EXCEPTION 'simulated payment unavailable' USING ERRCODE = 'P0001';
    END IF;
    PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
    UPDATE public.bookings
    SET status = 'payment_processing'::public.booking_status
    WHERE id = booking_row.id;
    UPDATE private.capacity_holds
    SET status = 'consumed'::public.hold_status,
        consumed_at = authority_time
    WHERE id = hold_row.id;
    UPDATE public.bookings
    SET status = 'confirmed'::public.booking_status
    WHERE id = booking_row.id;
    INSERT INTO private.simulated_payment_receipts (
      id, booking_id, owner_user_id, checkout_attempt_id, idempotency_key,
      result_booking_status, result_payment_status, amount_minor, currency,
      simulated_at, created_at
    ) VALUES (
      new_receipt_id, booking_row.id, actor_user_id, attempt_row.id, requested_idempotency_key,
      'confirmed'::public.booking_status, 'paid'::public.payment_status,
      booking_row.checkout_amount_minor, booking_row.checkout_currency,
      authority_time, authority_time
    ) RETURNING * INTO receipt_row;
  END IF;

  RETURN NEXT (
    receipt_row.booking_id,
    receipt_row.result_booking_status,
    receipt_row.result_payment_status,
    receipt_row.simulated_at,
    CASE
      WHEN receipt_row.result_booking_status = 'expired'::public.booking_status THEN 'expired'
      ELSE 'completed'
    END
  )::public.simulated_payment_result;
END;
$function$;
SET LOCAL ROLE postgres;

GRANT CREATE ON SCHEMA public TO localens_cancellation_customer_rpc_owner;
SET LOCAL ROLE localens_cancellation_customer_rpc_owner;
CREATE OR REPLACE FUNCTION public.cancel_booking(
  booking_id uuid,
  reason_code text DEFAULT NULL,
  other_reason text DEFAULT NULL,
  idempotency_key text DEFAULT NULL
)
RETURNS SETOF public.booking_cancellation_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  requested_booking_id uuid := $1;
  requested_reason_code text := $2;
  requested_other_reason text := $3;
  requested_idempotency_key text := $4;
  actor_user_id uuid;
  idempotency_row private.checkout_idempotency%ROWTYPE;
  routing_attempt private.checkout_attempts%ROWTYPE;
  attempt_row private.checkout_attempts%ROWTYPE;
  booking_row public.bookings%ROWTYPE;
  hold_row private.capacity_holds%ROWTYPE;
  quote_row public.custom_quotes%ROWTYPE;
  cancellation_row private.booking_cancellations%ROWTYPE;
  payment_id uuid;
  simulated_receipt_id uuid;
  source_found boolean := false;
  authority_time timestamptz;
  qa_slot private.thesis_demo_qa_slots%ROWTYPE;
  new_cancellation_id uuid := pg_catalog.gen_random_uuid();
BEGIN
  actor_user_id := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(
      NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      'sub'
    )
  )::uuid;
  IF actor_user_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM private.user_roles AS roles
       WHERE roles.user_id = actor_user_id AND roles.role = 'customer'::public.app_role
     )
     OR EXISTS (
       SELECT 1 FROM private.user_roles AS roles
       WHERE roles.user_id = actor_user_id AND roles.role <> 'customer'::public.app_role
     ) THEN
    RAISE EXCEPTION 'cancellation customer role required' USING ERRCODE = '42501';
  END IF;

  IF requested_booking_id IS NULL
     OR requested_idempotency_key IS NULL
     OR requested_idempotency_key <> btrim(requested_idempotency_key)
     OR requested_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'
     OR NOT COALESCE((
       (requested_reason_code IS NULL AND requested_other_reason IS NULL)
       OR
       (
         requested_reason_code IN (
           'trip_plan_changed',
           'wrong_tour_or_departure',
           'booking_details_change',
           'tour_details_unsuitable',
           'price_unsuitable',
           'payment_unavailable'
         )
         AND requested_other_reason IS NULL
       )
       OR
       (
         requested_reason_code = 'other'
         AND requested_other_reason = btrim(requested_other_reason)
         AND length(requested_other_reason) BETWEEN 3 AND 500
         AND requested_other_reason !~ '[[:cntrl:]]'
       )
     ), false) THEN
    RAISE EXCEPTION 'cancellation input rejected' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO qa_slot
  FROM private.thesis_demo_qa_slots AS registered
  WHERE registered.booking_id = requested_booking_id;
  IF FOUND THEN
    IF qa_slot.owner_user_id IS DISTINCT FROM actor_user_id
       OR qa_slot.terminal_flow IS DISTINCT FROM 'cancellation'
       OR qa_slot.cancellation_idempotency_key IS DISTINCT FROM requested_idempotency_key THEN
      RAISE EXCEPTION 'THESIS_DEMO_QA_SLOT_MISMATCH' USING ERRCODE = '22023';
    END IF;
    new_cancellation_id := qa_slot.cancellation_id;
  END IF;

  -- Shared terminalization order: checkout idempotency, actor/key advisory,
  -- source row, booking, source-dependent hold, attempt, payment authorities,
  -- and finally the cancellation fact.
  SELECT * INTO idempotency_row
  FROM private.checkout_idempotency AS idempotency
  WHERE idempotency.booking_id = requested_booking_id
    AND idempotency.owner_user_id = actor_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_user_id::text || ':' || requested_idempotency_key, 0)
  );

  SELECT * INTO routing_attempt
  FROM private.checkout_attempts AS attempts
  WHERE attempts.id = idempotency_row.checkout_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = 'P0001';
  END IF;

  IF routing_attempt.source_kind = 'departure'
     AND routing_attempt.departure_id IS NOT NULL
     AND routing_attempt.quote_id IS NULL THEN
    PERFORM departures.id
    FROM public.departures AS departures
    WHERE departures.id = routing_attempt.departure_id
    FOR UPDATE;
    source_found := FOUND;
  ELSIF routing_attempt.source_kind = 'quote'
     AND routing_attempt.quote_id IS NOT NULL
     AND routing_attempt.departure_id IS NULL THEN
    SELECT * INTO quote_row
    FROM public.custom_quotes AS quotes
    WHERE quotes.id = routing_attempt.quote_id
    FOR UPDATE;
    source_found := FOUND;
  END IF;
  IF NOT source_found THEN
    RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO booking_row
  FROM public.bookings AS bookings
  WHERE bookings.id = requested_booking_id
  FOR UPDATE;
  IF NOT FOUND
     OR booking_row.owner_user_id IS DISTINCT FROM actor_user_id
     OR booking_row.source_kind IS DISTINCT FROM routing_attempt.source_kind
     OR booking_row.departure_id IS DISTINCT FROM routing_attempt.departure_id
     OR booking_row.quote_id IS DISTINCT FROM routing_attempt.quote_id THEN
    RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = '42501';
  END IF;

  IF booking_row.source_kind = 'departure' THEN
    SELECT * INTO hold_row
    FROM private.capacity_holds AS holds
    WHERE holds.booking_id = booking_row.id
    ORDER BY holds.created_at DESC, holds.id DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  SELECT * INTO attempt_row
  FROM private.checkout_attempts AS attempts
  WHERE attempts.id = idempotency_row.checkout_attempt_id
  FOR UPDATE;
  IF NOT FOUND
     OR attempt_row.booking_id IS DISTINCT FROM booking_row.id
     OR attempt_row.owner_user_id IS DISTINCT FROM actor_user_id THEN
    RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT payments.id INTO payment_id
  FROM public.payments AS payments
  WHERE payments.booking_id = booking_row.id;
  SELECT receipts.id INTO simulated_receipt_id
  FROM private.simulated_payment_receipts AS receipts
  WHERE receipts.booking_id = booking_row.id;

  SELECT * INTO cancellation_row
  FROM private.booking_cancellations AS cancellations
  WHERE cancellations.booking_id = booking_row.id
     OR (
       cancellations.customer_user_id = actor_user_id
       AND cancellations.request_idempotency_key = requested_idempotency_key
     )
  ORDER BY CASE WHEN cancellations.booking_id = booking_row.id THEN 0 ELSE 1 END
  LIMIT 1;
  IF FOUND THEN
    IF cancellation_row.booking_id IS DISTINCT FROM booking_row.id
       OR cancellation_row.customer_user_id IS DISTINCT FROM actor_user_id
       OR cancellation_row.request_idempotency_key IS DISTINCT FROM requested_idempotency_key
       OR cancellation_row.reason_code IS DISTINCT FROM requested_reason_code
       OR cancellation_row.other_reason IS DISTINCT FROM requested_other_reason THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEXT (
      cancellation_row.id,
      cancellation_row.booking_id,
      cancellation_row.customer_user_id,
      cancellation_row.source_kind,
      cancellation_row.reason_code,
      cancellation_row.other_reason,
      cancellation_row.request_idempotency_key,
      cancellation_row.cancelled_at,
      'cancelled'::public.booking_status,
      'replayed'
    )::public.booking_cancellation_result;
    RETURN;
  END IF;

  authority_time := pg_catalog.clock_timestamp();
  IF booking_row.status <> 'pending_payment'::public.booking_status
     OR attempt_row.status <> 'created'
     OR attempt_row.provider_session_id IS NOT NULL
     OR payment_id IS NOT NULL
     OR simulated_receipt_id IS NOT NULL
     OR (
       booking_row.source_kind = 'departure'
       AND (
         hold_row.id IS NULL
         OR hold_row.status <> 'active'::public.hold_status
         OR hold_row.expires_at <= authority_time
       )
     )
     OR (
       booking_row.source_kind = 'quote'
       AND (
         quote_row.id IS NULL
         OR quote_row.status <> 'checkout_pending'::public.quote_status
         OR quote_row.valid_until <= authority_time
       )
     ) THEN
    RAISE EXCEPTION 'cancellation unavailable' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
  IF booking_row.source_kind = 'quote' THEN
    PERFORM pg_catalog.set_config('localens.quote_transition', 'on', true);
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled'::public.booking_status
  WHERE id = booking_row.id;
  IF booking_row.source_kind = 'departure' THEN
    UPDATE private.capacity_holds
    SET status = 'released'::public.hold_status,
        released_at = authority_time
    WHERE id = hold_row.id;
  ELSE
    UPDATE public.custom_quotes
    SET status = 'revoked'::public.quote_status
    WHERE id = quote_row.id;
  END IF;
  UPDATE private.checkout_attempts
  SET status = 'compensated', updated_at = authority_time
  WHERE id = attempt_row.id;

  INSERT INTO private.booking_cancellations (
    id,
    booking_id,
    customer_user_id,
    source_kind,
    reason_code,
    other_reason,
    request_idempotency_key,
    cancelled_at
  ) VALUES (
    new_cancellation_id,
    booking_row.id,
    actor_user_id,
    booking_row.source_kind,
    requested_reason_code,
    requested_other_reason,
    requested_idempotency_key,
    authority_time
  )
  RETURNING * INTO cancellation_row;

  RETURN NEXT (
    cancellation_row.id,
    cancellation_row.booking_id,
    cancellation_row.customer_user_id,
    cancellation_row.source_kind,
    cancellation_row.reason_code,
    cancellation_row.other_reason,
    cancellation_row.request_idempotency_key,
    cancellation_row.cancelled_at,
    'cancelled'::public.booking_status,
    'created'
  )::public.booking_cancellation_result;
END;
$function$;
SET LOCAL ROLE postgres;

GRANT CREATE ON SCHEMA private TO localens_checkout_rpc_owner;
ALTER FUNCTION private.start_checkout_tx(text, uuid, integer, public.locale, text, text)
  OWNER TO localens_checkout_rpc_owner;
REVOKE CREATE ON SCHEMA private FROM localens_checkout_rpc_owner;
SET LOCAL ROLE localens_checkout_rpc_owner;
REVOKE ALL ON FUNCTION private.start_checkout_tx(text, uuid, integer, public.locale, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.start_checkout_tx(text, uuid, integer, public.locale, text, text)
  TO localens_checkout_rpc_owner;
SET LOCAL ROLE postgres;

GRANT CREATE ON SCHEMA public TO localens_simulated_payment_rpc_owner;
ALTER FUNCTION public.complete_simulated_fixed_tour_payment(uuid, text)
  OWNER TO localens_simulated_payment_rpc_owner;
REVOKE CREATE ON SCHEMA public FROM localens_simulated_payment_rpc_owner;
SET LOCAL ROLE localens_simulated_payment_rpc_owner;
REVOKE ALL ON FUNCTION public.complete_simulated_fixed_tour_payment(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_simulated_fixed_tour_payment(uuid, text)
  TO authenticated;
SET LOCAL ROLE postgres;

GRANT CREATE ON SCHEMA public TO localens_cancellation_customer_rpc_owner;
ALTER FUNCTION public.cancel_booking(uuid, text, text, text)
  OWNER TO localens_cancellation_customer_rpc_owner;
REVOKE CREATE ON SCHEMA public FROM localens_cancellation_customer_rpc_owner;
SET LOCAL ROLE localens_cancellation_customer_rpc_owner;
REVOKE ALL ON FUNCTION public.cancel_booking(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, text, text, text)
  TO authenticated;
SET LOCAL ROLE postgres;

-- The plan owner gets two immutable quota columns through FORCE RLS solely so
-- the private helper can count the operation's own reservations.
CREATE POLICY quota_reservations_plan_rpc_owner_select
  ON private.quota_reservations
  FOR SELECT TO localens_plan_rpc_owner
  USING (current_user = 'localens_plan_rpc_owner');
GRANT SELECT (reservation_id, kind)
  ON TABLE private.quota_reservations TO localens_plan_rpc_owner;

GRANT CREATE ON SCHEMA private TO localens_plan_rpc_owner;
SET LOCAL ROLE localens_plan_rpc_owner;
CREATE OR REPLACE FUNCTION private.get_runtime_planner_operation_attestation(uuid, uuid)
RETURNS TABLE (
  operation_count integer,
  planner_reservation_count integer,
  gemini_reservation_count integer,
  recommendation_run_count integer,
  provider_attempted_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
  WITH operation_scope AS MATERIALIZED (
    SELECT
      operations.result_plan_id,
      operations.result_revision_no,
      operations.planner_reservation_id,
      operations.gemini_reservation_id
    FROM private.runtime_planner_operations AS operations
    WHERE operations.owner_user_id = $1
      AND operations.operation_id = $2
  ),
  revision_scope AS MATERIALIZED (
    SELECT revisions.id
    FROM operation_scope AS operation
    JOIN public.trip_plan_revisions AS revisions
      ON revisions.plan_id = operation.result_plan_id
     AND revisions.revision_no = operation.result_revision_no
  )
  SELECT
    (SELECT pg_catalog.count(*)::integer FROM operation_scope),
    (SELECT pg_catalog.count(*)::integer
     FROM operation_scope AS operation
     JOIN private.quota_reservations AS reservations
       ON reservations.reservation_id = operation.planner_reservation_id
      AND reservations.kind = 'planner'),
    (SELECT pg_catalog.count(*)::integer
     FROM operation_scope AS operation
     JOIN private.quota_reservations AS reservations
       ON reservations.reservation_id = operation.gemini_reservation_id
      AND reservations.kind = 'gemini'),
    (SELECT pg_catalog.count(*)::integer
     FROM revision_scope AS revision
     JOIN private.recommendation_runs AS runs
       ON runs.revision_id = revision.id
      AND runs.actor_user_id = $1),
    (SELECT pg_catalog.count(*)::integer
     FROM revision_scope AS revision
     JOIN private.recommendation_runs AS runs
       ON runs.revision_id = revision.id
      AND runs.actor_user_id = $1
      AND runs.provider_attempted IS TRUE);
$function$;
SET LOCAL ROLE postgres;
ALTER FUNCTION private.get_runtime_planner_operation_attestation(uuid, uuid)
  OWNER TO localens_plan_rpc_owner;
SET LOCAL ROLE localens_plan_rpc_owner;
REVOKE ALL ON FUNCTION private.get_runtime_planner_operation_attestation(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_runtime_planner_operation_attestation(uuid, uuid)
  TO localens_plan_rpc_owner;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA private FROM localens_plan_rpc_owner;


GRANT CREATE ON SCHEMA public TO localens_plan_rpc_owner;
SET LOCAL ROLE localens_plan_rpc_owner;
CREATE OR REPLACE FUNCTION public.get_runtime_planner_operation(
  p_actor_user_id uuid,
  p_operation_id uuid,
  p_request_digest text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  operation_row private.runtime_planner_operations%ROWTYPE;
  attestation_row record;
  attestation_json jsonb;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM private.user_roles AS roles
    WHERE roles.user_id = p_actor_user_id
      AND roles.role = 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION 'customer role required' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL
     OR p_request_digest IS NULL
     OR p_request_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid planner operation lookup' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO attestation_row
  FROM private.get_runtime_planner_operation_attestation(
    p_actor_user_id,
    p_operation_id
  );
  attestation_json := jsonb_build_object(
    'operationCount', attestation_row.operation_count,
    'plannerReservationCount', attestation_row.planner_reservation_count,
    'geminiReservationCount', attestation_row.gemini_reservation_count,
    'recommendationRunCount', attestation_row.recommendation_run_count,
    'providerAttemptedCount', attestation_row.provider_attempted_count
  );

  SELECT *
  INTO operation_row
  FROM private.runtime_planner_operations AS operations
  WHERE operations.owner_user_id = p_actor_user_id
    AND operations.operation_id = p_operation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'missing') || attestation_json;
  END IF;
  IF operation_row.request_digest IS DISTINCT FROM p_request_digest THEN
    RETURN jsonb_build_object('state', 'conflict') || attestation_json;
  END IF;
  IF operation_row.state = 'completed' THEN
    RETURN jsonb_build_object(
      'state', 'completed',
      'planId', operation_row.result_plan_id::text,
      'revision', operation_row.result_revision_no
    ) || attestation_json;
  ELSIF operation_row.state = 'rejected' THEN
    RETURN jsonb_build_object(
      'state', 'rejected',
      'errorCode', operation_row.rejection_code
    ) || attestation_json;
  ELSIF operation_row.state = 'interrupted' THEN
    RETURN jsonb_build_object('state', 'interrupted') || attestation_json;
  ELSIF operation_row.state = 'claimed' THEN
    RETURN jsonb_build_object('state', 'in_progress') || attestation_json;
  END IF;

  RAISE EXCEPTION 'invalid persisted planner operation state' USING ERRCODE = 'P0001';
END;
$function$;
SET LOCAL ROLE postgres;

GRANT CREATE ON SCHEMA public TO localens_plan_rpc_owner;
ALTER FUNCTION public.get_runtime_planner_operation(uuid, uuid, text)
  OWNER TO localens_plan_rpc_owner;
REVOKE CREATE ON SCHEMA public FROM localens_plan_rpc_owner;
SET LOCAL ROLE localens_plan_rpc_owner;
REVOKE ALL ON FUNCTION public.get_runtime_planner_operation(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_runtime_planner_operation(uuid, uuid, text) TO service_role;
SET LOCAL ROLE postgres;

COMMIT;
