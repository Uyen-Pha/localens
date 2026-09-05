BEGIN;

-- The original revision CAS function predates PostgREST's complete claims JSON
-- path. This narrow wrapper resolves the authenticated subject, normalizes the
-- dotted claim for the existing audited implementation, and delegates every
-- validation and write to that implementation.
GRANT CREATE ON SCHEMA public TO localens_plan_rpc_owner;
SET LOCAL ROLE localens_plan_rpc_owner;

CREATE FUNCTION public.advance_authenticated_trip_plan_revision(
  plan_id uuid,
  base_revision_no integer,
  persistence_dto jsonb
)
RETURNS TABLE (revision_id uuid, revision_no integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  actor_user_id uuid;
BEGIN
  actor_user_id := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(
      NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      'sub'
    )
  )::uuid;
  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', actor_user_id::text, true);
  RETURN QUERY
  SELECT advanced.revision_id, advanced.revision_no
  FROM public.advance_trip_plan_revision(
    plan_id,
    base_revision_no,
    persistence_dto
  ) AS advanced;
END
$function$;

REVOKE ALL ON FUNCTION public.advance_authenticated_trip_plan_revision(uuid, integer, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advance_authenticated_trip_plan_revision(uuid, integer, jsonb)
TO authenticated;

SET LOCAL ROLE postgres;
ALTER FUNCTION public.advance_authenticated_trip_plan_revision(uuid, integer, jsonb)
OWNER TO localens_plan_rpc_owner;
REVOKE CREATE ON SCHEMA public FROM localens_plan_rpc_owner;

COMMIT;
