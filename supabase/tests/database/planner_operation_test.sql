-- Task 14.2A executable operation/idempotency contract.
-- The controller runs this file only on a disposable isolated database.
BEGIN;

SELECT plan(54);
GRANT USAGE ON SCHEMA extensions TO localens_plan_rpc_owner;
SELECT set_config('search_path', 'public, extensions, pg_catalog', true);

-- Synthetic identities and immutable snapshot facts used by the complete-RPC
-- checks.  No production identity or provider payload is used here.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000009401'::uuid, 'authenticated', 'authenticated', 'planner-operation-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000009402'::uuid, 'authenticated', 'authenticated', 'planner-operation-peer@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000009403'::uuid, 'authenticated', 'authenticated', 'planner-operation-non-customer@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

DELETE FROM private.user_roles
WHERE user_id IN (
  '00000000-0000-0000-0000-000000009401'::uuid,
  '00000000-0000-0000-0000-000000009402'::uuid,
  '00000000-0000-0000-0000-000000009403'::uuid
);
INSERT INTO private.user_roles (user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000009401'::uuid, 'customer'::public.app_role),
  ('00000000-0000-0000-0000-000000009402'::uuid, 'customer'::public.app_role),
  ('00000000-0000-0000-0000-000000009403'::uuid, 'admin'::public.app_role);

INSERT INTO public.trip_plans (id, owner_user_id)
VALUES ('00000000-0000-0000-0000-000000009431'::uuid, '00000000-0000-0000-0000-000000009402'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.catalog_snapshots (id, status, published_at)
VALUES ('00000000-0000-0000-0000-000000009410'::uuid, 'building', NULL)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.catalog_snapshot_areas (snapshot_id, area_id, slug)
VALUES ('00000000-0000-0000-0000-000000009410'::uuid, '00000000-0000-0000-0000-000000009411'::uuid, 'planner-operation-area')
ON CONFLICT DO NOTHING;
INSERT INTO public.catalog_snapshot_places (
  snapshot_id, place_id, area_id, slug, price_vnd_per_person,
  visit_duration_minutes, source_url, verified_at, attribution
)
VALUES (
  '00000000-0000-0000-0000-000000009410'::uuid,
  '00000000-0000-0000-0000-000000009412'::uuid,
  '00000000-0000-0000-0000-000000009411'::uuid,
  'planner-operation-place', 0, 60, 'https://example.invalid/planner-operation-place', DATE '2026-09-05', 'pgTAP fixture'
)
ON CONFLICT DO NOTHING;
UPDATE public.catalog_snapshots
SET status = 'published'::public.snapshot_status, published_at = now()
WHERE id = '00000000-0000-0000-0000-000000009410'::uuid;
INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status, published_at)
VALUES ('00000000-0000-0000-0000-000000009413'::uuid, '00000000-0000-0000-0000-000000009410'::uuid, 'building', NULL)
ON CONFLICT (id) DO NOTHING;
UPDATE public.travel_snapshots
SET status = 'published'::public.snapshot_status, published_at = now()
WHERE id = '00000000-0000-0000-0000-000000009413'::uuid;

CREATE TEMP TABLE planner_operation_fixture (persistence_dto jsonb) ON COMMIT DROP;
INSERT INTO planner_operation_fixture
WITH request_fixture AS (
  SELECT jsonb_build_object(
    'startAt', '2026-09-05T01:00:00Z',
    'durationMinutes', 60,
    'areas', jsonb_build_array('00000000-0000-0000-0000-000000009411'),
    'budget', jsonb_build_object('currency', 'VND', 'amountMinor', 0),
    'partySize', 1,
    'guideLanguage', 'en',
    'priorityWeights', jsonb_build_object(
      'street_food', 1, 'history', 0,
      'traditional_craft', 0, 'traditional_market', 0
    ),
    'pace', 'balanced',
    'dietaryRequirements', jsonb_build_array(),
    'mobilityRequirements', jsonb_build_array(),
    'lockedStopIds', jsonb_build_array()
  ) AS request_json
)
SELECT jsonb_build_object(
  'revisionNo', 1,
  'request', request_json,
  'result', jsonb_build_object(
    'normalizedStartAt', '2026-09-05T08:00:00+07:00',
    'budgetVnd', 0,
    'rankingSource', 'deterministic',
    'items', jsonb_build_array(),
    'totals', jsonb_build_object(
      'durationMinutes', 0, 'visitMinutes', 0, 'travelMinutes', 0,
      'transitionBufferMinutes', 0, 'groupCostVnd', 0, 'score', 0
    ),
    'snapshotIds', jsonb_build_object(
      'catalog', '00000000-0000-0000-0000-000000009410',
      'travel', '00000000-0000-0000-0000-000000009413',
      'fx', NULL::text
    )
  ),
  'fingerprint', repeat('a', 64),
  'rankingSource', 'deterministic',
  'catalogSnapshotId', '00000000-0000-0000-0000-000000009410',
  'travelSnapshotId', '00000000-0000-0000-0000-000000009413',
  'fxSnapshotId', NULL::text,
  'fxVndPerUsd', NULL::text,
  'currency', 'VND',
  'budgetVnd', '0',
  'totalCostVnd', '0',
  'totalDurationMinutes', 0,
  'lockedPlaceIds', jsonb_build_array(),
  'items', jsonb_build_array()
)
FROM request_fixture;
GRANT SELECT ON planner_operation_fixture TO service_role;

CREATE TEMP TABLE planner_operation_decisions (
  label text PRIMARY KEY,
  decision jsonb NOT NULL
) ON COMMIT DROP;
GRANT INSERT, SELECT ON planner_operation_decisions TO service_role;

SELECT extensions.ok(to_regclass('private.runtime_planner_operations') IS NOT NULL, 'operation table exists');
SELECT extensions.ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'private.runtime_planner_operations'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%owner_user_id, operation_id%'
  ),
  'operation scope is unique per owner and operation ID'
);
SELECT extensions.ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'private.runtime_planner_operations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%claimed%completed%rejected%interrupted%'
  ),
  'operation state constraint contains only the accepted state machine'
);
SELECT extensions.ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'private.runtime_planner_operations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%rejection_code%'
  ),
  'rejection code is database constrained'
);
SELECT extensions.ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'private.runtime_planner_operations'::regclass), 'operation table has forced RLS');
SELECT extensions.is((SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'private.runtime_planner_operations'::regclass)::text, 'localens_plan_rpc_owner', 'operation table has the plan owner');
SELECT extensions.ok(
  NOT has_table_privilege('anon', 'private.runtime_planner_operations', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'private.runtime_planner_operations', 'SELECT')
  AND NOT has_table_privilege('service_role', 'private.runtime_planner_operations', 'SELECT')
  AND has_table_privilege('localens_plan_rpc_owner', 'private.runtime_planner_operations', 'SELECT,INSERT,UPDATE'),
  'only the named definer owner can access the operation table'
);
SELECT extensions.ok(
  to_regprocedure('public.claim_runtime_planner_operation(uuid,uuid,text,text,uuid,integer)') IS NOT NULL
  AND to_regprocedure('public.get_runtime_planner_operation(uuid,uuid,text)') IS NOT NULL
  AND to_regprocedure('public.complete_runtime_recommendation(uuid,uuid,text,uuid,jsonb)') IS NOT NULL
  AND to_regprocedure('public.complete_runtime_refinement(uuid,uuid,text,uuid,jsonb)') IS NOT NULL
  AND to_regprocedure('public.reject_runtime_planner_operation(uuid,uuid,text,uuid,text)') IS NOT NULL,
  'all five operation RPC signatures exist'
);
SELECT extensions.ok(
  (SELECT bool_and(
    p.prosecdef
    AND p.proconfig @> ARRAY['search_path=""']
    AND p.proconfig @> ARRAY['statement_timeout=5s']
    AND pg_get_userbyid(p.proowner) = 'localens_plan_rpc_owner'
  )
   FROM pg_proc AS p
   WHERE p.oid IN (
     'public.claim_runtime_planner_operation(uuid,uuid,text,text,uuid,integer)'::regprocedure,
     'public.get_runtime_planner_operation(uuid,uuid,text)'::regprocedure,
     'public.complete_runtime_recommendation(uuid,uuid,text,uuid,jsonb)'::regprocedure,
     'public.complete_runtime_refinement(uuid,uuid,text,uuid,jsonb)'::regprocedure,
     'public.reject_runtime_planner_operation(uuid,uuid,text,uuid,text)'::regprocedure
   )) IS TRUE,
  'operation RPCs are SECURITY DEFINER, pinned, and named-owner functions'
);
SELECT extensions.ok(
  (SELECT provolatile = 's' FROM pg_proc WHERE oid = 'public.get_runtime_planner_operation(uuid,uuid,text)'::regprocedure)
  AND (SELECT bool_and(provolatile = 'v') FROM pg_proc WHERE oid IN (
    'public.claim_runtime_planner_operation(uuid,uuid,text,text,uuid,integer)'::regprocedure,
    'public.complete_runtime_recommendation(uuid,uuid,text,uuid,jsonb)'::regprocedure,
    'public.complete_runtime_refinement(uuid,uuid,text,uuid,jsonb)'::regprocedure,
    'public.reject_runtime_planner_operation(uuid,uuid,text,uuid,text)'::regprocedure
  )),
  'read status is STABLE and mutations are VOLATILE'
);
SELECT extensions.ok(
  (SELECT bool_and(
    has_function_privilege('service_role', signature, 'EXECUTE')
    AND NOT has_function_privilege('anon', signature, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', signature, 'EXECUTE')
  ) FROM unnest(ARRAY[
    'public.claim_runtime_planner_operation(uuid,uuid,text,text,uuid,integer)',
    'public.get_runtime_planner_operation(uuid,uuid,text)',
    'public.complete_runtime_recommendation(uuid,uuid,text,uuid,jsonb)',
    'public.complete_runtime_refinement(uuid,uuid,text,uuid,jsonb)',
    'public.reject_runtime_planner_operation(uuid,uuid,text,uuid,text)'
  ]) AS rpc(signature)),
  'service role is the only API executor for operation RPCs'
);
SELECT extensions.ok(
  (SELECT bool_and(NOT has_function_privilege(role_name, signature, 'EXECUTE'))
   FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS roles(role_name)
   CROSS JOIN unnest(ARRAY[
     'public.create_authenticated_trip_plan(uuid,jsonb)',
     'public.advance_authenticated_trip_plan_revision(uuid,integer,jsonb)',
     'public.advance_trip_plan_revision(uuid,integer,jsonb)'
   ]) AS legacy(signature)),
  'all three legacy public write routes have no external EXECUTE'
);

SET LOCAL ROLE service_role;
INSERT INTO planner_operation_decisions
VALUES (
  'owner-claim',
  public.claim_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009421'::uuid,
    'recommend', repeat('a', 64), NULL::uuid, NULL::integer
  )
);
RESET ROLE;
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'owner-claim'), 'claimed', 'new operation is claimed');
SELECT extensions.is(
  (SELECT recommend_plan_id::text
   FROM private.runtime_planner_operations
   WHERE owner_user_id = '00000000-0000-0000-0000-000000009401'::uuid
     AND operation_id = '00000000-0000-0000-0000-000000009421'::uuid),
  (SELECT decision->>'planId' FROM planner_operation_decisions WHERE label = 'owner-claim'),
  'recommend claim persists one stable plan ID'
);
SELECT extensions.ok((SELECT (decision->>'plannerReservationId') <> (decision->>'geminiReservationId') FROM planner_operation_decisions WHERE label = 'owner-claim'), 'planner and Gemini reservation IDs are distinct');
SELECT extensions.is((SELECT count(*)::integer FROM private.runtime_planner_operations WHERE owner_user_id = '00000000-0000-0000-0000-000000009401'::uuid AND operation_id = '00000000-0000-0000-0000-000000009421'::uuid), 1, 'claim creates one scoped operation row');
SELECT extensions.ok(
  (SELECT lease_expires_at = claimed_at + INTERVAL '60 seconds'
   FROM private.runtime_planner_operations
   WHERE owner_user_id = '00000000-0000-0000-0000-000000009401'::uuid
     AND operation_id = '00000000-0000-0000-0000-000000009421'::uuid),
  'claim lease is exactly sixty seconds from its authoritative claim time'
);
SELECT extensions.is(
  (SELECT planner_reservation_id::text FROM private.runtime_planner_operations WHERE owner_user_id = '00000000-0000-0000-0000-000000009401'::uuid AND operation_id = '00000000-0000-0000-0000-000000009421'::uuid),
  (SELECT decision->>'plannerReservationId' FROM planner_operation_decisions WHERE label = 'owner-claim'),
  'planner reservation ID is persisted exactly once'
);
SELECT extensions.is(
  (SELECT gemini_reservation_id::text FROM private.runtime_planner_operations WHERE owner_user_id = '00000000-0000-0000-0000-000000009401'::uuid AND operation_id = '00000000-0000-0000-0000-000000009421'::uuid),
  (SELECT decision->>'geminiReservationId' FROM planner_operation_decisions WHERE label = 'owner-claim'),
  'Gemini reservation ID is persisted exactly once'
);
SELECT extensions.is(
  (SELECT lease_token::text FROM private.runtime_planner_operations WHERE owner_user_id = '00000000-0000-0000-0000-000000009401'::uuid AND operation_id = '00000000-0000-0000-0000-000000009421'::uuid),
  (SELECT decision->>'leaseToken' FROM planner_operation_decisions WHERE label = 'owner-claim'),
  'lease token is persisted exactly once'
);
SELECT extensions.ok(
  (SELECT count(*) = 6 FROM information_schema.columns WHERE table_schema = 'private' AND table_name = 'runtime_planner_operations' AND column_name IN ('created_at', 'claimed_at', 'lease_expires_at', 'completed_at', 'rejected_at', 'interrupted_at')),
  'operation timestamps are explicit authoritative columns'
);
SELECT extensions.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'private' AND table_name = 'runtime_planner_operations'
      AND column_name IN ('raw_prompt', 'raw_feedback', 'locale', 'correlation_id', 'owner_email')
  ),
  'operation table has no raw prompt, feedback, locale, correlation, or PII columns'
);

SET LOCAL ROLE service_role;
INSERT INTO planner_operation_decisions
VALUES (
  'owner-retry',
  public.claim_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009421'::uuid,
    'recommend', repeat('a', 64), NULL::uuid, NULL::integer
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'owner-conflict',
  public.claim_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009421'::uuid,
    'recommend', repeat('b', 64), NULL::uuid, NULL::integer
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'owner-kind-conflict',
  public.claim_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009421'::uuid,
    'refine', repeat('a', 64), '00000000-0000-0000-0000-000000009432'::uuid, 1
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'peer-get',
  public.get_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009402'::uuid,
    '00000000-0000-0000-0000-000000009421'::uuid,
    repeat('a', 64)
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'peer-claim',
  public.claim_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009402'::uuid,
    '00000000-0000-0000-0000-000000009421'::uuid,
    'recommend', repeat('c', 64), NULL::uuid, NULL::integer
  )
);
RESET ROLE;
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'owner-retry'), 'in_progress', 'same-key retry does not steal a live lease');
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'owner-conflict'), 'conflict', 'same owner and key with a different digest conflicts');
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'owner-kind-conflict'), 'conflict', 'same owner and key with a different kind conflicts before target lookup');
SELECT extensions.ok((SELECT NOT (decision ? 'operationState') FROM planner_operation_decisions WHERE label = 'owner-conflict'), 'conflict carries no operation state');
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'peer-get'), 'missing', 'another owner has no operation visibility');
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'peer-claim'), 'claimed', 'same operation ID is independent across owners');
SELECT extensions.is((SELECT count(*)::integer FROM private.runtime_planner_operations WHERE operation_id = '00000000-0000-0000-0000-000000009421'::uuid), 2, 'owner scope permits independent rows');

-- get is deliberately read-only, including for an already expired lease.  The
-- row is inserted with a historical authoritative lease because the transition
-- guard must correctly reject attempts to edit lease_expires_at after claim.
SET LOCAL ROLE localens_plan_rpc_owner;
INSERT INTO private.runtime_planner_operations (
  owner_user_id, operation_id, kind, request_digest,
  target_plan_id, base_revision_no, recommend_plan_id,
  planner_reservation_id, gemini_reservation_id, lease_token,
  lease_version, state, created_at, claimed_at, lease_expires_at
)
VALUES (
  '00000000-0000-0000-0000-000000009401'::uuid,
  '00000000-0000-0000-0000-000000009426'::uuid,
  'recommend', repeat('f', 64),
  NULL, NULL,
  '00000000-0000-0000-0000-000000009430'::uuid,
  '00000000-0000-0000-0000-000000009427'::uuid,
  '00000000-0000-0000-0000-000000009428'::uuid,
  '00000000-0000-0000-0000-000000009429'::uuid,
  1, 'claimed',
  TIMESTAMPTZ '2000-01-01 00:00:00+00',
  TIMESTAMPTZ '2000-01-01 00:00:00+00',
  TIMESTAMPTZ '2000-01-01 00:01:00+00'
);
RESET ROLE;
SET LOCAL ROLE service_role;
INSERT INTO planner_operation_decisions
VALUES (
  'expired-get',
   public.get_runtime_planner_operation(
     '00000000-0000-0000-0000-000000009401'::uuid,
     '00000000-0000-0000-0000-000000009426'::uuid,
     repeat('f', 64)
   )
);
RESET ROLE;
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'expired-get'), 'in_progress', 'get does not expire a row');
SELECT extensions.is((SELECT state FROM private.runtime_planner_operations WHERE owner_user_id = '00000000-0000-0000-0000-000000009401'::uuid AND operation_id = '00000000-0000-0000-0000-000000009426'::uuid), 'claimed', 'read-only get leaves the expired row claimed');

SET LOCAL ROLE service_role;
INSERT INTO planner_operation_decisions
VALUES (
  'expired-claim',
  public.claim_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009426'::uuid,
    'recommend', repeat('f', 64), NULL::uuid, NULL::integer
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'expired-complete',
  public.complete_runtime_recommendation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009426'::uuid,
    repeat('f', 64),
    '00000000-0000-0000-0000-000000009429'::uuid,
    '{}'::jsonb
  )
);
RESET ROLE;
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'expired-claim'), 'interrupted', 'claim reconciles an expired lease to interrupted');
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'expired-complete'), 'interrupted', 'an expired worker token cannot complete');
SELECT extensions.is((SELECT count(*)::integer FROM public.trip_plans WHERE id = '00000000-0000-0000-0000-000000009430'::uuid), 0, 'interrupted operation leaves no orphan plan');

SET LOCAL ROLE service_role;
INSERT INTO planner_operation_decisions
VALUES (
  'reject-claim',
  public.claim_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009422'::uuid,
    'recommend', repeat('d', 64), NULL::uuid, NULL::integer
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'rejected',
  public.reject_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009422'::uuid,
    repeat('d', 64),
    ((SELECT decision FROM planner_operation_decisions WHERE label = 'reject-claim')->>'leaseToken')::uuid,
    'CATALOG_UNAVAILABLE'
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'rejected-replay',
  public.reject_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009422'::uuid,
    repeat('d', 64),
    ((SELECT decision FROM planner_operation_decisions WHERE label = 'reject-claim')->>'leaseToken')::uuid,
    'QUOTA_EXCEEDED'
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'rejected-complete',
  public.complete_runtime_recommendation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009422'::uuid,
    repeat('d', 64),
    ((SELECT decision FROM planner_operation_decisions WHERE label = 'reject-claim')->>'leaseToken')::uuid,
    '{}'::jsonb
  )
);
RESET ROLE;
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'rejected'), 'rejected', 'allowlisted rejection is terminal');
SELECT extensions.is((SELECT decision->>'errorCode' FROM planner_operation_decisions WHERE label = 'rejected'), 'CATALOG_UNAVAILABLE', 'rejection stores only the safe code');
SELECT extensions.is((SELECT decision FROM planner_operation_decisions WHERE label = 'rejected-replay'), (SELECT decision FROM planner_operation_decisions WHERE label = 'rejected'), 'terminal rejection replay is exact and immutable');
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'rejected-complete'), 'rejected', 'old lease cannot complete a rejected operation');
SELECT extensions.throws_ok($$SELECT public.reject_runtime_planner_operation('00000000-0000-0000-0000-000000009401'::uuid, '00000000-0000-0000-0000-000000009422'::uuid, repeat('d', 64), ((SELECT decision FROM planner_operation_decisions WHERE label = 'reject-claim')->>'leaseToken')::uuid, 'not-allowlisted')$$, '22023', 'invalid rejection code', 'reject refuses an unknown code');
SET LOCAL ROLE localens_plan_rpc_owner;
SELECT extensions.throws_ok($$UPDATE private.runtime_planner_operations SET state = 'completed' WHERE operation_id = '00000000-0000-0000-0000-000000009422'::uuid$$, 'P0001', NULL::text, 'terminal operation rows are immutable');
SELECT extensions.throws_ok($$DELETE FROM private.runtime_planner_operations WHERE operation_id = '00000000-0000-0000-0000-000000009422'::uuid$$, 'P0001', NULL::text, 'operation rows cannot be deleted');
RESET ROLE;

-- Complete and replay a recommendation, then two refinements.  The first
-- refinement must replay its original revision after the plan has advanced.
SET LOCAL ROLE service_role;
INSERT INTO planner_operation_decisions
VALUES (
  'recommend-claim',
  public.claim_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009423'::uuid,
    'recommend', repeat('e', 64), NULL::uuid, NULL::integer
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'recommend-complete',
  public.complete_runtime_recommendation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009423'::uuid,
    repeat('e', 64),
    ((SELECT decision FROM planner_operation_decisions WHERE label = 'recommend-claim')->>'leaseToken')::uuid,
    (SELECT persistence_dto FROM planner_operation_fixture)
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'recommend-replay',
  public.complete_runtime_recommendation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009423'::uuid,
    repeat('e', 64),
    ((SELECT decision FROM planner_operation_decisions WHERE label = 'recommend-claim')->>'leaseToken')::uuid,
    (SELECT persistence_dto FROM planner_operation_fixture)
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'recommend-get',
  public.get_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009423'::uuid,
    repeat('e', 64)
  )
);
RESET ROLE;
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'recommend-complete'), 'completed', 'recommendation completes through the operation wrapper');
SELECT extensions.is((SELECT decision FROM planner_operation_decisions WHERE label = 'recommend-replay'), (SELECT decision FROM planner_operation_decisions WHERE label = 'recommend-complete'), 'recommendation replay returns the exact stored result');
SELECT extensions.is((SELECT latest_revision_no FROM public.trip_plans WHERE id = ((SELECT decision FROM planner_operation_decisions WHERE label = 'recommend-complete')->>'planId')::uuid), 1, 'recommendation completion persists revision one exactly once');
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'recommend-get'), 'completed', 'read-only get returns a completed decision');
SELECT extensions.is((SELECT decision->>'revision' FROM planner_operation_decisions WHERE label = 'recommend-get'), '1', 'completed get returns the stored revision reference');

SET LOCAL ROLE service_role;
INSERT INTO planner_operation_decisions
VALUES (
  'refine-one-claim',
  public.claim_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009424'::uuid,
    'refine', repeat('1', 64),
    ((SELECT decision FROM planner_operation_decisions WHERE label = 'recommend-complete')->>'planId')::uuid,
    1
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'refine-one-missing-target-conflict',
  public.claim_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009424'::uuid,
    'refine', repeat('1', 64), '00000000-0000-0000-0000-000000009432'::uuid, 1
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'refine-one-foreign-target-conflict',
  public.claim_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009424'::uuid,
    'refine', repeat('1', 64), '00000000-0000-0000-0000-000000009431'::uuid, 1
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'refine-one-complete',
  public.complete_runtime_refinement(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009424'::uuid,
    repeat('1', 64),
    ((SELECT decision FROM planner_operation_decisions WHERE label = 'refine-one-claim')->>'leaseToken')::uuid,
    jsonb_set(jsonb_set((SELECT persistence_dto FROM planner_operation_fixture), '{revisionNo}', to_jsonb(2), false), '{fingerprint}', to_jsonb(repeat('f', 64)), false)
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'refine-two-claim',
  public.claim_runtime_planner_operation(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009425'::uuid,
    'refine', repeat('2', 64),
    ((SELECT decision FROM planner_operation_decisions WHERE label = 'recommend-complete')->>'planId')::uuid,
    2
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'refine-two-complete',
  public.complete_runtime_refinement(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009425'::uuid,
    repeat('2', 64),
    ((SELECT decision FROM planner_operation_decisions WHERE label = 'refine-two-claim')->>'leaseToken')::uuid,
    jsonb_set(jsonb_set((SELECT persistence_dto FROM planner_operation_fixture), '{revisionNo}', to_jsonb(3), false), '{fingerprint}', to_jsonb(repeat('0', 64)), false)
  )
);
INSERT INTO planner_operation_decisions
VALUES (
  'refine-one-replay',
  public.complete_runtime_refinement(
    '00000000-0000-0000-0000-000000009401'::uuid,
    '00000000-0000-0000-0000-000000009424'::uuid,
    repeat('1', 64),
    ((SELECT decision FROM planner_operation_decisions WHERE label = 'refine-one-claim')->>'leaseToken')::uuid,
    jsonb_set(jsonb_set((SELECT persistence_dto FROM planner_operation_fixture), '{revisionNo}', to_jsonb(2), false), '{fingerprint}', to_jsonb(repeat('f', 64)), false)
  )
);
RESET ROLE;
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'refine-one-complete'), 'completed', 'refinement completes against its bound target and base');
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'refine-one-missing-target-conflict'), 'conflict', 'existing refine operation conflicts before validating a missing target');
SELECT extensions.is((SELECT decision->>'state' FROM planner_operation_decisions WHERE label = 'refine-one-foreign-target-conflict'), 'conflict', 'existing refine operation conflicts before validating a foreign target');
SELECT extensions.is((SELECT decision->>'revision' FROM planner_operation_decisions WHERE label = 'refine-one-complete'), '2', 'first refinement stores revision two');
SELECT extensions.is((SELECT decision->>'revision' FROM planner_operation_decisions WHERE label = 'refine-two-complete'), '3', 'second refinement advances the plan to revision three');
SELECT extensions.is((SELECT decision->>'revision' FROM planner_operation_decisions WHERE label = 'refine-one-replay'), '2', 'completed refinement replay returns its original revision');
SELECT extensions.is((SELECT latest_revision_no FROM public.trip_plans WHERE id = ((SELECT decision FROM planner_operation_decisions WHERE label = 'recommend-complete')->>'planId')::uuid), 3, 'replay does not apply the first refinement to the latest revision');
SELECT extensions.is((SELECT count(*)::integer FROM public.trip_plan_revisions WHERE plan_id = ((SELECT decision FROM planner_operation_decisions WHERE label = 'recommend-complete')->>'planId')::uuid), 3, 'replay creates no duplicate revision');

SELECT * FROM finish();
ROLLBACK;
