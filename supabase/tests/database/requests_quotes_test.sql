-- Runtime execution is deferred to the container-backed Task 16 gate.  This
-- file remains executable pgTAP and intentionally uses only deterministic
-- fixtures and the authenticated JWT roles.
BEGIN;

SELECT plan(119);

RESET ROLE;
DELETE FROM auth.users
WHERE id IN (
  '00000000-0000-0000-0000-000000000801'::uuid,
  '00000000-0000-0000-0000-000000000802'::uuid,
  '00000000-0000-0000-0000-000000000803'::uuid
);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000801'::uuid, 'authenticated', 'authenticated', 'task8-customer@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000802'::uuid, 'authenticated', 'authenticated', 'task8-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000803'::uuid, 'authenticated', 'authenticated', 'task8-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.user_roles (user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000000801'::uuid, 'customer'::public.app_role),
  ('00000000-0000-0000-0000-000000000802'::uuid, 'admin'::public.app_role),
  ('00000000-0000-0000-0000-000000000803'::uuid, 'customer'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.profiles (id, display_name, language)
VALUES
  ('00000000-0000-0000-0000-000000000801'::uuid, 'Task 8 Customer', 'en'::public.locale),
  ('00000000-0000-0000-0000-000000000802'::uuid, 'Task 8 Admin', 'en'::public.locale),
  ('00000000-0000-0000-0000-000000000803'::uuid, 'Task 8 Other', 'vi'::public.locale)
ON CONFLICT (id) DO UPDATE SET language = EXCLUDED.language;

INSERT INTO public.catalog_snapshots (id, status, published_at)
VALUES ('00000000-0000-0000-0000-000000000811'::uuid, 'published'::public.snapshot_status, now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.travel_snapshots (id, catalog_snapshot_id, status, published_at)
VALUES ('00000000-0000-0000-0000-000000000812'::uuid, '00000000-0000-0000-0000-000000000811'::uuid, 'published'::public.snapshot_status, now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fx_snapshots (id, vnd_per_usd, source, observed_at, environment, is_demo)
VALUES ('00000000-0000-0000-0000-000000000813'::uuid, 25000.00000000, 'task8-fixture', now(), 'demo', true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fx_snapshots (id, vnd_per_usd, source, observed_at, environment, is_demo)
VALUES
  ('00000000-0000-0000-0000-000000000814'::uuid, 24000.00000000, 'task8-stale', now() - interval '8 days', 'demo', true),
  ('00000000-0000-0000-0000-000000000815'::uuid, 26000.00000000, 'task8-future', now() + interval '1 hour', 'demo', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.trip_plans (id, owner_user_id, latest_revision_no)
VALUES ('00000000-0000-0000-0000-000000000821'::uuid, '00000000-0000-0000-0000-000000000801'::uuid, 3)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.trip_plan_revisions (
  id, plan_id, revision_no, base_revision_no, request_json, result_json,
  fingerprint, ranking_source, catalog_snapshot_id, travel_snapshot_id,
  fx_snapshot_id, fx_vnd_per_usd, currency, budget_vnd, total_cost_vnd,
  total_duration_minutes, actor_user_id
)
VALUES (
  '00000000-0000-0000-0000-000000000822'::uuid,
  '00000000-0000-0000-0000-000000000821'::uuid,
  3, 2, '{}'::jsonb, '{}'::jsonb, repeat('a', 64),
  'deterministic'::public.ranking_source,
  '00000000-0000-0000-0000-000000000811'::uuid,
  '00000000-0000-0000-0000-000000000812'::uuid,
  '00000000-0000-0000-0000-000000000813'::uuid, 25000.00000000,
  'USD'::public.currency_code, 10000000, 5000000, 120,
  '00000000-0000-0000-0000-000000000801'::uuid
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.trip_plan_revisions (
  id, plan_id, revision_no, base_revision_no, request_json, result_json,
  fingerprint, ranking_source, catalog_snapshot_id, travel_snapshot_id,
  fx_snapshot_id, fx_vnd_per_usd, currency, budget_vnd, total_cost_vnd,
  total_duration_minutes, actor_user_id
)
VALUES (
  '00000000-0000-0000-0000-000000000823'::uuid,
  '00000000-0000-0000-0000-000000000821'::uuid,
  4, 3, '{"resubmitted":true}'::jsonb, '{}'::jsonb, repeat('b', 64),
  'deterministic'::public.ranking_source,
  '00000000-0000-0000-0000-000000000811'::uuid,
  '00000000-0000-0000-0000-000000000812'::uuid,
  '00000000-0000-0000-0000-000000000813'::uuid, 25000.00000000,
  'USD'::public.currency_code, 12000000, 6000000, 150,
  '00000000-0000-0000-0000-000000000801'::uuid
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.trip_plans (id, owner_user_id, latest_revision_no)
VALUES ('00000000-0000-0000-0000-000000000824'::uuid, '00000000-0000-0000-0000-000000000801'::uuid, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.trip_plan_revisions (
  id, plan_id, revision_no, base_revision_no, request_json, result_json,
  fingerprint, ranking_source, catalog_snapshot_id, travel_snapshot_id,
  fx_snapshot_id, fx_vnd_per_usd, currency, budget_vnd, total_cost_vnd,
  total_duration_minutes, actor_user_id
)
VALUES (
  '00000000-0000-0000-0000-000000000825'::uuid,
  '00000000-0000-0000-0000-000000000824'::uuid,
  1, 0, '{}'::jsonb, '{}'::jsonb, repeat('c', 64),
  'deterministic'::public.ranking_source,
  '00000000-0000-0000-0000-000000000811'::uuid,
  '00000000-0000-0000-0000-000000000812'::uuid,
  '00000000-0000-0000-0000-000000000813'::uuid, 25000.00000000,
  'USD'::public.currency_code, 9000000, 4500000, 90,
  '00000000-0000-0000-0000-000000000801'::uuid
)
ON CONFLICT (id) DO NOTHING;

-- Shape, indexes, and RLS are checked before exercising the wrappers.
SELECT ok(to_regclass('public.custom_requests') IS NOT NULL, 'custom_requests table exists');
SELECT ok(to_regclass('private.custom_request_events') IS NOT NULL, 'request events table exists');
SELECT ok(to_regclass('public.custom_quotes') IS NOT NULL, 'custom_quotes table exists');
SELECT ok(to_regclass('public.customer_custom_requests_v') IS NOT NULL, 'customer request projection exists');
SELECT ok(to_regclass('public.admin_custom_request_queue_v') IS NOT NULL, 'admin request projection exists');
SELECT ok(to_regclass('public.customer_custom_quotes_v') IS NOT NULL, 'customer quote projection exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.custom_requests'::regclass AND attname = 'revision_id' AND NOT attisdropped), 'request binds an immutable revision');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'private.custom_request_events'::regclass AND attname = 'revision_id' AND NOT attisdropped), 'request events snapshot revision identity');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.custom_quotes'::regclass AND attname = 'valid_until' AND attgenerated = 's'), 'quote validity is generated by the database');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE indexname = 'custom_requests_one_active_per_plan'), 'one active request index exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE indexname = 'custom_quotes_one_sellable_per_request'), 'one sellable quote index exists');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.custom_requests'::regclass), 'requests have RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.custom_requests'::regclass), 'requests force RLS');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.custom_request_events'::regclass), 'events have RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.custom_request_events'::regclass), 'events force RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.custom_quotes'::regclass), 'quotes force RLS');
SELECT ok(
  ARRAY(SELECT rolname FROM pg_catalog.pg_roles WHERE rolname LIKE 'localens_%' ORDER BY rolname) = ARRAY[
    'localens_admin_rpc_owner', 'localens_audit_guard_owner', 'localens_auth_trigger_owner',
    'localens_build_executor', 'localens_catalog_guard_owner', 'localens_catalog_rpc_owner',
    'localens_claim_rpc_owner', 'localens_guest_executor', 'localens_guest_rpc_owner',
    'localens_identity_rpc_owner', 'localens_plan_guard_owner', 'localens_plan_rpc_owner',
    'localens_quota_executor', 'localens_quota_rpc_owner', 'localens_request_admin_rpc_owner',
    'localens_request_customer_rpc_owner', 'localens_request_guard_owner', 'localens_tour_guard_owner',
    'localens_tour_rpc_owner', 'localens_webhook_executor'
  ]::text[],
  'protected role registry is exactly 20 roles'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname LIKE 'localens_%'
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)
  ),
  'all protected roles are hardened'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname LIKE 'localens_%'
      AND ((rolname IN ('localens_guest_executor', 'localens_quota_executor') AND NOT rolcanlogin)
        OR (rolname NOT IN ('localens_guest_executor', 'localens_quota_executor') AND rolcanlogin))
  ),
  'protected roles preserve the exact login class'
);
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members AS m JOIN pg_catalog.pg_roles AS r ON r.oid = m.roleid WHERE r.rolname LIKE 'localens_%'), 'protected roles have no memberships');
SELECT ok(NOT has_table_privilege('anon', 'public.custom_requests', 'SELECT'), 'anon cannot read request base table');
SELECT ok(NOT has_table_privilege('authenticated', 'public.custom_quotes', 'SELECT'), 'authenticated cannot read quote base table');
SELECT ok(has_table_privilege('localens_request_customer_rpc_owner', 'public.custom_requests', 'INSERT') AND has_column_privilege('localens_request_customer_rpc_owner', 'public.custom_requests', 'revision_id', 'UPDATE') AND has_column_privilege('localens_request_customer_rpc_owner', 'public.custom_requests', 'revision_no', 'UPDATE') AND NOT has_column_privilege('localens_request_customer_rpc_owner', 'public.custom_requests', 'owner_user_id', 'UPDATE'), 'customer request owner has only guarded request writes');
SELECT ok(has_column_privilege('localens_request_admin_rpc_owner', 'public.custom_requests', 'status', 'UPDATE') AND has_column_privilege('localens_request_admin_rpc_owner', 'public.custom_requests', 'latest_decision_at', 'UPDATE') AND NOT has_column_privilege('localens_request_admin_rpc_owner', 'public.custom_requests', 'revision_id', 'UPDATE'), 'admin request owner has only review writes');
SELECT ok(has_column_privilege('localens_request_customer_rpc_owner', 'public.trip_plans', 'id', 'UPDATE') AND has_column_privilege('localens_request_customer_rpc_owner', 'public.trip_plan_revisions', 'id', 'UPDATE') AND NOT has_column_privilege('localens_request_customer_rpc_owner', 'public.trip_plans', 'owner_user_id', 'UPDATE') AND NOT has_column_privilege('localens_request_customer_rpc_owner', 'public.trip_plan_revisions', 'revision_no', 'UPDATE'), 'customer request owner has only source lock writes');
SELECT ok(has_column_privilege('localens_request_admin_rpc_owner', 'public.trip_plans', 'id', 'UPDATE') AND has_column_privilege('localens_request_admin_rpc_owner', 'public.trip_plan_revisions', 'id', 'UPDATE') AND NOT has_column_privilege('localens_request_admin_rpc_owner', 'public.trip_plans', 'owner_user_id', 'UPDATE') AND NOT has_column_privilege('localens_request_admin_rpc_owner', 'public.trip_plan_revisions', 'revision_no', 'UPDATE'), 'admin request owner has only source lock writes');
SELECT ok(has_column_privilege('localens_request_admin_rpc_owner', 'public.custom_quotes', 'id', 'UPDATE') AND has_column_privilege('localens_request_admin_rpc_owner', 'public.fx_snapshots', 'id', 'UPDATE') AND NOT has_column_privilege('localens_request_admin_rpc_owner', 'public.custom_quotes', 'amount_vnd_minor', 'UPDATE') AND NOT has_column_privilege('localens_request_admin_rpc_owner', 'public.fx_snapshots', 'vnd_per_usd', 'UPDATE'), 'admin quote owner has only quote and FX lock writes');
SELECT ok(
  (SELECT count(*) FROM pg_catalog.pg_policies
   WHERE schemaname = 'public'
     AND cmd = 'UPDATE'
     AND (
       (policyname = 'trip_plans_request_customer_rpc_lock' AND tablename = 'trip_plans' AND roles = ARRAY['localens_request_customer_rpc_owner']::name[])
       OR (policyname = 'trip_plan_revisions_request_customer_rpc_lock' AND tablename = 'trip_plan_revisions' AND roles = ARRAY['localens_request_customer_rpc_owner']::name[])
       OR (policyname = 'trip_plans_request_admin_rpc_lock' AND tablename = 'trip_plans' AND roles = ARRAY['localens_request_admin_rpc_owner']::name[])
       OR (policyname = 'trip_plan_revisions_request_admin_rpc_lock' AND tablename = 'trip_plan_revisions' AND roles = ARRAY['localens_request_admin_rpc_owner']::name[])
       OR (policyname = 'fx_snapshots_request_admin_rpc_lock' AND tablename = 'fx_snapshots' AND roles = ARRAY['localens_request_admin_rpc_owner']::name[])
     )) = 5,
  'source lock UPDATE policies are owner-scoped'
);
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'trip_plans_request_id_immutable'), 'trip plan id immutable trigger exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proname = 'reject_custom_quote_mutation' AND pg_get_functiondef(oid) LIKE '%OLD.id IS DISTINCT FROM NEW.id%'), 'quote immutable guard protects id');
SELECT ok(has_table_privilege('localens_request_customer_rpc_owner', 'private.custom_request_events', 'INSERT'), 'customer request owner can append events');
SELECT ok(NOT has_table_privilege('authenticated', 'private.custom_request_events', 'SELECT'), 'API roles cannot read request events');
SELECT ok(has_function_privilege('authenticated', 'public.submit_custom_request(uuid,integer)', 'EXECUTE'), 'customer submit wrapper is callable');
SELECT ok(has_function_privilege('authenticated', 'public.review_custom_request(uuid,public.request_status,text)', 'EXECUTE'), 'review wrapper is callable');
SELECT ok(has_function_privilege('authenticated', 'public.create_custom_quote(uuid,bigint,public.checkout_currency,text,text,text)', 'EXECUTE'), 'quote wrapper is callable');
SELECT ok(NOT has_function_privilege('anon', 'public.submit_custom_request(uuid,integer)', 'EXECUTE'), 'anonymous submit is denied');
SELECT ok(NOT has_function_privilege('authenticated', 'private.submit_custom_request(uuid,integer)', 'EXECUTE'), 'private submit is denied');
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.submit_custom_request(uuid,integer)'::regprocedure), 'submit wrapper is SECURITY DEFINER');
SELECT ok((SELECT proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc WHERE oid = 'public.submit_custom_request(uuid,integer)'::regprocedure), 'submit pins an empty search path');
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.create_custom_quote(uuid,bigint,public.checkout_currency,text,text,text)'::regprocedure), 'quote wrapper is SECURITY DEFINER');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'custom_request_events_append_only_truncate'), 'request events reject TRUNCATE');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'custom_quotes_immutable_facts'), 'quote immutable trigger exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'custom_request_events_append_only'), 'request events reject UPDATE/DELETE');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.custom_quotes'::regclass AND pg_get_constraintdef(oid) LIKE '%48 hours%'), 'quote validity is 48 hours');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.custom_quotes'::regclass AND pg_get_constraintdef(oid) LIKE '%checkout_amount_minor%amount_vnd_minor%'), 'VND amount equality is guarded');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.custom_quotes'::regclass AND pg_get_constraintdef(oid) LIKE '%fx_snapshot_id%'), 'quote FX nullability is guarded');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'custom_requests' AND policyname = 'custom_requests_customer_select'), 'customer request ownership policy exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'custom_quotes' AND policyname = 'custom_quotes_customer_select'), 'customer quote ownership policy exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'private' AND tablename = 'custom_request_events' AND policyname = 'custom_request_events_customer_rpc_owner_all'), 'event owner policy exists');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('submit_custom_request', 'review_custom_request', 'create_custom_quote') AND pg_get_functiondef(p.oid) ~ 'request\.headers'), 'RPCs do not inspect HTTP headers');

-- Customer submission derives the actor, locks the plan/revision, and emits a
-- single append-only event plus safe scalar audit data.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000801', 'role', 'authenticated', 'locale', 'en')::text, true);
SELECT ok((SELECT count(*) = 0 FROM public.customer_custom_requests_v), 'customer starts without a request');
SELECT is((SELECT status FROM public.submit_custom_request('00000000-0000-0000-0000-000000000821'::uuid, 3)), 'pending_review'::public.request_status, 'submit creates pending review');
SELECT ok((SELECT count(*) = 1 FROM public.customer_custom_requests_v), 'customer sees own request');
RESET ROLE;
SET LOCAL ROLE localens_request_customer_rpc_owner;
SELECT ok((SELECT count(*) = 1 FROM private.custom_request_events WHERE request_id = (SELECT id FROM public.custom_requests WHERE plan_id = '00000000-0000-0000-0000-000000000821'::uuid)), 'submit appends one request event');
SELECT is((SELECT revision_id FROM private.custom_request_events WHERE request_id = (SELECT id FROM public.custom_requests WHERE plan_id = '00000000-0000-000000000821'::uuid) ORDER BY created_at, id LIMIT 1), '00000000-0000-0000-0000-000000000822'::uuid, 'submit snapshots revision identity');
RESET ROLE;
SELECT is((SELECT status FROM public.custom_requests WHERE id = '00000000-0000-0000-0000-000000000901'::uuid), NULL::public.request_status, 'unknown request does not enumerate through a guessed id');
SELECT ok((SELECT count(*) = 1 FROM public.custom_requests WHERE plan_id = '00000000-0000-0000-0000-000000000821'::uuid AND status = 'pending_review'), 'one active request exists');
SELECT throws_ok($$SELECT public.submit_custom_request('00000000-0000-0000-0000-000000000821'::uuid, 2)$$, 'P0001', 'custom request operation failed', 'stale revision does not leak details');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000803', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000803', 'role', 'authenticated')::text, true);
SELECT ok((SELECT count(*) = 0 FROM public.customer_custom_requests_v), 'other customer sees no request');
SELECT throws_ok($$SELECT public.submit_custom_request('00000000-0000-0000-0000-000000000821'::uuid, 3)$$, 'P0001', 'custom request operation failed', 'cross-owner submission is safe');
SELECT throws_ok($$SELECT public.review_custom_request('00000000-0000-0000-0000-000000000901'::uuid, 'approved'::public.request_status, NULL)$$, 'P0001', 'custom request operation failed', 'non-admin review is safe');
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000803', 'role', 'admin')::text, true);
SELECT throws_ok($$SELECT public.review_custom_request('00000000-0000-0000-0000-000000000901'::uuid, 'approved'::public.request_status, NULL)$$, 'P0001', 'custom request operation failed', 'forged admin JWT role is ignored');
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000803', 'role', 'service_role')::text, true);
SELECT throws_ok($$SELECT public.create_custom_quote('00000000-0000-0000-0000-000000000901'::uuid, 1, 'vnd'::public.checkout_currency, 'No', 'Không', 'No')$$, 'P0001', 'custom request operation failed', 'forged service role JWT is ignored');
RESET ROLE;

-- Admin review follows the exact transition table and stores note only in the
-- private event stream, never in the customer projection.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000802', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000802', 'role', 'authenticated')::text, true);
SELECT is((SELECT count(*)::integer FROM public.admin_custom_request_queue_v WHERE status = 'pending_review'), 1, 'admin sees the pending queue row');
SELECT throws_ok($$SELECT public.review_custom_request((SELECT id FROM public.custom_requests LIMIT 1), 'changes_requested'::public.request_status, NULL)$$, 'P0001', 'custom request operation failed', 'changes request requires a note');
SELECT is((SELECT status FROM public.review_custom_request((SELECT id FROM public.custom_requests LIMIT 1), 'changes_requested'::public.request_status, 'Please adjust the route.')), 'changes_requested'::public.request_status, 'admin can request changes');
RESET ROLE;
SET LOCAL ROLE localens_request_admin_rpc_owner;
SELECT ok((SELECT count(*) = 1 FROM private.custom_request_events WHERE request_id = (SELECT id FROM public.custom_requests LIMIT 1) AND event_type = 'request_changes_requested' AND note = 'Please adjust the route.'), 'admin note stays in private event');
RESET ROLE;
SELECT is((SELECT status FROM public.custom_requests LIMIT 1), 'changes_requested'::public.request_status, 'changes requested state is persisted');
SELECT throws_ok($$SELECT public.review_custom_request((SELECT id FROM public.custom_requests LIMIT 1), 'approved'::public.request_status, NULL)$$, 'P0001', 'custom request operation failed', 'only pending review can be reviewed');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000801', 'role', 'authenticated')::text, true);
SELECT is((SELECT status FROM public.submit_custom_request('00000000-0000-0000-0000-000000000821'::uuid, 4)), 'pending_review'::public.request_status, 'customer can resubmit after changes with a new revision');
SELECT is((SELECT revision_no FROM public.custom_requests WHERE plan_id = '00000000-0000-0000-0000-000000000821'::uuid), 4, 'resubmit binds revision four');
RESET ROLE;
SET LOCAL ROLE localens_request_customer_rpc_owner;
SELECT is((SELECT array_agg(revision_no ORDER BY created_at, id) FROM private.custom_request_events WHERE request_id = (SELECT id FROM public.custom_requests LIMIT 1)), ARRAY[3, 3, 4]::integer[], 'request events preserve every submitted revision');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000802', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000802', 'role', 'authenticated')::text, true);
SELECT is((SELECT status FROM public.review_custom_request((SELECT id FROM public.custom_requests LIMIT 1), 'approved'::public.request_status, NULL)), 'approved'::public.request_status, 'admin can approve pending review');
RESET ROLE;
SET LOCAL ROLE localens_request_customer_rpc_owner;
SELECT is((SELECT count(*)::integer FROM private.custom_request_events WHERE request_id = (SELECT id FROM public.custom_requests LIMIT 1)), 4, 'request event stream is append-only across review and resubmit');
SELECT is((SELECT array_agg(revision_no ORDER BY created_at, id) FROM private.custom_request_events WHERE request_id = (SELECT id FROM public.custom_requests LIMIT 1)), ARRAY[3, 3, 4, 4]::integer[], 'review event snapshots the approved revision');
RESET ROLE;

-- Quote creation derives every snapshot and commercial fact from the approved
-- revision; only one active quote can win.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000802', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000802', 'role', 'admin')::text, true);
SELECT is((SELECT status FROM public.create_custom_quote((SELECT id FROM public.custom_requests LIMIT 1), 2500000, 'vnd'::public.checkout_currency, 'Cho Lon walk', 'Đi bộ Chợ Lớn', 'Demo policy')), 'active'::public.quote_status, 'admin creates an active VND quote');
SELECT is((SELECT count(*)::integer FROM public.custom_quotes WHERE request_id = (SELECT id FROM public.custom_requests LIMIT 1)), 1, 'one quote is created');
SELECT is((SELECT checkout_amount_minor FROM public.custom_quotes LIMIT 1), 2500000::bigint, 'VND checkout amount is server-owned');
SELECT ok((SELECT fx_snapshot_id IS NULL AND fx_vnd_per_usd IS NULL FROM public.custom_quotes LIMIT 1), 'VND quote has no FX snapshot');
SELECT ok((SELECT valid_until = created_at + interval '48 hours' FROM public.custom_quotes LIMIT 1), 'quote validity is exactly 48 hours');
SELECT throws_ok($$SELECT public.create_custom_quote((SELECT id FROM public.custom_requests LIMIT 1), 2500000, 'vnd'::public.checkout_currency, 'Duplicate', 'Trùng', 'Policy')$$, 'P0001', 'custom request operation failed', 'duplicate sellable quote is safe');
SELECT is((SELECT count(*)::integer FROM public.customer_custom_quotes_v), 0, 'admin cannot see the customer quote projection');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000801', 'role', 'authenticated', 'locale', 'en')::text, true);
SELECT is((SELECT count(*)::integer FROM public.customer_custom_quotes_v), 1, 'customer sees the own quote projection');
SELECT is((SELECT title FROM public.customer_custom_quotes_v LIMIT 1), 'Cho Lon walk', 'customer quote title uses profile language');
RESET ROLE;
UPDATE public.profiles SET language = 'vi'::public.locale WHERE id = '00000000-0000-0000-0000-000000000801'::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
SELECT is((SELECT title FROM public.customer_custom_quotes_v LIMIT 1), 'Đi bộ Chợ Lớn', 'customer quote title switches by profile language');
RESET ROLE;
UPDATE public.profiles SET language = 'en'::public.locale WHERE id = '00000000-0000-0000-0000-000000000801'::uuid;
SELECT throws_ok($$UPDATE public.custom_quotes SET amount_vnd_minor = 1 WHERE request_id = (SELECT id FROM public.custom_requests LIMIT 1)$$, '42501', 'custom quote commercial facts are immutable', 'quote money cannot be changed');
SELECT throws_ok($$UPDATE public.custom_requests SET status = 'approved'::public.request_status WHERE plan_id = '00000000-0000-0000-0000-000000000821'::uuid$$, '42501', 'custom request state transition is invalid', 'request state machine rejects an illegal transition');
SELECT throws_ok($$DELETE FROM private.custom_request_events$$, '42501', 'custom request events are append-only', 'request events cannot be deleted');
SELECT throws_ok($$UPDATE private.custom_request_events SET note = 'changed'$$, '42501', 'custom request events are append-only', 'request events cannot be updated');
SELECT throws_ok($$TRUNCATE private.custom_request_events$$, '42501', 'custom request events are append-only', 'request events cannot be truncated');
SET LOCAL ROLE localens_admin_rpc_owner;
SELECT is((SELECT count(*)::integer FROM private.audit_events WHERE target_id = (SELECT id FROM public.custom_requests LIMIT 1) AND event_type IN ('request_submitted', 'request_changes_requested', 'request_approved')), 4, 'request audit stream records each state transition');
SELECT is((SELECT count(*)::integer FROM private.audit_events WHERE event_type = 'quote_created'), 2, 'quote audit records both scalar facts');
SELECT ok(NOT EXISTS (SELECT 1 FROM private.audit_events WHERE metadata_text LIKE '%private%' OR metadata_text LIKE '%note%'), 'audit metadata has no free-form note');
RESET ROLE;
SELECT throws_ok($$SELECT public.create_custom_quote((SELECT id FROM public.custom_requests LIMIT 1), 9007199254740992, 'vnd'::public.checkout_currency, 'Too high', 'Quá cao', 'Policy')$$, 'P0001', 'custom request operation failed', 'unsafe quote amount is rejected');
SELECT throws_ok($$SELECT public.create_custom_quote((SELECT id FROM public.custom_requests LIMIT 1), 0, 'vnd'::public.checkout_currency, 'Zero', 'Không', 'Policy')$$, 'P0001', 'custom request operation failed', 'zero quote amount is rejected');
SELECT throws_ok($$SELECT public.create_custom_quote((SELECT id FROM public.custom_requests LIMIT 1), 2500000, 'vnd'::public.checkout_currency, E'Bad\nTitle', 'Tiêu đề', 'Policy')$$, 'P0001', 'custom request operation failed', 'control characters in English title are rejected');
SELECT throws_ok($$SELECT public.create_custom_quote((SELECT id FROM public.custom_requests LIMIT 1), 2500000, 'vnd'::public.checkout_currency, 'Title', E'Bad\nTiêu đề', 'Policy')$$, 'P0001', 'custom request operation failed', 'control characters in Vietnamese title are rejected');
SELECT throws_ok($$SELECT public.create_custom_quote((SELECT id FROM public.custom_requests LIMIT 1), 2500000, 'vnd'::public.checkout_currency, 'Title', 'Tiêu đề', E'Bad\nPolicy')$$, 'P0001', 'custom request operation failed', 'control characters in policy are rejected');
SELECT is((SELECT count(*)::integer FROM public.fx_snapshots WHERE id IN ('00000000-0000-0000-0000-000000000814'::uuid, '00000000-0000-0000-0000-000000000815'::uuid) AND observed_at <= clock_timestamp() AND observed_at >= clock_timestamp() - interval '7 days'), 0, 'stale and future FX snapshots are rejected');
SELECT is((SELECT id FROM public.fx_snapshots WHERE environment = 'demo' AND is_demo = true AND observed_at <= clock_timestamp() AND observed_at >= clock_timestamp() - interval '7 days' ORDER BY observed_at DESC, id DESC LIMIT 1), '00000000-0000-0000-0000-000000000813'::uuid, 'fresh demo FX is selected');

-- A separate approved request proves USD conversion is not masked by the VND
-- quote on the first request.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000801', 'role', 'authenticated')::text, true);
SELECT is((SELECT status FROM public.submit_custom_request('00000000-0000-0000-0000-000000000824'::uuid, 1)), 'pending_review'::public.request_status, 'second request submits for USD quote');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000802', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-000000000802', 'role', 'authenticated')::text, true);
SELECT is((SELECT status FROM public.review_custom_request((SELECT id FROM public.custom_requests WHERE plan_id = '00000000-0000-0000-0000-000000000824'::uuid), 'approved'::public.request_status, NULL)), 'approved'::public.request_status, 'second request is approved for USD quote');
SELECT is((SELECT status FROM public.create_custom_quote((SELECT id FROM public.custom_requests WHERE plan_id = '00000000-0000-0000-0000-000000000824'::uuid), 2500001, 'usd'::public.checkout_currency, 'USD walk', 'Đi bộ USD', 'USD policy')), 'active'::public.quote_status, 'admin creates USD quote with fresh FX');
RESET ROLE;
SELECT is((SELECT checkout_amount_minor FROM public.custom_quotes WHERE request_id = (SELECT id FROM public.custom_requests WHERE plan_id = '00000000-0000-0000-0000-000000000824'::uuid)), 10001::bigint, 'USD quote uses exact ceiling conversion');
SELECT is((SELECT fx_snapshot_id FROM public.custom_quotes WHERE request_id = (SELECT id FROM public.custom_requests WHERE plan_id = '00000000-0000-0000-0000-000000000824'::uuid)), '00000000-0000-0000-0000-000000000813'::uuid, 'USD quote stores fresh demo FX snapshot');
RESET ROLE;

-- Safe projection and role/grant boundaries remain true after state changes.
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_custom_requests_v' AND column_name IN ('owner_user_id', 'admin_note', 'actor_user_id')), 'customer request projection omits private columns');
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_custom_quotes_v' AND column_name IN ('fx_snapshot_id', 'fx_vnd_per_usd', 'title_en', 'title_vi')), 'customer quote projection omits snapshot/title internals');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.custom_quotes'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%'), 'quote source FKs are restrictive');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.custom_requests'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%'), 'request source FKs are restrictive');
SELECT ok((SELECT count(*) = 2 FROM public.custom_requests WHERE status = 'approved'), 'request approvals remain auditable');
SELECT ok((SELECT count(*) = 2 FROM public.custom_quotes WHERE status = 'active'), 'each approved request has one sellable quote');
SELECT ok(NOT has_table_privilege('authenticated', 'private.audit_events', 'INSERT'), 'authenticated cannot forge audit events');
SELECT ok(NOT has_table_privilege('authenticated', 'private.custom_request_events', 'INSERT'), 'authenticated cannot forge request events');
SELECT ok(NOT has_table_privilege('localens_request_customer_rpc_owner', 'public.catalog_snapshots', 'SELECT') AND NOT has_table_privilege('localens_request_customer_rpc_owner', 'public.travel_snapshots', 'SELECT') AND NOT has_table_privilege('localens_request_customer_rpc_owner', 'public.fx_snapshots', 'SELECT'), 'customer request owner has no snapshot source grants');
SELECT ok(NOT has_table_privilege('localens_request_customer_rpc_owner', 'private.audit_events', 'INSERT') AND NOT has_table_privilege('localens_request_admin_rpc_owner', 'private.audit_events', 'INSERT'), 'request owners cannot insert audit rows directly');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE pg_get_userbyid(p.proowner) IN ('postgres', 'service_role') AND p.proname IN ('submit_custom_request', 'review_custom_request', 'create_custom_quote')), 'public wrappers have named owners');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members AS m JOIN pg_catalog.pg_roles AS parent_role ON parent_role.oid = m.roleid JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = m.member WHERE parent_role.rolname LIKE 'localens_%' OR member_role.rolname LIKE 'localens_%'), 'protected request roles have no inherited grants');
SELECT ok((SELECT count(*) = 1 FROM public.custom_requests WHERE plan_id = '00000000-0000-0000-0000-000000000821'::uuid), 'one active request invariant holds');
SELECT ok((SELECT count(*) = 1 FROM public.custom_quotes WHERE request_id = (SELECT id FROM public.custom_requests LIMIT 1) AND status IN ('active', 'checkout_pending')), 'one sellable quote invariant holds');

SELECT * FROM finish();
ROLLBACK;
