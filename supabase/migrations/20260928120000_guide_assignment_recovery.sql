BEGIN;

-- The original assignment runtime only exposed fixed departures.  Keep its
-- public RPC names and result shapes stable, but give the bounded definers the
-- minimum immutable custom-plan facts needed to validate and project a quote.
CREATE POLICY custom_quotes_guide_recovery_projection_select
  ON public.custom_quotes FOR SELECT
  TO localens_guide_projection_owner
  USING (current_user = 'localens_guide_projection_owner');
CREATE POLICY custom_requests_guide_recovery_projection_select
  ON public.custom_requests FOR SELECT
  TO localens_guide_projection_owner
  USING (current_user = 'localens_guide_projection_owner');
CREATE POLICY trip_plan_revisions_guide_recovery_projection_select
  ON public.trip_plan_revisions FOR SELECT
  TO localens_guide_projection_owner
  USING (current_user = 'localens_guide_projection_owner');
CREATE POLICY trip_plan_items_guide_recovery_assignment_select
  ON public.trip_plan_items FOR SELECT
  TO localens_guide_assignment_rpc_owner
  USING (current_user = 'localens_guide_assignment_rpc_owner');
CREATE POLICY trip_plan_items_guide_recovery_projection_select
  ON public.trip_plan_items FOR SELECT
  TO localens_guide_projection_owner
  USING (current_user = 'localens_guide_projection_owner');

GRANT SELECT (id, request_id, status)
  ON public.custom_quotes
  TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner;
GRANT SELECT (id, plan_id, revision_id, revision_no, status)
  ON public.custom_requests
  TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner;
GRANT SELECT (id, plan_id, revision_no)
  ON public.trip_plan_revisions
  TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner;
GRANT SELECT (revision_id, catalog_snapshot_id, place_id, position, start_at, end_at)
  ON public.trip_plan_items
  TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner;

GRANT CREATE ON SCHEMA private TO localens_guide_assignment_rpc_owner;
SET LOCAL ROLE localens_guide_assignment_rpc_owner;

-- One source-aware window is shared by mutation, admin queue, and guide
-- schedule.  It deliberately does not filter booking/departure completion or
-- cancellation so an already assigned cancelled tour remains visible in the
-- guide's history; callers decide whether the row is assignable or merely
-- readable.
CREATE OR REPLACE FUNCTION private.guide_booking_window(p_booking_id uuid)
RETURNS TABLE (start_at timestamptz, end_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
  SELECT departures.start_at, departures.end_at
  FROM public.bookings AS bookings
  JOIN public.departures AS departures ON departures.id = bookings.departure_id
  WHERE bookings.id = p_booking_id
    AND bookings.source_kind = 'departure'
    AND bookings.departure_id IS NOT NULL
    AND bookings.tour_version_id IS NOT NULL
    AND departures.start_at IS NOT NULL
    AND departures.end_at IS NOT NULL
    AND departures.end_at > departures.start_at
  UNION ALL
  SELECT pg_catalog.min(items.start_at), pg_catalog.max(items.end_at)
  FROM public.bookings AS bookings
  JOIN public.custom_quotes AS quotes ON quotes.id = bookings.quote_id
  JOIN public.custom_requests AS requests ON requests.id = quotes.request_id
  JOIN public.trip_plan_revisions AS revisions
    ON revisions.id = requests.revision_id
   AND revisions.plan_id = requests.plan_id
   AND revisions.revision_no = requests.revision_no
  JOIN public.trip_plan_items AS items ON items.revision_id = revisions.id
  WHERE bookings.id = p_booking_id
    AND bookings.source_kind = 'quote'
    AND bookings.quote_id IS NOT NULL
    AND bookings.tour_version_id IS NULL
    AND quotes.status IN (
      'accepted'::public.quote_status,
      'revoked'::public.quote_status
    )
    AND requests.status = 'approved'::public.request_status
  GROUP BY bookings.id
  HAVING pg_catalog.count(*) > 0
     AND pg_catalog.max(items.end_at) > pg_catalog.min(items.start_at);
$function$;

CREATE OR REPLACE FUNCTION private.assign_guide_runtime(
  p_booking_id uuid,
  p_guide_user_id uuid
)
RETURNS TABLE (assignment_id uuid, status public.assignment_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  actor_user_id uuid;
  actor_role_count integer;
  target_role_count integer;
  booking_row record;
  departure_row record;
  quote_row record;
  window_row record;
  current_assignment public.guide_assignments%ROWTYPE;
  requirement_snapshot record;
  new_assignment public.guide_assignments%ROWTYPE;
  transition_at timestamptz;
  had_active boolean := false;
BEGIN
  actor_user_id := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(
      NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      'sub'
    )
  )::uuid;
  SELECT count(*) INTO actor_role_count
  FROM private.user_roles AS roles
  WHERE roles.user_id = actor_user_id;
  IF actor_user_id IS NULL OR actor_role_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = actor_user_id AND roles.role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'guide assignment administrator role required' USING ERRCODE = '42501';
  END IF;

  IF p_booking_id IS NULL OR p_guide_user_id IS NULL THEN
    RAISE EXCEPTION 'guide assignment input rejected' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO target_role_count
  FROM private.user_roles AS roles
  WHERE roles.user_id = p_guide_user_id;
  IF target_role_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = p_guide_user_id AND roles.role = 'guide'::public.app_role
  ) OR NOT EXISTS (
    SELECT 1 FROM public.guide_profiles AS profiles
    WHERE profiles.user_id = p_guide_user_id
  ) THEN
    RAISE EXCEPTION 'guide_assignment_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT bookings.id, bookings.source_kind, bookings.departure_id,
    bookings.tour_version_id, bookings.status, bookings.quote_id INTO booking_row
  FROM public.bookings AS bookings
  WHERE bookings.id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND OR booking_row.status <> 'confirmed'::public.booking_status THEN
    RAISE EXCEPTION 'guide_assignment_state_conflict' USING ERRCODE = 'P0001';
  END IF;

  IF booking_row.source_kind = 'departure' THEN
    IF booking_row.departure_id IS NULL OR booking_row.tour_version_id IS NULL THEN
      RAISE EXCEPTION 'guide_assignment_state_conflict' USING ERRCODE = 'P0001';
    END IF;
    SELECT departures.id, departures.start_at, departures.end_at, departures.status
    INTO departure_row
    FROM public.departures AS departures
    WHERE departures.id = booking_row.departure_id
    FOR UPDATE;
    IF NOT FOUND
       OR departure_row.status NOT IN (
         'scheduled'::public.departure_status,
         'sold_out'::public.departure_status
       )
       OR departure_row.start_at IS NULL
       OR departure_row.end_at IS NULL
       OR departure_row.end_at <= departure_row.start_at THEN
      RAISE EXCEPTION 'guide_assignment_state_conflict' USING ERRCODE = 'P0001';
    END IF;
  ELSIF booking_row.source_kind = 'quote' THEN
    SELECT quotes.id, quotes.status, requests.status AS request_status
    INTO quote_row
    FROM public.custom_quotes AS quotes
    JOIN public.custom_requests AS requests ON requests.id = quotes.request_id
    WHERE quotes.id = booking_row.quote_id
    FOR UPDATE OF quotes, requests;
    IF NOT FOUND
       OR booking_row.quote_id IS NULL
       OR booking_row.departure_id IS NOT NULL
       OR booking_row.tour_version_id IS NOT NULL
       OR quote_row.status <> 'accepted'::public.quote_status
       OR quote_row.request_status <> 'approved'::public.request_status THEN
      RAISE EXCEPTION 'guide_assignment_state_conflict' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'guide_assignment_state_conflict' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO window_row
  FROM private.guide_booking_window(p_booking_id);
  IF NOT FOUND OR window_row.start_at IS NULL OR window_row.end_at IS NULL
     OR window_row.end_at <= window_row.start_at THEN
    RAISE EXCEPTION 'guide_assignment_state_conflict' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO current_assignment
  FROM public.guide_assignments AS assignments
  WHERE assignments.booking_id = p_booking_id
    AND assignments.status IN ('assigned'::public.assignment_status, 'accepted'::public.assignment_status)
  ORDER BY assignments.id
  LIMIT 1
  FOR UPDATE;
  had_active := FOUND;
  IF had_active AND current_assignment.guide_user_id IS NOT DISTINCT FROM p_guide_user_id THEN
    assignment_id := current_assignment.id;
    status := current_assignment.status;
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('localens:guide-schedule:' || p_guide_user_id::text, 0)
  );
  IF EXISTS (
    SELECT 1
    FROM public.guide_assignments AS assignments
    JOIN public.bookings AS bookings ON bookings.id = assignments.booking_id
    LEFT JOIN public.departures AS departures ON departures.id = bookings.departure_id
    CROSS JOIN LATERAL private.guide_booking_window(assignments.booking_id) AS existing_window
    WHERE assignments.guide_user_id = p_guide_user_id
      AND assignments.status IN ('assigned'::public.assignment_status, 'accepted'::public.assignment_status)
      AND assignments.booking_id <> p_booking_id
      AND bookings.status NOT IN ('cancelled'::public.booking_status, 'completed'::public.booking_status)
      AND (
        bookings.source_kind = 'quote'
        OR departures.status NOT IN ('cancelled'::public.departure_status, 'completed'::public.departure_status)
      )
      AND existing_window.start_at < window_row.end_at
      AND window_row.start_at < existing_window.end_at
  ) THEN
    RAISE EXCEPTION 'guide_assignment_schedule_conflict' USING ERRCODE = 'P0001';
  END IF;

  transition_at := pg_catalog.clock_timestamp();
  IF had_active THEN
    PERFORM pg_catalog.set_config('localens.guide_assignment_transition', 'on', true);
    UPDATE public.guide_assignments AS assignments
    SET status = 'closed'::public.assignment_status,
        closed_at = transition_at,
        updated_at = transition_at
    WHERE assignments.id = current_assignment.id;
    PERFORM private.record_guide_assignment_audit_event(
      'guide_reassigned'::public.audit_event_type,
      actor_user_id,
      current_assignment.id,
      current_assignment.status::text,
      'closed'
    );
  END IF;

  SELECT * INTO requirement_snapshot
  FROM private.guide_requirement_snapshot(p_booking_id);
  PERFORM pg_catalog.set_config('localens.guide_assignment_transition', 'on', true);
  INSERT INTO public.guide_assignments (
    booking_id, guide_user_id, status, mobility_flags, dietary_flags,
    assigned_at, created_at, updated_at
  ) VALUES (
    p_booking_id, p_guide_user_id, 'assigned'::public.assignment_status,
    requirement_snapshot.mobility_flags, requirement_snapshot.dietary_flags,
    transition_at, transition_at, transition_at
  ) RETURNING * INTO new_assignment;
  PERFORM private.record_guide_assignment_audit_event(
    CASE WHEN had_active
      THEN 'guide_reassigned'::public.audit_event_type
      ELSE 'guide_assigned'::public.audit_event_type
    END,
    actor_user_id,
    new_assignment.id,
    NULL,
    'assigned'
  );
  assignment_id := new_assignment.id;
  status := new_assignment.status;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION private.guide_booking_window(uuid), private.assign_guide_runtime(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guide_booking_window(uuid), private.assign_guide_runtime(uuid, uuid)
  TO localens_guide_assignment_rpc_owner;
SET LOCAL ROLE postgres;
GRANT EXECUTE ON FUNCTION private.guide_booking_window(uuid)
  TO localens_guide_admin_projection_owner, localens_guide_projection_owner;

GRANT CREATE ON SCHEMA public TO localens_guide_assignment_rpc_owner;
SET LOCAL ROLE localens_guide_assignment_rpc_owner;

CREATE OR REPLACE FUNCTION public.assign_fixed_departure_guide(
  booking_id uuid,
  guide_user_id uuid,
  idempotency_key text
)
RETURNS SETOF public.guide_assignment_mutation_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  requested_booking_id uuid := $1;
  requested_guide_user_id uuid := $2;
  requested_idempotency_key text := $3;
  authenticated_actor_user_id uuid;
  actor_role_count integer;
  target_role_count integer;
  ledger_row private.guide_assignment_idempotency%ROWTYPE;
  booking_row record;
  departure_row record;
  quote_row record;
  window_row record;
  current_assignment public.guide_assignments%ROWTYPE;
  assigned_row record;
  had_active boolean := false;
  result_outcome text;
BEGIN
  authenticated_actor_user_id := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(
      NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      'sub'
    )
  )::uuid;
  SELECT count(*) INTO actor_role_count
  FROM private.user_roles AS roles
  WHERE roles.user_id = authenticated_actor_user_id;
  IF authenticated_actor_user_id IS NULL OR actor_role_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = authenticated_actor_user_id AND roles.role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'guide assignment administrator role required' USING ERRCODE = '42501';
  END IF;
  IF requested_booking_id IS NULL OR requested_guide_user_id IS NULL
     OR requested_idempotency_key IS NULL
     OR requested_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$' THEN
    RAISE EXCEPTION 'guide assignment input rejected' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'localens:guide-assignment-idempotency:' || authenticated_actor_user_id::text || ':' || requested_idempotency_key,
      0
    )
  );
  SELECT * INTO ledger_row
  FROM private.guide_assignment_idempotency AS ledger
  WHERE ledger.actor_user_id = authenticated_actor_user_id
    AND ledger.idempotency_key = requested_idempotency_key;
  IF FOUND THEN
    IF ledger_row.booking_id IS DISTINCT FROM requested_booking_id
       OR ledger_row.guide_user_id IS DISTINCT FROM requested_guide_user_id THEN
      RAISE EXCEPTION 'guide_assignment_idempotency_conflict' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEXT (
      ledger_row.assignment_id,
      ledger_row.booking_id,
      ledger_row.guide_user_id,
      ledger_row.result_status,
      'replayed'
    )::public.guide_assignment_mutation_result;
    RETURN;
  END IF;

  SELECT count(*) INTO target_role_count
  FROM private.user_roles AS roles
  WHERE roles.user_id = requested_guide_user_id;
  IF target_role_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = requested_guide_user_id AND roles.role = 'guide'::public.app_role
  ) OR NOT EXISTS (
    SELECT 1 FROM public.guide_profiles AS profiles
    WHERE profiles.user_id = requested_guide_user_id
  ) THEN
    RAISE EXCEPTION 'guide_assignment_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT bookings.id, bookings.source_kind, bookings.departure_id,
    bookings.tour_version_id, bookings.status, bookings.quote_id INTO booking_row
  FROM public.bookings AS bookings
  WHERE bookings.id = requested_booking_id
  FOR UPDATE;
  IF NOT FOUND OR booking_row.status <> 'confirmed'::public.booking_status THEN
    RAISE EXCEPTION 'guide_assignment_state_conflict' USING ERRCODE = 'P0001';
  END IF;
  IF booking_row.source_kind = 'departure' THEN
    IF booking_row.departure_id IS NULL OR booking_row.tour_version_id IS NULL THEN
      RAISE EXCEPTION 'guide_assignment_state_conflict' USING ERRCODE = 'P0001';
    END IF;
    SELECT departures.id, departures.start_at, departures.end_at, departures.status
    INTO departure_row
    FROM public.departures AS departures
    WHERE departures.id = booking_row.departure_id
    FOR UPDATE;
    IF NOT FOUND
       OR departure_row.status NOT IN ('scheduled'::public.departure_status, 'sold_out'::public.departure_status)
       OR departure_row.start_at IS NULL
       OR departure_row.end_at IS NULL
       OR departure_row.end_at <= departure_row.start_at THEN
      RAISE EXCEPTION 'guide_assignment_state_conflict' USING ERRCODE = 'P0001';
    END IF;
  ELSIF booking_row.source_kind = 'quote' THEN
    SELECT quotes.id, quotes.status, requests.status AS request_status
    INTO quote_row
    FROM public.custom_quotes AS quotes
    JOIN public.custom_requests AS requests ON requests.id = quotes.request_id
    WHERE quotes.id = booking_row.quote_id
    FOR UPDATE OF quotes, requests;
    IF NOT FOUND
       OR booking_row.quote_id IS NULL
       OR booking_row.departure_id IS NOT NULL
       OR booking_row.tour_version_id IS NOT NULL
       OR quote_row.status <> 'accepted'::public.quote_status
       OR quote_row.request_status <> 'approved'::public.request_status THEN
      RAISE EXCEPTION 'guide_assignment_state_conflict' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'guide_assignment_state_conflict' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO window_row FROM private.guide_booking_window(requested_booking_id);
  IF NOT FOUND OR window_row.start_at IS NULL OR window_row.end_at IS NULL
     OR window_row.end_at <= window_row.start_at THEN
    RAISE EXCEPTION 'guide_assignment_state_conflict' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO current_assignment
  FROM public.guide_assignments AS assignments
  WHERE assignments.booking_id = requested_booking_id
    AND assignments.status IN ('assigned'::public.assignment_status, 'accepted'::public.assignment_status)
  ORDER BY assignments.id
  LIMIT 1
  FOR UPDATE;
  had_active := FOUND;
  IF had_active
     AND current_assignment.guide_user_id IS NOT DISTINCT FROM requested_guide_user_id THEN
    INSERT INTO private.guide_assignment_idempotency (
      actor_user_id, idempotency_key, booking_id, guide_user_id,
      assignment_id, result_status, result_outcome
    ) VALUES (
      authenticated_actor_user_id, requested_idempotency_key, requested_booking_id,
      requested_guide_user_id, current_assignment.id, current_assignment.status, 'unchanged'
    );
    RETURN NEXT (
      current_assignment.id,
      requested_booking_id,
      requested_guide_user_id,
      current_assignment.status,
      'unchanged'
    )::public.guide_assignment_mutation_result;
    RETURN;
  END IF;

  SELECT * INTO assigned_row
  FROM private.assign_guide_runtime(requested_booking_id, requested_guide_user_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guide_assignment_state_conflict' USING ERRCODE = 'P0001';
  END IF;
  result_outcome := CASE WHEN had_active THEN 'reassigned' ELSE 'assigned' END;
  INSERT INTO private.guide_assignment_idempotency (
    actor_user_id, idempotency_key, booking_id, guide_user_id,
    assignment_id, result_status, result_outcome
  ) VALUES (
    authenticated_actor_user_id, requested_idempotency_key, requested_booking_id,
    requested_guide_user_id, assigned_row.assignment_id, assigned_row.status, result_outcome
  );
  RETURN NEXT (
    assigned_row.assignment_id,
    requested_booking_id,
    requested_guide_user_id,
    assigned_row.status,
    result_outcome
  )::public.guide_assignment_mutation_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_fixed_departure_guide(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_fixed_departure_guide(uuid, uuid, text)
  TO authenticated;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA public FROM localens_guide_assignment_rpc_owner;

GRANT CREATE ON SCHEMA public TO localens_guide_admin_projection_owner;
SET LOCAL ROLE localens_guide_admin_projection_owner;

CREATE OR REPLACE FUNCTION public.get_admin_guide_assignment_queue()
RETURNS TABLE (
  booking_id uuid,
  tour_version_id uuid,
  departure_id uuid,
  title_en text,
  title_vi text,
  start_at timestamptz,
  end_at timestamptz,
  meeting_point text,
  party_size integer,
  language public.locale,
  assignment_id uuid,
  guide_user_id uuid,
  guide_display_name text,
  assignment_status public.assignment_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  actor_user_id uuid;
  actor_role_count integer;
BEGIN
  actor_user_id := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(
      NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      'sub'
    )
  )::uuid;
  SELECT count(*) INTO actor_role_count
  FROM private.user_roles AS roles
  WHERE roles.user_id = actor_user_id;
  IF actor_user_id IS NULL OR actor_role_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = actor_user_id AND roles.role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'guide assignment administrator role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT bookings.id,
    bookings.tour_version_id,
    departures.id,
    bookings.title_en,
    bookings.title_vi,
    windows.start_at,
    windows.end_at,
    bookings.meeting_point,
    bookings.party_size,
    bookings.language,
    active_assignment.id,
    active_assignment.guide_user_id,
    profiles.display_name,
    active_assignment.status
  FROM public.bookings AS bookings
  LEFT JOIN public.departures AS departures ON departures.id = bookings.departure_id
  CROSS JOIN LATERAL private.guide_booking_window(bookings.id) AS windows
  LEFT JOIN LATERAL (
    SELECT assignments.id, assignments.guide_user_id, assignments.status
    FROM public.guide_assignments AS assignments
    WHERE assignments.booking_id = bookings.id
      AND assignments.status IN ('assigned'::public.assignment_status, 'accepted'::public.assignment_status)
    ORDER BY assignments.id
    LIMIT 1
  ) AS active_assignment ON true
  LEFT JOIN public.guide_profiles AS profiles
    ON profiles.user_id = active_assignment.guide_user_id
  WHERE bookings.status = 'confirmed'::public.booking_status
    AND (
      (
        bookings.source_kind = 'departure'
        AND bookings.tour_version_id IS NOT NULL
        AND departures.status IN ('scheduled'::public.departure_status, 'sold_out'::public.departure_status)
      )
      OR bookings.source_kind = 'quote'
    )
    AND windows.end_at > windows.start_at
  ORDER BY windows.start_at, bookings.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_guide_assignment_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_guide_assignment_queue() TO authenticated;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA public FROM localens_guide_admin_projection_owner;

GRANT CREATE ON SCHEMA public TO localens_guide_projection_owner;
SET LOCAL ROLE localens_guide_projection_owner;

CREATE OR REPLACE FUNCTION public.get_guide_schedule(p_assignment_id uuid DEFAULT NULL)
RETURNS TABLE (
  assignment_id uuid,
  booking_id uuid,
  tour_version_id uuid,
  departure_id uuid,
  title text,
  start_at timestamptz,
  end_at timestamptz,
  meeting_point text,
  party_size integer,
  language public.locale,
  mobility_flags text[],
  dietary_flags text[],
  assignment_status public.assignment_status,
  tour_status text,
  itinerary jsonb,
  is_demo boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  actor_user_id uuid;
  actor_role_count integer;
  guide_language public.locale;
BEGIN
  actor_user_id := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(
      NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      'sub'
    )
  )::uuid;
  SELECT count(*) INTO actor_role_count
  FROM private.user_roles AS roles
  WHERE roles.user_id = actor_user_id;
  IF actor_user_id IS NULL OR actor_role_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = actor_user_id AND roles.role = 'guide'::public.app_role
  ) THEN
    RAISE EXCEPTION 'guide assignment guide role required' USING ERRCODE = '42501';
  END IF;
  SELECT profiles.language INTO guide_language
  FROM public.guide_profiles AS profiles
  WHERE profiles.user_id = actor_user_id;
  IF guide_language IS NULL THEN
    RAISE EXCEPTION 'guide_assignment_not_found' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT assignments.id,
    bookings.id,
    bookings.tour_version_id,
    bookings.departure_id,
    CASE WHEN guide_language = 'vi'::public.locale
      THEN bookings.title_vi
      ELSE bookings.title_en
    END,
    windows.start_at,
    windows.end_at,
    bookings.meeting_point,
    bookings.party_size,
    bookings.language,
    assignments.mobility_flags,
    assignments.dietary_flags,
    assignments.status,
    CASE
      WHEN bookings.status::text = 'cancelled' OR departures.status::text = 'cancelled' THEN 'cancelled'
      WHEN assignments.status::text = 'completed'
        OR bookings.status::text = 'completed'
        OR departures.status::text = 'completed' THEN 'completed'
      ELSE 'upcoming'
    END,
    CASE
      WHEN bookings.source_kind = 'departure' THEN COALESCE((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object('title', translations.title)
          ORDER BY stops.position
        )
        FROM public.tour_version_stops AS stops
        JOIN public.catalog_snapshot_place_translations AS translations
          ON translations.snapshot_id = stops.catalog_snapshot_id
         AND translations.place_id = stops.place_id
         AND translations.locale = guide_language
        WHERE stops.tour_version_id = bookings.tour_version_id
      ), '[]'::jsonb)
      ELSE COALESCE((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object('title', translations.title)
          ORDER BY items.position
        )
        FROM public.custom_quotes AS quotes
        JOIN public.custom_requests AS requests ON requests.id = quotes.request_id
        JOIN public.trip_plan_revisions AS revisions
          ON revisions.id = requests.revision_id
         AND revisions.plan_id = requests.plan_id
         AND revisions.revision_no = requests.revision_no
        JOIN public.trip_plan_items AS items ON items.revision_id = revisions.id
        JOIN public.catalog_snapshot_place_translations AS translations
          ON translations.snapshot_id = items.catalog_snapshot_id
         AND translations.place_id = items.place_id
         AND translations.locale = guide_language
        WHERE bookings.source_kind = 'quote'
          AND quotes.id = bookings.quote_id
      ), '[]'::jsonb)
    END,
    false
  FROM public.guide_assignments AS assignments
  JOIN public.bookings AS bookings ON bookings.id = assignments.booking_id
  LEFT JOIN public.departures AS departures ON departures.id = bookings.departure_id
  CROSS JOIN LATERAL private.guide_booking_window(bookings.id) AS windows
  WHERE assignments.guide_user_id = actor_user_id
    AND assignments.status IN (
      'assigned'::public.assignment_status,
      'accepted'::public.assignment_status,
      'completed'::public.assignment_status
    )
    AND (p_assignment_id IS NULL OR assignments.id = p_assignment_id)
  UNION ALL
  SELECT demo.id, NULL::uuid, demo.tour_version_id, NULL::uuid,
    copy.title, demo.start_at, demo.end_at, copy.meeting_point, demo.party_size,
    guide_language, '{}'::text[], '{}'::text[],
    CASE WHEN demo.tour_status = 'completed' THEN 'completed'::public.assignment_status ELSE 'assigned'::public.assignment_status END,
    demo.tour_status,
    COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('title', translations.title)
        ORDER BY stops.position
      )
      FROM public.tour_version_stops AS stops
      JOIN public.catalog_snapshot_place_translations AS translations
        ON translations.snapshot_id = stops.catalog_snapshot_id
       AND translations.place_id = stops.place_id
       AND translations.locale = guide_language
      WHERE stops.tour_version_id = demo.tour_version_id
    ), '[]'::jsonb),
    true
  FROM private.guide_demo_schedule AS demo
  JOIN public.tour_version_translations AS copy
    ON copy.tour_version_id = demo.tour_version_id
   AND copy.locale = guide_language
  WHERE demo.guide_user_id = actor_user_id
    AND (p_assignment_id IS NULL OR demo.id = p_assignment_id)
  ORDER BY 6, 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_guide_schedule(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_guide_schedule(uuid) TO authenticated;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA public FROM localens_guide_projection_owner;

COMMIT;
