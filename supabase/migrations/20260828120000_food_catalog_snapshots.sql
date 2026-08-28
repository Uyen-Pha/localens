BEGIN;

-- Task 3A: canonical food facts are mutable catalog evidence.  Snapshot
-- history and public projections are added in later slices of this migration.

CREATE TABLE public.food_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL,
  slug text NOT NULL,
  status public.place_status NOT NULL DEFAULT 'draft',
  service_type text NOT NULL,
  location_note text NOT NULL,
  capacity_note text NOT NULL,
  source_url text,
  verified_at date,
  attribution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT food_vendors_place_id_fkey FOREIGN KEY (place_id)
    REFERENCES public.places(id) ON DELETE RESTRICT,
  CONSTRAINT food_vendors_slug_check CHECK (
    slug <> '' AND slug = btrim(slug) AND slug = lower(slug)
    AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  CONSTRAINT food_vendors_service_type_check CHECK (service_type IN ('stall', 'shop', 'food_court', 'street_vendor')),
  CONSTRAINT food_vendors_location_note_check CHECK (length(btrim(location_note)) BETWEEN 1 AND 500 AND location_note = btrim(location_note)),
  CONSTRAINT food_vendors_capacity_note_check CHECK (length(btrim(capacity_note)) BETWEEN 1 AND 500 AND capacity_note = btrim(capacity_note)),
  CONSTRAINT food_vendors_source_url_check CHECK (source_url IS NULL OR (source_url ~ '^https://' AND length(source_url) <= 2048)),
  CONSTRAINT food_vendors_attribution_check CHECK (attribution IS NULL OR (length(btrim(attribution)) BETWEEN 1 AND 500 AND attribution = btrim(attribution))),
  CONSTRAINT food_vendors_place_slug_unique UNIQUE (place_id, slug)
);

CREATE TABLE public.food_vendor_translations (
  food_vendor_id uuid NOT NULL,
  locale public.locale NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  CONSTRAINT food_vendor_translations_vendor_id_fkey FOREIGN KEY (food_vendor_id)
    REFERENCES public.food_vendors(id) ON DELETE RESTRICT,
  CONSTRAINT food_vendor_translations_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 240 AND title = btrim(title)),
  CONSTRAINT food_vendor_translations_description_check CHECK (length(btrim(description)) BETWEEN 1 AND 2000 AND description = btrim(description)),
  PRIMARY KEY (food_vendor_id, locale)
);

CREATE TABLE public.food_vendor_supports (
  food_vendor_id uuid NOT NULL,
  support_kind text NOT NULL,
  requirement text NOT NULL,
  status text NOT NULL,
  CONSTRAINT food_vendor_supports_vendor_id_fkey FOREIGN KEY (food_vendor_id)
    REFERENCES public.food_vendors(id) ON DELETE RESTRICT,
  CONSTRAINT food_vendor_supports_kind_check CHECK (support_kind IN ('dietary', 'mobility', 'allergen')),
  CONSTRAINT food_vendor_supports_requirement_check CHECK (length(btrim(requirement)) BETWEEN 1 AND 80 AND requirement = btrim(requirement)),
  CONSTRAINT food_vendor_supports_status_check CHECK (status IN ('supported', 'unsupported', 'unknown')),
  PRIMARY KEY (food_vendor_id, support_kind, requirement)
);

CREATE TABLE public.food_vendor_opening_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_vendor_id uuid NOT NULL,
  weekday smallint NOT NULL,
  opens_at time without time zone NOT NULL,
  closes_at time without time zone NOT NULL,
  CONSTRAINT food_vendor_opening_hours_vendor_id_fkey FOREIGN KEY (food_vendor_id)
    REFERENCES public.food_vendors(id) ON DELETE RESTRICT,
  CONSTRAINT food_vendor_opening_hours_weekday_check CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT food_vendor_opening_hours_time_check CHECK (opens_at <> closes_at),
  CONSTRAINT food_vendor_opening_hours_unique UNIQUE (food_vendor_id, weekday, opens_at, closes_at)
);

CREATE TABLE public.food_vendor_opening_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_vendor_id uuid NOT NULL,
  local_date date NOT NULL,
  closed boolean NOT NULL DEFAULT false,
  CONSTRAINT food_vendor_opening_exceptions_vendor_id_fkey FOREIGN KEY (food_vendor_id)
    REFERENCES public.food_vendors(id) ON DELETE RESTRICT,
  CONSTRAINT food_vendor_opening_exceptions_unique_date UNIQUE (food_vendor_id, local_date),
  CONSTRAINT food_vendor_opening_exceptions_id_vendor_unique UNIQUE (id, food_vendor_id)
);

CREATE TABLE public.food_vendor_opening_exception_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_vendor_id uuid NOT NULL,
  exception_id uuid NOT NULL,
  opens_at time without time zone NOT NULL,
  closes_at time without time zone NOT NULL,
  CONSTRAINT food_vendor_exception_windows_parent_fkey FOREIGN KEY (exception_id, food_vendor_id)
    REFERENCES public.food_vendor_opening_exceptions(id, food_vendor_id) ON DELETE RESTRICT,
  CONSTRAINT food_vendor_exception_windows_time_check CHECK (opens_at <> closes_at),
  CONSTRAINT food_vendor_exception_windows_unique UNIQUE (exception_id, opens_at, closes_at)
);

CREATE TABLE public.food_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_vendor_id uuid NOT NULL,
  slug text NOT NULL,
  status public.place_status NOT NULL DEFAULT 'draft',
  serving_unit text NOT NULL,
  price_vnd_min bigint NOT NULL DEFAULT 0,
  price_vnd_max bigint NOT NULL DEFAULT 0,
  portion_description text NOT NULL,
  available boolean NOT NULL DEFAULT false,
  allergens text[] NOT NULL DEFAULT '{}'::text[],
  source_url text,
  verified_at date,
  attribution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT food_items_vendor_id_fkey FOREIGN KEY (food_vendor_id)
    REFERENCES public.food_vendors(id) ON DELETE RESTRICT,
  CONSTRAINT food_items_slug_check CHECK (
    slug <> '' AND slug = btrim(slug) AND slug = lower(slug)
    AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  CONSTRAINT food_items_serving_unit_check CHECK (serving_unit IN ('portion', 'bowl', 'piece', 'drink', 'shared_set')),
  CONSTRAINT food_items_price_min_check CHECK (price_vnd_min BETWEEN 0 AND 9007199254740991),
  CONSTRAINT food_items_price_max_check CHECK (price_vnd_max BETWEEN 0 AND 9007199254740991),
  CONSTRAINT food_items_price_order_check CHECK (price_vnd_min <= price_vnd_max),
  CONSTRAINT food_items_portion_description_check CHECK (length(btrim(portion_description)) BETWEEN 1 AND 500 AND portion_description = btrim(portion_description)),
  CONSTRAINT food_items_allergens_check CHECK (
    array_position(allergens, NULL) IS NULL
    AND pg_catalog.array_to_string(allergens, E'\x1F') !~ E'(^|\x1F)[[:space:]]*(\x1F|$)'
  ),
  CONSTRAINT food_items_source_url_check CHECK (source_url IS NULL OR (source_url ~ '^https://' AND length(source_url) <= 2048)),
  CONSTRAINT food_items_attribution_check CHECK (attribution IS NULL OR (length(btrim(attribution)) BETWEEN 1 AND 500 AND attribution = btrim(attribution))),
  CONSTRAINT food_items_vendor_slug_unique UNIQUE (food_vendor_id, slug)
);

CREATE TABLE public.food_item_translations (
  food_item_id uuid NOT NULL,
  locale public.locale NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  CONSTRAINT food_item_translations_item_id_fkey FOREIGN KEY (food_item_id)
    REFERENCES public.food_items(id) ON DELETE RESTRICT,
  CONSTRAINT food_item_translations_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 240 AND title = btrim(title)),
  CONSTRAINT food_item_translations_description_check CHECK (length(btrim(description)) BETWEEN 1 AND 2000 AND description = btrim(description)),
  PRIMARY KEY (food_item_id, locale)
);

CREATE TABLE public.food_item_supports (
  food_item_id uuid NOT NULL,
  support_kind text NOT NULL,
  requirement text NOT NULL,
  status text NOT NULL,
  CONSTRAINT food_item_supports_item_id_fkey FOREIGN KEY (food_item_id)
    REFERENCES public.food_items(id) ON DELETE RESTRICT,
  CONSTRAINT food_item_supports_kind_check CHECK (support_kind IN ('dietary', 'mobility', 'allergen')),
  CONSTRAINT food_item_supports_requirement_check CHECK (length(btrim(requirement)) BETWEEN 1 AND 80 AND requirement = btrim(requirement)),
  CONSTRAINT food_item_supports_status_check CHECK (status IN ('supported', 'unsupported', 'unknown')),
  PRIMARY KEY (food_item_id, support_kind, requirement)
);

-- Every mutable food fact is forced through RLS. The browser receives no
-- direct base-table grants; the catalog RPC owner is the only writer.
ALTER TABLE public.food_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_vendors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.food_vendor_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_vendor_translations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.food_vendor_supports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_vendor_supports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.food_vendor_opening_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_vendor_opening_hours FORCE ROW LEVEL SECURITY;
ALTER TABLE public.food_vendor_opening_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_vendor_opening_exceptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.food_vendor_opening_exception_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_vendor_opening_exception_windows FORCE ROW LEVEL SECURITY;
ALTER TABLE public.food_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.food_item_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_item_translations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.food_item_supports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_item_supports FORCE ROW LEVEL SECURITY;

-- Opening and exception guards execute as the named no-login guard owner.
-- Their read policies are restricted to the three relations they inspect and
-- are not API grants.
CREATE POLICY food_vendor_opening_hours_guard_select ON public.food_vendor_opening_hours
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_vendor_opening_exceptions_guard_select ON public.food_vendor_opening_exceptions
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_vendor_opening_exception_windows_guard_select ON public.food_vendor_opening_exception_windows
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');

DO $policies$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'food_vendors', 'food_vendor_translations', 'food_vendor_supports',
    'food_vendor_opening_hours', 'food_vendor_opening_exceptions',
    'food_vendor_opening_exception_windows', 'food_items',
    'food_item_translations', 'food_item_supports'
  ]
  LOOP
    EXECUTE format('CREATE POLICY catalog_owner_all ON public.%I FOR ALL TO localens_catalog_rpc_owner USING (current_user = %L) WITH CHECK (current_user = %L)', table_name, 'localens_catalog_rpc_owner', 'localens_catalog_rpc_owner');
  END LOOP;
END
$policies$;

GRANT USAGE ON SCHEMA public, private TO localens_catalog_rpc_owner, localens_catalog_guard_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.food_vendors, public.food_vendor_translations, public.food_vendor_supports,
  public.food_vendor_opening_hours, public.food_vendor_opening_exceptions,
  public.food_vendor_opening_exception_windows, public.food_items,
  public.food_item_translations, public.food_item_supports
  TO localens_catalog_rpc_owner;
GRANT SELECT ON TABLE
  public.food_vendor_opening_hours,
  public.food_vendor_opening_exceptions,
  public.food_vendor_opening_exception_windows
  TO localens_catalog_guard_owner;
REVOKE ALL ON TABLE
  public.food_vendors, public.food_vendor_translations, public.food_vendor_supports,
  public.food_vendor_opening_hours, public.food_vendor_opening_exceptions,
  public.food_vendor_opening_exception_windows, public.food_items,
  public.food_item_translations, public.food_item_supports
  FROM PUBLIC, anon, authenticated, service_role;

-- Reuse the existing catalog timestamp helper for all mutable parent rows.
CREATE TRIGGER food_vendors_set_updated_at
BEFORE UPDATE ON public.food_vendors
FOR EACH ROW EXECUTE FUNCTION private.catalog_set_updated_at();
CREATE TRIGGER food_items_set_updated_at
BEFORE UPDATE ON public.food_items
FOR EACH ROW EXECUTE FUNCTION private.catalog_set_updated_at();

CREATE OR REPLACE FUNCTION private.assert_food_opening_window_nonoverlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.food_vendor_id IS DISTINCT FROM NEW.food_vendor_id THEN
    IF OLD.food_vendor_id::text < NEW.food_vendor_id::text THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-vendor:' || OLD.food_vendor_id::text, 0::bigint));
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-vendor:' || NEW.food_vendor_id::text, 0::bigint));
    ELSE
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-vendor:' || NEW.food_vendor_id::text, 0::bigint));
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-vendor:' || OLD.food_vendor_id::text, 0::bigint));
    END IF;
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-vendor:' || NEW.food_vendor_id::text, 0::bigint));
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.food_vendor_opening_hours AS existing
    CROSS JOIN LATERAL (
      SELECT NEW.weekday AS day,
             pg_catalog.extract(epoch FROM NEW.opens_at)::integer AS start_seconds,
             CASE WHEN NEW.closes_at > NEW.opens_at THEN pg_catalog.extract(epoch FROM NEW.closes_at)::integer ELSE 86400 END AS end_seconds
      UNION ALL
      SELECT ((NEW.weekday + 1) % 7), 0, pg_catalog.extract(epoch FROM NEW.closes_at)::integer
      WHERE NEW.closes_at < NEW.opens_at
    ) AS incoming
    CROSS JOIN LATERAL (
      SELECT existing.weekday AS day,
             pg_catalog.extract(epoch FROM existing.opens_at)::integer AS start_seconds,
             CASE WHEN existing.closes_at > existing.opens_at THEN pg_catalog.extract(epoch FROM existing.closes_at)::integer ELSE 86400 END AS end_seconds
      UNION ALL
      SELECT ((existing.weekday + 1) % 7), 0, pg_catalog.extract(epoch FROM existing.closes_at)::integer
      WHERE existing.closes_at < existing.opens_at
    ) AS stored
    WHERE existing.food_vendor_id = NEW.food_vendor_id
      AND existing.id <> NEW.id
      AND incoming.day = stored.day
      AND incoming.start_seconds < stored.end_seconds
      AND stored.start_seconds < incoming.end_seconds
  ) THEN
    RAISE EXCEPTION 'food vendor opening windows overlap, including overnight carry' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_food_opening_window_nonoverlap() OWNER TO localens_catalog_guard_owner;
REVOKE ALL ON FUNCTION private.assert_food_opening_window_nonoverlap() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER food_vendor_opening_hours_no_overlap
BEFORE INSERT OR UPDATE ON public.food_vendor_opening_hours
FOR EACH ROW EXECUTE FUNCTION private.assert_food_opening_window_nonoverlap();

CREATE OR REPLACE FUNCTION private.assert_food_exception_window_nonoverlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-exception:' || NEW.exception_id::text, 0::bigint));
  IF EXISTS (
    SELECT 1
    FROM public.food_vendor_opening_exception_windows AS existing
    CROSS JOIN LATERAL (
      SELECT pg_catalog.extract(epoch FROM NEW.opens_at)::integer AS start_seconds,
             CASE WHEN NEW.closes_at > NEW.opens_at THEN pg_catalog.extract(epoch FROM NEW.closes_at)::integer ELSE 86400 END AS end_seconds
      UNION ALL
      SELECT 0, pg_catalog.extract(epoch FROM NEW.closes_at)::integer
      WHERE NEW.closes_at < NEW.opens_at
    ) AS incoming
    CROSS JOIN LATERAL (
      SELECT pg_catalog.extract(epoch FROM existing.opens_at)::integer AS start_seconds,
             CASE WHEN existing.closes_at > existing.opens_at THEN pg_catalog.extract(epoch FROM existing.closes_at)::integer ELSE 86400 END AS end_seconds
      UNION ALL
      SELECT 0, pg_catalog.extract(epoch FROM existing.closes_at)::integer
      WHERE existing.closes_at < existing.opens_at
    ) AS stored
    WHERE existing.exception_id = NEW.exception_id
      AND existing.id <> NEW.id
      AND incoming.start_seconds < stored.end_seconds
      AND stored.start_seconds < incoming.end_seconds
  ) THEN
    RAISE EXCEPTION 'food vendor exception windows overlap, including overnight carry' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_food_exception_window_nonoverlap() OWNER TO localens_catalog_guard_owner;
REVOKE ALL ON FUNCTION private.assert_food_exception_window_nonoverlap() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER food_vendor_exception_windows_no_overlap
BEFORE INSERT OR UPDATE ON public.food_vendor_opening_exception_windows
FOR EACH ROW EXECUTE FUNCTION private.assert_food_exception_window_nonoverlap();

CREATE OR REPLACE FUNCTION private.assert_food_exception_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-exception:' || NEW.id::text, 0::bigint));
  IF NEW.closed AND EXISTS (
    SELECT 1 FROM public.food_vendor_opening_exception_windows
    WHERE exception_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'closed food vendor exceptions cannot contain opening windows' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_food_exception_consistency() OWNER TO localens_catalog_guard_owner;
REVOKE ALL ON FUNCTION private.assert_food_exception_consistency() FROM PUBLIC, anon, authenticated, service_role;
CREATE CONSTRAINT TRIGGER food_vendor_exception_consistency
AFTER INSERT OR UPDATE ON public.food_vendor_opening_exceptions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.assert_food_exception_consistency();

CREATE OR REPLACE FUNCTION private.assert_food_exception_window_parent_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-exception:' || NEW.exception_id::text, 0::bigint));
  IF EXISTS (
    SELECT 1 FROM public.food_vendor_opening_exceptions AS exceptions
    WHERE exceptions.id = NEW.exception_id
      AND exceptions.food_vendor_id = NEW.food_vendor_id
      AND exceptions.closed
  ) THEN
    RAISE EXCEPTION 'closed food vendor exceptions cannot contain opening windows' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_food_exception_window_parent_open() OWNER TO localens_catalog_guard_owner;
REVOKE ALL ON FUNCTION private.assert_food_exception_window_parent_open() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER food_vendor_exception_window_parent_open
BEFORE INSERT OR UPDATE ON public.food_vendor_opening_exception_windows
FOR EACH ROW EXECUTE FUNCTION private.assert_food_exception_window_parent_open();

CREATE INDEX food_vendors_place_status_idx ON public.food_vendors (place_id, status, slug);
CREATE INDEX food_vendor_translations_locale_idx ON public.food_vendor_translations (locale, food_vendor_id);
CREATE INDEX food_vendor_opening_idx ON public.food_vendor_opening_hours (food_vendor_id, weekday, opens_at);
CREATE INDEX food_vendor_exception_idx ON public.food_vendor_opening_exceptions (food_vendor_id, local_date);
CREATE INDEX food_items_vendor_status_idx ON public.food_items (food_vendor_id, status, available, slug);
CREATE INDEX food_item_translations_locale_idx ON public.food_item_translations (locale, food_item_id);

-- Task 3B: immutable copies of the nine food catalog relations.  Snapshot
-- identities are global within one catalog snapshot and retain the parent
-- venue/vendor keys needed by later itinerary selections.
CREATE TABLE public.catalog_snapshot_food_vendors (
  snapshot_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  place_id uuid NOT NULL,
  slug text NOT NULL,
  status public.place_status NOT NULL,
  service_type text NOT NULL,
  location_note text NOT NULL,
  capacity_note text NOT NULL,
  source_url text NOT NULL CHECK (source_url ~ '^https://' AND length(source_url) <= 2048),
  verified_at date NOT NULL,
  attribution text NOT NULL CHECK (length(btrim(attribution)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT catalog_snapshot_food_vendors_slug_check CHECK (
    slug <> '' AND slug = btrim(slug) AND slug = lower(slug)
    AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  CONSTRAINT catalog_snapshot_food_vendors_service_type_check CHECK (service_type IN ('stall', 'shop', 'food_court', 'street_vendor')),
  CONSTRAINT catalog_snapshot_food_vendors_location_note_check CHECK (length(btrim(location_note)) BETWEEN 1 AND 500 AND location_note = btrim(location_note)),
  CONSTRAINT catalog_snapshot_food_vendors_capacity_note_check CHECK (length(btrim(capacity_note)) BETWEEN 1 AND 500 AND capacity_note = btrim(capacity_note)),
  PRIMARY KEY (snapshot_id, vendor_id),
  UNIQUE (snapshot_id, place_id, vendor_id),
  FOREIGN KEY (snapshot_id) REFERENCES public.catalog_snapshots(id) ON DELETE RESTRICT,
  FOREIGN KEY (snapshot_id, place_id)
    REFERENCES public.catalog_snapshot_places(snapshot_id, place_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_food_vendor_translations (
  snapshot_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  locale public.locale NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 2000),
  PRIMARY KEY (snapshot_id, vendor_id, locale),
  FOREIGN KEY (snapshot_id, vendor_id)
    REFERENCES public.catalog_snapshot_food_vendors(snapshot_id, vendor_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_food_vendor_supports (
  snapshot_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  support_kind text NOT NULL CHECK (support_kind IN ('dietary', 'mobility', 'allergen')),
  requirement text NOT NULL CHECK (length(btrim(requirement)) BETWEEN 1 AND 80),
  status text NOT NULL CHECK (status IN ('supported', 'unsupported', 'unknown')),
  PRIMARY KEY (snapshot_id, vendor_id, support_kind, requirement),
  FOREIGN KEY (snapshot_id, vendor_id)
    REFERENCES public.catalog_snapshot_food_vendors(snapshot_id, vendor_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_food_vendor_opening_hours (
  snapshot_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  opening_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at time without time zone NOT NULL,
  closes_at time without time zone NOT NULL,
  CHECK (opens_at <> closes_at),
  PRIMARY KEY (snapshot_id, vendor_id, opening_id),
  FOREIGN KEY (snapshot_id, vendor_id)
    REFERENCES public.catalog_snapshot_food_vendors(snapshot_id, vendor_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_food_vendor_opening_exceptions (
  snapshot_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  exception_id uuid NOT NULL,
  local_date date NOT NULL,
  closed boolean NOT NULL,
  PRIMARY KEY (snapshot_id, vendor_id, exception_id),
  UNIQUE (snapshot_id, vendor_id, local_date),
  FOREIGN KEY (snapshot_id, vendor_id)
    REFERENCES public.catalog_snapshot_food_vendors(snapshot_id, vendor_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_food_vendor_opening_exception_windows (
  snapshot_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  exception_id uuid NOT NULL,
  window_id uuid NOT NULL,
  opens_at time without time zone NOT NULL,
  closes_at time without time zone NOT NULL,
  CHECK (opens_at <> closes_at),
  PRIMARY KEY (snapshot_id, vendor_id, exception_id, window_id),
  FOREIGN KEY (snapshot_id, vendor_id, exception_id)
    REFERENCES public.catalog_snapshot_food_vendor_opening_exceptions(snapshot_id, vendor_id, exception_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_food_items (
  snapshot_id uuid NOT NULL,
  item_id uuid NOT NULL,
  place_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  slug text NOT NULL,
  status public.place_status NOT NULL,
  serving_unit text NOT NULL CHECK (serving_unit IN ('portion', 'bowl', 'piece', 'drink', 'shared_set')),
  price_vnd_min bigint NOT NULL CHECK (price_vnd_min BETWEEN 0 AND 9007199254740991),
  price_vnd_max bigint NOT NULL CHECK (price_vnd_max BETWEEN 0 AND 9007199254740991),
  portion_description text NOT NULL CHECK (length(btrim(portion_description)) BETWEEN 1 AND 500),
  available boolean NOT NULL,
  allergens text[] NOT NULL,
  source_url text NOT NULL CHECK (source_url ~ '^https://' AND length(source_url) <= 2048),
  verified_at date NOT NULL,
  attribution text NOT NULL CHECK (length(btrim(attribution)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT catalog_snapshot_food_items_slug_check CHECK (
    slug <> '' AND slug = btrim(slug) AND slug = lower(slug)
    AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  CONSTRAINT catalog_snapshot_food_items_allergens_check CHECK (
    array_position(allergens, NULL) IS NULL
    AND pg_catalog.array_to_string(allergens, E'\x1F') !~ E'(^|\x1F)[[:space:]]*(\x1F|$)'
  ),
  CONSTRAINT catalog_snapshot_food_items_price_order_check CHECK (price_vnd_min <= price_vnd_max),
  PRIMARY KEY (snapshot_id, item_id),
  FOREIGN KEY (snapshot_id, place_id, vendor_id)
    REFERENCES public.catalog_snapshot_food_vendors(snapshot_id, place_id, vendor_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_food_item_translations (
  snapshot_id uuid NOT NULL,
  item_id uuid NOT NULL,
  locale public.locale NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 2000),
  PRIMARY KEY (snapshot_id, item_id, locale),
  FOREIGN KEY (snapshot_id, item_id)
    REFERENCES public.catalog_snapshot_food_items(snapshot_id, item_id) ON DELETE RESTRICT
);

CREATE TABLE public.catalog_snapshot_food_item_supports (
  snapshot_id uuid NOT NULL,
  item_id uuid NOT NULL,
  support_kind text NOT NULL CHECK (support_kind IN ('dietary', 'mobility', 'allergen')),
  requirement text NOT NULL CHECK (length(btrim(requirement)) BETWEEN 1 AND 80),
  status text NOT NULL CHECK (status IN ('supported', 'unsupported', 'unknown')),
  PRIMARY KEY (snapshot_id, item_id, support_kind, requirement),
  FOREIGN KEY (snapshot_id, item_id)
    REFERENCES public.catalog_snapshot_food_items(snapshot_id, item_id) ON DELETE RESTRICT
);

DO $snapshot_rls$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'catalog_snapshot_food_vendors', 'catalog_snapshot_food_vendor_translations',
    'catalog_snapshot_food_vendor_supports', 'catalog_snapshot_food_vendor_opening_hours',
    'catalog_snapshot_food_vendor_opening_exceptions',
    'catalog_snapshot_food_vendor_opening_exception_windows', 'catalog_snapshot_food_items',
    'catalog_snapshot_food_item_translations', 'catalog_snapshot_food_item_supports'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END
$snapshot_rls$;

-- Keep the RLS inventory explicit for static review as well as runtime.
ALTER TABLE public.catalog_snapshot_food_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_vendors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_vendor_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_vendor_translations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_vendor_supports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_vendor_supports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_vendor_opening_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_vendor_opening_hours FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_vendor_opening_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_vendor_opening_exceptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_vendor_opening_exception_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_vendor_opening_exception_windows FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_item_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_item_translations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_item_supports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_snapshot_food_item_supports FORCE ROW LEVEL SECURITY;

-- Snapshot history is writeable only by the catalog RPC owner while the
-- shared append-only guard rejects UPDATE, DELETE, and TRUNCATE.
DO $snapshot_policies$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'catalog_snapshot_food_vendors', 'catalog_snapshot_food_vendor_translations',
    'catalog_snapshot_food_vendor_supports', 'catalog_snapshot_food_vendor_opening_hours',
    'catalog_snapshot_food_vendor_opening_exceptions',
    'catalog_snapshot_food_vendor_opening_exception_windows', 'catalog_snapshot_food_items',
    'catalog_snapshot_food_item_translations', 'catalog_snapshot_food_item_supports'
  ]
  LOOP
    EXECUTE format('CREATE POLICY catalog_owner_all ON public.%I FOR ALL TO localens_catalog_rpc_owner USING (current_user = %L) WITH CHECK (current_user = %L)', table_name, 'localens_catalog_rpc_owner', 'localens_catalog_rpc_owner');
  END LOOP;
END
$snapshot_policies$;

GRANT SELECT, INSERT ON TABLE
  public.catalog_snapshot_food_vendors, public.catalog_snapshot_food_vendor_translations,
  public.catalog_snapshot_food_vendor_supports, public.catalog_snapshot_food_vendor_opening_hours,
  public.catalog_snapshot_food_vendor_opening_exceptions,
  public.catalog_snapshot_food_vendor_opening_exception_windows, public.catalog_snapshot_food_items,
  public.catalog_snapshot_food_item_translations, public.catalog_snapshot_food_item_supports
  TO localens_catalog_rpc_owner;
REVOKE ALL ON TABLE
  public.catalog_snapshot_food_vendors, public.catalog_snapshot_food_vendor_translations,
  public.catalog_snapshot_food_vendor_supports, public.catalog_snapshot_food_vendor_opening_hours,
  public.catalog_snapshot_food_vendor_opening_exceptions,
  public.catalog_snapshot_food_vendor_opening_exception_windows, public.catalog_snapshot_food_items,
  public.catalog_snapshot_food_item_translations, public.catalog_snapshot_food_item_supports
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER catalog_snapshot_food_vendors_append_only BEFORE UPDATE OR DELETE ON public.catalog_snapshot_food_vendors
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_vendor_translations_append_only BEFORE UPDATE OR DELETE ON public.catalog_snapshot_food_vendor_translations
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_vendor_supports_append_only BEFORE UPDATE OR DELETE ON public.catalog_snapshot_food_vendor_supports
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_vendor_opening_hours_append_only BEFORE UPDATE OR DELETE ON public.catalog_snapshot_food_vendor_opening_hours
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_vendor_opening_exceptions_append_only BEFORE UPDATE OR DELETE ON public.catalog_snapshot_food_vendor_opening_exceptions
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_vendor_opening_exception_windows_append_only BEFORE UPDATE OR DELETE ON public.catalog_snapshot_food_vendor_opening_exception_windows
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_items_append_only BEFORE UPDATE OR DELETE ON public.catalog_snapshot_food_items
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_item_translations_append_only BEFORE UPDATE OR DELETE ON public.catalog_snapshot_food_item_translations
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_item_supports_append_only BEFORE UPDATE OR DELETE ON public.catalog_snapshot_food_item_supports
FOR EACH ROW EXECUTE FUNCTION private.reject_append_only_change();

CREATE TRIGGER catalog_snapshot_food_vendors_append_only_truncate BEFORE TRUNCATE ON public.catalog_snapshot_food_vendors
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_vendor_translations_append_only_truncate BEFORE TRUNCATE ON public.catalog_snapshot_food_vendor_translations
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_vendor_supports_append_only_truncate BEFORE TRUNCATE ON public.catalog_snapshot_food_vendor_supports
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_vendor_opening_hours_append_only_truncate BEFORE TRUNCATE ON public.catalog_snapshot_food_vendor_opening_hours
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_vendor_opening_exceptions_append_only_truncate BEFORE TRUNCATE ON public.catalog_snapshot_food_vendor_opening_exceptions
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_vendor_opening_exception_windows_append_only_truncate BEFORE TRUNCATE ON public.catalog_snapshot_food_vendor_opening_exception_windows
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_items_append_only_truncate BEFORE TRUNCATE ON public.catalog_snapshot_food_items
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_item_translations_append_only_truncate BEFORE TRUNCATE ON public.catalog_snapshot_food_item_translations
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_food_item_supports_append_only_truncate BEFORE TRUNCATE ON public.catalog_snapshot_food_item_supports
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();

-- The original venue snapshot relations are part of the same immutable
-- history.  Add the missing statement-level protection in this forward
-- migration so a broad TRUNCATE cannot bypass the row guards.
CREATE TRIGGER catalog_snapshots_append_only_truncate
BEFORE TRUNCATE ON public.catalog_snapshots
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_areas_append_only_truncate
BEFORE TRUNCATE ON public.catalog_snapshot_areas
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_area_translations_append_only_truncate
BEFORE TRUNCATE ON public.catalog_snapshot_area_translations
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_places_append_only_truncate
BEFORE TRUNCATE ON public.catalog_snapshot_places
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_place_translations_append_only_truncate
BEFORE TRUNCATE ON public.catalog_snapshot_place_translations
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_place_types_append_only_truncate
BEFORE TRUNCATE ON public.catalog_snapshot_place_experience_types
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_place_languages_append_only_truncate
BEFORE TRUNCATE ON public.catalog_snapshot_place_guide_languages
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_place_supports_append_only_truncate
BEFORE TRUNCATE ON public.catalog_snapshot_place_supports
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_place_hours_append_only_truncate
BEFORE TRUNCATE ON public.catalog_snapshot_place_opening_hours
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_place_exceptions_append_only_truncate
BEFORE TRUNCATE ON public.catalog_snapshot_place_opening_exceptions
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();
CREATE TRIGGER catalog_snapshot_place_exception_windows_append_only_truncate
BEFORE TRUNCATE ON public.catalog_snapshot_place_opening_exception_windows
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_append_only_change();

-- Publication checks run as the named non-login guard owner.  Because every
-- catalog table is FORCE RLS, the guard receives only the narrow SELECT rows
-- required to validate a publication; it receives no write privilege.
CREATE POLICY food_vendors_guard_select ON public.food_vendors
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_vendor_translations_guard_select ON public.food_vendor_translations
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_vendor_supports_guard_select ON public.food_vendor_supports
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_items_guard_select ON public.food_items
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_item_translations_guard_select ON public.food_item_translations
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_item_supports_guard_select ON public.food_item_supports
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_vendor_completeness_place_guard_select ON public.places
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
GRANT SELECT ON TABLE
  public.places, public.food_vendors, public.food_vendor_translations,
  public.food_vendor_supports, public.food_vendor_opening_hours,
  public.food_vendor_opening_exceptions, public.food_vendor_opening_exception_windows,
  public.food_items, public.food_item_translations, public.food_item_supports
  TO localens_catalog_guard_owner;

CREATE OR REPLACE FUNCTION private.assert_published_food_item_complete(target_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  item_row public.food_items%ROWTYPE;
BEGIN
  IF target_item_id IS NULL THEN RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('localens:food-item:' || target_item_id::text, 0::bigint)
  );
  SELECT * INTO item_row FROM public.food_items WHERE id = target_item_id;
  IF NOT FOUND OR item_row.status <> 'published'::public.place_status THEN RETURN; END IF;
  IF item_row.source_url IS NULL OR item_row.source_url !~ '^https://'
     OR item_row.verified_at IS NULL OR item_row.attribution IS NULL
     OR btrim(item_row.attribution) = '' THEN
    RAISE EXCEPTION 'published food item provenance is incomplete' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM public.food_item_translations
      WHERE food_item_id = target_item_id
        AND locale IN ('en'::public.locale, 'vi'::public.locale)) <> 2
     OR (SELECT count(*) FROM public.food_item_translations
         WHERE food_item_id = target_item_id
           AND locale IN ('en'::public.locale, 'vi'::public.locale)
           AND btrim(title) <> '' AND btrim(description) <> '') <> 2 THEN
    RAISE EXCEPTION 'published food item requires complete EN and VI translations' USING ERRCODE = '23514';
  END IF;
  IF item_row.serving_unit IS NULL OR btrim(item_row.serving_unit) = ''
     OR item_row.portion_description IS NULL OR btrim(item_row.portion_description) = ''
     OR item_row.price_vnd_min NOT BETWEEN 0 AND 9007199254740991
     OR item_row.price_vnd_max NOT BETWEEN 0 AND 9007199254740991
     OR item_row.price_vnd_min > item_row.price_vnd_max THEN
    RAISE EXCEPTION 'published food item serving or price evidence is incomplete' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.food_item_supports
                 WHERE food_item_id = target_item_id AND support_kind = 'dietary')
     OR NOT EXISTS (SELECT 1 FROM public.food_item_supports
                    WHERE food_item_id = target_item_id AND support_kind = 'allergen') THEN
    RAISE EXCEPTION 'published food item requires explicit dietary and allergen evidence' USING ERRCODE = '23514';
  END IF;
END;
$function$;
ALTER FUNCTION private.assert_published_food_item_complete(uuid) OWNER TO localens_catalog_guard_owner;
REVOKE ALL ON FUNCTION private.assert_published_food_item_complete(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.assert_published_food_vendor_complete(target_vendor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  vendor_row public.food_vendors%ROWTYPE;
  item_row public.food_items%ROWTYPE;
  parent_status public.place_status;
  complete_item_found boolean := false;
BEGIN
  IF target_vendor_id IS NULL THEN RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('localens:food-vendor:' || target_vendor_id::text, 0::bigint)
  );
  SELECT * INTO vendor_row FROM public.food_vendors WHERE id = target_vendor_id;
  IF NOT FOUND OR vendor_row.status <> 'published'::public.place_status THEN RETURN; END IF;
  SELECT status INTO parent_status FROM public.places WHERE id = vendor_row.place_id;
  IF NOT FOUND OR parent_status <> 'published'::public.place_status THEN
    RAISE EXCEPTION 'published food vendor requires a published place' USING ERRCODE = '23514';
  END IF;
  IF vendor_row.source_url IS NULL OR vendor_row.source_url !~ '^https://'
     OR vendor_row.verified_at IS NULL OR vendor_row.attribution IS NULL
     OR btrim(vendor_row.attribution) = '' THEN
    RAISE EXCEPTION 'published food vendor provenance is incomplete' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM public.food_vendor_translations
      WHERE food_vendor_id = target_vendor_id
        AND locale IN ('en'::public.locale, 'vi'::public.locale)) <> 2
     OR (SELECT count(*) FROM public.food_vendor_translations
         WHERE food_vendor_id = target_vendor_id
           AND locale IN ('en'::public.locale, 'vi'::public.locale)
           AND btrim(title) <> '' AND btrim(description) <> '') <> 2 THEN
    RAISE EXCEPTION 'published food vendor requires complete EN and VI translations' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.food_vendor_opening_hours
                 WHERE food_vendor_id = target_vendor_id) THEN
    RAISE EXCEPTION 'published food vendor requires an opening window' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.food_vendor_supports
                 WHERE food_vendor_id = target_vendor_id AND support_kind = 'dietary')
     OR NOT EXISTS (SELECT 1 FROM public.food_vendor_supports
                    WHERE food_vendor_id = target_vendor_id AND support_kind = 'mobility') THEN
    RAISE EXCEPTION 'published food vendor requires explicit dietary and mobility support facts' USING ERRCODE = '23514';
  END IF;
  FOR item_row IN
    SELECT * FROM public.food_items
    WHERE food_vendor_id = target_vendor_id
      AND status = 'published'::public.place_status
      AND available = true
  LOOP
    complete_item_found := true;
    PERFORM private.assert_published_food_item_complete(item_row.id);
  END LOOP;
  IF NOT complete_item_found THEN
    RAISE EXCEPTION 'published food vendor requires a complete published available menu item' USING ERRCODE = '23514';
  END IF;
END;
$function$;
ALTER FUNCTION private.assert_published_food_vendor_complete(uuid) OWNER TO localens_catalog_guard_owner;
REVOKE ALL ON FUNCTION private.assert_published_food_vendor_complete(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.assert_published_food_vendor_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  PERFORM private.assert_published_food_vendor_complete(NEW.id);
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_published_food_vendor_transition() OWNER TO localens_catalog_guard_owner;
REVOKE ALL ON FUNCTION private.assert_published_food_vendor_transition() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.assert_published_food_item_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  PERFORM private.assert_published_food_item_complete(NEW.id);
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_published_food_item_transition() OWNER TO localens_catalog_guard_owner;
REVOKE ALL ON FUNCTION private.assert_published_food_item_transition() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.assert_published_food_vendor_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  old_vendor_id uuid;
  new_vendor_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_vendor_id := OLD.food_vendor_id;
  ELSIF TG_OP = 'UPDATE' THEN
    old_vendor_id := OLD.food_vendor_id;
    new_vendor_id := NEW.food_vendor_id;
  ELSE
    new_vendor_id := NEW.food_vendor_id;
  END IF;
  IF TG_OP = 'UPDATE' AND old_vendor_id IS DISTINCT FROM new_vendor_id THEN
    IF old_vendor_id::text < new_vendor_id::text THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-vendor:' || old_vendor_id::text, 0::bigint));
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-vendor:' || new_vendor_id::text, 0::bigint));
    ELSE
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-vendor:' || new_vendor_id::text, 0::bigint));
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-vendor:' || old_vendor_id::text, 0::bigint));
    END IF;
    PERFORM private.assert_published_food_vendor_complete(old_vendor_id);
    PERFORM private.assert_published_food_vendor_complete(new_vendor_id);
  ELSE
    PERFORM private.assert_published_food_vendor_complete(COALESCE(new_vendor_id, old_vendor_id));
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_published_food_vendor_row() OWNER TO localens_catalog_guard_owner;
REVOKE ALL ON FUNCTION private.assert_published_food_vendor_row() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.assert_published_food_item_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  old_item_id uuid;
  new_item_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_item_id := OLD.food_item_id;
  ELSIF TG_OP = 'UPDATE' THEN
    old_item_id := OLD.food_item_id;
    new_item_id := NEW.food_item_id;
  ELSE
    new_item_id := NEW.food_item_id;
  END IF;
  IF TG_OP = 'UPDATE' AND old_item_id IS DISTINCT FROM new_item_id THEN
    IF old_item_id::text < new_item_id::text THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-item:' || old_item_id::text, 0::bigint));
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-item:' || new_item_id::text, 0::bigint));
    ELSE
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-item:' || new_item_id::text, 0::bigint));
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('localens:food-item:' || old_item_id::text, 0::bigint));
    END IF;
    PERFORM private.assert_published_food_item_complete(old_item_id);
    PERFORM private.assert_published_food_item_complete(new_item_id);
  ELSE
    PERFORM private.assert_published_food_item_complete(COALESCE(new_item_id, old_item_id));
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_published_food_item_row() OWNER TO localens_catalog_guard_owner;
REVOKE ALL ON FUNCTION private.assert_published_food_item_row() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER food_vendors_published_completeness
AFTER INSERT OR UPDATE OF place_id, status, source_url, verified_at, attribution ON public.food_vendors
FOR EACH ROW WHEN (NEW.status = 'published'::public.place_status)
EXECUTE FUNCTION private.assert_published_food_vendor_transition();
CREATE TRIGGER food_items_published_completeness
AFTER INSERT OR UPDATE OF status, source_url, verified_at, attribution, serving_unit, portion_description,
  price_vnd_min, price_vnd_max ON public.food_items
FOR EACH ROW WHEN (NEW.status = 'published'::public.place_status)
EXECUTE FUNCTION private.assert_published_food_item_transition();
CREATE TRIGGER food_vendor_translations_published_completeness AFTER INSERT OR UPDATE OR DELETE ON public.food_vendor_translations
FOR EACH ROW EXECUTE FUNCTION private.assert_published_food_vendor_row();
CREATE TRIGGER food_vendor_supports_published_completeness AFTER INSERT OR UPDATE OR DELETE ON public.food_vendor_supports
FOR EACH ROW EXECUTE FUNCTION private.assert_published_food_vendor_row();
CREATE TRIGGER food_vendor_hours_published_completeness AFTER INSERT OR UPDATE OR DELETE ON public.food_vendor_opening_hours
FOR EACH ROW EXECUTE FUNCTION private.assert_published_food_vendor_row();
CREATE TRIGGER food_vendor_exceptions_published_completeness AFTER INSERT OR UPDATE OR DELETE ON public.food_vendor_opening_exceptions
FOR EACH ROW EXECUTE FUNCTION private.assert_published_food_vendor_row();
CREATE TRIGGER food_vendor_exception_windows_published_completeness AFTER INSERT OR UPDATE OR DELETE ON public.food_vendor_opening_exception_windows
FOR EACH ROW EXECUTE FUNCTION private.assert_published_food_vendor_row();
CREATE TRIGGER food_item_translations_published_completeness AFTER INSERT OR UPDATE OR DELETE ON public.food_item_translations
FOR EACH ROW EXECUTE FUNCTION private.assert_published_food_item_row();
CREATE TRIGGER food_item_supports_published_completeness AFTER INSERT OR UPDATE OR DELETE ON public.food_item_supports
FOR EACH ROW EXECUTE FUNCTION private.assert_published_food_item_row();

-- Extend the existing venue snapshot RPC forward-only.  The venue lock prefix
-- and copy statements intentionally remain byte-for-byte compatible; food
-- locks and copies follow them in deterministic parent/child order.
CREATE OR REPLACE FUNCTION private.create_catalog_snapshot()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  actor uuid;
  snapshot_id uuid;
  place_row public.places%ROWTYPE;
  vendor_row public.food_vendors%ROWTYPE;
  item_row public.food_items%ROWTYPE;
BEGIN
  actor := auth.uid();
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
  LOCK TABLE public.food_vendors IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_vendor_translations IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_vendor_supports IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_vendor_opening_hours IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_vendor_opening_exceptions IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_vendor_opening_exception_windows IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_items IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_item_translations IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_item_supports IN SHARE ROW EXCLUSIVE MODE;

  snapshot_id := gen_random_uuid();
  FOR place_row IN
    SELECT * FROM public.places WHERE status = 'published'::public.place_status
  LOOP
    PERFORM private.assert_published_place_complete(place_row.id);
  END LOOP;
  FOR vendor_row IN
    SELECT * FROM public.food_vendors WHERE status = 'published'::public.place_status
  LOOP
    PERFORM private.assert_published_food_vendor_complete(vendor_row.id);
  END LOOP;
  FOR item_row IN
    SELECT * FROM public.food_items WHERE status = 'published'::public.place_status
  LOOP
    PERFORM private.assert_published_food_item_complete(item_row.id);
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

  INSERT INTO public.catalog_snapshot_food_vendors (
    snapshot_id, vendor_id, place_id, slug, status, service_type, location_note,
    capacity_note, source_url, verified_at, attribution, created_at, updated_at
  )
  SELECT snapshot_id, v.id, v.place_id, v.slug, v.status, v.service_type, v.location_note,
    v.capacity_note, v.source_url, v.verified_at, v.attribution, v.created_at, v.updated_at
  FROM public.food_vendors AS v
  JOIN public.places AS p ON p.id = v.place_id AND p.status = 'published'::public.place_status
  WHERE v.status = 'published'::public.place_status;

  INSERT INTO public.catalog_snapshot_food_vendor_translations (snapshot_id, vendor_id, locale, title, description)
  SELECT snapshot_id, t.food_vendor_id, t.locale, t.title, t.description
  FROM public.food_vendor_translations AS t
  WHERE EXISTS (
    SELECT 1 FROM public.catalog_snapshot_food_vendors AS v
    WHERE v.snapshot_id = snapshot_id AND v.vendor_id = t.food_vendor_id
  );

  INSERT INTO public.catalog_snapshot_food_vendor_supports (snapshot_id, vendor_id, support_kind, requirement, status)
  SELECT snapshot_id, s.food_vendor_id, s.support_kind, s.requirement, s.status
  FROM public.food_vendor_supports AS s
  WHERE EXISTS (
    SELECT 1 FROM public.catalog_snapshot_food_vendors AS v
    WHERE v.snapshot_id = snapshot_id AND v.vendor_id = s.food_vendor_id
  );

  INSERT INTO public.catalog_snapshot_food_vendor_opening_hours (snapshot_id, vendor_id, opening_id, weekday, opens_at, closes_at)
  SELECT snapshot_id, h.food_vendor_id, h.id, h.weekday, h.opens_at, h.closes_at
  FROM public.food_vendor_opening_hours AS h
  WHERE EXISTS (
    SELECT 1 FROM public.catalog_snapshot_food_vendors AS v
    WHERE v.snapshot_id = snapshot_id AND v.vendor_id = h.food_vendor_id
  );

  INSERT INTO public.catalog_snapshot_food_vendor_opening_exceptions (snapshot_id, vendor_id, exception_id, local_date, closed)
  SELECT snapshot_id, e.food_vendor_id, e.id, e.local_date, e.closed
  FROM public.food_vendor_opening_exceptions AS e
  WHERE EXISTS (
    SELECT 1 FROM public.catalog_snapshot_food_vendors AS v
    WHERE v.snapshot_id = snapshot_id AND v.vendor_id = e.food_vendor_id
  );

  INSERT INTO public.catalog_snapshot_food_vendor_opening_exception_windows (
    snapshot_id, vendor_id, exception_id, window_id, opens_at, closes_at
  )
  SELECT snapshot_id, w.food_vendor_id, w.exception_id, w.id, w.opens_at, w.closes_at
  FROM public.food_vendor_opening_exception_windows AS w
  WHERE EXISTS (
    SELECT 1 FROM public.catalog_snapshot_food_vendor_opening_exceptions AS e
    WHERE e.snapshot_id = snapshot_id AND e.vendor_id = w.food_vendor_id AND e.exception_id = w.exception_id
  );

  INSERT INTO public.catalog_snapshot_food_items (
    snapshot_id, item_id, place_id, vendor_id, slug, status, serving_unit,
    price_vnd_min, price_vnd_max, portion_description, available, allergens,
    source_url, verified_at, attribution, created_at, updated_at
  )
  SELECT snapshot_id, i.id, i_vendor.place_id, i.food_vendor_id, i.slug, i.status, i.serving_unit,
    i.price_vnd_min, i.price_vnd_max, i.portion_description, i.available, i.allergens,
    i.source_url, i.verified_at, i.attribution, i.created_at, i.updated_at
  FROM public.food_items AS i
  JOIN public.catalog_snapshot_food_vendors AS i_vendor
    ON i_vendor.snapshot_id = snapshot_id AND i_vendor.vendor_id = i.food_vendor_id
  WHERE i.status = 'published'::public.place_status
    AND i.available = true;

  INSERT INTO public.catalog_snapshot_food_item_translations (snapshot_id, item_id, locale, title, description)
  SELECT snapshot_id, t.food_item_id, t.locale, t.title, t.description
  FROM public.food_item_translations AS t
  WHERE EXISTS (
    SELECT 1 FROM public.catalog_snapshot_food_items AS i
    WHERE i.snapshot_id = snapshot_id AND i.item_id = t.food_item_id
  );

  INSERT INTO public.catalog_snapshot_food_item_supports (snapshot_id, item_id, support_kind, requirement, status)
  SELECT snapshot_id, s.food_item_id, s.support_kind, s.requirement, s.status
  FROM public.food_item_supports AS s
  WHERE EXISTS (
    SELECT 1 FROM public.catalog_snapshot_food_items AS i
    WHERE i.snapshot_id = snapshot_id AND i.item_id = s.food_item_id
  );

  UPDATE public.catalog_snapshots
  SET status = 'published'::public.snapshot_status, published_at = pg_catalog.clock_timestamp()
  WHERE id = snapshot_id;
  RETURN snapshot_id;
END;
$function$;
ALTER FUNCTION private.create_catalog_snapshot() OWNER TO localens_catalog_rpc_owner;
REVOKE ALL ON FUNCTION private.create_catalog_snapshot() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.create_catalog_snapshot() TO localens_admin_rpc_owner;

COMMIT;
