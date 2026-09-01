BEGIN;

-- FORCE RLS remains active for this NOBYPASSRLS owner. The public RPC still
-- binds every read to the JWT subject before projecting profile data.
CREATE POLICY profiles_portal_identity_select ON public.profiles
  FOR SELECT TO localens_identity_rpc_owner
  USING (current_user = 'localens_identity_rpc_owner');

GRANT SELECT (id, display_name, language)
  ON TABLE public.profiles TO localens_identity_rpc_owner;
GRANT CREATE ON SCHEMA public TO localens_identity_rpc_owner;

CREATE OR REPLACE FUNCTION public.get_portal_identity()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  role public.app_role,
  language public.locale
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  actor_user_id uuid;
  actor_role public.app_role;
  actor_role_count bigint;
BEGIN
  actor_user_id := NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*), (pg_catalog.array_agg(actor_roles.role))[1]
  INTO actor_role_count, actor_role
  FROM private.user_roles AS actor_roles
  WHERE actor_roles.user_id = actor_user_id;

  IF actor_role_count <> 1 THEN
    RAISE EXCEPTION 'portal identity must have exactly one role' USING ERRCODE = '21000';
  END IF;

  RETURN QUERY
  SELECT profiles.id, profiles.display_name, actor_role, profiles.language
  FROM public.profiles AS profiles
  WHERE profiles.id = actor_user_id;
END;
$function$;

ALTER FUNCTION public.get_portal_identity() OWNER TO localens_identity_rpc_owner;
SET LOCAL ROLE localens_identity_rpc_owner;
REVOKE ALL ON FUNCTION public.get_portal_identity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_identity() TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM localens_identity_rpc_owner;

COMMIT;
