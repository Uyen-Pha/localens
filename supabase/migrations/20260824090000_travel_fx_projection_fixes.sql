BEGIN;

-- The API boundary is deliberately a named, non-invoker projection.  Its
-- NOLOGIN/NOBYPASSRLS owner has only the narrow source grants required to
-- build this explicit shape; API roles never receive base-table access.
GRANT CREATE ON SCHEMA public TO localens_catalog_rpc_owner;

DROP VIEW IF EXISTS public.travel_snapshot_edges_v;

SET LOCAL ROLE localens_catalog_rpc_owner;
CREATE OR REPLACE VIEW public.travel_snapshots_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  s.id AS snapshot_id,
  s.catalog_snapshot_id,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'from_place_id', e.from_place_id,
        'to_place_id', e.to_place_id,
        'mode', e.mode,
        'minutes', e.minutes,
        'group_cost_vnd', e.group_cost_vnd::text,
        'verified_at', pg_catalog.to_char(
          e.verified_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      )
      ORDER BY e.from_place_id, e.to_place_id
    ) FILTER (WHERE e.snapshot_id IS NOT NULL),
    '[]'::jsonb
  ) AS edges
FROM public.travel_snapshots AS s
LEFT JOIN public.travel_snapshot_edges AS e
  ON e.snapshot_id = s.id
 AND e.catalog_snapshot_id = s.catalog_snapshot_id
WHERE s.status = 'published'::public.snapshot_status
GROUP BY s.id, s.catalog_snapshot_id;

ALTER VIEW public.travel_snapshots_v OWNER TO localens_catalog_rpc_owner;
REVOKE ALL ON public.travel_snapshots_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.travel_snapshots_v TO anon, authenticated;

CREATE OR REPLACE VIEW public.latest_fx_snapshot_v
WITH (security_invoker = false, security_barrier = true)
AS
-- Callers must filter environment when selecting a current FX row.  The
-- partitioned query returns the newest valid observation for each environment.
SELECT DISTINCT ON (f.environment)
  f.id,
  f.vnd_per_usd::text AS vnd_per_usd,
  f.source,
  pg_catalog.to_char(f.observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS observed_at,
  f.environment,
  f.is_demo
FROM public.fx_snapshots AS f
WHERE f.observed_at >= pg_catalog.now() - INTERVAL '7 days'
  AND f.observed_at <= pg_catalog.now()
ORDER BY f.environment, f.observed_at DESC, f.id DESC;

REVOKE ALL ON public.latest_fx_snapshot_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.latest_fx_snapshot_v TO anon, authenticated;
SET LOCAL ROLE postgres;

ALTER TABLE public.fx_snapshots
  ADD CONSTRAINT fx_snapshots_source_trimmed_no_controls
  CHECK (source = btrim(source) AND source !~ '[[:cntrl:]]');

REVOKE CREATE ON SCHEMA public FROM localens_catalog_rpc_owner;

COMMIT;
