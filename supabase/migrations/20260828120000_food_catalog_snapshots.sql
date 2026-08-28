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

-- Guard functions execute as the named no-login guard owner. Their read
-- policies are restricted to that owner and are not API grants.
CREATE POLICY food_vendors_guard_select ON public.food_vendors
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_vendor_translations_guard_select ON public.food_vendor_translations
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_vendor_supports_guard_select ON public.food_vendor_supports
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_vendor_opening_hours_guard_select ON public.food_vendor_opening_hours
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_vendor_opening_exceptions_guard_select ON public.food_vendor_opening_exceptions
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_vendor_opening_exception_windows_guard_select ON public.food_vendor_opening_exception_windows
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_items_guard_select ON public.food_items
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_item_translations_guard_select ON public.food_item_translations
  FOR SELECT TO localens_catalog_guard_owner USING (current_user = 'localens_catalog_guard_owner');
CREATE POLICY food_item_supports_guard_select ON public.food_item_supports
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
  public.food_vendors, public.food_vendor_translations, public.food_vendor_supports,
  public.food_vendor_opening_hours, public.food_vendor_opening_exceptions,
  public.food_vendor_opening_exception_windows, public.food_items,
  public.food_item_translations, public.food_item_supports
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

COMMIT;
