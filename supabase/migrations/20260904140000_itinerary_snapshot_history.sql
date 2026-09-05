BEGIN;

-- Refinement must reconstruct the exact immutable snapshot used by an older
-- revision without granting the Edge service credential broad base-table
-- reads. These authenticated-only views expose only the metadata required to
-- bind the existing public catalog and travel projections.
GRANT CREATE ON SCHEMA public TO localens_catalog_rpc_owner;
SET LOCAL ROLE localens_catalog_rpc_owner;

CREATE VIEW public.itinerary_travel_snapshot_history_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  travel.id AS travel_snapshot_id,
  travel.catalog_snapshot_id,
  pg_catalog.to_char(
    travel.published_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) AS travel_published_at
FROM public.travel_snapshots AS travel
JOIN public.catalog_snapshots AS catalog
  ON catalog.id = travel.catalog_snapshot_id
WHERE travel.status = 'published'::public.snapshot_status
  AND catalog.status = 'published'::public.snapshot_status;

CREATE VIEW public.itinerary_fx_snapshot_history_v
WITH (security_invoker = false, security_barrier = true)
AS
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
  AND fx.is_demo IS FALSE;

REVOKE ALL ON public.itinerary_travel_snapshot_history_v,
  public.itinerary_fx_snapshot_history_v
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.itinerary_travel_snapshot_history_v,
  public.itinerary_fx_snapshot_history_v
TO authenticated;

-- Keep the explicit ownership declarations inside the creator role.  They are
-- redundant at runtime but make the generated access matrix auditable without
-- asking the migration runner to reassign an object it does not own.
ALTER VIEW public.itinerary_travel_snapshot_history_v
OWNER TO localens_catalog_rpc_owner;
ALTER VIEW public.itinerary_fx_snapshot_history_v
OWNER TO localens_catalog_rpc_owner;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA public FROM localens_catalog_rpc_owner;

COMMIT;
