BEGIN;

-- Guide assignment RPCs and the guide projection use dedicated, non-login,
-- non-bypass owners.  Memberships are scrubbed so a future role change cannot
-- silently widen a SECURITY DEFINER function.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_guide_assignment_rpc_owner') THEN
    EXECUTE 'CREATE ROLE localens_guide_assignment_rpc_owner NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_guide_projection_owner') THEN
    EXECUTE 'CREATE ROLE localens_guide_projection_owner NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_guide_assignment_guard_owner') THEN
    EXECUTE 'CREATE ROLE localens_guide_assignment_guard_owner NOLOGIN NOBYPASSRLS';
  END IF;
END
$roles$;

ALTER ROLE localens_guide_assignment_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_guide_projection_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_guide_assignment_guard_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;

DO $memberships$
DECLARE
  membership_record record;
BEGIN
  FOR membership_record IN
    SELECT granted.rolname AS granted_role, member.rolname AS member_role
    FROM pg_catalog.pg_auth_members AS memberships
    JOIN pg_catalog.pg_roles AS granted ON granted.oid = memberships.roleid
    JOIN pg_catalog.pg_roles AS member ON member.oid = memberships.member
    WHERE granted.rolname IN (
      'localens_guide_assignment_rpc_owner',
      'localens_guide_projection_owner',
      'localens_guide_assignment_guard_owner'
    )
    OR member.rolname IN (
      'localens_guide_assignment_rpc_owner',
      'localens_guide_projection_owner',
      'localens_guide_assignment_guard_owner'
    )
  LOOP
    EXECUTE pg_catalog.format('REVOKE %I FROM %I', membership_record.granted_role, membership_record.member_role);
  END LOOP;
END
$memberships$;

REVOKE ALL ON SCHEMA public, private, auth
  FROM localens_guide_assignment_rpc_owner, localens_guide_projection_owner, localens_guide_assignment_guard_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA public, private, auth
  FROM localens_guide_assignment_rpc_owner, localens_guide_projection_owner, localens_guide_assignment_guard_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, private
  FROM localens_guide_assignment_rpc_owner, localens_guide_projection_owner, localens_guide_assignment_guard_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public, private, auth
  FROM localens_guide_assignment_rpc_owner, localens_guide_projection_owner, localens_guide_assignment_guard_owner;

CREATE OR REPLACE FUNCTION private.valid_guide_requirement_flags(value text[], kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT value IS NOT NULL
    AND kind IN ('dietary', 'mobility')
    AND COALESCE(pg_catalog.array_ndims(value), 1) = 1
    AND pg_catalog.cardinality(value) <= 12
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(value) AS entries(flag)
      WHERE flag IS NULL OR flag <> pg_catalog.btrim(flag) OR flag = '' OR flag ~ '[[:cntrl:]]'
    )
    AND (SELECT pg_catalog.count(*) FROM pg_catalog.unnest(value)) =
        (SELECT pg_catalog.count(DISTINCT flag) FROM pg_catalog.unnest(value) AS entries(flag))
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(value) AS entries(flag)
      WHERE (kind = 'dietary' AND flag NOT IN ('halal', 'vegetarian'))
         OR (kind = 'mobility' AND flag NOT IN ('step-free'))
    );
$function$;
ALTER FUNCTION private.valid_guide_requirement_flags(text[], text) OWNER TO localens_guide_assignment_guard_owner;
REVOKE ALL ON FUNCTION private.valid_guide_requirement_flags(text[], text) FROM PUBLIC, anon, authenticated;

CREATE TABLE public.guide_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  guide_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status public.assignment_status NOT NULL DEFAULT 'assigned',
  mobility_flags text[] NOT NULL DEFAULT '{}'::text[],
  dietary_flags text[] NOT NULL DEFAULT '{}'::text[],
  assigned_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  accepted_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (private.valid_guide_requirement_flags(mobility_flags, 'mobility')),
  CHECK (private.valid_guide_requirement_flags(dietary_flags, 'dietary')),
  CHECK (status = 'assigned'::public.assignment_status AND accepted_at IS NULL AND completed_at IS NULL AND closed_at IS NULL
    OR status = 'accepted'::public.assignment_status AND accepted_at IS NOT NULL AND completed_at IS NULL AND closed_at IS NULL
    OR status = 'completed'::public.assignment_status AND accepted_at IS NOT NULL AND completed_at IS NOT NULL AND closed_at IS NULL
    OR status = 'closed'::public.assignment_status AND closed_at IS NOT NULL),
  CHECK (accepted_at IS NULL OR accepted_at >= assigned_at),
  CHECK (completed_at IS NULL OR accepted_at IS NOT NULL AND completed_at >= accepted_at),
  CHECK (closed_at IS NULL OR closed_at >= assigned_at)
);

CREATE UNIQUE INDEX guide_assignments_one_active_booking
  ON public.guide_assignments (booking_id)
  WHERE status IN ('assigned'::public.assignment_status, 'accepted'::public.assignment_status);
CREATE INDEX guide_assignments_guide_status_time_idx
  ON public.guide_assignments (guide_user_id, status, assigned_at, id);
CREATE INDEX guide_assignments_booking_status_idx
  ON public.guide_assignments (booking_id, status, assigned_at, id);

ALTER TABLE public.guide_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guide_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY guide_assignments_rpc_owner_all ON public.guide_assignments
  FOR ALL TO localens_guide_assignment_rpc_owner
  USING (current_user = 'localens_guide_assignment_rpc_owner')
  WITH CHECK (current_user = 'localens_guide_assignment_rpc_owner');
CREATE POLICY guide_assignments_projection_owner_select ON public.guide_assignments
  FOR SELECT TO localens_guide_projection_owner
  USING (current_user = 'localens_guide_projection_owner');

-- Source rows are visible only to the two named definers. Browser roles have
-- no base booking, departure, assignment, role, or guide-profile SELECT.
CREATE POLICY bookings_guide_assignment_owner_select ON public.bookings
  FOR SELECT TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner
  USING (current_user IN ('localens_guide_assignment_rpc_owner', 'localens_guide_projection_owner'));
CREATE POLICY departures_guide_assignment_owner_select ON public.departures
  FOR SELECT TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner
  USING (current_user IN ('localens_guide_assignment_rpc_owner', 'localens_guide_projection_owner'));
CREATE POLICY guide_profiles_guide_assignment_owner_select ON public.guide_profiles
  FOR SELECT TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner
  USING (current_user IN ('localens_guide_assignment_rpc_owner', 'localens_guide_projection_owner'));
CREATE POLICY user_roles_guide_assignment_owner_select ON private.user_roles
  FOR SELECT TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner
  USING (current_user IN ('localens_guide_assignment_rpc_owner', 'localens_guide_projection_owner'));
CREATE POLICY audit_events_guide_assignment_owner_insert ON private.audit_events
  FOR INSERT TO localens_guide_assignment_rpc_owner
  WITH CHECK (current_user = 'localens_guide_assignment_rpc_owner');
CREATE POLICY custom_quotes_guide_assignment_owner_select ON public.custom_quotes
  FOR SELECT TO localens_guide_assignment_rpc_owner
  USING (current_user = 'localens_guide_assignment_rpc_owner');
CREATE POLICY custom_requests_guide_assignment_owner_select ON public.custom_requests
  FOR SELECT TO localens_guide_assignment_rpc_owner
  USING (current_user = 'localens_guide_assignment_rpc_owner');
CREATE POLICY trip_plans_guide_assignment_owner_select ON public.trip_plans
  FOR SELECT TO localens_guide_assignment_rpc_owner
  USING (current_user = 'localens_guide_assignment_rpc_owner');
CREATE POLICY trip_plan_revisions_guide_assignment_owner_select ON public.trip_plan_revisions
  FOR SELECT TO localens_guide_assignment_rpc_owner
  USING (current_user = 'localens_guide_assignment_rpc_owner');

GRANT USAGE ON SCHEMA public, private TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner, localens_guide_assignment_guard_owner;
GRANT USAGE ON SCHEMA auth TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE public.guide_assignments TO localens_guide_assignment_rpc_owner;
GRANT SELECT ON TABLE public.guide_assignments TO localens_guide_projection_owner;
GRANT SELECT (id, source_kind, departure_id, tour_version_id, status, title_en, title_vi, party_size, language, meeting_point)
  ON TABLE public.bookings TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner;
GRANT SELECT (id, tour_version_id, start_at, end_at, status)
  ON TABLE public.departures TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner;
GRANT SELECT (user_id, language) ON TABLE public.guide_profiles TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner;
GRANT SELECT (user_id, role) ON TABLE private.user_roles TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner;
GRANT INSERT ON TABLE private.audit_events TO localens_guide_assignment_rpc_owner;
GRANT SELECT (id, request_id) ON TABLE public.custom_quotes TO localens_guide_assignment_rpc_owner;
GRANT SELECT (id, plan_id, revision_id, revision_no) ON TABLE public.custom_requests TO localens_guide_assignment_rpc_owner;
GRANT SELECT (id, plan_id, revision_no, request_json) ON TABLE public.trip_plan_revisions TO localens_guide_assignment_rpc_owner;
GRANT EXECUTE ON FUNCTION auth.uid() TO localens_guide_assignment_rpc_owner, localens_guide_projection_owner;
GRANT EXECUTE ON FUNCTION private.valid_guide_requirement_flags(text[], text) TO localens_guide_assignment_rpc_owner;

REVOKE ALL ON TABLE public.guide_assignments FROM PUBLIC, anon, authenticated;

-- A closed transition is the only permitted direct mutation of assignment
-- facts; all other status changes go through the named functions below.
CREATE OR REPLACE FUNCTION private.assert_guide_assignment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF current_setting('localens.guide_assignment_transition', true) <> 'on' THEN
    RAISE EXCEPTION 'guide assignment changes require a named RPC' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'assigned'::public.assignment_status
       OR NEW.accepted_at IS NOT NULL OR NEW.completed_at IS NOT NULL OR NEW.closed_at IS NOT NULL
       OR NEW.assigned_at IS NULL OR NEW.created_at IS NULL OR NEW.updated_at IS NULL THEN
      RAISE EXCEPTION 'invalid guide assignment creation' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'UPDATE'
     OR OLD.id IS DISTINCT FROM NEW.id
     OR OLD.booking_id IS DISTINCT FROM NEW.booking_id
     OR OLD.guide_user_id IS DISTINCT FROM NEW.guide_user_id
     OR OLD.mobility_flags IS DISTINCT FROM NEW.mobility_flags
     OR OLD.dietary_flags IS DISTINCT FROM NEW.dietary_flags
     OR OLD.assigned_at IS DISTINCT FROM NEW.assigned_at
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR NOT ((OLD.status = 'assigned'::public.assignment_status AND NEW.status IN ('accepted'::public.assignment_status, 'closed'::public.assignment_status))
          OR (OLD.status = 'accepted'::public.assignment_status AND NEW.status IN ('completed'::public.assignment_status, 'closed'::public.assignment_status))) THEN
    RAISE EXCEPTION 'invalid guide assignment transition' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_guide_assignment_mutation() OWNER TO localens_guide_assignment_guard_owner;
REVOKE ALL ON FUNCTION private.assert_guide_assignment_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guide_assignment_mutation_guard
  BEFORE INSERT OR UPDATE ON public.guide_assignments
  FOR EACH ROW EXECUTE FUNCTION private.assert_guide_assignment_mutation();

CREATE OR REPLACE FUNCTION private.record_guide_assignment_audit_event(
  p_event_type public.audit_event_type,
  p_actor_user_id uuid,
  p_target_id uuid,
  p_from_state text,
  p_to_state text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_event_type NOT IN (
    'guide_assigned'::public.audit_event_type,
    'guide_reassigned'::public.audit_event_type,
    'guide_accepted'::public.audit_event_type,
    'guide_completed'::public.audit_event_type
  ) OR p_actor_user_id IS NULL OR p_target_id IS NULL THEN
    RAISE EXCEPTION 'invalid guide assignment audit event' USING ERRCODE = '42501';
  END IF;
  INSERT INTO private.audit_events (
    event_type, actor_user_id, actor_role, target_type, target_id,
    from_state, to_state, created_at
  ) VALUES (
    p_event_type, p_actor_user_id,
    CASE WHEN p_event_type IN ('guide_accepted'::public.audit_event_type, 'guide_completed'::public.audit_event_type)
      THEN 'guide'::public.app_role ELSE 'admin'::public.app_role END,
    'guide_assignment'::public.audit_target_type, p_target_id,
    p_from_state, p_to_state, pg_catalog.clock_timestamp()
  );
END;
$function$;
ALTER FUNCTION private.record_guide_assignment_audit_event(public.audit_event_type, uuid, uuid, text, text)
  OWNER TO localens_guide_assignment_rpc_owner;
REVOKE ALL ON FUNCTION private.record_guide_assignment_audit_event(public.audit_event_type, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.record_guide_assignment_audit_event(public.audit_event_type, uuid, uuid, text, text)
  TO localens_guide_assignment_rpc_owner;

-- Snapshot only the two allowlisted structured requirement arrays from an
-- immutable custom-plan revision. No raw notes, free text, contacts, or
-- payment facts are ever copied. Fixed-tour bookings have no plan and get {}.
CREATE OR REPLACE FUNCTION private.guide_requirement_snapshot(p_booking_id uuid)
RETURNS TABLE (mobility_flags text[], dietary_flags text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  booking_row record;
  revision_request jsonb;
BEGIN
  SELECT id, source_kind, quote_id INTO booking_row
  FROM public.bookings
  WHERE public.bookings.id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'guide assignment operation failed' USING ERRCODE = 'P0001';
  END IF;

  IF booking_row.source_kind = 'departure' THEN
    mobility_flags := '{}'::text[];
    dietary_flags := '{}'::text[];
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT revisions.request_json INTO revision_request
  FROM public.custom_quotes AS quotes
  JOIN public.custom_requests AS requests ON requests.id = quotes.request_id
  JOIN public.trip_plan_revisions AS revisions
    ON revisions.id = requests.revision_id
   AND revisions.plan_id = requests.plan_id
   AND revisions.revision_no = requests.revision_no
  WHERE booking_row.source_kind = 'quote'
    AND quotes.id = booking_row.quote_id;
  IF NOT FOUND OR jsonb_typeof(revision_request) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'guide assignment operation failed' USING ERRCODE = 'P0001';
  END IF;

  mobility_flags := COALESCE((
    SELECT pg_catalog.array_agg(DISTINCT value ORDER BY value)
    FROM jsonb_array_elements_text(revision_request -> 'mobilityRequirements') AS values(value)
    WHERE value IN ('step-free')
  ), '{}'::text[]);
  dietary_flags := COALESCE((
    SELECT pg_catalog.array_agg(DISTINCT value ORDER BY value)
    FROM jsonb_array_elements_text(revision_request -> 'dietaryRequirements') AS values(value)
    WHERE value IN ('halal', 'vegetarian')
  ), '{}'::text[]);
  IF NOT private.valid_guide_requirement_flags(mobility_flags, 'mobility')
     OR NOT private.valid_guide_requirement_flags(dietary_flags, 'dietary') THEN
    RAISE EXCEPTION 'guide assignment operation failed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION private.guide_requirement_snapshot(uuid) OWNER TO localens_guide_assignment_rpc_owner;
REVOKE ALL ON FUNCTION private.guide_requirement_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guide_requirement_snapshot(uuid) TO localens_guide_assignment_rpc_owner;

CREATE OR REPLACE FUNCTION private.assign_guide(
  p_booking_id uuid,
  p_guide_user_id uuid
)
RETURNS TABLE (assignment_id uuid, status public.assignment_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_user_id uuid;
  booking_row record;
  current_assignment public.guide_assignments%ROWTYPE;
  requirement_snapshot record;
  new_assignment public.guide_assignments%ROWTYPE;
  transition_at timestamptz;
  had_active boolean := false;
BEGIN
  actor_user_id := (SELECT auth.uid());
  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.user_roles
    WHERE user_id = actor_user_id AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'guide assignment operation failed' USING ERRCODE = '42501';
  END IF;
  IF p_booking_id IS NULL OR p_guide_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.user_roles WHERE user_id = p_guide_user_id AND role = 'guide'::public.app_role
  ) OR NOT EXISTS (
    SELECT 1 FROM public.guide_profiles WHERE user_id = p_guide_user_id
  ) THEN
    RAISE EXCEPTION 'guide assignment operation failed' USING ERRCODE = 'P0001';
  END IF;

  -- Every assignment mutation locks booking first, then the active assignment.
  SELECT id, source_kind, departure_id, tour_version_id, status, quote_id INTO booking_row
  FROM public.bookings
  WHERE public.bookings.id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND OR booking_row.status <> 'confirmed'::public.booking_status
     OR booking_row.source_kind <> 'departure' OR booking_row.departure_id IS NULL
     OR booking_row.tour_version_id IS NULL THEN
    RAISE EXCEPTION 'guide assignment operation failed' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO current_assignment
  FROM public.guide_assignments
  WHERE guide_assignments.booking_id = p_booking_id
    AND guide_assignments.status IN ('assigned'::public.assignment_status, 'accepted'::public.assignment_status)
  ORDER BY guide_assignments.id
  LIMIT 1
  FOR UPDATE;
  had_active := FOUND;
  transition_at := pg_catalog.clock_timestamp();

  IF had_active THEN
    IF current_assignment.status NOT IN ('assigned'::public.assignment_status, 'accepted'::public.assignment_status) THEN
      RAISE EXCEPTION 'guide assignment operation failed' USING ERRCODE = 'P0001';
    END IF;
    PERFORM pg_catalog.set_config('localens.guide_assignment_transition', 'on', true);
    UPDATE public.guide_assignments
    SET status = 'closed'::public.assignment_status,
        closed_at = transition_at,
        updated_at = transition_at
    WHERE public.guide_assignments.id = current_assignment.id;
    PERFORM private.record_guide_assignment_audit_event(
      'guide_reassigned'::public.audit_event_type, actor_user_id, current_assignment.id,
      current_assignment.status::text, 'closed'
    );
  END IF;

  SELECT * INTO requirement_snapshot
  FROM private.guide_requirement_snapshot(p_booking_id);
  PERFORM pg_catalog.set_config('localens.guide_assignment_transition', 'on', true);
  INSERT INTO public.guide_assignments (
    booking_id, guide_user_id, status, mobility_flags, dietary_flags, assigned_at, created_at, updated_at
  ) VALUES (
    p_booking_id, p_guide_user_id, 'assigned'::public.assignment_status,
    requirement_snapshot.mobility_flags, requirement_snapshot.dietary_flags,
    transition_at, transition_at, transition_at
  ) RETURNING * INTO new_assignment;
  PERFORM private.record_guide_assignment_audit_event(
    CASE WHEN had_active THEN 'guide_reassigned'::public.audit_event_type ELSE 'guide_assigned'::public.audit_event_type END,
    actor_user_id, new_assignment.id, NULL, 'assigned'
  );
  assignment_id := new_assignment.id;
  status := new_assignment.status;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_guide(booking_id uuid, guide_user_id uuid)
RETURNS TABLE (assignment_id uuid, status public.assignment_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY SELECT assigned.assignment_id, assigned.status
  FROM private.assign_guide(booking_id, guide_user_id) AS assigned;
END;
$function$;

CREATE OR REPLACE FUNCTION private.accept_guide_assignment(p_assignment_id uuid)
RETURNS TABLE (assignment_id uuid, status public.assignment_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_user_id uuid;
  assignment_row public.guide_assignments%ROWTYPE;
  transition_at timestamptz;
BEGIN
  actor_user_id := (SELECT auth.uid());
  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.user_roles WHERE user_id = actor_user_id AND role = 'guide'::public.app_role
  ) OR p_assignment_id IS NULL THEN
    RAISE EXCEPTION 'guide assignment operation failed' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO assignment_row FROM public.guide_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR assignment_row.guide_user_id IS DISTINCT FROM actor_user_id
     OR assignment_row.status <> 'assigned'::public.assignment_status THEN
    RAISE EXCEPTION 'guide assignment operation failed' USING ERRCODE = 'P0001';
  END IF;
  transition_at := pg_catalog.clock_timestamp();
  PERFORM pg_catalog.set_config('localens.guide_assignment_transition', 'on', true);
  UPDATE public.guide_assignments
  SET status = 'accepted'::public.assignment_status, accepted_at = transition_at, updated_at = transition_at
  WHERE id = assignment_row.id;
  PERFORM private.record_guide_assignment_audit_event(
    'guide_accepted'::public.audit_event_type, actor_user_id, assignment_row.id, 'assigned', 'accepted'
  );
  assignment_id := assignment_row.id;
  status := 'accepted'::public.assignment_status;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_guide_assignment(assignment_id uuid)
RETURNS TABLE (assignment_id uuid, status public.assignment_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY SELECT accepted.assignment_id, accepted.status
  FROM private.accept_guide_assignment(assignment_id) AS accepted;
END;
$function$;

CREATE OR REPLACE FUNCTION private.complete_guide_assignment(p_assignment_id uuid)
RETURNS TABLE (assignment_id uuid, status public.assignment_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_user_id uuid;
  assignment_row public.guide_assignments%ROWTYPE;
  transition_at timestamptz;
BEGIN
  actor_user_id := (SELECT auth.uid());
  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.user_roles WHERE user_id = actor_user_id AND role = 'guide'::public.app_role
  ) OR p_assignment_id IS NULL THEN
    RAISE EXCEPTION 'guide assignment operation failed' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO assignment_row FROM public.guide_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR assignment_row.guide_user_id IS DISTINCT FROM actor_user_id
     OR assignment_row.status <> 'accepted'::public.assignment_status THEN
    RAISE EXCEPTION 'guide assignment operation failed' USING ERRCODE = 'P0001';
  END IF;
  transition_at := pg_catalog.clock_timestamp();
  PERFORM pg_catalog.set_config('localens.guide_assignment_transition', 'on', true);
  UPDATE public.guide_assignments
  SET status = 'completed'::public.assignment_status, completed_at = transition_at, updated_at = transition_at
  WHERE id = assignment_row.id;
  PERFORM private.record_guide_assignment_audit_event(
    'guide_completed'::public.audit_event_type, actor_user_id, assignment_row.id, 'accepted', 'completed'
  );
  assignment_id := assignment_row.id;
  status := 'completed'::public.assignment_status;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_guide_assignment(assignment_id uuid)
RETURNS TABLE (assignment_id uuid, status public.assignment_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY SELECT completed.assignment_id, completed.status
  FROM private.complete_guide_assignment(assignment_id) AS completed;
END;
$function$;

-- Explicit return columns are the entire guide data boundary. The function
-- derives auth.uid and the guide's stored locale; it never returns base rows.
CREATE OR REPLACE FUNCTION public.get_guide_assigned_bookings()
RETURNS TABLE (
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
AS $function$
DECLARE
  actor_user_id uuid;
  guide_language public.locale;
BEGIN
  actor_user_id := (SELECT auth.uid());
  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.user_roles WHERE user_id = actor_user_id AND role = 'guide'::public.app_role
  ) THEN
    RAISE EXCEPTION 'guide assignment operation failed' USING ERRCODE = '42501';
  END IF;
  SELECT profiles.language INTO guide_language
  FROM public.guide_profiles AS profiles
  WHERE profiles.user_id = actor_user_id;
  IF guide_language IS NULL THEN
    RAISE EXCEPTION 'guide assignment operation failed' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT assignments.booking_id,
    bookings.tour_version_id,
    bookings.departure_id,
    CASE WHEN guide_language = 'vi'::public.locale THEN bookings.title_vi ELSE bookings.title_en END,
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

ALTER FUNCTION private.assign_guide(uuid, uuid) OWNER TO localens_guide_assignment_rpc_owner;
ALTER FUNCTION public.assign_guide(uuid, uuid) OWNER TO localens_guide_assignment_rpc_owner;
ALTER FUNCTION private.accept_guide_assignment(uuid) OWNER TO localens_guide_assignment_rpc_owner;
ALTER FUNCTION public.accept_guide_assignment(uuid) OWNER TO localens_guide_assignment_rpc_owner;
ALTER FUNCTION private.complete_guide_assignment(uuid) OWNER TO localens_guide_assignment_rpc_owner;
ALTER FUNCTION public.complete_guide_assignment(uuid) OWNER TO localens_guide_assignment_rpc_owner;
ALTER FUNCTION public.get_guide_assigned_bookings() OWNER TO localens_guide_projection_owner;

REVOKE ALL ON FUNCTION private.assign_guide(uuid, uuid), public.assign_guide(uuid, uuid),
  private.accept_guide_assignment(uuid), public.accept_guide_assignment(uuid),
  private.complete_guide_assignment(uuid), public.complete_guide_assignment(uuid),
  public.get_guide_assigned_bookings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.assign_guide(uuid, uuid), private.accept_guide_assignment(uuid), private.complete_guide_assignment(uuid)
  TO localens_guide_assignment_rpc_owner;
GRANT EXECUTE ON FUNCTION public.assign_guide(uuid, uuid), public.accept_guide_assignment(uuid), public.complete_guide_assignment(uuid),
  public.get_guide_assigned_bookings() TO authenticated;

COMMIT;
