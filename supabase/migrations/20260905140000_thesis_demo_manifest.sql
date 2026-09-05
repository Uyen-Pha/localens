BEGIN;

-- Close the legacy NULL fail-open before the seed uses the narrow assignment
-- owner. An absent transition setting must reject direct assignment writes.
GRANT CREATE ON SCHEMA private TO localens_guide_assignment_guard_owner;
SET LOCAL ROLE localens_guide_assignment_guard_owner;
CREATE OR REPLACE FUNCTION private.assert_guide_assignment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  IF current_setting('localens.guide_assignment_transition', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'guide assignment changes require a named RPC' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'assigned'::public.assignment_status
       OR NEW.accepted_at IS NOT NULL OR NEW.completed_at IS NOT NULL OR NEW.closed_at IS NOT NULL
       OR NEW.assigned_at IS NULL OR NEW.created_at IS NULL OR NEW.updated_at IS NULL THEN
      RAISE EXCEPTION 'invalid guide assignment creation' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'UPDATE'
     OR OLD.id IS DISTINCT FROM NEW.id
     OR OLD.booking_id IS DISTINCT FROM NEW.booking_id
     OR OLD.guide_user_id IS DISTINCT FROM NEW.guide_user_id
     OR OLD.mobility_flags IS DISTINCT FROM NEW.mobility_flags
     OR OLD.dietary_flags IS DISTINCT FROM NEW.dietary_flags
     OR OLD.assigned_at IS DISTINCT FROM NEW.assigned_at
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR NOT ((OLD.status = 'assigned'::public.assignment_status AND NEW.status IN ('accepted'::public.assignment_status, 'closed'::public.assignment_status))
          OR (OLD.status = 'accepted'::public.assignment_status AND NEW.status IN ('completed'::public.assignment_status, 'closed'::public.assignment_status))) THEN
    RAISE EXCEPTION 'invalid guide assignment transition' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.assert_guide_assignment_mutation() FROM PUBLIC, anon, authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM localens_guide_assignment_guard_owner;

-- This singleton identifies the reviewed thesis-demo dataset installed by the
-- server-side seeder. The migration creates only the marker boundary; the
-- seeder inserts the row in the same PostgreSQL transaction as its dataset.
CREATE TABLE private.thesis_demo_manifest (
  project_ref text NOT NULL
    CHECK (
      project_ref = btrim(project_ref)
      AND length(project_ref) BETWEEN 1 AND 64
      AND project_ref !~ '[[:cntrl:]]'
    ),
  environment text NOT NULL,
  dataset_version text NOT NULL
    CHECK (
      dataset_version = btrim(dataset_version)
      AND length(dataset_version) BETWEEN 1 AND 128
      AND dataset_version !~ '[[:cntrl:]]'
    ),
  seed_base_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT thesis_demo_manifest_pkey PRIMARY KEY (environment),
  CONSTRAINT thesis_demo_manifest_environment_check
    CHECK (environment = 'thesis-demo')
);

ALTER TABLE private.thesis_demo_manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.thesis_demo_manifest FORCE ROW LEVEL SECURITY;

CREATE POLICY thesis_demo_manifest_migration_owner_all
  ON private.thesis_demo_manifest
  FOR ALL
  TO postgres
  USING (true)
  WITH CHECK (true);

-- Only the separately verified server database connection may manage this
-- marker. Browser-facing roles and the application service role receive no
-- direct table access and there is deliberately no browser/service-role policy.
REVOKE ALL ON TABLE private.thesis_demo_manifest
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
