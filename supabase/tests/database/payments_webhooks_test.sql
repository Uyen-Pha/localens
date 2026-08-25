-- Runtime execution is deferred to the container-backed Task 16 gate. This
-- remains executable pgTAP and proves the payment/webhook security contract.
-- webhook event idempotency and early webhook races are covered below.
BEGIN;

SELECT plan(101);
RESET ROLE;

SELECT ok(to_regclass('public.payments') IS NOT NULL, 'payments table exists');
SELECT ok(to_regclass('private.webhook_events') IS NOT NULL, 'webhook events table exists');
SELECT ok(to_regclass('private.stripe_test_settings') IS NOT NULL, 'Stripe Test settings exist');
SELECT ok(to_regclass('public.customer_payment_status_v') IS NOT NULL, 'customer payment projection exists');
SELECT ok(to_regprocedure('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)') IS NOT NULL, 'payment finalizer exists');
SELECT ok(to_regprocedure('public.reconcile_payment(uuid,public.booking_status)') IS NOT NULL, 'admin reconciliation exists');
SELECT ok(to_regprocedure('private.record_checkout_session(uuid,uuid,text,timestamptz)') IS NOT NULL, 'hydrated session recorder exists');

SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.payments'::regclass), 'payments have RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.payments'::regclass), 'payments force RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.webhook_events'::regclass), 'webhook events force RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.stripe_test_settings'::regclass), 'Stripe Test settings force RLS');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.payments'::regclass AND attname = 'provider_session_id'), 'payment stores provider session identity');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.payments'::regclass AND attname = 'provider_payment_intent_id'), 'payment stores provider intent identity');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.payments'::regclass AND attname = 'provider_account_id'), 'payment stores provider account binding');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.payments'::regclass AND attname = 'provider_endpoint_id'), 'payment stores provider endpoint binding');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'private.webhook_events'::regclass AND attname = 'payload_hash'), 'events store only a payload hash');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'private.webhook_events'::regclass AND attname IN ('raw_body', 'signature', 'secret', 'token')), 'events do not store provider secrets or bodies');

SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.payments'::regclass AND conname LIKE '%booking_id%key%'), 'one payment fact per booking');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.payments'::regclass AND conname LIKE '%attempt_id%key%'), 'one payment fact per checkout attempt');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE indexname = 'payments_provider_payment_intent_key'), 'provider intent is unique when present');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.payments'::regclass AND pg_get_constraintdef(oid) LIKE '%provider_session_id%'), 'provider session is unique');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'private.webhook_events'::regclass AND pg_get_constraintdef(oid) LIKE '%provider_event_id%'), 'provider event id is unique');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE indexname = 'webhook_events_provider_session_type_key'), 'session event type identity is unique');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE indexname = 'webhook_events_provider_payment_intent_key'), 'event intent identity is unique when present');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'private.webhook_events'::regclass AND pg_get_constraintdef(oid) ~* 'livemode.*false'), 'events are Test mode only');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'private.stripe_test_settings'::regclass AND pg_get_constraintdef(oid) ~* 'livemode.*false'), 'server settings are Test mode only');
SELECT ok(EXISTS (SELECT 1 FROM private.stripe_test_settings WHERE id = true AND stripe_test_account_id LIKE 'acct_%' AND stripe_test_endpoint_id LIKE 'we_%'), 'expected Test account and endpoint are server owned');

SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure), 'finalizer is SECURITY DEFINER');
SELECT ok((SELECT proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc WHERE oid = 'private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure), 'finalizer pins empty search_path');
SELECT ok((SELECT pg_get_userbyid(proowner) = 'localens_payment_rpc_owner' FROM pg_catalog.pg_proc WHERE oid = 'private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure), 'finalizer has a named non-login owner');
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.reconcile_payment(uuid,public.booking_status)'::regprocedure), 'reconciliation is SECURITY DEFINER');
SELECT ok((SELECT proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc WHERE oid = 'public.reconcile_payment(uuid,public.booking_status)'::regprocedure), 'reconciliation pins empty search_path');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proname IN ('finalize_stripe_event', 'reconcile_payment') AND pg_get_userbyid(proowner) IN ('postgres', 'service_role')), 'payment definers are not superuser or service role');
SELECT ok(NOT has_function_privilege('anon', 'private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)', 'EXECUTE'), 'anonymous cannot finalize events');
SELECT ok(NOT has_function_privilege('authenticated', 'private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)', 'EXECUTE'), 'browser role cannot finalize events');
SELECT ok(has_function_privilege('localens_webhook_executor', 'private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)', 'EXECUTE'), 'only webhook executor can call finalizer');
SELECT ok(has_function_privilege('authenticated', 'public.reconcile_payment(uuid,public.booking_status)', 'EXECUTE'), 'authenticated reaches only guarded reconciliation');

SELECT ok(NOT has_table_privilege('anon', 'public.payments', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.payments', 'SELECT'), 'API roles cannot read payment facts');
SELECT ok(NOT has_table_privilege('anon', 'private.webhook_events', 'SELECT') AND NOT has_table_privilege('authenticated', 'private.webhook_events', 'SELECT'), 'API roles cannot read webhook facts');
SELECT ok(NOT has_table_privilege('authenticated', 'public.payments', 'INSERT'), 'browser role cannot forge payment facts');
SELECT ok(NOT has_table_privilege('authenticated', 'private.webhook_events', 'INSERT'), 'browser role cannot forge webhook facts');
SELECT ok(has_table_privilege('authenticated', 'public.customer_payment_status_v', 'SELECT'), 'customer receives named payment projection');
SELECT ok(NOT has_table_privilege('authenticated', 'public.bookings', 'SELECT'), 'customer projection does not grant booking base access');
SELECT ok(NOT has_table_privilege('authenticated', 'private.stripe_test_settings', 'SELECT'), 'customer cannot read Stripe Test configuration');
SELECT ok(NOT has_table_privilege('localens_payment_projection_owner', 'public.payments', 'UPDATE'), 'projection owner has no payment write privilege');
SELECT ok(NOT has_table_privilege('localens_payment_projection_owner', 'public.payments', 'DELETE'), 'projection owner has no payment delete privilege');

SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'payments_status_guard'), 'payment status guard exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'webhook_events_append_only'), 'webhook append-only guard exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'webhook_events_append_only_truncate'), 'webhook truncate guard exists');
SELECT ok(pg_get_functiondef('private.assert_payment_mutation()'::regprocedure) ~* 'pending.*paid|pending.*failed|pending.*review', 'payment transitions are explicit');
SELECT ok(pg_get_functiondef('private.assert_payment_mutation()'::regprocedure) ~* 'review.*paid|review.*failed', 'only audited path leaves payment review');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) !~* $$status = 'review'.*status = 'paid'$$, 'webhook executor cannot promote reviewed payment');
SELECT ok(pg_get_functiondef('private.reject_webhook_mutation()'::regprocedure) ~* 'append-only', 'webhook events are immutable');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'livemode.*false', 'finalizer rejects live mode');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'settings_row.*stripe_test_account_id', 'finalizer uses server account binding');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'settings_row.*stripe_test_endpoint_id', 'finalizer uses server endpoint binding');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'mode.*payment', 'finalizer requires payment mode');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'payload_hash.*64', 'finalizer accepts a strict SHA-256 envelope');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'event_row.*payload_hash', 'same event id replays only the same hash');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'webhook_conflict', 'different hash records a conflict audit');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'ON CONFLICT.*provider_event_id', 'same-event races reserve one receipt before side effects');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'event_row.status.*received', 'only a received receipt can be terminalized');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'event_status := .conflict', 'hash conflict returns a conflict result without mutation');

SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'checkout_pending.*accepted', 'paid custom quote is accepted and never reactivated');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'checkout.session.expired', 'expired event is handled separately');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'active.*expired', 'expired hold is released before review');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'status = CASE WHEN expires_at <= current_time THEN .expired.*released', 'expired session releases an unexpired active hold');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'payment_review', 'paid without an active hold enters payment review');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'consumed', 'paid with an active hold consumes that hold');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'confirmed', 'paid with valid capacity confirms a booking');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'status IN.*pending_payment.*payment_processing', 'only pending or processing bookings are changed');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'confirmed.*payment_review', 'confirmed or reviewed bookings are never downgraded');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'terminal/incompatible', 'terminal booking status remains unchanged on late payment');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'idempotency_row.*source.*booking.*hold.*attempt.*payment', 'finalizer documents the common lock order');
SELECT ok(strpos(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure), 'current_time := pg_catalog.clock_timestamp()') > strpos(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure), 'SELECT * INTO payment_row FROM public.payments WHERE booking_id = booking_row.id FOR UPDATE') AND strpos(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure), 'current_time := pg_catalog.clock_timestamp()') < strpos(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure), 'hold_is_active :='), 'finalizer samples time after payment lock before hold evaluation');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'provider_session_id IS NULL', 'early webhook attaches the same provider session');
SELECT ok(pg_get_functiondef('private.finalize_stripe_event(text,text,text,uuid,uuid,bigint,public.checkout_currency,boolean,text,text,text,text,text,text,text)'::regprocedure) ~* 'provider_expires_at = NULL', 'early webhook does not fabricate provider expiry');
SELECT ok(pg_get_functiondef('private.record_checkout_session(uuid,uuid,text,timestamptz)'::regprocedure) ~* 'provider_expires_at IS NULL', 'browser session recording hydrates an early event');
SELECT ok(pg_get_functiondef('private.record_checkout_session(uuid,uuid,text,timestamptz)'::regprocedure) ~* 'payment_status_value', 'session replay returns payment status');

SELECT ok(pg_get_functiondef('public.reconcile_payment(uuid,public.booking_status)'::regprocedure) ~* 'role.*admin', 'reconciliation derives admin authority');
SELECT ok(pg_get_functiondef('public.reconcile_payment(uuid,public.booking_status)'::regprocedure) ~* 'payment_reconciled', 'reconciliation writes an audit event');
SELECT ok(pg_get_functiondef('public.reconcile_payment(uuid,public.booking_status)'::regprocedure) ~* 'payment_review', 'reconciliation only resolves payment review');
SELECT ok(pg_get_functiondef('public.reconcile_payment(uuid,public.booking_status)'::regprocedure) ~* 'review.*paid|review.*failed', 'admin reconciliation owns reviewed payment resolution');
SELECT ok(pg_get_viewdef('public.customer_payment_status_v'::regclass) !~* 'owner_user_id|provider_payment_intent_id|provider_account_id|provider_endpoint_id', 'customer projection omits internal provider and owner facts');
SELECT ok(pg_get_viewdef('public.customer_payment_status_v'::regclass) ~* 'booking_status|payment_status|amount_minor|currency|updated_at', 'customer projection has explicit payment columns');
SELECT ok(pg_get_viewdef('public.customer_payment_status_v'::regclass) ~* 'auth\.uid', 'customer payment projection derives the authenticated owner');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'bookings' AND policyname = 'bookings_payment_projection_select'), 'payment projection has an owner-scoped booking policy');
SELECT ok((SELECT pg_get_expr(polqual, polrelid) FROM pg_catalog.pg_policy WHERE polname = 'bookings_payment_projection_select' AND polrelid = 'public.bookings'::regclass) ~* 'auth\.uid', 'cross-user booking rows are filtered by auth uid');
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_payment_status_v' AND column_name = 'provider_session_id'), 'customer projection omits provider session identity');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members AS m JOIN pg_catalog.pg_roles AS r ON r.oid = m.roleid WHERE r.rolname IN ('localens_payment_rpc_owner', 'localens_payment_projection_owner', 'localens_webhook_executor')), 'payment owners have no inherited roles');
SELECT ok(has_schema_privilege('localens_payment_rpc_owner', 'private', 'USAGE'), 'payment owner has private schema usage only');
SELECT ok(NOT has_table_privilege('localens_payment_projection_owner', 'public.payments', 'INSERT'), 'projection owner cannot insert payments');
SELECT ok(NOT has_table_privilege('localens_payment_rpc_owner', 'private.webhook_events', 'UPDATE'), 'payment owner cannot mutate webhook events');
SELECT ok(NOT has_table_privilege('localens_webhook_executor', 'public.payments', 'UPDATE'), 'webhook executor has no direct payment DML');
SELECT ok(has_column_privilege('localens_checkout_rpc_owner', 'public.payments', 'id', 'SELECT')
  AND has_column_privilege('localens_checkout_rpc_owner', 'public.payments', 'booking_id', 'SELECT')
  AND has_column_privilege('localens_checkout_rpc_owner', 'public.payments', 'status', 'SELECT'), 'checkout owner has only named payment replay columns');
SELECT ok(NOT has_table_privilege('localens_checkout_rpc_owner', 'public.payments', 'INSERT')
  AND NOT has_column_privilege('localens_checkout_rpc_owner', 'public.payments', 'provider_session_id', 'SELECT'), 'checkout owner cannot write or read provider payment facts');
SELECT ok(pg_get_functiondef('private.record_checkout_session(uuid,uuid,text,timestamptz)'::regprocedure) ~* 'SELECT id, booking_id, status', 'session replay uses named payment columns');
SELECT ok(pg_get_functiondef('private.record_checkout_session(uuid,uuid,text,timestamptz)'::regprocedure) ~* 'idempotency.*source.*booking.*hold.*attempt.*payment', 'session recorder keeps the common lock order');
SELECT ok(strpos(pg_get_functiondef('private.record_checkout_session(uuid,uuid,text,timestamptz)'::regprocedure), 'now_time := pg_catalog.clock_timestamp()') > strpos(pg_get_functiondef('private.record_checkout_session(uuid,uuid,text,timestamptz)'::regprocedure), 'FOR KEY SHARE'), 'session recorder samples database time after locks');
SELECT ok(pg_get_functiondef('private.record_checkout_session(uuid,uuid,text,timestamptz)'::regprocedure) ~* 'NOT hold_found.*hold_row.status.*active.*expires_at', 'fixed departure recording rejects missing or stale holds');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members AS m JOIN pg_catalog.pg_roles AS granted ON granted.oid = m.roleid JOIN pg_catalog.pg_roles AS member ON member.oid = m.member WHERE granted.rolname IN ('localens_payment_rpc_owner', 'localens_payment_projection_owner', 'localens_payment_guard_owner', 'localens_webhook_executor') OR member.rolname IN ('localens_payment_rpc_owner', 'localens_payment_projection_owner', 'localens_payment_guard_owner', 'localens_webhook_executor')), 'payment owners and webhook executor have no parent or member roles');

SELECT * FROM finish();
ROLLBACK;
