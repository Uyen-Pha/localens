BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'localens_guide_admin_projection_owner'
  ) THEN
    EXECUTE 'CREATE ROLE localens_guide_admin_projection_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS';
  END IF;
END;
$roles$;

DO $role_safety$
DECLARE
  unsafe_count integer;
BEGIN
  SELECT count(*) INTO unsafe_count
  FROM pg_catalog.pg_roles
  WHERE rolname = 'localens_guide_admin_projection_owner'
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolcanlogin OR rolbypassrls);
  IF unsafe_count <> 0 THEN
    RAISE EXCEPTION 'unsafe pre-existing LocalLens guide administrator projection role attributes';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS memberships
    JOIN pg_catalog.pg_roles AS granted ON granted.oid = memberships.roleid
    JOIN pg_catalog.pg_roles AS member ON member.oid = memberships.member
    WHERE (granted.rolname = 'localens_guide_admin_projection_owner'
      AND (member.rolname <> 'postgres' OR memberships.inherit_option))
       OR member.rolname = 'localens_guide_admin_projection_owner'
  ) THEN
    RAISE EXCEPTION 'unsafe pre-existing LocalLens guide administrator projection role memberships';
  END IF;
END;
$role_safety$;

GRANT localens_guide_admin_projection_owner TO postgres WITH SET TRUE, INHERIT FALSE;
REVOKE ALL ON SCHEMA public, private, auth FROM localens_guide_admin_projection_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA public, private, auth FROM localens_guide_admin_projection_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, private FROM localens_guide_admin_projection_owner;
GRANT USAGE ON SCHEMA public, private TO localens_guide_admin_projection_owner;

CREATE TABLE private.guide_assignment_idempotency (
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'
  ),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  guide_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES public.guide_assignments(id) ON DELETE RESTRICT,
  result_status public.assignment_status NOT NULL CHECK (
    result_status IN ('assigned'::public.assignment_status, 'accepted'::public.assignment_status)
  ),
  result_outcome text NOT NULL CHECK (
    result_outcome IN ('assigned', 'reassigned', 'unchanged')
  ),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (actor_user_id, idempotency_key)
);
ALTER TABLE private.guide_assignment_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.guide_assignment_idempotency FORCE ROW LEVEL SECURITY;

CREATE POLICY guide_assignment_idempotency_rpc_select
  ON private.guide_assignment_idempotency FOR SELECT
  TO localens_guide_assignment_rpc_owner
  USING (current_user = 'localens_guide_assignment_rpc_owner');
CREATE POLICY guide_assignment_idempotency_rpc_insert
  ON private.guide_assignment_idempotency FOR INSERT
  TO localens_guide_assignment_rpc_owner
  WITH CHECK (current_user = 'localens_guide_assignment_rpc_owner');

CREATE POLICY departures_runtime_guide_assignment_lock
  ON public.departures FOR UPDATE
  TO localens_guide_assignment_rpc_owner
  USING (current_user = 'localens_guide_assignment_rpc_owner')
  WITH CHECK (current_user = 'localens_guide_assignment_rpc_owner');

CREATE POLICY guide_assignments_admin_runtime_projection_select
  ON public.guide_assignments FOR SELECT
  TO localens_guide_admin_projection_owner
  USING (current_user = 'localens_guide_admin_projection_owner');
CREATE POLICY bookings_admin_guide_runtime_projection_select
  ON public.bookings FOR SELECT
  TO localens_guide_admin_projection_owner
  USING (current_user = 'localens_guide_admin_projection_owner');
CREATE POLICY departures_admin_guide_runtime_projection_select
  ON public.departures FOR SELECT
  TO localens_guide_admin_projection_owner
  USING (current_user = 'localens_guide_admin_projection_owner');
CREATE POLICY guide_profiles_admin_guide_runtime_projection_select
  ON public.guide_profiles FOR SELECT
  TO localens_guide_admin_projection_owner
  USING (current_user = 'localens_guide_admin_projection_owner');
CREATE POLICY user_roles_admin_guide_runtime_projection_select
  ON private.user_roles FOR SELECT
  TO localens_guide_admin_projection_owner
  USING (current_user = 'localens_guide_admin_projection_owner');

REVOKE ALL ON private.guide_assignment_idempotency FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON private.guide_assignment_idempotency TO localens_guide_assignment_rpc_owner;
GRANT UPDATE (id) ON public.departures TO localens_guide_assignment_rpc_owner;

GRANT SELECT (id, source_kind, departure_id, tour_version_id, status, title_en, title_vi, party_size, language, meeting_point)
  ON public.bookings TO localens_guide_admin_projection_owner;
GRANT SELECT (id, start_at, end_at, status)
  ON public.departures TO localens_guide_admin_projection_owner;
GRANT SELECT (id, booking_id, guide_user_id, status, assigned_at)
  ON public.guide_assignments TO localens_guide_admin_projection_owner;
GRANT SELECT (user_id, display_name, language)
  ON public.guide_profiles TO localens_guide_admin_projection_owner;
GRANT SELECT (user_id, role)
  ON private.user_roles TO localens_guide_admin_projection_owner;

-- The legacy browser lifecycle is outside the thesis boundary. The functions
-- remain as historical internal seams, but authenticated browser sessions can
-- no longer execute them.
SET LOCAL ROLE localens_guide_assignment_rpc_owner;
REVOKE ALL ON FUNCTION public.assign_guide(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_guide_assignment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_guide_assignment(uuid) FROM PUBLIC, anon, authenticated;
RESET ROLE;
SET LOCAL ROLE postgres;

GRANT CREATE ON SCHEMA private, public TO localens_guide_assignment_rpc_owner;
SET LOCAL ROLE localens_guide_assignment_rpc_owner;

CREATE OR REPLACE FUNCTION private.assign_guide(
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
  authenticated_actor_user_id uuid;
  actor_role_count integer;
  target_role_count integer;
  booking_row record;
  departure_row record;
  current_assignment public.guide_assignments%ROWTYPE;
  requirement_snapshot record;
  new_assignment public.guide_assignments%ROWTYPE;
  transition_at timestamptz;
  had_active boolean := false;
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

  -- Lock order is booking, departure, active assignment, then guide schedule.
  SELECT bookings.id, bookings.source_kind, bookings.departure_id,
    bookings.tour_version_id, bookings.status INTO booking_row
  FROM public.bookings AS bookings
  WHERE bookings.id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND OR booking_row.status <> 'confirmed'::public.booking_status
     OR booking_row.source_kind <> 'departure' OR booking_row.departure_id IS NULL
     OR booking_row.tour_version_id IS NULL THEN
    RAISE EXCEPTION 'guide_assignment_state_conflict' USING ERRCODE = 'P0001';
  END IF;

  SELECT departures.id, departures.start_at, departures.end_at, departures.status
  INTO departure_row
  FROM public.departures AS departures
  WHERE departures.id = booking_row.departure_id
  FOR UPDATE;
  IF NOT FOUND OR departure_row.status <> 'scheduled'::public.departure_status
     OR departure_row.start_at IS NULL OR departure_row.end_at IS NULL
     OR departure_row.end_at <= departure_row.start_at THEN
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
    JOIN public.departures AS departures ON departures.id = bookings.departure_id
    WHERE assignments.guide_user_id = p_guide_user_id
      AND assignments.status IN ('assigned'::public.assignment_status, 'accepted'::public.assignment_status)
      AND assignments.booking_id <> p_booking_id
      AND departures.status = 'scheduled'::public.departure_status
      AND departures.end_at IS NOT NULL
      AND pg_catalog.tstzrange(departures.start_at, departures.end_at, '[)')
        && pg_catalog.tstzrange(departure_row.start_at, departure_row.end_at, '[)')
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
      authenticated_actor_user_id,
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
    authenticated_actor_user_id,
    new_assignment.id,
    NULL,
    'assigned'
  );
  assignment_id := new_assignment.id;
  status := new_assignment.status;
  RETURN NEXT;
END;
$function$;

CREATE TYPE public.guide_assignment_mutation_result AS (
  assignment_id uuid,
  booking_id uuid,
  guide_user_id uuid,
  status public.assignment_status,
  outcome text
);

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
    bookings.tour_version_id, bookings.status INTO booking_row
  FROM public.bookings AS bookings
  WHERE bookings.id = requested_booking_id
  FOR UPDATE;
  IF NOT FOUND OR booking_row.status <> 'confirmed'::public.booking_status
     OR booking_row.source_kind <> 'departure' OR booking_row.departure_id IS NULL
     OR booking_row.tour_version_id IS NULL THEN
    RAISE EXCEPTION 'guide_assignment_state_conflict' USING ERRCODE = 'P0001';
  END IF;
  SELECT departures.id, departures.start_at, departures.end_at, departures.status
  INTO departure_row
  FROM public.departures AS departures
  WHERE departures.id = booking_row.departure_id
  FOR UPDATE;
  IF NOT FOUND OR departure_row.status <> 'scheduled'::public.departure_status
     OR departure_row.start_at IS NULL OR departure_row.end_at IS NULL
     OR departure_row.end_at <= departure_row.start_at THEN
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

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('localens:guide-schedule:' || requested_guide_user_id::text, 0)
  );
  IF EXISTS (
    SELECT 1
    FROM public.guide_assignments AS assignments
    JOIN public.bookings AS bookings ON bookings.id = assignments.booking_id
    JOIN public.departures AS departures ON departures.id = bookings.departure_id
    WHERE assignments.guide_user_id = requested_guide_user_id
      AND assignments.status IN ('assigned'::public.assignment_status, 'accepted'::public.assignment_status)
      AND assignments.booking_id <> requested_booking_id
      AND departures.status = 'scheduled'::public.departure_status
      AND departures.end_at IS NOT NULL
      AND pg_catalog.tstzrange(departures.start_at, departures.end_at, '[)')
        && pg_catalog.tstzrange(departure_row.start_at, departure_row.end_at, '[)')
  ) THEN
    RAISE EXCEPTION 'guide_assignment_schedule_conflict' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO assigned_row
  FROM private.assign_guide(requested_booking_id, requested_guide_user_id);
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

REVOKE ALL ON FUNCTION private.assign_guide(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_fixed_departure_guide(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.assign_guide(uuid, uuid) TO localens_guide_assignment_rpc_owner;
GRANT EXECUTE ON FUNCTION public.assign_fixed_departure_guide(uuid, uuid, text) TO authenticated;
RESET ROLE;
SET LOCAL ROLE postgres;
ALTER FUNCTION public.assign_fixed_departure_guide(uuid, uuid, text)
  OWNER TO localens_guide_assignment_rpc_owner;

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
    departures.start_at,
    departures.end_at,
    bookings.meeting_point,
    bookings.party_size,
    bookings.language,
    active_assignment.id,
    active_assignment.guide_user_id,
    profiles.display_name,
    active_assignment.status
  FROM public.bookings AS bookings
  JOIN public.departures AS departures ON departures.id = bookings.departure_id
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
    AND bookings.source_kind = 'departure'
    AND bookings.tour_version_id IS NOT NULL
    AND departures.status = 'scheduled'::public.departure_status
    AND departures.end_at IS NOT NULL
    AND departures.end_at > departures.start_at
  ORDER BY departures.start_at, bookings.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_eligible_guides()
RETURNS TABLE (
  guide_user_id uuid,
  display_name text,
  language public.locale
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
  SELECT profiles.user_id,
    pg_catalog.btrim(profiles.display_name),
    profiles.language
  FROM public.guide_profiles AS profiles
  WHERE NULLIF(pg_catalog.btrim(profiles.display_name), '') IS NOT NULL
    AND (
      SELECT count(*) FROM private.user_roles AS roles
      WHERE roles.user_id = profiles.user_id
    ) = 1
    AND EXISTS (
      SELECT 1 FROM private.user_roles AS roles
      WHERE roles.user_id = profiles.user_id AND roles.role = 'guide'::public.app_role
    )
  ORDER BY pg_catalog.btrim(profiles.display_name), profiles.user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_guide_assignment_queue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_admin_eligible_guides() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_guide_assignment_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_eligible_guides() TO authenticated;
RESET ROLE;
SET LOCAL ROLE postgres;
ALTER FUNCTION public.get_admin_guide_assignment_queue()
  OWNER TO localens_guide_admin_projection_owner;
ALTER FUNCTION public.get_admin_eligible_guides()
  OWNER TO localens_guide_admin_projection_owner;

-- PostgreSQL cannot change a function's TABLE return shape with CREATE OR
-- REPLACE. Recreate the sanitized projection under its existing bounded owner
-- to add assignment_id without changing its public name.
REVOKE ALL ON FUNCTION public.get_guide_assigned_bookings() FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.get_guide_assigned_bookings();
GRANT CREATE ON SCHEMA public TO localens_guide_projection_owner;
SET LOCAL ROLE localens_guide_projection_owner;

CREATE OR REPLACE FUNCTION public.get_guide_assigned_bookings()
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
    assignments.booking_id,
    bookings.tour_version_id,
    bookings.departure_id,
    CASE WHEN guide_language = 'vi'::public.locale
      THEN bookings.title_vi
      ELSE bookings.title_en
    END,
    departures.start_at,
    departures.end_at,
    bookings.meeting_point,
    bookings.party_size,
    bookings.language,
    assignments.mobility_flags,
    assignments.dietary_flags,
    assignments.status
  FROM public.guide_assignments AS assignments
  JOIN public.bookings AS bookings ON bookings.id = assignments.booking_id
  JOIN public.departures AS departures ON departures.id = bookings.departure_id
  WHERE assignments.guide_user_id = actor_user_id
    AND assignments.status IN ('assigned'::public.assignment_status, 'accepted'::public.assignment_status)
  ORDER BY departures.start_at, assignments.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_guide_assigned_bookings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_guide_assigned_bookings() TO authenticated;
RESET ROLE;
SET LOCAL ROLE postgres;
ALTER FUNCTION public.get_guide_assigned_bookings()
  OWNER TO localens_guide_projection_owner;

REVOKE ALL ON public.guide_assignments FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON TABLE public.guide_profiles FROM authenticated;

REVOKE CREATE ON SCHEMA private, public FROM localens_guide_assignment_rpc_owner;
REVOKE CREATE ON SCHEMA public FROM localens_guide_admin_projection_owner;
REVOKE CREATE ON SCHEMA public FROM localens_guide_projection_owner;

COMMIT;
