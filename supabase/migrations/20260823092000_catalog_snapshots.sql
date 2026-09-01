BEGIN;

-- Catalog facts are maintained by the admin application and are copied into
-- immutable engine snapshots.  The API roles receive only published rows.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_catalog_rpc_owner') THEN
    EXECUTE 'CREATE ROLE localens_catalog_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_catalog_guard_owner') THEN
    EXECUTE 'CREATE ROLE localens_catalog_guard_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname IN ('localens_catalog_rpc_owner', 'localens_catalog_guard_owner')
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolcanlogin OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'unsafe pre-existing LocalLens catalog owner role attributes';
  END IF;
END
$roles$;

GRANT localens_catalog_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
GRANT localens_catalog_guard_owner TO postgres WITH SET TRUE, INHERIT FALSE;

REVOKE ALL ON SCHEMA public, private, auth FROM localens_catalog_rpc_owner, localens_catalog_guard_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA public, private, auth FROM localens_catalog_rpc_owner, localens_catalog_guard_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, private, auth FROM localens_catalog_rpc_owner, localens_catalog_guard_owner;

CREATE TABLE public.areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug <> '' AND slug = lower(slug) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.area_translations (
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE RESTRICT,
  locale public.locale NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 2000),
  PRIMARY KEY (area_id, locale)
);

CREATE TABLE public.places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE RESTRICT,
  slug text NOT NULL UNIQUE CHECK (slug <> '' AND slug = lower(slug) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status public.place_status NOT NULL DEFAULT 'draft',
  price_vnd_per_person bigint NOT NULL DEFAULT 0 CHECK (price_vnd_per_person BETWEEN 0 AND 9007199254740991),
  visit_duration_minutes smallint NOT NULL DEFAULT 60 CHECK (visit_duration_minutes BETWEEN 15 AND 480),
  source_url text CHECK (source_url IS NULL OR (source_url ~ '^https://' AND length(source_url) <= 2048)),
  verified_at date,
  attribution text CHECK (attribution IS NULL OR length(btrim(attribution)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.place_translations (
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE RESTRICT,
  locale public.locale NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 1000),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 4000),
  PRIMARY KEY (place_id, locale)
);

CREATE TABLE public.place_experience_types (
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE RESTRICT,
  experience_type text NOT NULL CHECK (experience_type IN ('street_food', 'history', 'traditional_craft', 'traditional_market')),
  PRIMARY KEY (place_id, experience_type)
);

CREATE TABLE public.place_guide_languages (
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE RESTRICT,
  language public.locale NOT NULL,
  PRIMARY KEY (place_id, language)
);

CREATE TABLE public.place_supports (
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE RESTRICT,
  support_kind text NOT NULL CHECK (support_kind IN ('dietary', 'mobility')),
  requirement text NOT NULL CHECK (length(btrim(requirement)) BETWEEN 1 AND 80),
  status text NOT NULL CHECK (status IN ('supported', 'unsupported', 'unknown')),
  PRIMARY KEY (place_id, support_kind, requirement)
);

CREATE TABLE public.place_opening_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE RESTRICT,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at time without time zone NOT NULL,
  closes_at time without time zone NOT NULL,
  CHECK (opens_at <> closes_at),
  UNIQUE (place_id, weekday, opens_at, closes_at)
);

CREATE TABLE public.place_opening_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE RESTRICT,
  local_date date NOT NULL,
  closed boolean NOT NULL DEFAULT false,
  UNIQUE (id, place_id),
  UNIQUE (place_id, local_date)
);

CREATE TABLE public.place_opening_exception_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_id uuid NOT NULL,
  place_id uuid NOT NULL,
  opens_at time without time zone NOT NULL,
  closes_at time without time zone NOT NULL,
  CHECK (opens_at <> closes_at),
  UNIQUE (exception_id, opens_at, closes_at),
  FOREIGN KEY (exception_id, place_id) REFERENCES public.place_opening_exceptions(id, place_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status public.snapshot_status NOT NULL DEFAULT 'building',
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CHECK ((status = 'published' AND published_at IS NOT NULL) OR (status <> 'published'))
);

CREATE TABLE public.catalog_snapshot_areas (
  snapshot_id uuid NOT NULL REFERENCES public.catalog_snapshots(id) ON DELETE RESTRICT,
  area_id uuid NOT NULL,
  slug text NOT NULL CHECK (slug <> ''),
  PRIMARY KEY (snapshot_id, area_id),
  UNIQUE (snapshot_id, slug)
);

CREATE TABLE public.catalog_snapshot_area_translations (
  snapshot_id uuid NOT NULL,
  area_id uuid NOT NULL,
  locale public.locale NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  PRIMARY KEY (snapshot_id, area_id, locale),
  FOREIGN KEY (snapshot_id, area_id) REFERENCES public.catalog_snapshot_areas(snapshot_id, area_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_places (
  snapshot_id uuid NOT NULL REFERENCES public.catalog_snapshots(id) ON DELETE RESTRICT,
  place_id uuid NOT NULL,
  area_id uuid NOT NULL,
  slug text NOT NULL CHECK (slug <> ''),
  price_vnd_per_person bigint NOT NULL CHECK (price_vnd_per_person BETWEEN 0 AND 9007199254740991),
  visit_duration_minutes smallint NOT NULL CHECK (visit_duration_minutes BETWEEN 15 AND 480),
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  verified_at date NOT NULL,
  attribution text NOT NULL CHECK (length(btrim(attribution)) BETWEEN 1 AND 500),
  PRIMARY KEY (snapshot_id, place_id),
  UNIQUE (snapshot_id, place_id, area_id),
  FOREIGN KEY (snapshot_id, area_id) REFERENCES public.catalog_snapshot_areas(snapshot_id, area_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_place_translations (
  snapshot_id uuid NOT NULL,
  place_id uuid NOT NULL,
  locale public.locale NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  description text NOT NULL,
  PRIMARY KEY (snapshot_id, place_id, locale),
  FOREIGN KEY (snapshot_id, place_id) REFERENCES public.catalog_snapshot_places(snapshot_id, place_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_place_experience_types (
  snapshot_id uuid NOT NULL,
  place_id uuid NOT NULL,
  experience_type text NOT NULL CHECK (experience_type IN ('street_food', 'history', 'traditional_craft', 'traditional_market')),
  PRIMARY KEY (snapshot_id, place_id, experience_type),
  FOREIGN KEY (snapshot_id, place_id) REFERENCES public.catalog_snapshot_places(snapshot_id, place_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_place_guide_languages (
  snapshot_id uuid NOT NULL,
  place_id uuid NOT NULL,
  language public.locale NOT NULL,
  PRIMARY KEY (snapshot_id, place_id, language),
  FOREIGN KEY (snapshot_id, place_id) REFERENCES public.catalog_snapshot_places(snapshot_id, place_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_place_supports (
  snapshot_id uuid NOT NULL,
  place_id uuid NOT NULL,
  support_kind text NOT NULL CHECK (support_kind IN ('dietary', 'mobility')),
  requirement text NOT NULL CHECK (length(btrim(requirement)) BETWEEN 1 AND 80),
  status text NOT NULL CHECK (status IN ('supported', 'unsupported', 'unknown')),
  PRIMARY KEY (snapshot_id, place_id, support_kind, requirement),
  FOREIGN KEY (snapshot_id, place_id) REFERENCES public.catalog_snapshot_places(snapshot_id, place_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_place_opening_hours (
  snapshot_id uuid NOT NULL,
  place_id uuid NOT NULL,
  opening_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at time without time zone NOT NULL,
  closes_at time without time zone NOT NULL,
  CHECK (opens_at <> closes_at),
  PRIMARY KEY (snapshot_id, place_id, opening_id),
  FOREIGN KEY (snapshot_id, place_id) REFERENCES public.catalog_snapshot_places(snapshot_id, place_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_place_opening_exceptions (
  snapshot_id uuid NOT NULL,
  place_id uuid NOT NULL,
  exception_id uuid NOT NULL,
  local_date date NOT NULL,
  closed boolean NOT NULL,
  PRIMARY KEY (snapshot_id, place_id, exception_id),
  UNIQUE (snapshot_id, place_id, local_date),
  FOREIGN KEY (snapshot_id, place_id) REFERENCES public.catalog_snapshot_places(snapshot_id, place_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_place_opening_exception_windows (
  snapshot_id uuid NOT NULL,
  place_id uuid NOT NULL,
  exception_id uuid NOT NULL,
  window_id uuid NOT NULL,
  opens_at time without time zone NOT NULL,
  closes_at time without time zone NOT NULL,
  CHECK (opens_at <> closes_at),
  PRIMARY KEY (snapshot_id, place_id, exception_id, window_id),
  FOREIGN KEY (snapshot_id, place_id, exception_id)
    REFERENCES public.catalog_snapshot_place_opening_exceptions(snapshot_id, place_id, exception_id) ON DELETE RESTRICT
);

-- Every public relation is RLS-protected, including immutable history.
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.area_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_translations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places FORCE ROW LEVEL SECURITY;
ALTER TABLE public.place_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_translations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.place_experience_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_experience_types FORCE ROW LEVEL SECURITY;
ALTER TABLE public.place_guide_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_guide_languages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.place_supports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_supports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.place_opening_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_opening_hours FORCE ROW LEVEL SECURITY;
ALTER TABLE public.place_opening_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_opening_exceptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.place_opening_exception_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_opening_exception_windows FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_areas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_area_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_area_translations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_places FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_place_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_place_translations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_place_experience_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_place_experience_types FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_place_guide_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_place_guide_languages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_place_supports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_place_supports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_place_opening_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_place_opening_hours FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_place_opening_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_place_opening_exceptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_place_opening_exception_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_place_opening_exception_windows FORCE ROW LEVEL SECURITY;

-- Client reads are limited to published rows.  No API role receives INSERT,
-- UPDATE, DELETE, or TRUNCATE on the base catalog/history tables.
CREATE POLICY areas_public_select ON public.areas FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.places WHERE places.area_id = areas.id AND places.status = 'published')
);
CREATE POLICY area_translations_public_select ON public.area_translations FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.places WHERE places.area_id = area_translations.area_id AND places.status = 'published')
);
CREATE POLICY places_public_select ON public.places FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY place_translations_public_select ON public.place_translations FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.places WHERE places.id = place_translations.place_id AND places.status = 'published')
);
CREATE POLICY place_experience_types_public_select ON public.place_experience_types FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.places WHERE places.id = place_experience_types.place_id AND places.status = 'published')
);
CREATE POLICY place_guide_languages_public_select ON public.place_guide_languages FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.places WHERE places.id = place_guide_languages.place_id AND places.status = 'published')
);
CREATE POLICY place_supports_public_select ON public.place_supports FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.places WHERE places.id = place_supports.place_id AND places.status = 'published')
);
CREATE POLICY place_opening_hours_public_select ON public.place_opening_hours FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.places WHERE places.id = place_opening_hours.place_id AND places.status = 'published')
);
CREATE POLICY place_opening_exceptions_public_select ON public.place_opening_exceptions FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.places WHERE places.id = place_opening_exceptions.place_id AND places.status = 'published')
);
CREATE POLICY place_opening_exception_windows_public_select ON public.place_opening_exception_windows FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.places WHERE places.id = place_opening_exception_windows.place_id AND places.status = 'published')
);

CREATE POLICY catalog_snapshots_public_select ON public.catalog_snapshots FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY catalog_snapshot_areas_public_select ON public.catalog_snapshot_areas FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.catalog_snapshots WHERE catalog_snapshots.id = catalog_snapshot_areas.snapshot_id AND catalog_snapshots.status = 'published')
);
CREATE POLICY catalog_snapshot_area_translations_public_select ON public.catalog_snapshot_area_translations FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.catalog_snapshots WHERE catalog_snapshots.id = catalog_snapshot_area_translations.snapshot_id AND catalog_snapshots.status = 'published')
);
CREATE POLICY catalog_snapshot_places_public_select ON public.catalog_snapshot_places FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.catalog_snapshots WHERE catalog_snapshots.id = catalog_snapshot_places.snapshot_id AND catalog_snapshots.status = 'published')
);
CREATE POLICY catalog_snapshot_place_translations_public_select ON public.catalog_snapshot_place_translations FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.catalog_snapshots WHERE catalog_snapshots.id = catalog_snapshot_place_translations.snapshot_id AND catalog_snapshots.status = 'published')
);
CREATE POLICY catalog_snapshot_place_experience_types_public_select ON public.catalog_snapshot_place_experience_types FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.catalog_snapshots WHERE catalog_snapshots.id = catalog_snapshot_place_experience_types.snapshot_id AND catalog_snapshots.status = 'published')
);
CREATE POLICY catalog_snapshot_place_guide_languages_public_select ON public.catalog_snapshot_place_guide_languages FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.catalog_snapshots WHERE catalog_snapshots.id = catalog_snapshot_place_guide_languages.snapshot_id AND catalog_snapshots.status = 'published')
);
CREATE POLICY catalog_snapshot_place_supports_public_select ON public.catalog_snapshot_place_supports FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.catalog_snapshots WHERE catalog_snapshots.id = catalog_snapshot_place_supports.snapshot_id AND catalog_snapshots.status = 'published')
);
CREATE POLICY catalog_snapshot_place_opening_hours_public_select ON public.catalog_snapshot_place_opening_hours FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.catalog_snapshots WHERE catalog_snapshots.id = catalog_snapshot_place_opening_hours.snapshot_id AND catalog_snapshots.status = 'published')
);
CREATE POLICY catalog_snapshot_place_opening_exceptions_public_select ON public.catalog_snapshot_place_opening_exceptions FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.catalog_snapshots WHERE catalog_snapshots.id = catalog_snapshot_place_opening_exceptions.snapshot_id AND catalog_snapshots.status = 'published')
);
CREATE POLICY catalog_snapshot_place_opening_exception_windows_public_select ON public.catalog_snapshot_place_opening_exception_windows FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.catalog_snapshots WHERE catalog_snapshots.id = catalog_snapshot_place_opening_exception_windows.snapshot_id AND catalog_snapshots.status = 'published')
);

-- The catalog owner is the only role that can maintain current facts and build
-- snapshots. FORCE RLS remains active even for the SECURITY DEFINER RPC.
DO $policies$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'areas', 'area_translations', 'places', 'place_translations',
    'place_experience_types', 'place_guide_languages', 'place_supports',
    'place_opening_hours', 'place_opening_exceptions', 'place_opening_exception_windows',
    'catalog_snapshots', 'catalog_snapshot_areas', 'catalog_snapshot_area_translations', 'catalog_snapshot_places',
    'catalog_snapshot_place_translations', 'catalog_snapshot_place_experience_types',
    'catalog_snapshot_place_guide_languages', 'catalog_snapshot_place_supports',
    'catalog_snapshot_place_opening_hours', 'catalog_snapshot_place_opening_exceptions',
    'catalog_snapshot_place_opening_exception_windows'
  ]
  LOOP
    EXECUTE format('CREATE POLICY catalog_owner_all ON public.%I FOR ALL TO localens_catalog_rpc_owner USING (true) WITH CHECK (true)', table_name);
  END LOOP;
END
$policies$;

GRANT USAGE ON SCHEMA public, private TO localens_catalog_rpc_owner;
GRANT CREATE ON SCHEMA private TO localens_catalog_rpc_owner, localens_catalog_guard_owner;
GRANT CREATE ON SCHEMA public TO localens_catalog_rpc_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.areas, public.area_translations, public.places, public.place_translations,
  public.place_experience_types, public.place_guide_languages, public.place_supports,
  public.place_opening_hours, public.place_opening_exceptions, public.place_opening_exception_windows,
  public.catalog_snapshots, public.catalog_snapshot_areas, public.catalog_snapshot_places,
  public.catalog_snapshot_area_translations,
  public.catalog_snapshot_place_translations, public.catalog_snapshot_place_experience_types,
  public.catalog_snapshot_place_guide_languages, public.catalog_snapshot_place_supports,
  public.catalog_snapshot_place_opening_hours, public.catalog_snapshot_place_opening_exceptions,
  public.catalog_snapshot_place_opening_exception_windows
  TO localens_catalog_rpc_owner;
GRANT SELECT ON private.user_roles TO localens_catalog_rpc_owner;
-- API roles receive no direct privilege on mutable catalog facts or immutable
-- history tables. They read the exact published projection below instead.
REVOKE ALL ON TABLE
  public.areas, public.area_translations, public.places, public.place_translations,
  public.place_experience_types, public.place_guide_languages, public.place_supports,
  public.place_opening_hours, public.place_opening_exceptions, public.place_opening_exception_windows,
  public.catalog_snapshots, public.catalog_snapshot_areas, public.catalog_snapshot_places,
  public.catalog_snapshot_area_translations,
  public.catalog_snapshot_place_translations, public.catalog_snapshot_place_experience_types,
  public.catalog_snapshot_place_guide_languages, public.catalog_snapshot_place_supports,
  public.catalog_snapshot_place_opening_hours, public.catalog_snapshot_place_opening_exceptions,
  public.catalog_snapshot_place_opening_exception_windows
  FROM anon, authenticated;

CREATE POLICY user_roles_catalog_rpc_select ON private.user_roles
  FOR SELECT TO localens_catalog_rpc_owner
  USING (current_user = 'localens_catalog_rpc_owner');

-- Trigger helper ownership is explicit and fixed; no API role can execute it.
CREATE OR REPLACE FUNCTION private.catalog_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.catalog_set_updated_at() OWNER TO localens_catalog_rpc_owner;
REVOKE ALL ON FUNCTION private.catalog_set_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER areas_set_updated_at BEFORE UPDATE ON public.areas FOR EACH ROW EXECUTE FUNCTION private.catalog_set_updated_at();
CREATE TRIGGER places_set_updated_at BEFORE UPDATE ON public.places FOR EACH ROW EXECUTE FUNCTION private.catalog_set_updated_at();

CREATE OR REPLACE FUNCTION private.assert_opening_window_nonoverlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.place_id IS DISTINCT FROM NEW.place_id THEN
    IF OLD.place_id::text < NEW.place_id::text THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('localens:place:' || OLD.place_id::text, 0::bigint)
      );
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('localens:place:' || NEW.place_id::text, 0::bigint)
      );
    ELSE
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('localens:place:' || NEW.place_id::text, 0::bigint)
      );
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('localens:place:' || OLD.place_id::text, 0::bigint)
      );
    END IF;
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('localens:place:' || NEW.place_id::text, 0::bigint)
    );
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.place_opening_hours AS existing
    CROSS JOIN LATERAL (
      SELECT NEW.weekday AS day,
             extract(epoch FROM NEW.opens_at)::integer AS start_seconds,
             CASE WHEN NEW.closes_at > NEW.opens_at THEN extract(epoch FROM NEW.closes_at)::integer ELSE 86400 END AS end_seconds
      UNION ALL
      SELECT ((NEW.weekday + 1) % 7), 0, extract(epoch FROM NEW.closes_at)::integer
      WHERE NEW.closes_at < NEW.opens_at
    ) AS incoming
    CROSS JOIN LATERAL (
      SELECT existing.weekday AS day,
             extract(epoch FROM existing.opens_at)::integer AS start_seconds,
             CASE WHEN existing.closes_at > existing.opens_at THEN extract(epoch FROM existing.closes_at)::integer ELSE 86400 END AS end_seconds
      UNION ALL
      SELECT ((existing.weekday + 1) % 7), 0, extract(epoch FROM existing.closes_at)::integer
      WHERE existing.closes_at < existing.opens_at
    ) AS stored
    WHERE existing.place_id = NEW.place_id
      AND existing.id <> NEW.id
      AND incoming.day = stored.day
      AND incoming.start_seconds < stored.end_seconds
      AND stored.start_seconds < incoming.end_seconds
  ) THEN
    RAISE EXCEPTION 'opening windows overlap, including overnight carry' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_opening_window_nonoverlap() OWNER TO localens_catalog_rpc_owner;
REVOKE ALL ON FUNCTION private.assert_opening_window_nonoverlap() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER place_opening_hours_no_overlap
BEFORE INSERT OR UPDATE ON public.place_opening_hours
FOR EACH ROW EXECUTE FUNCTION private.assert_opening_window_nonoverlap();

CREATE OR REPLACE FUNCTION private.assert_exception_window_nonoverlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('localens:exception:' || NEW.exception_id::text, 0::bigint)
  );
  IF EXISTS (
    SELECT 1
    FROM public.place_opening_exception_windows AS existing
    CROSS JOIN LATERAL (
      SELECT extract(epoch FROM NEW.opens_at)::integer AS start_seconds,
             CASE WHEN NEW.closes_at > NEW.opens_at THEN extract(epoch FROM NEW.closes_at)::integer ELSE 86400 END AS end_seconds
      UNION ALL
      SELECT 0, extract(epoch FROM NEW.closes_at)::integer
      WHERE NEW.closes_at < NEW.opens_at
    ) AS incoming
    CROSS JOIN LATERAL (
      SELECT extract(epoch FROM existing.opens_at)::integer AS start_seconds,
             CASE WHEN existing.closes_at > existing.opens_at THEN extract(epoch FROM existing.closes_at)::integer ELSE 86400 END AS end_seconds
      UNION ALL
      SELECT 0, extract(epoch FROM existing.closes_at)::integer
      WHERE existing.closes_at < existing.opens_at
    ) AS stored
    WHERE existing.exception_id = NEW.exception_id
      AND existing.id <> NEW.id
      AND incoming.start_seconds < stored.end_seconds
      AND stored.start_seconds < incoming.end_seconds
  ) THEN
    RAISE EXCEPTION 'exception windows overlap, including overnight carry' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_exception_window_nonoverlap() OWNER TO localens_catalog_rpc_owner;
REVOKE ALL ON FUNCTION private.assert_exception_window_nonoverlap() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER place_exception_windows_no_overlap
BEFORE INSERT OR UPDATE ON public.place_opening_exception_windows
FOR EACH ROW EXECUTE FUNCTION private.assert_exception_window_nonoverlap();

CREATE OR REPLACE FUNCTION private.assert_exception_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('localens:exception:' || NEW.id::text, 0::bigint)
  );
  IF NEW.closed AND EXISTS (SELECT 1 FROM public.place_opening_exception_windows WHERE exception_id = NEW.id) THEN
    RAISE EXCEPTION 'closed exceptions cannot contain opening windows' USING ERRCODE = '23514';
  END IF;
  IF NEW.closed AND EXISTS (
    SELECT 1 FROM public.place_opening_exception_windows AS windows
    WHERE windows.exception_id = NEW.id AND windows.place_id <> NEW.place_id
  ) THEN
    RAISE EXCEPTION 'exception window place mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_exception_consistency() OWNER TO localens_catalog_rpc_owner;
REVOKE ALL ON FUNCTION private.assert_exception_consistency() FROM PUBLIC, anon, authenticated;
CREATE CONSTRAINT TRIGGER place_exception_consistency
AFTER INSERT OR UPDATE ON public.place_opening_exceptions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.assert_exception_consistency();

CREATE OR REPLACE FUNCTION private.assert_exception_window_parent_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('localens:exception:' || NEW.exception_id::text, 0::bigint)
  );
  IF EXISTS (
    SELECT 1 FROM public.place_opening_exceptions AS exceptions
    WHERE exceptions.id = NEW.exception_id
      AND exceptions.place_id = NEW.place_id
      AND exceptions.closed
  ) THEN
    RAISE EXCEPTION 'closed exceptions cannot contain opening windows' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_exception_window_parent_open() OWNER TO localens_catalog_rpc_owner;
REVOKE ALL ON FUNCTION private.assert_exception_window_parent_open() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER place_exception_window_parent_open
BEFORE INSERT OR UPDATE ON public.place_opening_exception_windows
FOR EACH ROW EXECUTE FUNCTION private.assert_exception_window_parent_open();

CREATE OR REPLACE FUNCTION private.assert_published_place_complete(target_place_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  place_row public.places%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('localens:place:' || target_place_id::text, 0::bigint)
  );
  SELECT * INTO place_row FROM public.places WHERE id = target_place_id;
  IF NOT FOUND OR place_row.status <> 'published'::public.place_status THEN RETURN; END IF;
  IF place_row.source_url IS NULL OR place_row.source_url !~ '^https://' OR place_row.verified_at IS NULL OR place_row.attribution IS NULL OR btrim(place_row.attribution) = '' THEN
    RAISE EXCEPTION 'published place provenance is incomplete' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM public.place_translations WHERE place_id = target_place_id AND locale IN ('en'::public.locale, 'vi'::public.locale)) <> 2
     OR (SELECT count(*) FROM public.place_translations WHERE place_id = target_place_id AND locale IN ('en'::public.locale, 'vi'::public.locale) AND btrim(title) <> '' AND btrim(summary) <> '' AND btrim(description) <> '') <> 2 THEN
    RAISE EXCEPTION 'published place requires complete EN and VI translations' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.place_experience_types WHERE place_id = target_place_id)
     OR NOT EXISTS (SELECT 1 FROM public.place_guide_languages WHERE place_id = target_place_id)
     OR NOT EXISTS (SELECT 1 FROM public.place_opening_hours WHERE place_id = target_place_id) THEN
    RAISE EXCEPTION 'published place requires experience, language, and opening facts' USING ERRCODE = '23514';
  END IF;
END;
$function$;
ALTER FUNCTION private.assert_published_place_complete(uuid) OWNER TO localens_catalog_rpc_owner;
REVOKE ALL ON FUNCTION private.assert_published_place_complete(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.assert_published_place_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM private.assert_published_place_complete(OLD.place_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.place_id IS DISTINCT FROM NEW.place_id THEN
    IF OLD.place_id::text < NEW.place_id::text THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('localens:place:' || OLD.place_id::text, 0::bigint)
      );
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('localens:place:' || NEW.place_id::text, 0::bigint)
      );
    ELSE
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('localens:place:' || NEW.place_id::text, 0::bigint)
      );
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('localens:place:' || OLD.place_id::text, 0::bigint)
      );
    END IF;
    PERFORM private.assert_published_place_complete(OLD.place_id);
    PERFORM private.assert_published_place_complete(NEW.place_id);
  ELSE
    PERFORM private.assert_published_place_complete(NEW.place_id);
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_published_place_row() OWNER TO localens_catalog_rpc_owner;
REVOKE ALL ON FUNCTION private.assert_published_place_row() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.assert_published_place_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM private.assert_published_place_complete(NEW.id);
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_published_place_transition() OWNER TO localens_catalog_rpc_owner;
REVOKE ALL ON FUNCTION private.assert_published_place_transition() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER places_published_completeness
AFTER INSERT OR UPDATE OF status, source_url, verified_at, attribution ON public.places
FOR EACH ROW WHEN (NEW.status = 'published'::public.place_status)
EXECUTE FUNCTION private.assert_published_place_transition();

CREATE TRIGGER place_translations_published_completeness AFTER INSERT OR UPDATE OR DELETE ON public.place_translations FOR EACH ROW EXECUTE FUNCTION private.assert_published_place_row();
CREATE TRIGGER place_types_published_completeness AFTER INSERT OR UPDATE OR DELETE ON public.place_experience_types FOR EACH ROW EXECUTE FUNCTION private.assert_published_place_row();
CREATE TRIGGER place_languages_published_completeness AFTER INSERT OR UPDATE OR DELETE ON public.place_guide_languages FOR EACH ROW EXECUTE FUNCTION private.assert_published_place_row();
CREATE TRIGGER place_hours_published_completeness AFTER INSERT OR UPDATE OR DELETE ON public.place_opening_hours FOR EACH ROW EXECUTE FUNCTION private.assert_published_place_row();

CREATE OR REPLACE FUNCTION private.reject_append_only_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'catalog_snapshots' AND TG_OP = 'UPDATE'
     AND to_jsonb(OLD)->>'status' = 'building'
     AND to_jsonb(NEW)->>'status' = 'published'
     AND to_jsonb(NEW)->>'published_at' IS NOT NULL
     AND to_jsonb(OLD)->>'published_at' IS NULL
     AND to_jsonb(NEW)->>'id' = to_jsonb(OLD)->>'id'
     AND to_jsonb(NEW)->>'created_at' = to_jsonb(OLD)->>'created_at' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'published catalog snapshot history is append-only' USING ERRCODE = '42501';
END;
$function$;
ALTER FUNCTION private.reject_append_only_change() OWNER TO localens_catalog_guard_owner;
REVOKE ALL ON FUNCTION private.reject_append_only_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER catalog_snapshots_append_only
BEFORE UPDATE OR DELETE ON public.catalog_snapshots
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_areas_append_only
BEFORE UPDATE OR DELETE ON public.catalog_snapshot_areas
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_area_translations_append_only
BEFORE UPDATE OR DELETE ON public.catalog_snapshot_area_translations
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_places_append_only
BEFORE UPDATE OR DELETE ON public.catalog_snapshot_places
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_place_translations_append_only
BEFORE UPDATE OR DELETE ON public.catalog_snapshot_place_translations
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_place_types_append_only
BEFORE UPDATE OR DELETE ON public.catalog_snapshot_place_experience_types
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_place_languages_append_only
BEFORE UPDATE OR DELETE ON public.catalog_snapshot_place_guide_languages
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_place_supports_append_only
BEFORE UPDATE OR DELETE ON public.catalog_snapshot_place_supports
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_place_hours_append_only
BEFORE UPDATE OR DELETE ON public.catalog_snapshot_place_opening_hours
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_place_exceptions_append_only
BEFORE UPDATE OR DELETE ON public.catalog_snapshot_place_opening_exceptions
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_place_exception_windows_append_only
BEFORE UPDATE OR DELETE ON public.catalog_snapshot_place_opening_exception_windows
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();

-- Copies only complete, published current facts. Every insert and the final
-- status transition occur in this one transaction owned by the private RPC.
CREATE OR REPLACE FUNCTION private.create_catalog_snapshot()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid;
  snapshot_id uuid;
  place_row public.places%ROWTYPE;
BEGIN
  actor := NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.user_roles WHERE user_id = actor AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  -- The fixed-order SHARE ROW EXCLUSIVE locks conflict with catalog DML while
  -- continuing to allow reads. A two-session lock/copy race harness is
  -- deferred to Task 16 because Docker/Postgres is unavailable here.
  LOCK TABLE public.areas IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.area_translations IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.places IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.place_translations IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.place_experience_types IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.place_guide_languages IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.place_supports IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.place_opening_hours IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.place_opening_exceptions IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.place_opening_exception_windows IN SHARE ROW EXCLUSIVE MODE;

  snapshot_id := gen_random_uuid();
  FOR place_row IN
    SELECT * FROM public.places WHERE status = 'published'::public.place_status
  LOOP
    PERFORM private.assert_published_place_complete(place_row.id);
  END LOOP;
  INSERT INTO public.catalog_snapshots (id, status) VALUES (snapshot_id, 'building'::public.snapshot_status);

  INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug)
  SELECT snapshot_id, a.id, a.slug
  FROM public.areas AS a
  WHERE EXISTS (SELECT 1 FROM public.places AS p WHERE p.area_id = a.id AND p.status = 'published'::public.place_status);

  INSERT INTO public.catalog_snapshot_area_translations (snapshot_id, area_id, locale, name, description)
  SELECT snapshot_id, t.area_id, t.locale, t.name, t.description
  FROM public.area_translations AS t
  WHERE EXISTS (SELECT 1 FROM public.catalog_snapshot_areas AS a WHERE a.snapshot_id = snapshot_id AND a.area_id = t.area_id);

  INSERT INTO public.catalog_snapshot_places (
    snapshot_id, place_id, area_id, slug, price_vnd_per_person,
    visit_duration_minutes, source_url, verified_at, attribution
  )
  SELECT snapshot_id, p.id, p.area_id, p.slug, p.price_vnd_per_person, p.visit_duration_minutes, p.source_url, p.verified_at, p.attribution
  FROM public.places AS p
  WHERE p.status = 'published'::public.place_status;

  INSERT INTO public.catalog_snapshot_place_translations (snapshot_id, place_id, locale, title, summary, description)
  SELECT snapshot_id, t.place_id, t.locale, t.title, t.summary, t.description
  FROM public.place_translations AS t
  WHERE EXISTS (SELECT 1 FROM public.places AS p WHERE p.id = t.place_id AND p.status = 'published'::public.place_status);

  INSERT INTO public.catalog_snapshot_place_experience_types (snapshot_id, place_id, experience_type)
  SELECT snapshot_id, e.place_id, e.experience_type
  FROM public.place_experience_types AS e
  WHERE EXISTS (SELECT 1 FROM public.places AS p WHERE p.id = e.place_id AND p.status = 'published'::public.place_status);

  INSERT INTO public.catalog_snapshot_place_guide_languages (snapshot_id, place_id, language)
  SELECT snapshot_id, l.place_id, l.language
  FROM public.place_guide_languages AS l
  WHERE EXISTS (SELECT 1 FROM public.places AS p WHERE p.id = l.place_id AND p.status = 'published'::public.place_status);

  INSERT INTO public.catalog_snapshot_place_supports (snapshot_id, place_id, support_kind, requirement, status)
  SELECT snapshot_id, s.place_id, s.support_kind, s.requirement, s.status
  FROM public.place_supports AS s
  WHERE EXISTS (SELECT 1 FROM public.places AS p WHERE p.id = s.place_id AND p.status = 'published'::public.place_status);

  INSERT INTO public.catalog_snapshot_place_opening_hours (snapshot_id, place_id, opening_id, weekday, opens_at, closes_at)
  SELECT snapshot_id, h.place_id, h.id, h.weekday, h.opens_at, h.closes_at
  FROM public.place_opening_hours AS h
  WHERE EXISTS (SELECT 1 FROM public.places AS p WHERE p.id = h.place_id AND p.status = 'published'::public.place_status);

  INSERT INTO public.catalog_snapshot_place_opening_exceptions (snapshot_id, place_id, exception_id, local_date, closed)
  SELECT snapshot_id, e.place_id, e.id, e.local_date, e.closed
  FROM public.place_opening_exceptions AS e
  WHERE EXISTS (SELECT 1 FROM public.places AS p WHERE p.id = e.place_id AND p.status = 'published'::public.place_status);

  INSERT INTO public.catalog_snapshot_place_opening_exception_windows (snapshot_id, place_id, exception_id, window_id, opens_at, closes_at)
  SELECT snapshot_id, w.place_id, w.exception_id, w.id, w.opens_at, w.closes_at
  FROM public.place_opening_exception_windows AS w
  WHERE EXISTS (SELECT 1 FROM public.places AS p WHERE p.id = w.place_id AND p.status = 'published'::public.place_status);

  UPDATE public.catalog_snapshots
  SET status = 'published'::public.snapshot_status, published_at = pg_catalog.clock_timestamp()
  WHERE id = snapshot_id;
  RETURN snapshot_id;
END;
$function$;
ALTER FUNCTION private.create_catalog_snapshot() OWNER TO localens_catalog_rpc_owner;
REVOKE ALL ON FUNCTION private.create_catalog_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.create_catalog_snapshot() TO localens_admin_rpc_owner;

-- Explicit projection for PostgREST. JSON arrays/objects are built only from
-- snapshot child rows; no current mutable values are joined into history.
CREATE OR REPLACE VIEW public.catalog_snapshot_places_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  sp.snapshot_id,
  sp.place_id,
  sp.area_id,
  sp.price_vnd_per_person::text AS price_vnd_per_person,
  sp.visit_duration_minutes,
  COALESCE((SELECT jsonb_agg(e.experience_type ORDER BY e.experience_type) FROM public.catalog_snapshot_place_experience_types AS e WHERE e.snapshot_id = sp.snapshot_id AND e.place_id = sp.place_id), '[]'::jsonb) AS experience_types,
  COALESCE((SELECT jsonb_agg(l.language::text ORDER BY l.language::text) FROM public.catalog_snapshot_place_guide_languages AS l WHERE l.snapshot_id = sp.snapshot_id AND l.place_id = sp.place_id), '[]'::jsonb) AS guide_languages,
  COALESCE((SELECT jsonb_object_agg(s.requirement, s.status ORDER BY s.requirement) FROM public.catalog_snapshot_place_supports AS s WHERE s.snapshot_id = sp.snapshot_id AND s.place_id = sp.place_id AND s.support_kind = 'dietary'), '{}'::jsonb) AS dietary_support,
  COALESCE((SELECT jsonb_object_agg(s.requirement, s.status ORDER BY s.requirement) FROM public.catalog_snapshot_place_supports AS s WHERE s.snapshot_id = sp.snapshot_id AND s.place_id = sp.place_id AND s.support_kind = 'mobility'), '{}'::jsonb) AS mobility_support,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens_at', h.opens_at::text, 'closes_at', h.closes_at::text) ORDER BY h.weekday, h.opens_at) FROM public.catalog_snapshot_place_opening_hours AS h WHERE h.snapshot_id = sp.snapshot_id AND h.place_id = sp.place_id), '[]'::jsonb) AS opening_hours,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'local_date', e.local_date::text,
    'closed', e.closed,
    'windows', COALESCE((SELECT jsonb_agg(jsonb_build_object('opens_at', w.opens_at::text, 'closes_at', w.closes_at::text) ORDER BY w.opens_at) FROM public.catalog_snapshot_place_opening_exception_windows AS w WHERE w.snapshot_id = e.snapshot_id AND w.place_id = e.place_id AND w.exception_id = e.exception_id), '[]'::jsonb)
  ) ORDER BY e.local_date) FROM public.catalog_snapshot_place_opening_exceptions AS e WHERE e.snapshot_id = sp.snapshot_id AND e.place_id = sp.place_id), '[]'::jsonb) AS opening_exceptions
FROM public.catalog_snapshot_places AS sp
JOIN public.catalog_snapshots AS s ON s.id = sp.snapshot_id
WHERE s.status = 'published'::public.snapshot_status;

ALTER VIEW public.catalog_snapshot_places_v OWNER TO localens_catalog_rpc_owner;
REVOKE ALL ON public.catalog_snapshot_places_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.catalog_snapshot_places_v TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

REVOKE CREATE ON SCHEMA private FROM localens_catalog_rpc_owner, localens_catalog_guard_owner;
REVOKE CREATE ON SCHEMA public FROM localens_catalog_rpc_owner;

CREATE INDEX areas_slug_idx ON public.areas (slug);
CREATE INDEX places_status_slug_idx ON public.places (status, slug);
CREATE INDEX place_translations_locale_idx ON public.place_translations (locale, place_id);
CREATE INDEX catalog_snapshots_status_idx ON public.catalog_snapshots (status, created_at DESC);
CREATE INDEX catalog_snapshot_places_area_idx ON public.catalog_snapshot_places (snapshot_id, area_id, place_id);
CREATE INDEX catalog_snapshot_types_idx ON public.catalog_snapshot_place_experience_types (snapshot_id, experience_type, place_id);
CREATE INDEX catalog_snapshot_opening_idx ON public.catalog_snapshot_place_opening_hours (snapshot_id, place_id, weekday, opens_at);
CREATE INDEX catalog_snapshot_exception_idx ON public.catalog_snapshot_place_opening_exceptions (snapshot_id, place_id, local_date);

COMMIT;
