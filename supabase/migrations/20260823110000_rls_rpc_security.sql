BEGIN;

-- Task 13 is the final privilege boundary for the data foundation.  It is
-- intentionally additive: earlier migrations own the row predicates and
-- transition guards; this migration removes accidental API grants and then
-- exposes only the named projections/RPCs in the access matrix.
CREATE SCHEMA IF NOT EXISTS private;

-- API roles never receive private-schema access, base-table stateful access,
-- or a default privilege that could silently expose a future table/function.
REVOKE ALL ON SCHEMA private, auth FROM PUBLIC, anon, authenticated, service_role;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA public, private, auth FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, private, auth FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public, private, auth FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

-- PostgREST can resolve only explicit public objects.  private/auth remain
-- unreachable from a browser even when a JWT is valid.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
REVOKE USAGE ON SCHEMA private, auth FROM anon, authenticated;

-- Every data table is already RLS-enabled by its owning migration.  Repeating
-- both declarations here makes the final gate explicit and prevents a future
-- table added before this migration from being treated as an owner bypass.
DO $force_rls$
DECLARE
  relation_record record;
BEGIN
  FOR relation_record IN
    SELECT n.nspname AS schema_name, c.relname AS relation_name
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'private')
      AND c.relkind = 'r'
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      relation_record.schema_name,
      relation_record.relation_name
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',
      relation_record.schema_name,
      relation_record.relation_name
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated, service_role',
      relation_record.schema_name,
      relation_record.relation_name
    );
  END LOOP;
END
$force_rls$;

-- Public read projections.  The view definitions are explicit, barriered,
-- and filter to published/owner/admin rows; no base table is API-readable.
GRANT SELECT ON TABLE
  public.published_tours_v,
  public.catalog_snapshot_places_v,
  public.travel_snapshots_v,
  public.latest_fx_snapshot_v,
  public.published_content_release_v
TO anon, authenticated;

-- published_tours_v is the one explicit narrow base-table grant exception.
-- Its security_invoker=true join needs exactly these source columns. RLS
-- policies still require published parent/snapshot rows, and every other base
-- column remains denied. All other catalog projections remain safe definer
-- projections because invoker grants would expose operational JSON/child
-- columns.
GRANT SELECT (id, slug, status) ON TABLE public.tours TO anon, authenticated;
GRANT SELECT (id, tour_id, status, duration_minutes, price_vnd_per_person,
  inclusions, exclusions, cancellation_policy, source_url, verified_at,
  attribution, license, catalog_snapshot_id)
  ON TABLE public.tour_versions TO anon, authenticated;
GRANT SELECT (tour_version_id, locale, title, summary, meeting_point)
  ON TABLE public.tour_version_translations TO anon, authenticated;
GRANT SELECT (tour_version_id, catalog_snapshot_id, position, place_id)
  ON TABLE public.tour_version_stops TO anon, authenticated;
GRANT SELECT (snapshot_id, place_id, slug)
  ON TABLE public.catalog_snapshot_places TO anon, authenticated;
GRANT SELECT (snapshot_id, place_id, locale, title)
  ON TABLE public.catalog_snapshot_place_translations TO anon, authenticated;
-- RLS predicates on the published child rows perform a published-snapshot
-- existence check. These two predicate columns are part of the same narrow
-- invoker-view exception; no other snapshot columns are exposed.
GRANT SELECT (id, status) ON TABLE public.catalog_snapshots TO anon, authenticated;

GRANT SELECT ON TABLE
  public.customer_custom_requests_v,
  public.customer_custom_quotes_v,
  public.customer_bookings_v,
  public.customer_payment_status_v,
  public.admin_custom_request_queue_v,
  public.admin_content_drafts_v,
  public.admin_audit_events_v
TO authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.guide_profiles TO authenticated;

-- Customer/admin/guide API entry points.  Each function derives auth.uid(),
-- validates role/capability, and is owned by a named NOLOGIN NOBYPASSRLS role.
GRANT EXECUTE ON FUNCTION public.admin_user_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_trip_plan_revision(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_guest_plan(uuid, text, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_custom_request(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_custom_request(uuid, public.request_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_custom_quote(uuid, bigint, public.checkout_currency, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_payment(uuid, public.booking_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_guide(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_guide_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_guide_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_guide_assigned_bookings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_content_draft(public.locale, text, text, text, text, jsonb, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_seo(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_departure_availability() TO anon, authenticated;

-- The build executor is an Edge-only credential, never a browser role.  It
-- receives release-scoped capability RPCs only, never service_role evidence.
GRANT EXECUTE ON FUNCTION public.read_seo_build_release(uuid, text, text) TO localens_content_build_executor;
GRANT EXECUTE ON FUNCTION public.finalize_seo_publish(uuid, text, text, text, text) TO localens_content_build_executor;
GRANT EXECUTE ON FUNCTION public.fail_seo_publish(uuid, text, text, text) TO localens_content_build_executor;

-- Internal executor credentials are intentionally narrow.  Revoke all broad
-- inherited privileges first; the earlier migrations' column grants remain
-- the only data needed by each stateful RPC.
REVOKE ALL ON SCHEMA public, private, auth FROM
  localens_guest_executor, localens_quota_executor, localens_webhook_executor,
  localens_content_build_executor;
GRANT USAGE ON SCHEMA private TO
  localens_guest_executor, localens_quota_executor, localens_webhook_executor,
  localens_content_build_executor;
GRANT USAGE ON SCHEMA public TO localens_webhook_executor, localens_content_build_executor;

-- SECURITY DEFINER code is bounded even when called from an Edge retry.  The
-- migration uses catalog-qualified regprocedure values, so overloaded
-- functions receive the setting without hand-maintained dynamic SQL in their
-- function bodies.  No definer uses a caller-controlled search path.
DO $definer_hardening$
DECLARE
  function_record record;
BEGIN
  FOR function_record IN
    SELECT p.oid::pg_catalog.regprocedure AS signature
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prosecdef
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER FUNCTION %s SET search_path = '''' ',
      function_record.signature
    );
    EXECUTE pg_catalog.format(
      'ALTER FUNCTION %s SET statement_timeout = %L',
      function_record.signature,
      '5s'
    );
  END LOOP;
END
$definer_hardening$;

-- A named callable definer must never be owned by a login/bypass role.  This
-- assertion fails the migration if a future RPC is added with an unsafe owner.
DO $definer_owner_check$
DECLARE
  unsafe_function record;
BEGIN
  SELECT n.nspname, p.proname, r.rolname, r.rolcanlogin, r.rolbypassrls
    INTO unsafe_function
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS r ON r.oid = p.proowner
  WHERE n.nspname IN ('public', 'private')
    AND p.prosecdef
    AND (r.rolcanlogin OR r.rolbypassrls OR r.rolname IN ('postgres', 'service_role'))
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'unsafe SECURITY DEFINER owner %.% (% login %, bypass %)',
      unsafe_function.nspname, unsafe_function.proname, unsafe_function.rolname,
      unsafe_function.rolcanlogin, unsafe_function.rolbypassrls
      USING ERRCODE = '42501';
  END IF;
END
$definer_owner_check$;

-- Explicitly keep the extension/API schema surface pinned in the database as
-- well as in supabase/config.toml.  The public schema is the only PostgREST
-- data schema used by this milestone; graphql_public is config-only metadata.
COMMENT ON SCHEMA private IS 'Internal LocalLens data; never exposed by PostgREST';

COMMIT;
