BEGIN;

-- Current travel facts are mutable admin-owned data.  Travel snapshots and FX
-- rows are immutable facts consumed by the deterministic itinerary engine.
CREATE TABLE public.travel_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE RESTRICT,
  to_place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('walk', 'taxi', 'public_transport')),
  minutes smallint NOT NULL CHECK (minutes BETWEEN 1 AND 240),
  group_cost_vnd bigint NOT NULL CHECK (group_cost_vnd BETWEEN 0 AND 1125899906842623),
  verified_at timestamptz NOT NULL,
  CHECK (from_place_id <> to_place_id),
  UNIQUE (from_place_id, to_place_id)
);

CREATE TABLE public.travel_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_snapshot_id uuid NOT NULL REFERENCES public.catalog_snapshots(id) ON DELETE RESTRICT,
  status public.snapshot_status NOT NULL DEFAULT 'building',
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CHECK ((status = 'published' AND published_at IS NOT NULL) OR (status <> 'published' AND published_at IS NULL)),
  UNIQUE (id, catalog_snapshot_id)
);

CREATE TABLE public.travel_snapshot_edges (
  snapshot_id uuid NOT NULL,
  catalog_snapshot_id uuid NOT NULL,
  -- Provenance identity is retained for audit, but current mutable edges are
  -- intentionally not FK parents of immutable history.
  source_edge_id uuid NOT NULL,
  from_place_id uuid NOT NULL,
  to_place_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('walk', 'taxi', 'public_transport')),
  minutes smallint NOT NULL CHECK (minutes BETWEEN 1 AND 240),
  group_cost_vnd bigint NOT NULL CHECK (group_cost_vnd BETWEEN 0 AND 1125899906842623),
  verified_at timestamptz NOT NULL,
  PRIMARY KEY (snapshot_id, source_edge_id),
  UNIQUE (snapshot_id, from_place_id, to_place_id),
  CHECK (from_place_id <> to_place_id),
  FOREIGN KEY (snapshot_id, catalog_snapshot_id)
    REFERENCES public.travel_snapshots(id, catalog_snapshot_id) ON DELETE RESTRICT,
  FOREIGN KEY (catalog_snapshot_id, from_place_id)
    REFERENCES public.catalog_snapshot_places(snapshot_id, place_id) ON DELETE RESTRICT,
  FOREIGN KEY (catalog_snapshot_id, to_place_id)
    REFERENCES public.catalog_snapshot_places(snapshot_id, place_id) ON DELETE RESTRICT
);

CREATE TABLE public.fx_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vnd_per_usd numeric(20,8) NOT NULL CHECK (vnd_per_usd > 0),
  source text NOT NULL CHECK (length(btrim(source)) BETWEEN 1 AND 240),
  observed_at timestamptz NOT NULL,
  environment text NOT NULL CHECK (environment IN ('demo', 'production')),
  is_demo boolean NOT NULL,
  CHECK (is_demo = (environment = 'demo'))
);

-- Every public base table is protected.  API consumers use only the two
-- explicit projections below; direct stateful reads and writes are denied.
ALTER TABLE public.travel_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_edges FORCE ROW LEVEL SECURITY;
ALTER TABLE public.travel_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.travel_snapshot_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_snapshot_edges FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fx_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY travel_edges_catalog_owner_all ON public.travel_edges
  FOR ALL TO localens_catalog_rpc_owner
  USING (true)
  WITH CHECK (true);
CREATE POLICY travel_snapshots_catalog_owner_all ON public.travel_snapshots
  FOR ALL TO localens_catalog_rpc_owner
  USING (true)
  WITH CHECK (true);
CREATE POLICY travel_snapshot_edges_catalog_owner_all ON public.travel_snapshot_edges
  FOR ALL TO localens_catalog_rpc_owner
  USING (true)
  WITH CHECK (true);
CREATE POLICY fx_snapshots_catalog_owner_all ON public.fx_snapshots
  FOR ALL TO localens_catalog_rpc_owner
  USING (true)
  WITH CHECK (true);
CREATE POLICY travel_snapshots_guard_select ON public.travel_snapshots
  FOR SELECT TO localens_catalog_guard_owner USING (true);
CREATE POLICY catalog_snapshots_guard_select ON public.catalog_snapshots
  FOR SELECT TO localens_catalog_guard_owner USING (true);

GRANT USAGE ON SCHEMA public, private TO localens_catalog_rpc_owner;
GRANT CREATE ON SCHEMA private TO localens_catalog_rpc_owner, localens_catalog_guard_owner;
GRANT CREATE ON SCHEMA public TO localens_catalog_rpc_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.travel_edges TO localens_catalog_rpc_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE public.travel_snapshots TO localens_catalog_rpc_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE public.travel_snapshot_edges TO localens_catalog_rpc_owner;
GRANT SELECT, INSERT ON TABLE public.fx_snapshots TO localens_catalog_rpc_owner;
GRANT USAGE ON SCHEMA public TO localens_catalog_guard_owner;
GRANT SELECT ON TABLE public.catalog_snapshots, public.travel_snapshots TO localens_catalog_guard_owner;

REVOKE ALL ON TABLE
  public.travel_edges,
  public.travel_snapshots,
  public.travel_snapshot_edges,
  public.fx_snapshots
FROM PUBLIC, anon, authenticated;

-- History can only make the single building -> published transition.  All
-- child facts and FX observations are append-only for every other operation.
CREATE OR REPLACE FUNCTION private.reject_travel_fx_append_only_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'travel_snapshots' AND TG_OP = 'UPDATE'
     AND to_jsonb(OLD)->>'status' = 'building'
     AND to_jsonb(NEW)->>'status' = 'published'
     AND to_jsonb(OLD)->>'id' = to_jsonb(NEW)->>'id'
     AND to_jsonb(OLD)->>'catalog_snapshot_id' = to_jsonb(NEW)->>'catalog_snapshot_id'
     AND to_jsonb(OLD)->>'created_at' = to_jsonb(NEW)->>'created_at'
     AND to_jsonb(OLD)->>'published_at' IS NULL
     AND to_jsonb(NEW)->>'published_at' IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'travel and FX snapshot history is append-only' USING ERRCODE = '42501';
END;
$function$;
ALTER FUNCTION private.reject_travel_fx_append_only_change() OWNER TO localens_catalog_guard_owner;
REVOKE ALL ON FUNCTION private.reject_travel_fx_append_only_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER travel_snapshots_append_only
BEFORE UPDATE OR DELETE ON public.travel_snapshots
FOR EACH ROW EXECUTE FUNCTION private.reject_travel_fx_append_only_change();
CREATE TRIGGER travel_snapshot_edges_append_only
BEFORE UPDATE OR DELETE ON public.travel_snapshot_edges
FOR EACH ROW EXECUTE FUNCTION private.reject_travel_fx_append_only_change();
CREATE TRIGGER fx_snapshots_append_only
BEFORE UPDATE OR DELETE ON public.fx_snapshots
FOR EACH ROW EXECUTE FUNCTION private.reject_travel_fx_append_only_change();

-- Published parent rows and their children cannot be injected directly.  The
-- only authorized publication path is the transaction that inserts a
-- building snapshot, copies all children, and performs the guarded transition.
CREATE OR REPLACE FUNCTION private.reject_published_snapshot_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  parent_status public.snapshot_status;
BEGIN
  IF TG_TABLE_NAME = 'travel_snapshots' THEN
    IF NEW.status <> 'building'::public.snapshot_status OR NEW.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'travel snapshots must be inserted as building' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'catalog_snapshots' THEN
    IF NEW.status <> 'building'::public.snapshot_status OR NEW.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'catalog snapshots must be inserted as building' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'travel_snapshot_edges' THEN
    SELECT status INTO parent_status
    FROM public.travel_snapshots
    WHERE id = NEW.snapshot_id
    FOR SHARE;
  ELSE
    SELECT status INTO parent_status
    FROM public.catalog_snapshots
    WHERE id = NEW.snapshot_id
    FOR SHARE;
  END IF;
  IF parent_status = 'published'::public.snapshot_status THEN
    RAISE EXCEPTION 'published snapshot children are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.reject_published_snapshot_insert() OWNER TO localens_catalog_guard_owner;
REVOKE ALL ON FUNCTION private.reject_published_snapshot_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER travel_snapshots_building_insert_guard
BEFORE INSERT ON public.travel_snapshots
FOR EACH ROW EXECUTE FUNCTION private.reject_published_snapshot_insert();
CREATE TRIGGER travel_snapshot_edges_building_insert_guard
BEFORE INSERT ON public.travel_snapshot_edges
FOR EACH ROW EXECUTE FUNCTION private.reject_published_snapshot_insert();
CREATE TRIGGER catalog_snapshots_building_insert_guard
BEFORE INSERT ON public.catalog_snapshots
FOR EACH ROW EXECUTE FUNCTION private.reject_published_snapshot_insert();
CREATE TRIGGER catalog_snapshot_areas_building_insert_guard
BEFORE INSERT ON public.catalog_snapshot_areas
FOR EACH ROW EXECUTE FUNCTION private.reject_published_snapshot_insert();
CREATE TRIGGER catalog_snapshot_area_translations_building_insert_guard
BEFORE INSERT ON public.catalog_snapshot_area_translations
FOR EACH ROW EXECUTE FUNCTION private.reject_published_snapshot_insert();
CREATE TRIGGER catalog_snapshot_places_building_insert_guard
BEFORE INSERT ON public.catalog_snapshot_places
FOR EACH ROW EXECUTE FUNCTION private.reject_published_snapshot_insert();
CREATE TRIGGER catalog_snapshot_place_translations_building_insert_guard
BEFORE INSERT ON public.catalog_snapshot_place_translations
FOR EACH ROW EXECUTE FUNCTION private.reject_published_snapshot_insert();
CREATE TRIGGER catalog_snapshot_place_experience_types_building_insert_guard
BEFORE INSERT ON public.catalog_snapshot_place_experience_types
FOR EACH ROW EXECUTE FUNCTION private.reject_published_snapshot_insert();
CREATE TRIGGER catalog_snapshot_place_guide_languages_building_insert_guard
BEFORE INSERT ON public.catalog_snapshot_place_guide_languages
FOR EACH ROW EXECUTE FUNCTION private.reject_published_snapshot_insert();
CREATE TRIGGER catalog_snapshot_place_supports_building_insert_guard
BEFORE INSERT ON public.catalog_snapshot_place_supports
FOR EACH ROW EXECUTE FUNCTION private.reject_published_snapshot_insert();
CREATE TRIGGER catalog_snapshot_place_opening_hours_building_insert_guard
BEFORE INSERT ON public.catalog_snapshot_place_opening_hours
FOR EACH ROW EXECUTE FUNCTION private.reject_published_snapshot_insert();
CREATE TRIGGER catalog_snapshot_place_opening_exceptions_building_insert_guard
BEFORE INSERT ON public.catalog_snapshot_place_opening_exceptions
FOR EACH ROW EXECUTE FUNCTION private.reject_published_snapshot_insert();
CREATE TRIGGER catalog_snapshot_place_opening_exception_windows_building_insert_guard
BEFORE INSERT ON public.catalog_snapshot_place_opening_exception_windows
FOR EACH ROW EXECUTE FUNCTION private.reject_published_snapshot_insert();

-- Copy canonical travel facts and the latest published catalog membership in a
-- single transaction.  The source lock order starts with the exact Task 3
-- catalog order, then takes the travel source lock, preventing a catalog and
-- travel snapshot creator from observing a half-published source graph.
CREATE OR REPLACE FUNCTION private.create_travel_snapshot()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid;
  catalog_id uuid;
  snapshot_id uuid;
BEGIN
  actor := NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM private.user_roles
    WHERE user_id = actor
      AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

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
  LOCK TABLE public.travel_edges IN SHARE ROW EXCLUSIVE MODE;

  SELECT id
  INTO catalog_id
  FROM public.catalog_snapshots
  WHERE status = 'published'::public.snapshot_status
  ORDER BY published_at DESC, id DESC
  LIMIT 1;
  IF catalog_id IS NULL THEN
    RAISE EXCEPTION 'published catalog snapshot required' USING ERRCODE = '23514';
  END IF;

  snapshot_id := gen_random_uuid();
  INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status)
  VALUES (snapshot_id, catalog_id, 'building'::public.snapshot_status);

  INSERT INTO public.travel_snapshot_edges (
    snapshot_id,
    catalog_snapshot_id,
    source_edge_id,
    from_place_id,
    to_place_id,
    mode,
    minutes,
    group_cost_vnd,
    verified_at
  )
  SELECT
    snapshot_id,
    catalog_id,
    e.id,
    e.from_place_id,
    e.to_place_id,
    e.mode,
    e.minutes,
    e.group_cost_vnd,
    e.verified_at
  FROM public.travel_edges AS e
  WHERE EXISTS (
    SELECT 1
    FROM public.catalog_snapshot_places AS from_membership
    WHERE from_membership.snapshot_id = catalog_id
      AND from_membership.place_id = e.from_place_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.catalog_snapshot_places AS to_membership
    WHERE to_membership.snapshot_id = catalog_id
      AND to_membership.place_id = e.to_place_id
  );

  UPDATE public.travel_snapshots
  SET status = 'published'::public.snapshot_status,
      published_at = pg_catalog.clock_timestamp()
  WHERE id = snapshot_id;
  RETURN snapshot_id;
END;
$function$;
ALTER FUNCTION private.create_travel_snapshot() OWNER TO localens_catalog_rpc_owner;
SET LOCAL ROLE localens_catalog_rpc_owner;
REVOKE ALL ON FUNCTION private.create_travel_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.create_travel_snapshot() TO localens_admin_rpc_owner;
SET LOCAL ROLE postgres;

-- FX observations are inserted through the same authenticated admin boundary;
-- the table checks remain authoritative for decimal, environment, and demo
-- consistency even when this function is called by an internal role.
CREATE OR REPLACE FUNCTION private.create_fx_snapshot(
  p_vnd_per_usd numeric,
  p_source text,
  p_observed_at timestamptz,
  p_environment text,
  p_is_demo boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid;
  snapshot_id uuid;
BEGIN
  actor := NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM private.user_roles
    WHERE user_id = actor
      AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.fx_snapshots (vnd_per_usd, source, observed_at, environment, is_demo)
  VALUES (p_vnd_per_usd, p_source, p_observed_at, p_environment, p_is_demo)
  RETURNING id INTO snapshot_id;
  RETURN snapshot_id;
END;
$function$;
ALTER FUNCTION private.create_fx_snapshot(numeric, text, timestamptz, text, boolean) OWNER TO localens_catalog_rpc_owner;
SET LOCAL ROLE localens_catalog_rpc_owner;
REVOKE ALL ON FUNCTION private.create_fx_snapshot(numeric, text, timestamptz, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.create_fx_snapshot(numeric, text, timestamptz, text, boolean) TO localens_admin_rpc_owner;
SET LOCAL ROLE postgres;

-- PostgREST receives only these explicit named projections.  Decimal money and
-- numeric FX are text, while timestamps are canonical UTC ISO strings.
CREATE OR REPLACE VIEW public.travel_snapshot_edges_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  e.snapshot_id,
  e.catalog_snapshot_id,
  e.from_place_id,
  e.to_place_id,
  e.mode,
  e.minutes,
  e.group_cost_vnd::text AS group_cost_vnd,
  pg_catalog.to_char(e.verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS verified_at
FROM public.travel_snapshot_edges AS e
JOIN public.travel_snapshots AS s
  ON s.id = e.snapshot_id
 AND s.catalog_snapshot_id = e.catalog_snapshot_id
WHERE s.status = 'published'::public.snapshot_status;

ALTER VIEW public.travel_snapshot_edges_v OWNER TO localens_catalog_rpc_owner;
REVOKE ALL ON public.travel_snapshot_edges_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.travel_snapshot_edges_v TO anon, authenticated;

CREATE OR REPLACE VIEW public.latest_fx_snapshot_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  f.id,
  f.vnd_per_usd::text AS vnd_per_usd,
  f.source,
  pg_catalog.to_char(f.observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS observed_at,
  f.environment,
  f.is_demo
FROM public.fx_snapshots AS f
WHERE f.observed_at >= pg_catalog.now() - INTERVAL '7 days'
  AND f.observed_at <= pg_catalog.now()
ORDER BY f.observed_at DESC, f.id DESC
LIMIT 1;

ALTER VIEW public.latest_fx_snapshot_v OWNER TO localens_catalog_rpc_owner;
REVOKE ALL ON public.latest_fx_snapshot_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.latest_fx_snapshot_v TO anon, authenticated;

REVOKE CREATE ON SCHEMA private FROM localens_catalog_rpc_owner, localens_catalog_guard_owner;
REVOKE CREATE ON SCHEMA public FROM localens_catalog_rpc_owner;

CREATE INDEX travel_edges_from_idx ON public.travel_edges (from_place_id, to_place_id);
CREATE INDEX travel_snapshots_catalog_idx ON public.travel_snapshots (catalog_snapshot_id, status, published_at DESC);
CREATE INDEX travel_snapshot_edges_from_idx ON public.travel_snapshot_edges (snapshot_id, from_place_id, to_place_id);
CREATE INDEX fx_snapshots_observed_idx ON public.fx_snapshots (observed_at DESC, id DESC);

COMMIT;
