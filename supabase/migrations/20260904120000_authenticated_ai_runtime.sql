BEGIN;

-- The public quota wrapper needs a NOLOGIN definer that can execute only the
-- existing quota helper.  It deliberately owns no quota table privileges.
DO $roles$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'localens_ai_quota_rpc_owner'
  ) THEN
    CREATE ROLE localens_ai_quota_rpc_owner
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
      NOREPLICATION NOLOGIN NOBYPASSRLS;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'localens_ai_quota_rpc_owner'
      AND (
        rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit
        OR rolcanlogin OR rolreplication OR rolbypassrls
      )
  ) THEN
    RAISE EXCEPTION 'unsafe pre-existing LocalLens AI quota owner role attributes';
  END IF;
END
$roles$;

DO $memberships$
DECLARE
  membership_record record;
BEGIN
  FOR membership_record IN
    SELECT parent_role.rolname AS parent_name,
           member_role.rolname AS member_name
    FROM pg_catalog.pg_auth_members AS memberships
    JOIN pg_catalog.pg_roles AS parent_role
      ON parent_role.oid = memberships.roleid
    JOIN pg_catalog.pg_roles AS member_role
      ON member_role.oid = memberships.member
    WHERE (
      parent_role.rolname = 'localens_ai_quota_rpc_owner'
      OR member_role.rolname = 'localens_ai_quota_rpc_owner'
    )
      AND NOT (
        parent_role.rolname = 'localens_ai_quota_rpc_owner'
        AND member_role.rolname = 'postgres'
        AND memberships.set_option
        AND NOT memberships.inherit_option
      )
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE %I FROM %I',
      membership_record.parent_name,
      membership_record.member_name
    );
  END LOOP;
END
$memberships$;

GRANT localens_ai_quota_rpc_owner TO postgres WITH SET TRUE, INHERIT FALSE;
REVOKE ALL ON SCHEMA public, private, auth FROM localens_ai_quota_rpc_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA public, private, auth FROM localens_ai_quota_rpc_owner;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, private, auth FROM localens_ai_quota_rpc_owner;
GRANT USAGE ON SCHEMA private TO localens_ai_quota_rpc_owner;
SET LOCAL ROLE localens_quota_rpc_owner;
GRANT EXECUTE ON FUNCTION private.reserve_quota(uuid, text, text, text)
  TO localens_ai_quota_rpc_owner;
RESET ROLE;

-- The Edge itinerary runtime reads immutable published facts through three
-- narrow projections.  The existing catalog projection owner has only the
-- base-table reads required to define them.
GRANT CREATE ON SCHEMA public TO localens_catalog_rpc_owner;
SET LOCAL ROLE localens_catalog_rpc_owner;

CREATE OR REPLACE VIEW public.current_itinerary_snapshot_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  current_travel.travel_snapshot_id,
  current_travel.catalog_snapshot_id,
  pg_catalog.to_char(
    current_travel.travel_published_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) AS travel_published_at,
  current_fx.fx_snapshot_id,
  current_fx.fx_vnd_per_usd,
  current_fx.fx_source,
  current_fx.fx_observed_at,
  current_fx.fx_environment,
  current_fx.fx_is_demo
FROM (
  SELECT
    travel.id AS travel_snapshot_id,
    travel.catalog_snapshot_id,
    travel.published_at AS travel_published_at
  FROM public.travel_snapshots AS travel
  JOIN public.catalog_snapshots AS catalog
    ON catalog.id = travel.catalog_snapshot_id
  WHERE travel.status = 'published'::public.snapshot_status
    AND catalog.status = 'published'::public.snapshot_status
  ORDER BY travel.published_at DESC, travel.id DESC
  LIMIT 1
) AS current_travel
LEFT JOIN LATERAL (
  SELECT
    fx.id AS fx_snapshot_id,
    fx.vnd_per_usd::text AS fx_vnd_per_usd,
    fx.source AS fx_source,
    pg_catalog.to_char(
      fx.observed_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ) AS fx_observed_at,
    fx.environment AS fx_environment,
    fx.is_demo AS fx_is_demo
  FROM public.fx_snapshots AS fx
  WHERE fx.environment = 'production'
    AND fx.is_demo IS FALSE
    AND fx.observed_at >= pg_catalog.now() - INTERVAL '7 days'
    AND fx.observed_at <= pg_catalog.now()
  ORDER BY fx.observed_at DESC, fx.id DESC
  LIMIT 1
) AS current_fx ON true;
ALTER VIEW public.current_itinerary_snapshot_v OWNER TO localens_catalog_rpc_owner;

CREATE OR REPLACE VIEW public.catalog_snapshot_areas_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  areas.snapshot_id,
  areas.area_id,
  areas.slug
FROM public.catalog_snapshot_areas AS areas
JOIN public.catalog_snapshots AS snapshots
  ON snapshots.id = areas.snapshot_id
WHERE snapshots.status = 'published'::public.snapshot_status;
ALTER VIEW public.catalog_snapshot_areas_v OWNER TO localens_catalog_rpc_owner;

CREATE OR REPLACE VIEW public.catalog_snapshot_place_display_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  translations.snapshot_id,
  translations.place_id,
  translations.locale,
  translations.title,
  translations.summary
FROM public.catalog_snapshot_place_translations AS translations
JOIN public.catalog_snapshots AS snapshots
  ON snapshots.id = translations.snapshot_id
WHERE snapshots.status = 'published'::public.snapshot_status;
ALTER VIEW public.catalog_snapshot_place_display_v OWNER TO localens_catalog_rpc_owner;

REVOKE ALL ON public.current_itinerary_snapshot_v,
  public.catalog_snapshot_areas_v,
  public.catalog_snapshot_place_display_v
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.current_itinerary_snapshot_v,
  public.catalog_snapshot_areas_v,
  public.catalog_snapshot_place_display_v
TO anon, authenticated, service_role;

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM localens_catalog_rpc_owner;

-- A server-generated UUID is part of the revision fingerprint, so the first
-- authenticated write accepts that UUID but derives ownership exclusively from
-- verified JWT claims.  The advisory lock makes absent-row creation and exact
-- retries one serial operation.
GRANT CREATE ON SCHEMA public TO localens_plan_rpc_owner;
SET LOCAL ROLE localens_plan_rpc_owner;

CREATE OR REPLACE FUNCTION public.create_authenticated_trip_plan(
  p_plan_id uuid,
  persistence_dto jsonb
)
RETURNS TABLE (plan_id uuid, revision_no integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  actor_user_id uuid;
  existing_owner_user_id uuid;
  existing_revision_no integer;
  existing_fingerprint text;
  persisted_revision_no integer;
BEGIN
  IF p_plan_id IS NULL THEN
    RAISE EXCEPTION 'invalid plan id' USING ERRCODE = '22023';
  END IF;

  actor_user_id := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(
      NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      'sub'
    )
  )::uuid;
  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM private.user_roles AS roles
    WHERE roles.user_id = actor_user_id
      AND roles.role = 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION 'customer role required' USING ERRCODE = '42501';
  END IF;

  -- Normalize the dotted claim only after the database-owned role check. This
  -- keeps existing owner RLS reads usable across PostgREST claim formats.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', actor_user_id::text, true);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_plan_id::text, 0)
  );

  SELECT
    plans.owner_user_id,
    plans.latest_revision_no,
    revisions.fingerprint
  INTO
    existing_owner_user_id,
    existing_revision_no,
    existing_fingerprint
  FROM public.trip_plans AS plans
  LEFT JOIN public.trip_plan_revisions AS revisions
    ON revisions.plan_id = plans.id
   AND revisions.revision_no = 1
  WHERE plans.id = p_plan_id
  FOR UPDATE OF plans;

  IF FOUND THEN
    IF existing_owner_user_id IS DISTINCT FROM actor_user_id
       OR existing_revision_no IS DISTINCT FROM 1
       OR existing_fingerprint IS DISTINCT FROM persistence_dto->>'fingerprint' THEN
      RAISE EXCEPTION 'PLAN_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    plan_id := p_plan_id;
    revision_no := 1;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.trip_plans (id, owner_user_id)
  VALUES (p_plan_id, actor_user_id);

  SELECT persisted.revision_no
  INTO persisted_revision_no
  FROM private.persist_trip_plan_revision(
    p_plan_id,
    0,
    persistence_dto,
    actor_user_id,
    NULL::uuid,
    NULL::text,
    NULL::smallint
  ) AS persisted;

  IF persisted_revision_no IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'initial revision must be one' USING ERRCODE = '23514';
  END IF;

  plan_id := p_plan_id;
  revision_no := persisted_revision_no;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION public.create_authenticated_trip_plan(uuid, jsonb)
  OWNER TO localens_plan_rpc_owner;

REVOKE ALL ON FUNCTION public.create_authenticated_trip_plan(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_authenticated_trip_plan(uuid, jsonb)
  TO authenticated;

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM localens_plan_rpc_owner;

-- The service-role endpoint delegates to the existing quota authority through
-- its no-table-access executor.  Failed provider attempts remain consumed by
-- the immutable reservation written by private.reserve_quota.
GRANT USAGE, CREATE ON SCHEMA public TO localens_ai_quota_rpc_owner;
SET LOCAL ROLE localens_ai_quota_rpc_owner;

CREATE OR REPLACE FUNCTION public.reserve_ai_quota(
  p_reservation_id uuid,
  p_kind text,
  p_ip_hash text,
  p_device_hash text
)
RETURNS TABLE (
  reservation_id uuid,
  kind text,
  bucket_hashes text[],
  period_start timestamptz,
  state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('planner', 'gemini') THEN
    RAISE EXCEPTION 'invalid quota reservation' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT reserved.reservation_id,
         reserved.kind,
         reserved.bucket_hashes,
         reserved.period_start,
         reserved.state
  FROM private.reserve_quota(
    p_reservation_id,
    p_kind,
    p_ip_hash,
    p_device_hash
  ) AS reserved;
END;
$function$;
ALTER FUNCTION public.reserve_ai_quota(uuid, text, text, text)
  OWNER TO localens_ai_quota_rpc_owner;

REVOKE ALL ON FUNCTION public.reserve_ai_quota(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ai_quota(uuid, text, text, text)
  TO service_role;

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM localens_ai_quota_rpc_owner;

COMMIT;
