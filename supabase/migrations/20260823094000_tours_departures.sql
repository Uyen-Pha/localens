BEGIN;

-- Fixed-tour maintenance is isolated behind named, non-login roles.  The API
-- roles receive only the published projection and the source columns needed
-- by its security-invoker plan; they cannot read draft/admin columns.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_tour_rpc_owner') THEN
    EXECUTE 'CREATE ROLE localens_tour_rpc_owner NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_tour_guard_owner') THEN
    EXECUTE 'CREATE ROLE localens_tour_guard_owner NOLOGIN NOBYPASSRLS';
  END IF;
END
$roles$;

ALTER ROLE localens_tour_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_tour_guard_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;

REVOKE ALL ON SCHEMA public, private, auth FROM localens_tour_rpc_owner, localens_tour_guard_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA public, private, auth FROM localens_tour_rpc_owner, localens_tour_guard_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, private, auth FROM localens_tour_rpc_owner, localens_tour_guard_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public, private, auth FROM localens_tour_rpc_owner, localens_tour_guard_owner;

CREATE OR REPLACE FUNCTION private.valid_tour_copy_array(value text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT value IS NOT NULL
    AND COALESCE(pg_catalog.array_ndims(value), 1) = 1
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.unnest(value) AS items(item)
      WHERE item IS NULL OR item <> pg_catalog.btrim(item) OR item = ''
        OR pg_catalog.length(item) > 500 OR item ~ '[[:cntrl:]]'
    )
    AND pg_catalog.cardinality(value) = (
      SELECT pg_catalog.count(DISTINCT item) FROM pg_catalog.unnest(value) AS items(item)
    );
$function$;
ALTER FUNCTION private.valid_tour_copy_array(text[]) OWNER TO localens_tour_guard_owner;
REVOKE ALL ON FUNCTION private.valid_tour_copy_array(text[]) FROM PUBLIC, anon, authenticated;

CREATE TABLE public.tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug <> '' AND length(slug) <= 160 AND slug = lower(slug) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status public.tour_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tour_translations (
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE RESTRICT,
  locale public.locale NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240 AND title = btrim(title) AND title !~ '[[:cntrl:]]'),
  summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 1000 AND summary = btrim(summary) AND summary !~ '[[:cntrl:]]'),
  meeting_point text NOT NULL CHECK (length(btrim(meeting_point)) BETWEEN 1 AND 500 AND meeting_point = btrim(meeting_point) AND meeting_point !~ '[[:cntrl:]]'),
  PRIMARY KEY (tour_id, locale)
);

CREATE TABLE public.tour_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE RESTRICT,
  catalog_snapshot_id uuid NOT NULL REFERENCES public.catalog_snapshots(id) ON DELETE RESTRICT,
  status public.tour_version_status NOT NULL DEFAULT 'draft',
  duration_minutes smallint NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  price_vnd_per_person bigint NOT NULL CHECK (price_vnd_per_person BETWEEN 0 AND 9007199254740991),
  inclusions text[] NOT NULL DEFAULT '{}'::text[] CHECK (private.valid_tour_copy_array(inclusions) AND cardinality(inclusions) <= 32),
  exclusions text[] NOT NULL DEFAULT '{}'::text[] CHECK (private.valid_tour_copy_array(exclusions) AND cardinality(exclusions) <= 32),
  cancellation_policy text NOT NULL CHECK (length(btrim(cancellation_policy)) BETWEEN 1 AND 2000 AND cancellation_policy = btrim(cancellation_policy) AND cancellation_policy !~ '[[:cntrl:]]'),
  source_url text NOT NULL CHECK (
    source_url ~ '^https://'
    AND source_url ~ '^https://[^[:space:]/?#]+'
    AND source_url ~ '^https://[^[:space:]]+$'
    AND source_url !~ '@'
    AND source_url !~ '#'
    AND source_url !~ '[?&]utm_'
    AND lower(source_url) !~ '[?&](utm_[^=&#]*|fbclid|gclid)(=|&|$)'
    AND source_url !~ '[?&][^=&#]*%[0-9A-Fa-f]{2}'
    AND lower(source_url) !~ '[?&]([^=&#]*_)?(email|phone|name|token|session|user|customer)(_[^=&#]*)?(=|&|$)'
    AND source_url = btrim(source_url)
    AND source_url !~ '[[:cntrl:]]'
    AND length(source_url) <= 2048
  ),
  verified_at date NOT NULL,
  attribution text NOT NULL CHECK (length(btrim(attribution)) BETWEEN 1 AND 500 AND attribution = btrim(attribution) AND attribution !~ '[[:cntrl:]]'),
  license text NOT NULL CHECK (length(btrim(license)) BETWEEN 1 AND 240 AND license = btrim(license) AND license !~ '[[:cntrl:]]'),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (id, catalog_snapshot_id),
  CHECK (
    (status = 'draft'::public.tour_version_status AND published_at IS NULL)
    OR (status = ANY(ARRAY['published'::public.tour_version_status, 'retired'::public.tour_version_status]) AND published_at IS NOT NULL)
  )
);

CREATE TABLE public.tour_version_translations (
  tour_version_id uuid NOT NULL REFERENCES public.tour_versions(id) ON DELETE RESTRICT,
  locale public.locale NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240 AND title = btrim(title) AND title !~ '[[:cntrl:]]'),
  summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 1000 AND summary = btrim(summary) AND summary !~ '[[:cntrl:]]'),
  meeting_point text NOT NULL CHECK (length(btrim(meeting_point)) BETWEEN 1 AND 500 AND meeting_point = btrim(meeting_point) AND meeting_point !~ '[[:cntrl:]]'),
  PRIMARY KEY (tour_version_id, locale)
);

CREATE TABLE public.tour_version_stops (
  tour_version_id uuid NOT NULL,
  catalog_snapshot_id uuid NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 64),
  place_id uuid NOT NULL,
  PRIMARY KEY (tour_version_id, position),
  UNIQUE (tour_version_id, place_id),
  FOREIGN KEY (tour_version_id, catalog_snapshot_id)
    REFERENCES public.tour_versions(id, catalog_snapshot_id) ON DELETE RESTRICT,
  FOREIGN KEY (catalog_snapshot_id, place_id)
    REFERENCES public.catalog_snapshot_places(snapshot_id, place_id) ON DELETE RESTRICT
);

CREATE TABLE public.departures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_version_id uuid NOT NULL REFERENCES public.tour_versions(id) ON DELETE RESTRICT,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status public.departure_status NOT NULL DEFAULT 'scheduled',
  capacity integer NOT NULL CHECK (capacity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tour_version_id, start_at),
  CHECK (end_at > start_at)
);

ALTER TABLE public.tours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tours FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tour_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_translations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tour_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tour_version_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_version_translations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tour_version_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_version_stops FORCE ROW LEVEL SECURITY;
ALTER TABLE public.departures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departures FORCE ROW LEVEL SECURITY;

CREATE POLICY tours_public_select ON public.tours
  FOR SELECT TO anon, authenticated
  USING (status = 'published'::public.tour_status);
CREATE POLICY tour_translations_public_select ON public.tour_translations
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tours AS t
    WHERE t.id = tour_translations.tour_id AND t.status = 'published'::public.tour_status
  ));
CREATE POLICY tour_versions_public_select ON public.tour_versions
  FOR SELECT TO anon, authenticated
  USING (
    status = 'published'::public.tour_version_status
    AND EXISTS (SELECT 1 FROM public.tours AS t WHERE t.id = tour_versions.tour_id AND t.status = 'published'::public.tour_status)
    AND EXISTS (SELECT 1 FROM public.catalog_snapshots AS s WHERE s.id = tour_versions.catalog_snapshot_id AND s.status = 'published'::public.snapshot_status)
  );
CREATE POLICY tour_version_translations_public_select ON public.tour_version_translations
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tour_versions AS v
    JOIN public.tours AS t ON t.id = v.tour_id
    JOIN public.catalog_snapshots AS s ON s.id = v.catalog_snapshot_id
    WHERE v.id = tour_version_translations.tour_version_id
      AND v.status = 'published'::public.tour_version_status
      AND t.status = 'published'::public.tour_status
      AND s.status = 'published'::public.snapshot_status
  ));
CREATE POLICY tour_version_stops_public_select ON public.tour_version_stops
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tour_versions AS v
    JOIN public.tours AS t ON t.id = v.tour_id
    JOIN public.catalog_snapshots AS s ON s.id = v.catalog_snapshot_id
    WHERE v.id = tour_version_stops.tour_version_id
      AND v.status = 'published'::public.tour_version_status
      AND t.status = 'published'::public.tour_status
      AND s.status = 'published'::public.snapshot_status
  ));

DO $policies$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['tours', 'tour_translations', 'tour_versions', 'tour_version_translations', 'tour_version_stops', 'departures']
  LOOP
    EXECUTE format(
      'CREATE POLICY tour_owner_all ON public.%I FOR ALL TO localens_tour_rpc_owner USING (current_user = %L) WITH CHECK (current_user = %L)',
      table_name, 'localens_tour_rpc_owner', 'localens_tour_rpc_owner'
    );
  END LOOP;
END
$policies$;

CREATE POLICY tour_guard_tours_select ON public.tours
  FOR SELECT TO localens_tour_guard_owner USING (current_user = 'localens_tour_guard_owner');
CREATE POLICY tour_guard_translations_select ON public.tour_translations
  FOR SELECT TO localens_tour_guard_owner USING (current_user = 'localens_tour_guard_owner');
CREATE POLICY tour_guard_versions_select ON public.tour_versions
  FOR SELECT TO localens_tour_guard_owner USING (current_user = 'localens_tour_guard_owner');
CREATE POLICY tour_guard_version_translations_select ON public.tour_version_translations
  FOR SELECT TO localens_tour_guard_owner USING (current_user = 'localens_tour_guard_owner');
CREATE POLICY tour_guard_version_stops_select ON public.tour_version_stops
  FOR SELECT TO localens_tour_guard_owner USING (current_user = 'localens_tour_guard_owner');

GRANT USAGE ON SCHEMA public, private TO localens_tour_rpc_owner, localens_tour_guard_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tours, public.tour_translations, public.tour_versions,
  public.tour_version_translations, public.tour_version_stops, public.departures TO localens_tour_rpc_owner;
GRANT SELECT ON TABLE public.tours, public.tour_translations, public.tour_versions,
  public.tour_version_translations, public.tour_version_stops TO localens_tour_guard_owner;
GRANT SELECT ON TABLE public.catalog_snapshots, public.catalog_snapshot_places,
  public.catalog_snapshot_place_translations TO localens_tour_guard_owner;
GRANT SELECT ON TABLE public.departures TO localens_tour_guard_owner;
GRANT EXECUTE ON FUNCTION private.valid_tour_copy_array(text[]) TO localens_tour_rpc_owner;

-- The invoker view needs source privileges, but only for columns represented by
-- its explicit public shape.  Table-level SELECT remains revoked.
REVOKE ALL ON TABLE public.tours, public.tour_translations, public.tour_versions,
  public.tour_version_translations, public.tour_version_stops, public.departures
  FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, slug, status) ON TABLE public.tours TO anon, authenticated;
GRANT SELECT (id, tour_id, catalog_snapshot_id, status, duration_minutes, price_vnd_per_person,
  inclusions, exclusions, cancellation_policy, source_url, verified_at, attribution, license)
  ON TABLE public.tour_versions TO anon, authenticated;
GRANT SELECT (tour_version_id, locale, title, summary, meeting_point)
  ON TABLE public.tour_version_translations TO anon, authenticated;
GRANT SELECT (tour_version_id, catalog_snapshot_id, position, place_id)
  ON TABLE public.tour_version_stops TO anon, authenticated;
GRANT SELECT (snapshot_id, place_id, slug) ON TABLE public.catalog_snapshot_places TO anon, authenticated;
GRANT SELECT (snapshot_id, place_id, locale, title) ON TABLE public.catalog_snapshot_place_translations TO anon, authenticated;
GRANT SELECT (id, status) ON TABLE public.catalog_snapshots TO anon, authenticated;
REVOKE ALL ON TABLE public.departures, public.tour_translations FROM PUBLIC, anon, authenticated;

-- The API can inspect only the published snapshot columns used by the view.
-- Existing catalog policies already restrict these rows to published snapshots.
CREATE POLICY catalog_snapshot_places_tour_public_select ON public.catalog_snapshot_places
  FOR SELECT TO anon, authenticated USING (EXISTS (
    SELECT 1 FROM public.catalog_snapshots AS s
    WHERE s.id = catalog_snapshot_places.snapshot_id AND s.status = 'published'::public.snapshot_status
  ));
CREATE POLICY catalog_snapshot_place_translations_tour_public_select ON public.catalog_snapshot_place_translations
  FOR SELECT TO anon, authenticated USING (EXISTS (
    SELECT 1 FROM public.catalog_snapshots AS s
    WHERE s.id = catalog_snapshot_place_translations.snapshot_id AND s.status = 'published'::public.snapshot_status
  ));

-- The guard reads catalog membership while FORCE RLS remains enabled.
CREATE POLICY catalog_snapshots_tour_guard_select ON public.catalog_snapshots
  FOR SELECT TO localens_tour_guard_owner USING (current_user = 'localens_tour_guard_owner');
CREATE POLICY catalog_snapshot_places_tour_guard_select ON public.catalog_snapshot_places
  FOR SELECT TO localens_tour_guard_owner USING (current_user = 'localens_tour_guard_owner');
CREATE POLICY catalog_snapshot_place_translations_tour_guard_select ON public.catalog_snapshot_place_translations
  FOR SELECT TO localens_tour_guard_owner USING (current_user = 'localens_tour_guard_owner');
CREATE POLICY tour_guard_departures_select ON public.departures
  FOR SELECT TO localens_tour_guard_owner USING (current_user = 'localens_tour_guard_owner');

-- Every lifecycle write takes the same advisory locks in UUID order.  The
-- guard role is deliberately pinned so callers cannot alter its search path.
CREATE OR REPLACE FUNCTION private.lock_tour_parents(uuid, uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  old_tour_id uuid := $1;
  new_tour_id uuid := $2;
BEGIN
  IF old_tour_id IS NULL AND new_tour_id IS NULL THEN
    RETURN;
  ELSIF new_tour_id IS NULL OR (old_tour_id IS NOT NULL AND old_tour_id = new_tour_id) THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('localens:tour:' || old_tour_id::text, 0::bigint)
    );
  ELSIF old_tour_id IS NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('localens:tour:' || new_tour_id::text, 0::bigint)
    );
  ELSIF old_tour_id::text < new_tour_id::text THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('localens:tour:' || old_tour_id::text, 0::bigint)
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('localens:tour:' || new_tour_id::text, 0::bigint)
    );
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('localens:tour:' || new_tour_id::text, 0::bigint)
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('localens:tour:' || old_tour_id::text, 0::bigint)
    );
  END IF;
END;
$function$;
ALTER FUNCTION private.lock_tour_parents(uuid, uuid) OWNER TO localens_tour_guard_owner;
REVOKE ALL ON FUNCTION private.lock_tour_parents(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_tour_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM private.lock_tour_parents(OLD.id, NULL);
    IF OLD.status = 'published'::public.tour_status THEN
      RAISE EXCEPTION 'published tours cannot be deleted' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  PERFORM private.lock_tour_parents(OLD.id, NEW.id);
  IF OLD.id IS DISTINCT FROM NEW.id OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'tour identity and created facts are immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'archived'::public.tour_status AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'archived tours are terminal' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    OLD.status = NEW.status
    OR (OLD.status = 'draft'::public.tour_status AND NEW.status = ANY(ARRAY['published'::public.tour_status, 'archived'::public.tour_status]))
    OR (OLD.status = 'published'::public.tour_status AND NEW.status = 'archived'::public.tour_status)
  ) THEN
    RAISE EXCEPTION 'invalid tour lifecycle transition' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'published'::public.tour_status AND OLD.slug IS DISTINCT FROM NEW.slug THEN
    RAISE EXCEPTION 'published tour slugs are immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'published'::public.tour_status
     AND NEW.status = 'archived'::public.tour_status
     AND EXISTS (
       SELECT 1
       FROM public.departures AS d
       JOIN public.tour_versions AS v ON v.id = d.tour_version_id
       WHERE v.tour_id = OLD.id
         AND d.status = ANY(ARRAY['scheduled'::public.departure_status, 'sold_out'::public.departure_status])
     ) THEN
    RAISE EXCEPTION 'tours with active departures cannot be archived' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.guard_tour_lifecycle() OWNER TO localens_tour_guard_owner;
REVOKE ALL ON FUNCTION private.guard_tour_lifecycle() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tours_lifecycle_lock BEFORE UPDATE OF status ON public.tours
FOR EACH ROW EXECUTE FUNCTION private.guard_tour_lifecycle();
CREATE TRIGGER tours_identity_guard BEFORE UPDATE OF id, slug, created_at OR DELETE ON public.tours
FOR EACH ROW EXECUTE FUNCTION private.guard_tour_lifecycle();

CREATE OR REPLACE FUNCTION private.guard_tour_translation_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM private.lock_tour_parents(NULL, NEW.tour_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM private.lock_tour_parents(OLD.tour_id, NULL);
    RETURN OLD;
  END IF;
  PERFORM private.lock_tour_parents(OLD.tour_id, NEW.tour_id);
  IF OLD.locale IS DISTINCT FROM NEW.locale THEN
    RAISE EXCEPTION 'tour translation locale is immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.tour_id IS DISTINCT FROM NEW.tour_id
     AND EXISTS (
       SELECT 1 FROM public.tours
       WHERE id = OLD.tour_id AND status = 'published'::public.tour_status
     ) THEN
    RAISE EXCEPTION 'translations cannot be reparented away from a published tour' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.guard_tour_translation_lifecycle() OWNER TO localens_tour_guard_owner;
REVOKE ALL ON FUNCTION private.guard_tour_translation_lifecycle() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tour_translations_lifecycle_lock BEFORE INSERT OR UPDATE OR DELETE ON public.tour_translations
FOR EACH ROW EXECUTE FUNCTION private.guard_tour_translation_lifecycle();

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

CREATE OR REPLACE FUNCTION private.reject_tour_append_only_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  parent_tour_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'tour_versions' THEN
    PERFORM private.lock_tour_parents(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.tour_id ELSE NEW.tour_id END,
      CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.tour_id END
    );
  ELSE
    SELECT v.tour_id INTO parent_tour_id
    FROM public.tour_versions AS v
    WHERE v.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.tour_version_id ELSE NEW.tour_version_id END;
    PERFORM private.lock_tour_parents(parent_tour_id, parent_tour_id);
  END IF;
  IF TG_TABLE_NAME = 'tour_versions' AND TG_OP = 'UPDATE'
     AND OLD.id = NEW.id
     AND OLD.tour_id = NEW.tour_id
     AND OLD.catalog_snapshot_id = NEW.catalog_snapshot_id
     AND OLD.duration_minutes = NEW.duration_minutes
     AND OLD.price_vnd_per_person = NEW.price_vnd_per_person
     AND OLD.inclusions = NEW.inclusions
     AND OLD.exclusions = NEW.exclusions
     AND OLD.cancellation_policy = NEW.cancellation_policy
     AND OLD.source_url = NEW.source_url
     AND OLD.verified_at = NEW.verified_at
     AND OLD.attribution = NEW.attribution
     AND OLD.license = NEW.license
     AND OLD.created_at = NEW.created_at
     AND ((OLD.status = 'draft'::public.tour_version_status AND NEW.status = 'published'::public.tour_version_status AND OLD.published_at IS NULL AND NEW.published_at IS NOT NULL)
       OR (OLD.status = 'published'::public.tour_version_status AND NEW.status = 'retired'::public.tour_version_status AND OLD.published_at = NEW.published_at)) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'tour version history is append-only' USING ERRCODE = '42501';
END;
$function$;
ALTER FUNCTION private.reject_tour_append_only_change() OWNER TO localens_tour_guard_owner;
REVOKE ALL ON FUNCTION private.reject_tour_append_only_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tour_versions_append_only
BEFORE UPDATE OR DELETE ON public.tour_versions
FOR EACH ROW EXECUTE FUNCTION private.reject_tour_append_only_change();
CREATE TRIGGER tour_version_translations_append_only
BEFORE UPDATE OR DELETE ON public.tour_version_translations
FOR EACH ROW EXECUTE FUNCTION private.reject_tour_append_only_change();
CREATE TRIGGER tour_version_stops_append_only
BEFORE UPDATE OR DELETE ON public.tour_version_stops
FOR EACH ROW EXECUTE FUNCTION private.reject_tour_append_only_change();

CREATE OR REPLACE FUNCTION private.guard_tour_version_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  parent_status public.tour_status;
  published_count integer;
  active_departure_exists boolean;
BEGIN
  PERFORM private.lock_tour_parents(OLD.tour_id, NEW.tour_id);
  SELECT status INTO parent_status FROM public.tours WHERE id = OLD.tour_id FOR SHARE;
  IF OLD.status = 'draft'::public.tour_version_status AND NEW.status = 'published'::public.tour_version_status THEN
    IF parent_status = 'archived'::public.tour_status THEN
      RAISE EXCEPTION 'archived tours cannot publish new versions' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'published'::public.tour_version_status AND NEW.status = 'retired'::public.tour_version_status THEN
    SELECT EXISTS (
      SELECT 1 FROM public.departures AS d
      WHERE d.tour_version_id = OLD.id
        AND d.status = ANY(ARRAY['scheduled'::public.departure_status, 'sold_out'::public.departure_status])
    ) INTO active_departure_exists;
    IF active_departure_exists THEN
      RAISE EXCEPTION 'tour version with active departures cannot retire' USING ERRCODE = '42501';
    END IF;
    SELECT count(*)::integer INTO published_count
      FROM public.tour_versions
      WHERE tour_id = OLD.tour_id AND status = 'published'::public.tour_version_status;
    IF published_count <= 1 AND parent_status <> 'archived'::public.tour_status THEN
      RAISE EXCEPTION 'published tour must retain a published version' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid tour version lifecycle transition' USING ERRCODE = '42501';
END;
$function$;
ALTER FUNCTION private.guard_tour_version_lifecycle() OWNER TO localens_tour_guard_owner;
REVOKE ALL ON FUNCTION private.guard_tour_version_lifecycle() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tour_versions_lifecycle_lock BEFORE UPDATE OF status ON public.tour_versions
FOR EACH ROW EXECUTE FUNCTION private.guard_tour_version_lifecycle();

CREATE OR REPLACE FUNCTION private.assert_departure_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  parent_tour_id uuid;
BEGIN
  IF NEW.status <> 'scheduled'::public.departure_status THEN
    RAISE EXCEPTION 'departures must be inserted as scheduled' USING ERRCODE = '42501';
  END IF;
  SELECT v.tour_id INTO parent_tour_id
  FROM public.tour_versions AS v
  WHERE v.id = NEW.tour_version_id;
  PERFORM private.lock_tour_parents(parent_tour_id, parent_tour_id);
  IF NOT EXISTS (
       SELECT 1
       FROM public.tour_versions AS v
       JOIN public.tours AS t ON t.id = v.tour_id
       WHERE v.id = NEW.tour_version_id
         AND v.status = 'published'::public.tour_version_status
         AND t.status = 'published'::public.tour_status
     ) THEN
    RAISE EXCEPTION 'scheduled departures require a published tour version' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_departure_insert() OWNER TO localens_tour_guard_owner;
REVOKE ALL ON FUNCTION private.assert_departure_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER departures_insert_guard BEFORE INSERT ON public.departures FOR EACH ROW EXECUTE FUNCTION private.assert_departure_insert();

CREATE OR REPLACE FUNCTION private.reject_published_tour_child_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  parent_status public.tour_version_status;
  parent_tour_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'tour_versions' THEN
    PERFORM private.lock_tour_parents(NULL, NEW.tour_id);
    IF NEW.status <> 'draft'::public.tour_version_status OR NEW.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'tour versions must be inserted as draft' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  SELECT tour_id INTO parent_tour_id FROM public.tour_versions WHERE id = NEW.tour_version_id;
  PERFORM private.lock_tour_parents(parent_tour_id, parent_tour_id);
  SELECT status INTO parent_status FROM public.tour_versions WHERE id = NEW.tour_version_id FOR SHARE;
  IF parent_status = ANY(ARRAY['published'::public.tour_version_status, 'retired'::public.tour_version_status]) THEN
    RAISE EXCEPTION 'published tour version children are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.reject_published_tour_child_insert() OWNER TO localens_tour_guard_owner;
REVOKE ALL ON FUNCTION private.reject_published_tour_child_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tour_versions_draft_insert_guard BEFORE INSERT ON public.tour_versions FOR EACH ROW EXECUTE FUNCTION private.reject_published_tour_child_insert();
CREATE TRIGGER tour_version_translations_published_insert_guard BEFORE INSERT ON public.tour_version_translations FOR EACH ROW EXECUTE FUNCTION private.reject_published_tour_child_insert();
CREATE TRIGGER tour_version_stops_published_insert_guard BEFORE INSERT ON public.tour_version_stops FOR EACH ROW EXECUTE FUNCTION private.reject_published_tour_child_insert();

CREATE OR REPLACE FUNCTION private.assert_departure_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.tour_version_id IS DISTINCT FROM OLD.tour_version_id
     OR NEW.start_at IS DISTINCT FROM OLD.start_at
     OR NEW.end_at IS DISTINCT FROM OLD.end_at
     OR NEW.capacity IS DISTINCT FROM OLD.capacity
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'departure facts are immutable after creation' USING ERRCODE = '42501';
  END IF;
  IF (OLD.status = 'scheduled'::public.departure_status AND NEW.status = ANY(ARRAY['scheduled'::public.departure_status, 'sold_out'::public.departure_status, 'cancelled'::public.departure_status, 'completed'::public.departure_status]))
     OR (OLD.status = 'sold_out'::public.departure_status AND NEW.status = ANY(ARRAY['sold_out'::public.departure_status, 'completed'::public.departure_status]))
     OR (OLD.status = ANY(ARRAY['cancelled'::public.departure_status, 'completed'::public.departure_status]) AND NEW.status = OLD.status) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid departure status transition' USING ERRCODE = '42501';
END;
$function$;
ALTER FUNCTION private.assert_departure_update() OWNER TO localens_tour_guard_owner;
REVOKE ALL ON FUNCTION private.assert_departure_update() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER departures_update_guard BEFORE UPDATE ON public.departures FOR EACH ROW EXECUTE FUNCTION private.assert_departure_update();

CREATE OR REPLACE FUNCTION private.assert_published_tour_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  target_tour_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'tours' THEN
    target_tour_id := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'tour_translations' THEN
    IF TG_OP = 'UPDATE' AND OLD.tour_id IS DISTINCT FROM NEW.tour_id THEN
      PERFORM private.assert_published_tour_complete(OLD.tour_id);
      PERFORM private.assert_published_tour_complete(NEW.tour_id);
      RETURN NEW;
    END IF;
    target_tour_id := COALESCE(NEW.tour_id, OLD.tour_id);
  ELSE
    SELECT tour_id INTO target_tour_id FROM public.tour_versions WHERE id = COALESCE(NEW.tour_version_id, OLD.tour_version_id);
  END IF;
  PERFORM private.assert_published_tour_complete(target_tour_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_published_tour_row() OWNER TO localens_tour_guard_owner;
REVOKE ALL ON FUNCTION private.assert_published_tour_row() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tours_published_completeness AFTER INSERT OR UPDATE OF status ON public.tours FOR EACH ROW WHEN (NEW.status = 'published'::public.tour_status) EXECUTE FUNCTION private.assert_published_tour_row();
CREATE TRIGGER tour_translations_published_completeness AFTER INSERT OR UPDATE OR DELETE ON public.tour_translations FOR EACH ROW EXECUTE FUNCTION private.assert_published_tour_row();
CREATE TRIGGER tour_versions_published_completeness AFTER INSERT OR UPDATE OF status, source_url, verified_at, attribution, license ON public.tour_versions FOR EACH ROW WHEN (NEW.status = 'published'::public.tour_version_status) EXECUTE FUNCTION private.assert_published_tour_row();
CREATE TRIGGER tour_version_translations_published_completeness AFTER INSERT OR UPDATE OR DELETE ON public.tour_version_translations FOR EACH ROW EXECUTE FUNCTION private.assert_published_tour_row();
CREATE TRIGGER tour_version_stops_published_completeness AFTER INSERT OR UPDATE OR DELETE ON public.tour_version_stops FOR EACH ROW EXECUTE FUNCTION private.assert_published_tour_row();

CREATE OR REPLACE VIEW public.published_tours_v
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
  t.id AS tour_id,
  v.id AS tour_version_id,
  t.slug,
  vt.locale,
  vt.title,
  vt.summary,
  vt.meeting_point,
  v.duration_minutes,
  v.price_vnd_per_person::text AS price_vnd_minor,
  v.inclusions,
  v.exclusions,
  v.cancellation_policy,
  v.source_url,
  v.verified_at::text AS verified_at,
  v.attribution,
  v.license,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'position', s.position,
      'place_id', s.place_id,
      'place_slug', sp.slug,
      'title', spt.title
    ) ORDER BY s.position)
    FROM public.tour_version_stops AS s
    JOIN public.catalog_snapshot_places AS sp
      ON sp.snapshot_id = s.catalog_snapshot_id AND sp.place_id = s.place_id
    JOIN public.catalog_snapshot_place_translations AS spt
      ON spt.snapshot_id = s.catalog_snapshot_id AND spt.place_id = s.place_id AND spt.locale = vt.locale
    WHERE s.tour_version_id = v.id
  ), '[]'::jsonb) AS stops
FROM public.tours AS t
JOIN public.tour_versions AS v ON v.tour_id = t.id
JOIN public.tour_version_translations AS vt ON vt.tour_version_id = v.id
WHERE t.status = 'published'::public.tour_status
  AND v.status = 'published'::public.tour_version_status
  AND vt.locale = ANY(ARRAY['en'::public.locale, 'vi'::public.locale]);

ALTER VIEW public.published_tours_v OWNER TO localens_tour_rpc_owner;
REVOKE ALL ON public.published_tours_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.published_tours_v TO anon, authenticated;
REVOKE ALL ON TABLE public.departures FROM PUBLIC, anon, authenticated;

COMMIT;
