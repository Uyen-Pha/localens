BEGIN;
-- Add a separately versioned read-only schedule; the legacy RPC remains compatible.
-- Closed assignments represent reassignment and must never become cancelled tours.
GRANT SELECT (tour_version_id, catalog_snapshot_id, place_id, position)
  ON public.tour_version_stops TO localens_guide_projection_owner;
GRANT SELECT (snapshot_id, place_id, locale, title)
  ON public.catalog_snapshot_place_translations TO localens_guide_projection_owner;
CREATE POLICY tour_stops_guide_schedule_select ON public.tour_version_stops
  FOR SELECT TO localens_guide_projection_owner USING (current_user = 'localens_guide_projection_owner');
CREATE POLICY snapshot_translations_guide_schedule_select ON public.catalog_snapshot_place_translations
  FOR SELECT TO localens_guide_projection_owner USING (current_user = 'localens_guide_projection_owner');
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
  itinerary jsonb
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
    assignments.status,
    CASE WHEN bookings.status::text = 'cancelled' OR departures.status::text = 'cancelled' THEN 'cancelled'
      WHEN assignments.status::text = 'completed' OR bookings.status::text = 'completed' OR departures.status::text = 'completed' THEN 'completed'
      ELSE 'upcoming' END,
    COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('title', translations.title) ORDER BY stops.position)
      FROM public.tour_version_stops AS stops
      JOIN public.catalog_snapshot_place_translations AS translations
        ON translations.snapshot_id = stops.catalog_snapshot_id AND translations.place_id = stops.place_id AND translations.locale = guide_language
      WHERE stops.tour_version_id = bookings.tour_version_id), '[]'::jsonb)
  FROM public.guide_assignments AS assignments
  JOIN public.bookings AS bookings ON bookings.id = assignments.booking_id
  JOIN public.departures AS departures ON departures.id = bookings.departure_id
  WHERE assignments.guide_user_id = actor_user_id
    AND assignments.status IN ('assigned'::public.assignment_status, 'accepted'::public.assignment_status, 'completed'::public.assignment_status)
    AND (p_assignment_id IS NULL OR assignments.id = p_assignment_id)
  ORDER BY departures.start_at, assignments.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_guide_schedule(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_guide_schedule(uuid) TO authenticated;
SET LOCAL ROLE postgres;
ALTER FUNCTION public.get_guide_schedule(uuid)
  OWNER TO localens_guide_projection_owner;


REVOKE CREATE ON SCHEMA public FROM localens_guide_projection_owner;
COMMIT;
