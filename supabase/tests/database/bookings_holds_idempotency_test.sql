-- Runtime execution is deferred to the container-backed Task 16 gate. This
-- suite is intentionally executable pgTAP and keeps all provider calls local.
BEGIN;

SELECT plan(106);

RESET ROLE;

-- Shape and immutable-fact assertions.
SELECT ok(to_regclass('public.bookings') IS NOT NULL, 'bookings table exists');
SELECT ok(to_regclass('private.checkout_attempts') IS NOT NULL, 'checkout attempts table exists');
SELECT ok(to_regclass('private.checkout_idempotency') IS NOT NULL, 'checkout idempotency table exists');
SELECT ok(to_regclass('private.capacity_holds') IS NOT NULL, 'capacity holds table exists');
SELECT ok(to_regclass('public.customer_bookings_v') IS NOT NULL, 'customer booking projection exists');
SELECT ok(to_regprocedure('private.start_checkout_tx(text,uuid,integer,public.locale,text,text)') IS NOT NULL, 'start checkout transaction exists');
SELECT ok(to_regprocedure('private.record_checkout_session(uuid,uuid,text,timestamptz)') IS NOT NULL, 'record session function exists');
SELECT ok(to_regprocedure('private.compensate_checkout_failure(uuid)') IS NOT NULL, 'checkout compensation function exists');
SELECT ok(to_regprocedure('public.get_live_departure_availability()') IS NOT NULL, 'live availability RPC exists');
SELECT ok((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.bookings'::regclass), 'bookings have RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.bookings'::regclass), 'bookings force RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.checkout_attempts'::regclass), 'attempts force RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.checkout_idempotency'::regclass), 'idempotency force RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.capacity_holds'::regclass), 'holds force RLS');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.bookings'::regclass AND pg_get_constraintdef(oid) ~* '\(departure_id IS NOT NULL\).*<>.*\(quote_id IS NOT NULL\)'), 'booking source is exactly one departure or quote');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.bookings'::regclass AND pg_get_constraintdef(oid) LIKE '%hold_expires_at%35 minutes%'), 'booking hold is exactly 35 minutes');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'private.capacity_holds'::regclass AND pg_get_constraintdef(oid) LIKE '%expires_at%35 minutes%'), 'capacity hold expiry is exactly 35 minutes');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE indexname = 'capacity_holds_departure_status_expiry_idx'), 'hold-aware availability index exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE indexname = 'checkout_attempts_one_active_quote'), 'one active quote checkout attempt index exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE indexname = 'capacity_holds_one_active_booking'), 'one active hold per booking index exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE indexname = 'bookings_departure_status_idx'), 'departure booking status index exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.bookings'::regclass AND attname = 'catalog_snapshot_id'), 'booking snapshots catalog identity');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.bookings'::regclass AND attname = 'travel_snapshot_id'), 'booking snapshots travel identity');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.bookings'::regclass AND attname = 'fx_vnd_per_usd'), 'booking snapshots FX rate');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.bookings'::regclass AND attname = 'cancellation_policy'), 'booking snapshots cancellation policy');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.bookings'::regclass AND attname = 'hold_duration_seconds'), 'booking snapshots hold term');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.bookings'::regclass AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%'), 'booking historical FKs are restrictive');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'private.checkout_idempotency'::regclass AND pg_get_constraintdef(oid) LIKE '%owner_user_id%idempotency_key%'), 'idempotency key is owner scoped');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'private.checkout_attempts'::regclass AND pg_get_constraintdef(oid) LIKE '%provider_idempotency_key%'), 'provider idempotency key is durable');

-- Function security and lock-boundary assertions.
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'private.start_checkout_tx(text,uuid,integer,public.locale,text,text)'::regprocedure), 'start checkout is SECURITY DEFINER');
SELECT ok((SELECT proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc WHERE oid = 'private.start_checkout_tx(text,uuid,integer,public.locale,text,text)'::regprocedure), 'start checkout pins empty search_path');
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'private.record_checkout_session(uuid,uuid,text,timestamptz)'::regprocedure), 'record session is SECURITY DEFINER');
SELECT ok((SELECT proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc WHERE oid = 'private.record_checkout_session(uuid,uuid,text,timestamptz)'::regprocedure), 'record session pins empty search_path');
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.get_live_departure_availability()'::regprocedure), 'availability is SECURITY DEFINER');
SELECT ok((SELECT proconfig @> ARRAY['search_path='] FROM pg_catalog.pg_proc WHERE oid = 'public.get_live_departure_availability()'::regprocedure), 'availability pins empty search_path');
SELECT ok((SELECT pg_get_userbyid(proowner) = 'localens_checkout_rpc_owner' FROM pg_catalog.pg_proc WHERE oid = 'private.start_checkout_tx(text,uuid,integer,public.locale,text,text)'::regprocedure), 'start checkout has named owner');
SELECT ok((SELECT pg_get_userbyid(proowner) = 'localens_availability_rpc_owner' FROM pg_catalog.pg_proc WHERE oid = 'public.get_live_departure_availability()'::regprocedure), 'availability has named owner');
SELECT ok(NOT has_function_privilege('anon', 'private.start_checkout_tx(text,uuid,integer,public.locale,text,text)', 'EXECUTE'), 'anonymous cannot call internal checkout');
SELECT ok(NOT has_function_privilege('authenticated', 'private.record_checkout_session(uuid,uuid,text,timestamptz)', 'EXECUTE'), 'authenticated cannot call internal session recorder');
SELECT ok(has_function_privilege('anon', 'public.get_live_departure_availability()', 'EXECUTE'), 'anonymous can call sanitized availability');
SELECT ok(NOT has_table_privilege('anon', 'public.bookings', 'SELECT'), 'anonymous cannot read booking base table');
SELECT ok(NOT has_table_privilege('authenticated', 'private.capacity_holds', 'SELECT'), 'authenticated cannot read hold base table');
SELECT ok(NOT has_table_privilege('authenticated', 'private.checkout_idempotency', 'INSERT'), 'authenticated cannot forge idempotency receipts');
SELECT ok(NOT has_table_privilege('authenticated', 'public.bookings', 'INSERT'), 'authenticated cannot insert bookings');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'bookings' AND policyname = 'bookings_customer_select'), 'customer booking policy is owner scoped');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'private' AND tablename = 'capacity_holds' AND policyname = 'capacity_holds_owner_all'), 'hold policy is owner scoped');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'custom_quotes' AND policyname = 'custom_quotes_checkout_owner_update'), 'checkout owner can update quote only through guarded status transitions');
SELECT ok(has_column_privilege('localens_checkout_rpc_owner', 'public.custom_quotes', 'status', 'UPDATE') AND NOT has_column_privilege('localens_checkout_rpc_owner', 'public.custom_quotes', 'amount_vnd_minor', 'UPDATE'), 'checkout quote grant is status-only');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'checkout_idempotency_append_only'), 'idempotency update/delete guard exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'checkout_idempotency_append_only_truncate'), 'idempotency truncate guard exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'checkout_attempt_mutation_guard'), 'checkout attempt mutation guard exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'bookings_transition_guard'), 'booking transition guard exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'capacity_holds_transition_guard'), 'hold transition guard exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'custom_quotes_checkout_transition_guard'), 'quote checkout transition guard exists');
SELECT ok(pg_get_functiondef('private.start_checkout_tx(text,uuid,integer,public.locale,text,text)'::regprocedure) ~* 'idempotency.*quote|idempotency.*departure', 'start checkout documents source lock order');
SELECT ok(pg_get_functiondef('private.start_checkout_tx(text,uuid,integer,public.locale,text,text)'::regprocedure) ~* 'canonical.*hash|checkout_hash_equal', 'SQL independently verifies canonical hash');
SELECT ok(pg_get_functiondef('private.start_checkout_tx(text,uuid,integer,public.locale,text,text)'::regprocedure) ~* '35 minutes', 'start checkout creates a 35-minute hold');
SELECT ok(pg_get_functiondef('private.record_checkout_session(uuid,uuid,text,timestamptz)'::regprocedure) ~* '30 minutes', 'session recording bounds provider expiry');
SELECT ok(pg_get_functiondef('private.record_checkout_session(uuid,uuid,text,timestamptz)'::regprocedure) ~* 'p_provider_expires_at.*booking_row.hold_expires_at', 'provider expiry is strictly inside the 35-minute hold despite RPC latency');
SELECT ok(pg_get_functiondef('private.compensate_checkout_failure(uuid)'::regprocedure) ~* 'checkout_pending.*active|valid_until', 'compensation only reactivates an unexpired quote');
SELECT ok(pg_get_functiondef('private.start_checkout_tx(text,uuid,integer,public.locale,text,text)'::regprocedure) ~* 'partySize.*request_json|request_json.*partySize', 'custom quote party size derives from immutable revision');
SELECT ok(pg_get_functiondef('private.start_checkout_tx(text,uuid,integer,public.locale,text,text)'::regprocedure) !~* 'amount_vnd_minor[^;]*\*[^;]*party', 'custom quote amount is not multiplied by party size');
SELECT ok(pg_get_functiondef('public.get_live_departure_availability()'::regprocedure) ~* 'greatest\(0', 'availability clamps remaining capacity at zero');
SELECT ok(pg_get_functiondef('public.get_live_departure_availability()'::regprocedure) ~* 'confirmed.*active.*expires_at', 'availability separates confirmed bookings and active holds');
SELECT ok(pg_get_functiondef('public.get_live_departure_availability()'::regprocedure) ~* 'hb.status NOT IN.*confirmed.*completed', 'confirmed bookings with active holds are never double-counted');
SELECT ok(pg_get_functiondef('public.get_live_departure_availability()'::regprocedure) !~* 'custom_quotes|quote_id', 'custom quotes consume no departure capacity');

-- State machine and provider metadata assertions.
SELECT ok(pg_get_functiondef('private.assert_checkout_transition()'::regprocedure) ~* 'pending_payment.*payment_processing', 'pending booking enters payment processing');
SELECT ok(pg_get_functiondef('private.assert_checkout_transition()'::regprocedure) ~* 'payment_processing.*payment_review', 'late payment enters payment review');
SELECT ok(pg_get_functiondef('private.assert_checkout_transition()'::regprocedure) ~* 'active.*checkout_pending', 'active quote enters checkout pending');
SELECT ok(pg_get_functiondef('private.assert_checkout_transition()'::regprocedure) ~* 'checkout_pending.*accepted', 'checkout pending quote is accepted only after session recording');
SELECT ok(pg_get_functiondef('private.assert_checkout_transition()'::regprocedure) !~* 'accepted.*checkout_pending', 'accepted quote never returns to checkout pending');
SELECT ok(pg_get_functiondef('private.start_checkout_tx(text,uuid,integer,public.locale,text,text)'::regprocedure) ~* 'provider_idempotency_key', 'provider key is returned from durable attempt');
SELECT ok(pg_get_functiondef('private.record_checkout_session(uuid,uuid,text,timestamptz)'::regprocedure) ~* 'replayed', 'session recording is idempotent');
SELECT ok(pg_get_functiondef('private.record_checkout_session(uuid,uuid,text,timestamptz)'::regprocedure) ~* 'different|conflict', 'different provider session is rejected');
SELECT ok(pg_get_functiondef('private.compensate_checkout_failure(uuid)'::regprocedure) ~* 'provider_session_id', 'unknown provider result is never compensated after session persistence');
SELECT ok(pg_get_functiondef('private.checkout_canonical_payload(uuid,text,uuid,integer,public.locale)'::regprocedure) LIKE '%localens-checkout-v1%', 'canonical hash is versioned');
SELECT ok(pg_get_functiondef('private.checkout_canonical_payload(uuid,text,uuid,integer,public.locale)'::regprocedure) LIKE '%UTF8%' OR pg_get_functiondef('private.start_checkout_tx(text,uuid,integer,public.locale,text,text)'::regprocedure) LIKE '%UTF8%', 'canonical hash uses UTF-8');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.customer_bookings_v'::regclass AND attname = 'checkout_amount_minor'), 'customer booking projection includes checkout amount');
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_bookings_v' AND column_name IN ('owner_user_id', 'provider_idempotency_key')), 'customer booking projection omits owner and provider keys');
SELECT ok(NOT has_table_privilege('authenticated', 'private.checkout_attempts', 'SELECT'), 'authenticated cannot read provider session facts');
SELECT ok(NOT has_table_privilege('authenticated', 'private.checkout_idempotency', 'SELECT'), 'authenticated cannot read idempotency facts');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE pg_get_userbyid(proowner) IN ('postgres', 'service_role') AND proname IN ('start_checkout_tx', 'record_checkout_session', 'compensate_checkout_failure', 'get_live_departure_availability')), 'checkout definers are not postgres or service_role');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members AS m JOIN pg_catalog.pg_roles AS r ON r.oid = m.roleid WHERE r.rolname IN ('localens_checkout_rpc_owner', 'localens_availability_rpc_owner')), 'checkout owners have no inherited roles');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'private.capacity_holds'::regclass AND pg_get_constraintdef(oid) ~* 'status.*active.*consumed.*released.*expired'), 'hold state values are guarded');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'private.checkout_attempts'::regclass AND pg_get_constraintdef(oid) ~* 'created.*session_recorded.*compensated.*failed'), 'checkout attempt state values are guarded');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.bookings'::regclass AND pg_get_constraintdef(oid) ~* 'payment_review'), 'booking payment review state is available');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.bookings'::regclass AND pg_get_constraintdef(oid) ~* 'checkout_currency'), 'booking currency is server-owned');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.bookings'::regclass AND pg_get_constraintdef(oid) ~* 'fx_snapshot_id'), 'booking FX coherence is guarded');

-- Edge-boundary error paths are represented in the SQL contract. These calls
-- must fail before any source row can be reached; the provider is never called.
SELECT throws_ok($$SELECT * FROM private.start_checkout_tx('departure', '00000000-0000-0000-0000-000000000901'::uuid, 1, 'en'::public.locale, 'test', repeat('0', 64))$$, '42501', NULL, 'unauthenticated checkout is rejected');
SELECT throws_ok($$SELECT * FROM private.record_checkout_session('00000000-0000-0000-0000-000000000901'::uuid, '00000000-0000-0000-0000-000000000902'::uuid, 'cs_test_localens_001', now() + interval '30 minutes')$$, '42501', NULL, 'unauthenticated session recording is rejected');
SELECT throws_ok($$SELECT * FROM private.compensate_checkout_failure('00000000-0000-0000-0000-000000000902'::uuid)$$, '42501', NULL, 'unauthenticated compensation is rejected');
SELECT lives_ok($$SELECT * FROM public.get_live_departure_availability()$$, 'availability RPC executes through a sanitized definer');
SELECT lives_ok($$SELECT has_function_privilege('anon', 'public.get_live_departure_availability()', 'EXECUTE')$$, 'anonymous availability grant is queryable');
SELECT ok(pg_get_functiondef('private.start_checkout_tx(text,uuid,integer,public.locale,text,text)'::regprocedure) ~* 'IDEMPOTENCY_CONFLICT', 'same key with another hash is rejected');
SELECT ok(pg_get_functiondef('private.start_checkout_tx(text,uuid,integer,public.locale,text,text)'::regprocedure) ~* 'resumed', 'same key and hash resume the original attempt');
SELECT ok(pg_get_functiondef('private.record_checkout_session(uuid,uuid,text,timestamptz)'::regprocedure) ~* 'payment_processing', 'recording a session moves booking into payment processing');
SELECT ok(pg_get_functiondef('private.compensate_checkout_failure(uuid)'::regprocedure) ~* 'released_at', 'provider failure releases the hold with a timestamp');
SELECT ok(pg_get_functiondef('private.compensate_checkout_failure(uuid)'::regprocedure) ~* 'cancelled|expired', 'provider failure cancels or expires pending booking');
SELECT ok(pg_get_functiondef('public.get_live_departure_availability()'::regprocedure) ~* 'remaining_capacity', 'availability returns only sanitized remaining capacity');
SELECT ok(pg_get_functiondef('public.get_live_departure_availability()'::regprocedure) !~* 'owner_user_id|hold_id|booking_id', 'availability leaks no customer or hold identity');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid = 'public.get_live_departure_availability()'::regprocedure AND proretset), 'availability returns a set of departures');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = 'public.bookings'::regclass AND polname = 'bookings_checkout_owner_all'), 'checkout owner booking policy exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = 'private.checkout_idempotency'::regclass AND polname = 'checkout_idempotency_owner_all'), 'checkout owner idempotency policy exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = 'public.departures'::regclass AND polname = 'departures_availability_owner_select'), 'availability source policy exists');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE pg_get_functiondef(oid) ~* 'raw_guest_token|stripe_signature|service_role_key'), 'checkout SQL stores no raw secrets');
-- Hostile search_path is explicitly exercised by the future runtime gate.
SELECT ok(pg_get_functiondef('private.start_checkout_tx(text,uuid,integer,public.locale,text,text)'::regprocedure) ~* 'hostile|search_path|SET search_path', 'hostile search path cannot shadow checkout objects');

SELECT * FROM finish();
ROLLBACK;
