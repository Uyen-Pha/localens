BEGIN;

-- These owners are deliberately non-login and cannot bypass row-level security.
-- They are created once by the migration role and reused by the fixed-signature definers.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_auth_trigger_owner') THEN
    EXECUTE 'CREATE ROLE localens_auth_trigger_owner NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_identity_rpc_owner') THEN
    EXECUTE 'CREATE ROLE localens_identity_rpc_owner NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_admin_rpc_owner') THEN
    EXECUTE 'CREATE ROLE localens_admin_rpc_owner NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_audit_guard_owner') THEN
    EXECUTE 'CREATE ROLE localens_audit_guard_owner NOLOGIN NOBYPASSRLS';
  END IF;
END
$roles$;

ALTER ROLE localens_auth_trigger_owner NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_identity_rpc_owner NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_admin_rpc_owner NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_audit_guard_owner NOLOGIN NOBYPASSRLS;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE private.user_roles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role),
  UNIQUE (user_id, role)
);

CREATE TABLE public.guide_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  bio text,
  language public.locale NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Audit facts are scalar and intentionally have no JSON, raw request, or free-form payload column.
CREATE TABLE private.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type public.audit_event_type NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role public.app_role,
  target_type text NOT NULL CHECK (target_type ~ '^[a-z][a-z0-9_]{0,31}$'),
  target_id text NOT NULL CHECK (target_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  from_state text CHECK (from_state IS NULL OR (length(from_state) BETWEEN 1 AND 64 AND from_state ~ '^[a-z][a-z0-9_]*$')),
  to_state text CHECK (to_state IS NULL OR (length(to_state) BETWEEN 1 AND 64 AND to_state ~ '^[a-z][a-z0-9_]*$')),
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  metadata_key text CHECK (metadata_key IS NULL OR metadata_key ~ '^[a-z][a-z0-9_]{0,31}$'),
  metadata_text text CHECK (metadata_text IS NULL OR metadata_text ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  metadata_number numeric(20, 8),
  metadata_boolean boolean,
  metadata_is_null boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (CASE WHEN metadata_text IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN metadata_number IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN metadata_boolean IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN metadata_is_null THEN 1 ELSE 0 END) <= 1
  ),
  CHECK (metadata_key IS NOT NULL OR metadata_text IS NULL AND metadata_number IS NULL AND metadata_boolean IS NULL AND NOT metadata_is_null)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE private.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.guide_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guide_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE private.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.audit_events FORCE ROW LEVEL SECURITY;

-- Public tables expose only owner-scoped reads. There are no client DML policies.
CREATE POLICY profiles_customer_select ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY profiles_auth_trigger_insert ON public.profiles
  FOR INSERT TO localens_auth_trigger_owner
  WITH CHECK (current_user = 'localens_auth_trigger_owner');

CREATE POLICY profiles_admin_summary_select ON public.profiles
  FOR SELECT TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner');

CREATE POLICY guide_profiles_guide_select ON public.guide_profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY guide_profiles_admin_summary_select ON public.guide_profiles
  FOR SELECT TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner');

-- FORCE RLS means the named NOBYPASSRLS owners need explicit policies for each operation.
CREATE POLICY user_roles_auth_trigger_insert ON private.user_roles
  FOR INSERT TO localens_auth_trigger_owner
  WITH CHECK (current_user = 'localens_auth_trigger_owner');

CREATE POLICY user_roles_identity_rpc_select ON private.user_roles
  FOR SELECT TO localens_identity_rpc_owner
  USING (current_user = 'localens_identity_rpc_owner');

CREATE POLICY user_roles_identity_rpc_insert ON private.user_roles
  FOR INSERT TO localens_identity_rpc_owner
  WITH CHECK (current_user = 'localens_identity_rpc_owner');

CREATE POLICY user_roles_admin_summary_select ON private.user_roles
  FOR SELECT TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner');

CREATE POLICY audit_events_identity_rpc_insert ON private.audit_events
  FOR INSERT TO localens_identity_rpc_owner
  WITH CHECK (current_user = 'localens_identity_rpc_owner');

CREATE POLICY audit_events_admin_summary_select ON private.audit_events
  FOR SELECT TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner');

-- Access is granted only to the non-login definer owners. API roles receive no base-table access.
GRANT USAGE ON SCHEMA private TO localens_auth_trigger_owner, localens_identity_rpc_owner, localens_admin_rpc_owner, localens_audit_guard_owner;
GRANT INSERT ON TABLE public.profiles TO localens_auth_trigger_owner;
GRANT SELECT ON TABLE public.profiles TO localens_admin_rpc_owner;
GRANT SELECT, INSERT ON TABLE private.user_roles TO localens_auth_trigger_owner;
GRANT SELECT, INSERT ON TABLE private.user_roles TO localens_identity_rpc_owner;
GRANT SELECT ON TABLE private.user_roles TO localens_admin_rpc_owner;
GRANT INSERT ON TABLE private.audit_events TO localens_identity_rpc_owner;
GRANT SELECT ON TABLE private.audit_events TO localens_admin_rpc_owner;
GRANT SELECT ON TABLE public.guide_profiles TO localens_admin_rpc_owner;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.user_roles, private.audit_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$function$;

ALTER FUNCTION private.set_updated_at() OWNER TO localens_identity_rpc_owner;
REVOKE ALL ON FUNCTION private.set_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER guide_profiles_set_updated_at
BEFORE UPDATE ON public.guide_profiles
FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at();

CREATE OR REPLACE FUNCTION private.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'private.audit_events is append-only' USING ERRCODE = '42501';
END;
$function$;

ALTER FUNCTION private.reject_audit_mutation() OWNER TO localens_audit_guard_owner;
REVOKE ALL ON FUNCTION private.reject_audit_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON private.audit_events
FOR EACH ROW
EXECUTE FUNCTION private.reject_audit_mutation();

CREATE OR REPLACE FUNCTION private.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Only NEW.id is trusted. Signup metadata is deliberately ignored.
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO private.user_roles (user_id, role)
  VALUES (NEW.id, 'customer'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION private.handle_new_auth_user() OWNER TO localens_auth_trigger_owner;
REVOKE ALL ON FUNCTION private.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION private.handle_new_auth_user();

CREATE OR REPLACE FUNCTION private.provision_role(
  target_user_id uuid,
  target_role public.app_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_user_id uuid;
  role_was_inserted boolean;
BEGIN
  actor_user_id := auth.uid();

  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF target_user_id IS NULL OR target_role IS NULL THEN
    RAISE EXCEPTION 'role target is required' USING ERRCODE = '22004';
  END IF;
  IF actor_user_id = target_user_id THEN
    RAISE EXCEPTION 'self elevation is not permitted' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM private.user_roles
    WHERE user_id = actor_user_id
      AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO private.user_roles (user_id, role)
  VALUES (target_user_id, target_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  role_was_inserted := FOUND;

  IF role_was_inserted THEN
    INSERT INTO private.audit_events (
      event_type,
      actor_user_id,
      actor_role,
      target_type,
      target_id,
      to_state,
      metadata_key,
      metadata_text
    )
    VALUES (
      'role_provisioned'::public.audit_event_type,
      actor_user_id,
      'admin'::public.app_role,
      'user',
      target_user_id::text,
      target_role::text,
      'role',
      target_role::text
    );
  END IF;
END;
$function$;

ALTER FUNCTION private.provision_role(uuid, public.app_role) OWNER TO localens_identity_rpc_owner;
REVOKE ALL ON FUNCTION private.provision_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_user_summary()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  role public.app_role,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_user_id uuid;
BEGIN
  actor_user_id := auth.uid();
  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM private.user_roles
    WHERE user_id = actor_user_id
      AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, ur.role, p.created_at
  FROM public.profiles AS p
  JOIN private.user_roles AS ur ON ur.user_id = p.id
  ORDER BY p.created_at, p.id, ur.role;
END;
$function$;

ALTER FUNCTION public.admin_user_summary() OWNER TO localens_admin_rpc_owner;
REVOKE ALL ON FUNCTION public.admin_user_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_summary() TO authenticated;

COMMIT;
