BEGIN;
-- Explicitly synthetic assignments, separate from bookings, payments and capacity.
CREATE TABLE private.guide_demo_schedule (
 id uuid PRIMARY KEY,
 guide_user_id uuid NOT NULL REFERENCES public.guide_profiles(user_id),
 tour_version_id uuid NOT NULL REFERENCES public.tour_versions(id),
 start_at timestamptz NOT NULL,
 end_at timestamptz NOT NULL CHECK (end_at > start_at),
 party_size integer NOT NULL CHECK (party_size BETWEEN 1 AND 15),
 tour_status text NOT NULL CHECK (tour_status IN ('upcoming','completed','cancelled')),
 classification text NOT NULL DEFAULT 'synthetic_demo' CHECK (classification = 'synthetic_demo')
);
ALTER TABLE private.guide_demo_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.guide_demo_schedule FORCE ROW LEVEL SECURITY;
CREATE POLICY guide_demo_schedule_projection_select ON private.guide_demo_schedule
 FOR SELECT TO localens_guide_projection_owner USING (current_user = 'localens_guide_projection_owner');
REVOKE ALL ON private.guide_demo_schedule FROM PUBLIC, anon, authenticated;
GRANT SELECT ON private.guide_demo_schedule TO localens_guide_projection_owner;
GRANT SELECT (tour_version_id,locale,title,meeting_point) ON public.tour_version_translations TO localens_guide_projection_owner;
CREATE POLICY tour_copy_guide_schedule_select ON public.tour_version_translations
 FOR SELECT TO localens_guide_projection_owner USING (current_user = 'localens_guide_projection_owner');
DROP FUNCTION public.get_guide_schedule(uuid);
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
      WHERE stops.tour_version_id = bookings.tour_version_id), '[]'::jsonb), false
  FROM public.guide_assignments AS assignments
  JOIN public.bookings AS bookings ON bookings.id = assignments.booking_id
  JOIN public.departures AS departures ON departures.id = bookings.departure_id
  WHERE assignments.guide_user_id = actor_user_id
    AND assignments.status IN ('assigned'::public.assignment_status, 'accepted'::public.assignment_status, 'completed'::public.assignment_status)
    AND (p_assignment_id IS NULL OR assignments.id = p_assignment_id)
  UNION ALL
  SELECT demo.id, NULL::uuid, demo.tour_version_id, NULL::uuid,
    copy.title, demo.start_at, demo.end_at, copy.meeting_point, demo.party_size,
    guide_language, '{}'::text[], '{}'::text[],
    CASE WHEN demo.tour_status = 'completed' THEN 'completed'::public.assignment_status ELSE 'assigned'::public.assignment_status END,
    demo.tour_status,
    COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('title', translations.title) ORDER BY stops.position)
      FROM public.tour_version_stops AS stops
      JOIN public.catalog_snapshot_place_translations AS translations
        ON translations.snapshot_id = stops.catalog_snapshot_id AND translations.place_id = stops.place_id AND translations.locale = guide_language
      WHERE stops.tour_version_id = demo.tour_version_id), '[]'::jsonb), true
  FROM private.guide_demo_schedule AS demo
  JOIN public.tour_version_translations AS copy ON copy.tour_version_id = demo.tour_version_id AND copy.locale = guide_language
  WHERE demo.guide_user_id = actor_user_id AND (p_assignment_id IS NULL OR demo.id = p_assignment_id)
  ORDER BY 6, 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_guide_schedule(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_guide_schedule(uuid) TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM localens_guide_projection_owner;
COMMIT;
