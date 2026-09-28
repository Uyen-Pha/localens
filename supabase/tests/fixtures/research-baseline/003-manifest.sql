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
