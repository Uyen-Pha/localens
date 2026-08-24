BEGIN;

-- PostgreSQL requires UPDATE privilege on at least one column for SELECT ...
-- FOR SHARE.  These grants authorize only the row identity column needed by
-- guard locks; RLS still has no UPDATE policy, so the roles cannot mutate rows.
GRANT UPDATE (id) ON TABLE public.tours, public.tour_versions TO localens_tour_guard_owner;
GRANT UPDATE (id) ON TABLE public.catalog_snapshots, public.travel_snapshots TO localens_catalog_guard_owner;

-- Recreate the publication helper in the forward migration as well.  The
-- original migration is already deployed in existing environments, so editing
-- that source alone would leave the duplicate publication-time URL guard stale.
CREATE OR REPLACE FUNCTION private.assert_published_tour_complete(target_tour_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  tour_row public.tours%ROWTYPE;
  version_row public.tour_versions%ROWTYPE;
  translation_count integer;
  complete_translation_count integer;
  stop_count integer;
  max_position integer;
BEGIN
  IF target_tour_id IS NULL THEN RETURN; END IF;
  PERFORM private.lock_tour_parents(target_tour_id, target_tour_id);
  SELECT * INTO tour_row FROM public.tours WHERE id = target_tour_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF tour_row.status = 'published'::public.tour_status
     AND ((SELECT count(*) FROM public.tour_translations WHERE tour_id = target_tour_id AND locale = ANY(ARRAY['en'::public.locale, 'vi'::public.locale])) <> 2
       OR (SELECT count(*) FROM public.tour_translations WHERE tour_id = target_tour_id AND locale = ANY(ARRAY['en'::public.locale, 'vi'::public.locale])
           AND btrim(title) <> '' AND btrim(summary) <> '' AND btrim(meeting_point) <> '') <> 2) THEN
    RAISE EXCEPTION 'published tour requires complete current EN and VI translations' USING ERRCODE = '23514';
  END IF;
  IF tour_row.status = 'published'::public.tour_status
     AND NOT EXISTS (SELECT 1 FROM public.tour_versions WHERE tour_id = target_tour_id AND status = 'published'::public.tour_version_status) THEN
    RAISE EXCEPTION 'published tour requires a published version' USING ERRCODE = '23514';
  END IF;
  FOR version_row IN SELECT * FROM public.tour_versions WHERE tour_id = target_tour_id AND status = 'published'::public.tour_version_status LOOP
    IF NOT EXISTS (SELECT 1 FROM public.catalog_snapshots WHERE id = version_row.catalog_snapshot_id AND status = 'published'::public.snapshot_status)
       OR version_row.source_url !~ '^https://[^[:space:]/?#]+'
       OR version_row.source_url !~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}([/?]|$)'
       OR version_row.source_url ~* '^https://[^/?#]*xn--[^/?#]*([/?]|$)'
       OR version_row.source_url ~ '#'
       OR lower(version_row.source_url) ~ '[?&](utm_[^=&#]*|fbclid|gclid)(=|&|$)'
       OR lower(version_row.source_url) ~ '[?&]([^=&#]*_)?(email|phone|name|token|session|user|customer)(_[^=&#]*)?(=|&|$)'
       OR btrim(version_row.attribution) = ''
       OR btrim(version_row.license) = ''
       OR cardinality(version_row.inclusions) <> cardinality(ARRAY(SELECT item FROM unnest(version_row.inclusions) AS items(item) WHERE btrim(item) <> ''))
       OR cardinality(version_row.exclusions) <> cardinality(ARRAY(SELECT item FROM unnest(version_row.exclusions) AS items(item) WHERE btrim(item) <> '')) THEN
      RAISE EXCEPTION 'published tour version provenance or inclusions are incomplete' USING ERRCODE = '23514';
    END IF;
    SELECT count(*)::integer, count(*) FILTER (WHERE btrim(title) <> '' AND btrim(summary) <> '' AND btrim(meeting_point) <> '')::integer
      INTO translation_count, complete_translation_count
      FROM public.tour_version_translations
      WHERE tour_version_id = version_row.id AND locale = ANY(ARRAY['en'::public.locale, 'vi'::public.locale]);
    IF translation_count <> 2 OR complete_translation_count <> 2 THEN
      RAISE EXCEPTION 'published tour version requires complete EN and VI translations' USING ERRCODE = '23514';
    END IF;
    SELECT count(*)::integer, COALESCE(max(position), 0)::integer
      INTO stop_count, max_position
      FROM public.tour_version_stops
      WHERE tour_version_id = version_row.id;
    IF stop_count < 1 OR stop_count <> max_position THEN
      RAISE EXCEPTION 'published tour version requires contiguous stops' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.tour_version_stops AS stop
      WHERE stop.tour_version_id = version_row.id
        AND (
          NOT EXISTS (
            SELECT 1
            FROM public.catalog_snapshot_places AS place
            WHERE place.snapshot_id = version_row.catalog_snapshot_id
              AND place.place_id = stop.place_id
              AND place.slug = btrim(place.slug)
              AND length(place.slug) BETWEEN 1 AND 160
              AND place.slug = lower(place.slug)
              AND place.slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
              AND place.slug !~ '[[:cntrl:]]'
          )
          OR NOT EXISTS (
            SELECT 1
            FROM public.catalog_snapshot_place_translations AS place_translation
            WHERE place_translation.snapshot_id = version_row.catalog_snapshot_id
              AND place_translation.place_id = stop.place_id
              AND place_translation.locale = 'en'::public.locale
              AND length(btrim(place_translation.title)) BETWEEN 1 AND 240
              AND place_translation.title = btrim(place_translation.title)
              AND place_translation.title !~ '[[:cntrl:]]'
          )
          OR NOT EXISTS (
            SELECT 1
            FROM public.catalog_snapshot_place_translations AS place_translation
            WHERE place_translation.snapshot_id = version_row.catalog_snapshot_id
              AND place_translation.place_id = stop.place_id
              AND place_translation.locale = 'vi'::public.locale
              AND length(btrim(place_translation.title)) BETWEEN 1 AND 240
              AND place_translation.title = btrim(place_translation.title)
              AND place_translation.title !~ '[[:cntrl:]]'
          )
        )
    ) THEN
      RAISE EXCEPTION 'published tour version stops require canonical catalog copy' USING ERRCODE = '23514';
    END IF;
  END LOOP;
END;
$function$;
ALTER FUNCTION private.assert_published_tour_complete(uuid) OWNER TO localens_tour_guard_owner;
REVOKE ALL ON FUNCTION private.assert_published_tour_complete(uuid) FROM PUBLIC, anon, authenticated;

-- The mapper accepts only an ASCII dotted-FQDN authority without ports,
-- numeric-host coercion, or punycode markers. Keep the database boundary equal.
ALTER TABLE public.tour_versions
  ADD CONSTRAINT tour_versions_source_url_authority_check
  CHECK (
    source_url ~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}([/?]|$)'
    AND source_url !~* '^https://[^/?#]*xn--[^/?#]*([/?]|$)'
  );

COMMIT;
