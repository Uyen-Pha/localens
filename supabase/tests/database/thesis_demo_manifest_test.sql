-- Task 17 database marker contract. The runtime gate executes this suite only
-- against its disposable, nonstandard-port Supabase project.
BEGIN;

SELECT plan(21);

SELECT extensions.ok(
  pg_get_functiondef('private.assert_guide_assignment_mutation()'::regprocedure)
    ~ $guard$current_setting\('localens\.guide_assignment_transition', true\) IS DISTINCT FROM 'on'$guard$,
  'guide assignment mutation guard rejects an absent transition setting'
);

-- Schema shape and access boundary.
SELECT extensions.ok(to_regnamespace('private') IS NOT NULL, 'private schema exists');
SELECT extensions.ok(to_regclass('private.thesis_demo_manifest') IS NOT NULL, 'thesis demo manifest table exists');
SELECT extensions.is(
  (
    SELECT string_agg(attribute.attname, '|' ORDER BY attribute.attnum)
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = 'private.thesis_demo_manifest'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ),
  'project_ref|environment|dataset_version|seed_base_date|created_at',
  'manifest exposes only the five reviewed marker columns'
);
SELECT extensions.is(
  (
    SELECT string_agg(pg_catalog.format_type(attribute.atttypid, attribute.atttypmod), '|' ORDER BY attribute.attnum)
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = 'private.thesis_demo_manifest'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ),
  'text|text|text|date|timestamp with time zone',
  'manifest column types are stable'
);
SELECT extensions.ok(
  (
    SELECT bool_and(attribute.attnotnull)
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = 'private.thesis_demo_manifest'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ),
  'every manifest marker field is required'
);
SELECT extensions.ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    JOIN pg_catalog.pg_attrdef AS default_value
      ON default_value.adrelid = attribute.attrelid
     AND default_value.adnum = attribute.attnum
    WHERE attribute.attrelid = 'private.thesis_demo_manifest'::regclass
      AND attribute.attname = 'created_at'
  ),
  'created_at has a database default'
);
SELECT extensions.ok(
  (
    SELECT relation.relrowsecurity
    FROM pg_catalog.pg_class AS relation
    WHERE relation.oid = 'private.thesis_demo_manifest'::regclass
  ),
  'manifest has RLS enabled'
);
SELECT extensions.ok(
  (
    SELECT relation.relforcerowsecurity
    FROM pg_catalog.pg_class AS relation
    WHERE relation.oid = 'private.thesis_demo_manifest'::regclass
  ),
  'manifest is FORCE RLS'
);
SELECT extensions.is(
  (
    SELECT string_agg(policy.polname || ':' || role.rolname, '|' ORDER BY policy.polname, role.rolname)
    FROM pg_catalog.pg_policy AS policy
    CROSS JOIN LATERAL unnest(policy.polroles) AS policy_role(role_oid)
    JOIN pg_catalog.pg_roles AS role ON role.oid = policy_role.role_oid
    WHERE policy.polrelid = 'private.thesis_demo_manifest'::regclass
  ),
  'thesis_demo_manifest_migration_owner_all:postgres',
  'only the migration owner has a manifest policy'
);
SELECT extensions.ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = 'private.thesis_demo_manifest'::regclass
      AND constraint_record.conname = 'thesis_demo_manifest_environment_check'
      AND constraint_record.contype = 'c'
  ),
  'environment has a named closed-value check'
);
SELECT extensions.is(
  (
    SELECT string_agg(attribute.attname, '|' ORDER BY key_column.ordinality)
    FROM pg_catalog.pg_constraint AS constraint_record
    CROSS JOIN LATERAL unnest(constraint_record.conkey) WITH ORDINALITY AS key_column(attnum, ordinality)
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = constraint_record.conrelid
     AND attribute.attnum = key_column.attnum
    WHERE constraint_record.conrelid = 'private.thesis_demo_manifest'::regclass
      AND constraint_record.contype = 'p'
  ),
  'environment',
  'the fixed environment key enforces singleton storage'
);
SELECT extensions.ok(
  NOT has_schema_privilege('anon', 'private', 'USAGE')
  AND NOT has_schema_privilege('authenticated', 'private', 'USAGE'),
  'API roles cannot resolve the private schema'
);
SELECT extensions.ok(
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS role_name(name)
    CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS privilege_name(name)
    WHERE has_table_privilege(
      role_name.name,
      'private.thesis_demo_manifest',
      privilege_name.name
    )
  ),
  'API and service roles have no manifest read or write privilege'
);

-- The server-side seeder supplies the row explicitly; the migration does not.
SELECT extensions.is(
  (SELECT count(*)::integer FROM private.thesis_demo_manifest),
  0,
  'migration creates no marker row'
);
SELECT extensions.lives_ok(
  $$
    INSERT INTO private.thesis_demo_manifest (
      project_ref,
      environment,
      dataset_version,
      seed_base_date
    )
    VALUES (
      'abcdefghijklmnopqrst',
      'thesis-demo',
      'thesis-demo.v1',
      DATE '2026-09-05'
    )
  $$,
  'a verified server-side seed marker can be inserted'
);
SELECT extensions.is(
  (SELECT count(*)::integer FROM private.thesis_demo_manifest),
  1,
  'exactly one marker row is stored'
);
SELECT extensions.throws_ok(
  $$
    INSERT INTO private.thesis_demo_manifest (
      project_ref,
      environment,
      dataset_version,
      seed_base_date
    )
    VALUES (
      'wrongenvironmentref0',
      'production',
      'thesis-demo.invalid',
      DATE '2026-09-05'
    )
  $$,
  '23514',
  NULL,
  'environment rejects every value except thesis-demo'
);
SELECT extensions.throws_ok(
  $$
    INSERT INTO private.thesis_demo_manifest (
      project_ref,
      environment,
      dataset_version,
      seed_base_date
    )
    VALUES (
      'zyxwvutsrqponmlkjihg',
      'thesis-demo',
      'thesis-demo.v2',
      DATE '2026-09-12'
    )
  $$,
  '23505',
  NULL,
  'a second thesis-demo marker is rejected'
);

DELETE FROM private.thesis_demo_manifest;

-- Model the PostgreSQL half of the seeder apply. Both marker and fixture data
-- must disappear when the apply transaction rolls back.
SAVEPOINT thesis_demo_seed_apply;
INSERT INTO private.thesis_demo_manifest (
  project_ref,
  environment,
  dataset_version,
  seed_base_date
)
VALUES (
  'abcdefghijklmnopqrst',
  'thesis-demo',
  'thesis-demo.rollback',
  DATE '2026-09-05'
);
INSERT INTO public.areas (id, slug)
VALUES (
  '00000000-0000-0000-0000-000000009711'::uuid,
  'thesis-demo-rollback-fixture'
);
ROLLBACK TO SAVEPOINT thesis_demo_seed_apply;
RELEASE SAVEPOINT thesis_demo_seed_apply;

SELECT extensions.is(
  (SELECT count(*)::integer FROM private.thesis_demo_manifest),
  0,
  'rolled-back seed apply leaves no marker'
);
SELECT extensions.is(
  (
    SELECT count(*)::integer
    FROM public.areas
    WHERE id = '00000000-0000-0000-0000-000000009711'::uuid
  ),
  0,
  'rolled-back seed apply leaves no fixture row'
);

SELECT * FROM finish();
ROLLBACK;
