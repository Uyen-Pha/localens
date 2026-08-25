BEGIN;

-- Task 10 keeps Stripe in Test mode.  The table stores only provider facts
-- needed to reconcile a booking; the Edge boundary verifies provider bytes
-- and timestamp tolerance before it calls the internal finalizer below.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_payment_rpc_owner') THEN
    EXECUTE 'CREATE ROLE localens_payment_rpc_owner NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_payment_projection_owner') THEN
    EXECUTE 'CREATE ROLE localens_payment_projection_owner NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'localens_payment_guard_owner') THEN
    EXECUTE 'CREATE ROLE localens_payment_guard_owner NOLOGIN NOBYPASSRLS';
  END IF;
END
$roles$;

ALTER ROLE localens_payment_rpc_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_payment_projection_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_payment_guard_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;
ALTER ROLE localens_webhook_executor NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOLOGIN NOBYPASSRLS;

-- Scrub both directions: a protected role cannot inherit another role and no
-- other role may inherit a protected owner/executor.
DO $memberships$
DECLARE
  membership_record record;
  protected_roles constant text[] := ARRAY[
    'localens_payment_rpc_owner', 'localens_payment_projection_owner',
    'localens_payment_guard_owner', 'localens_webhook_executor'
  ];
BEGIN
  FOR membership_record IN
    SELECT granted.rolname AS granted_role, member.rolname AS member_role
    FROM pg_catalog.pg_auth_members AS memberships
    JOIN pg_catalog.pg_roles AS granted ON granted.oid = memberships.roleid
    JOIN pg_catalog.pg_roles AS member ON member.oid = memberships.member
    WHERE granted.rolname = ANY(protected_roles)
       OR member.rolname = ANY(protected_roles)
  LOOP
    EXECUTE pg_catalog.format('REVOKE %I FROM %I', membership_record.granted_role, membership_record.member_role);
  END LOOP;
END
$memberships$;

REVOKE ALL ON SCHEMA public, private, auth FROM localens_payment_rpc_owner, localens_payment_projection_owner, localens_payment_guard_owner, localens_webhook_executor;
REVOKE ALL ON ALL TABLES IN SCHEMA public, private, auth FROM localens_payment_rpc_owner, localens_payment_projection_owner, localens_payment_guard_owner, localens_webhook_executor;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, private, auth FROM localens_payment_rpc_owner, localens_payment_projection_owner, localens_payment_guard_owner, localens_webhook_executor;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public, private, auth FROM localens_payment_rpc_owner, localens_payment_projection_owner, localens_payment_guard_owner, localens_webhook_executor;

-- These are server-owned, non-secret Stripe Test identifiers.  They are never
-- exposed through PostgREST and are not accepted from a browser caller.
CREATE TABLE private.stripe_test_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  stripe_test_account_id text NOT NULL CHECK (stripe_test_account_id ~ '^acct_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$'),
  stripe_test_endpoint_id text NOT NULL CHECK (stripe_test_endpoint_id ~ '^we_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$'),
  livemode boolean NOT NULL DEFAULT false CHECK (livemode = false),
  mode text NOT NULL DEFAULT 'payment' CHECK (mode = 'payment'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

INSERT INTO private.stripe_test_settings (id, stripe_test_account_id, stripe_test_endpoint_id)
VALUES (true, 'acct_localens_test', 'we_localens_test')
ON CONFLICT (id) DO NOTHING;

-- A composite target prevents an event from binding an attempt to a different
-- booking when the provider sends an early completion notification.
ALTER TABLE private.checkout_attempts
  ADD CONSTRAINT checkout_attempts_id_booking_key UNIQUE (id, booking_id);

-- A provider event may arrive before the browser has persisted Stripe's real
-- expiry. Keep the session binding, but let the later browser call hydrate the
-- verified provider expiry. Session-null still requires expiry-null.
DO $constraints$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_catalog.pg_constraint AS con
    WHERE con.conrelid = 'private.checkout_attempts'::pg_catalog.regclass
      AND pg_catalog.pg_get_constraintdef(con.oid) LIKE '%provider_session_id%'
      AND pg_catalog.pg_get_constraintdef(con.oid) LIKE '%provider_expires_at%'
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE private.checkout_attempts DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$constraints$;
ALTER TABLE private.checkout_attempts
  ADD CONSTRAINT checkout_attempts_provider_expiry_consistency
  CHECK ((provider_session_id IS NULL AND provider_expires_at IS NULL) OR provider_session_id IS NOT NULL);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  attempt_id uuid NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider_session_id text NOT NULL CHECK (provider_session_id ~ '^cs_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$'),
  provider_payment_intent_id text CHECK (provider_payment_intent_id IS NULL OR provider_payment_intent_id ~ '^pi_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$'),
  provider_account_id text NOT NULL CHECK (provider_account_id ~ '^acct_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$'),
  provider_endpoint_id text NOT NULL CHECK (provider_endpoint_id ~ '^we_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$'),
  mode text NOT NULL CHECK (mode = 'payment'),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
  currency public.checkout_currency NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  FOREIGN KEY (attempt_id, booking_id) REFERENCES private.checkout_attempts(id, booking_id) ON DELETE RESTRICT,
  UNIQUE (booking_id),
  UNIQUE (attempt_id),
  UNIQUE (provider_session_id)
);
CREATE UNIQUE INDEX payments_provider_payment_intent_key
  ON public.payments (provider_payment_intent_id)
  WHERE provider_payment_intent_id IS NOT NULL;

CREATE TABLE private.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text NOT NULL CHECK (provider_event_id ~ '^evt_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  event_type text NOT NULL CHECK (event_type IN ('checkout.session.completed', 'checkout.session.expired')),
  provider_session_id text NOT NULL CHECK (provider_session_id ~ '^cs_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$'),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  attempt_id uuid NOT NULL,
  provider_payment_intent_id text CHECK (provider_payment_intent_id IS NULL OR provider_payment_intent_id ~ '^pi_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$'),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
  currency public.checkout_currency NOT NULL,
  livemode boolean NOT NULL CHECK (livemode = false),
  mode text NOT NULL CHECK (mode = 'payment'),
  provider_account_id text NOT NULL CHECK (provider_account_id ~ '^acct_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$'),
  provider_endpoint_id text NOT NULL CHECK (provider_endpoint_id ~ '^we_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$'),
  status public.webhook_event_status NOT NULL,
  result_booking_status public.booking_status,
  result_payment_status public.payment_status,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  processed_at timestamptz,
  FOREIGN KEY (attempt_id, booking_id) REFERENCES private.checkout_attempts(id, booking_id) ON DELETE RESTRICT,
  UNIQUE (provider_event_id)
);
CREATE UNIQUE INDEX webhook_events_provider_session_type_key
  ON private.webhook_events (provider_session_id, event_type);
CREATE UNIQUE INDEX webhook_events_provider_payment_intent_key
  ON private.webhook_events (provider_payment_intent_id)
  WHERE provider_payment_intent_id IS NOT NULL;

ALTER TABLE private.stripe_test_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.stripe_test_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE private.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.webhook_events FORCE ROW LEVEL SECURITY;

CREATE POLICY stripe_test_settings_payment_owner_select ON private.stripe_test_settings
  FOR SELECT TO localens_payment_rpc_owner USING (current_user = 'localens_payment_rpc_owner');
CREATE POLICY payments_payment_owner_all ON public.payments
  FOR ALL TO localens_payment_rpc_owner
  USING (current_user = 'localens_payment_rpc_owner')
  WITH CHECK (current_user = 'localens_payment_rpc_owner');
CREATE POLICY payments_checkout_owner_select ON public.payments
  FOR SELECT TO localens_checkout_rpc_owner
  USING ((SELECT auth.uid()) = owner_user_id);
CREATE POLICY bookings_payment_owner_all ON public.bookings
  FOR ALL TO localens_payment_rpc_owner
  USING (current_user = 'localens_payment_rpc_owner')
  WITH CHECK (current_user = 'localens_payment_rpc_owner');
CREATE POLICY checkout_attempts_payment_owner_all ON private.checkout_attempts
  FOR ALL TO localens_payment_rpc_owner
  USING (current_user = 'localens_payment_rpc_owner')
  WITH CHECK (current_user = 'localens_payment_rpc_owner');
CREATE POLICY checkout_idempotency_payment_owner_select ON private.checkout_idempotency
  FOR SELECT TO localens_payment_rpc_owner
  USING (current_user = 'localens_payment_rpc_owner');
CREATE POLICY capacity_holds_payment_owner_all ON private.capacity_holds
  FOR ALL TO localens_payment_rpc_owner
  USING (current_user = 'localens_payment_rpc_owner')
  WITH CHECK (current_user = 'localens_payment_rpc_owner');
CREATE POLICY departures_payment_owner_select ON public.departures
  FOR SELECT TO localens_payment_rpc_owner
  USING (current_user = 'localens_payment_rpc_owner');
CREATE POLICY custom_quotes_payment_owner_all ON public.custom_quotes
  FOR ALL TO localens_payment_rpc_owner
  USING (current_user = 'localens_payment_rpc_owner')
  WITH CHECK (current_user = 'localens_payment_rpc_owner');
CREATE POLICY payments_projection_owner_select ON public.payments
  FOR SELECT TO localens_payment_projection_owner
  USING ((SELECT auth.uid()) = owner_user_id);
CREATE POLICY payments_admin_select ON public.payments
  FOR SELECT TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner');
CREATE POLICY payments_admin_reconciliation_update ON public.payments
  FOR UPDATE TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner')
  WITH CHECK (current_user = 'localens_admin_rpc_owner');
CREATE POLICY bookings_payment_projection_select ON public.bookings
  FOR SELECT TO localens_payment_projection_owner
  USING ((SELECT auth.uid()) = owner_user_id);
CREATE POLICY webhook_events_payment_owner_all ON private.webhook_events
  FOR ALL TO localens_payment_rpc_owner
  USING (current_user = 'localens_payment_rpc_owner')
  WITH CHECK (current_user = 'localens_payment_rpc_owner');

REVOKE ALL ON TABLE private.stripe_test_settings, public.payments, private.webhook_events FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public, private, auth TO localens_payment_rpc_owner, localens_payment_projection_owner, localens_webhook_executor;
GRANT SELECT ON TABLE private.stripe_test_settings TO localens_payment_rpc_owner;
GRANT SELECT, INSERT ON TABLE public.payments TO localens_payment_rpc_owner;
GRANT UPDATE (status, updated_at) ON TABLE public.payments TO localens_payment_rpc_owner;
GRANT SELECT, INSERT ON TABLE private.webhook_events TO localens_payment_rpc_owner;
GRANT UPDATE (status, result_booking_status, result_payment_status, processed_at) ON TABLE private.webhook_events TO localens_payment_rpc_owner;
GRANT SELECT ON TABLE public.bookings, public.departures, public.custom_quotes TO localens_payment_rpc_owner;
 -- checkout RPC owner only inspects the owner-scoped payment id/status needed for
-- replay hydration; it cannot insert or update payment facts.
GRANT SELECT (id, booking_id, status) ON TABLE public.payments TO localens_checkout_rpc_owner;
GRANT EXECUTE ON FUNCTION auth.uid() TO localens_checkout_rpc_owner;
GRANT UPDATE (status) ON TABLE public.bookings, public.custom_quotes TO localens_payment_rpc_owner;
GRANT SELECT ON TABLE private.checkout_attempts, private.checkout_idempotency, private.capacity_holds TO localens_payment_rpc_owner;
GRANT UPDATE (provider_session_id, provider_expires_at, status, updated_at) ON TABLE private.checkout_attempts TO localens_payment_rpc_owner;
GRANT UPDATE (status, consumed_at, released_at) ON TABLE private.capacity_holds TO localens_payment_rpc_owner;
GRANT SELECT (id, status, owner_user_id, booking_id, amount_minor, currency, updated_at) ON TABLE public.payments TO localens_payment_projection_owner;
GRANT SELECT (id, status) ON TABLE public.bookings TO localens_payment_projection_owner;
GRANT EXECUTE ON FUNCTION auth.uid() TO localens_payment_projection_owner;
GRANT SELECT ON TABLE public.payments TO localens_admin_rpc_owner;
GRANT UPDATE (status, updated_at) ON TABLE public.payments TO localens_admin_rpc_owner;
GRANT SELECT ON TABLE public.bookings TO localens_admin_rpc_owner;
GRANT UPDATE (status) ON TABLE public.bookings TO localens_admin_rpc_owner;
GRANT SELECT ON TABLE private.user_roles TO localens_admin_rpc_owner;

-- Payment facts may only change status through the finalizer or the audited
-- reconciliation function. Provider/session/amount/account facts are fixed.
CREATE OR REPLACE FUNCTION private.assert_payment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF current_setting('localens.payment_transition', true) <> 'on'
     OR OLD.id IS DISTINCT FROM NEW.id
     OR OLD.booking_id IS DISTINCT FROM NEW.booking_id
     OR OLD.attempt_id IS DISTINCT FROM NEW.attempt_id
     OR OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
     OR OLD.provider_session_id IS DISTINCT FROM NEW.provider_session_id
     OR OLD.provider_payment_intent_id IS DISTINCT FROM NEW.provider_payment_intent_id
     OR OLD.provider_account_id IS DISTINCT FROM NEW.provider_account_id
     OR OLD.provider_endpoint_id IS DISTINCT FROM NEW.provider_endpoint_id
     OR OLD.mode IS DISTINCT FROM NEW.mode
     OR OLD.amount_minor IS DISTINCT FROM NEW.amount_minor
     OR OLD.currency IS DISTINCT FROM NEW.currency
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR NOT ((OLD.status = 'pending'::public.payment_status AND NEW.status IN ('paid'::public.payment_status, 'failed'::public.payment_status, 'review'::public.payment_status))
       OR (OLD.status = 'review'::public.payment_status AND NEW.status IN ('paid'::public.payment_status, 'failed'::public.payment_status))) THEN
    RAISE EXCEPTION 'payment facts are immutable or transition is invalid' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_payment_mutation() OWNER TO localens_payment_guard_owner;
REVOKE ALL ON FUNCTION private.assert_payment_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER payments_status_guard
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.assert_payment_mutation();

CREATE OR REPLACE FUNCTION private.reject_webhook_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_setting('localens.payment_transition', true) = 'on'
     AND OLD.id IS NOT DISTINCT FROM NEW.id
     AND OLD.provider_event_id IS NOT DISTINCT FROM NEW.provider_event_id
     AND OLD.payload_hash IS NOT DISTINCT FROM NEW.payload_hash
     AND OLD.event_type IS NOT DISTINCT FROM NEW.event_type
     AND OLD.provider_session_id IS NOT DISTINCT FROM NEW.provider_session_id
     AND OLD.booking_id IS NOT DISTINCT FROM NEW.booking_id
     AND OLD.attempt_id IS NOT DISTINCT FROM NEW.attempt_id
     AND OLD.provider_payment_intent_id IS NOT DISTINCT FROM NEW.provider_payment_intent_id
     AND OLD.amount_minor IS NOT DISTINCT FROM NEW.amount_minor
     AND OLD.currency IS NOT DISTINCT FROM NEW.currency
     AND OLD.livemode IS NOT DISTINCT FROM NEW.livemode
     AND OLD.mode IS NOT DISTINCT FROM NEW.mode
     AND OLD.provider_account_id IS NOT DISTINCT FROM NEW.provider_account_id
     AND OLD.provider_endpoint_id IS NOT DISTINCT FROM NEW.provider_endpoint_id
     AND OLD.status = 'received'::public.webhook_event_status
     AND NEW.status IN ('processed'::public.webhook_event_status, 'ignored'::public.webhook_event_status, 'failed'::public.webhook_event_status, 'conflict'::public.webhook_event_status)
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'webhook events are append-only except terminalization' USING ERRCODE = '42501';
END;
$function$;
ALTER FUNCTION private.reject_webhook_mutation() OWNER TO localens_payment_guard_owner;
REVOKE ALL ON FUNCTION private.reject_webhook_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER webhook_events_append_only
  BEFORE UPDATE OR DELETE ON private.webhook_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_webhook_mutation();
CREATE TRIGGER webhook_events_append_only_truncate
  BEFORE TRUNCATE ON private.webhook_events
  FOR EACH STATEMENT EXECUTE FUNCTION private.reject_webhook_mutation();

-- Extend the Task 9 attempt guard for one safe hydration write: the early
-- webhook may set session_recorded with a null expiry, then the authenticated
-- browser can fill the real provider expiry for that same session exactly once.
CREATE OR REPLACE FUNCTION private.assert_checkout_attempt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF current_setting('localens.checkout_transition', true) <> 'on'
     OR OLD.id IS DISTINCT FROM NEW.id
     OR OLD.booking_id IS DISTINCT FROM NEW.booking_id
     OR OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
     OR OLD.source_kind IS DISTINCT FROM NEW.source_kind
     OR OLD.departure_id IS DISTINCT FROM NEW.departure_id
     OR OLD.quote_id IS DISTINCT FROM NEW.quote_id
     OR OLD.provider_idempotency_key IS DISTINCT FROM NEW.provider_idempotency_key
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR NOT (
       (OLD.status = 'created' AND NEW.status IN ('session_recorded', 'compensated', 'failed'))
       OR (OLD.status = 'session_recorded' AND NEW.status = 'session_recorded'
           AND OLD.provider_session_id IS NOT DISTINCT FROM NEW.provider_session_id
           AND OLD.provider_session_id IS NOT NULL
           AND OLD.provider_expires_at IS NULL
           AND NEW.provider_expires_at IS NOT NULL)
     ) THEN
    RAISE EXCEPTION 'checkout attempt facts are immutable or transition is invalid' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION private.assert_checkout_attempt_mutation() OWNER TO localens_checkout_rpc_owner;
REVOKE ALL ON FUNCTION private.assert_checkout_attempt_mutation() FROM PUBLIC, anon, authenticated;

-- The helper accepts only scalar, allowlisted audit facts. It deliberately
-- stores no provider body, secret, token, PII, or signature material.
CREATE OR REPLACE FUNCTION private.record_payment_audit_event(
  p_event_type public.audit_event_type,
  p_actor_user_id uuid,
  p_target_type public.audit_target_type,
  p_target_id uuid,
  p_from_state text,
  p_to_state text,
  p_metadata_key public.audit_metadata_key,
  p_metadata_text text,
  p_metadata_number numeric,
  p_metadata_boolean boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_event_type NOT IN (
      'webhook_processed'::public.audit_event_type,
      'webhook_ignored'::public.audit_event_type,
      'webhook_failed'::public.audit_event_type,
      'webhook_conflict'::public.audit_event_type,
      'payment_reconciled'::public.audit_event_type,
      'booking_status_changed'::public.audit_event_type
    )
    OR p_target_id IS NULL
    OR p_target_type NOT IN ('payment'::public.audit_target_type, 'webhook_event'::public.audit_target_type, 'booking'::public.audit_target_type)
    OR p_from_state IS NOT NULL AND p_from_state !~ '^[a-z][a-z0-9_]*$'
    OR p_to_state IS NOT NULL AND p_to_state !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'payment audit rejected' USING ERRCODE = '42501';
  END IF;
  INSERT INTO private.audit_events (
    event_type, actor_user_id, actor_role, target_type, target_id,
    from_state, to_state, metadata_key, metadata_text, metadata_number, metadata_boolean
  ) VALUES (
    p_event_type, p_actor_user_id,
    CASE WHEN p_actor_user_id IS NULL THEN NULL ELSE 'admin'::public.app_role END,
    p_target_type, p_target_id, p_from_state, p_to_state,
    p_metadata_key, p_metadata_text, p_metadata_number, p_metadata_boolean
  );
END;
$function$;
ALTER FUNCTION private.record_payment_audit_event(public.audit_event_type, uuid, public.audit_target_type, uuid, text, text, public.audit_metadata_key, text, numeric, boolean)
  OWNER TO localens_identity_rpc_owner;
REVOKE ALL ON FUNCTION private.record_payment_audit_event(public.audit_event_type, uuid, public.audit_target_type, uuid, text, text, public.audit_metadata_key, text, numeric, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.record_payment_audit_event(public.audit_event_type, uuid, public.audit_target_type, uuid, text, text, public.audit_metadata_key, text, numeric, boolean)
  TO localens_payment_rpc_owner, localens_admin_rpc_owner;
GRANT USAGE ON SCHEMA private, public TO localens_identity_rpc_owner;
GRANT INSERT ON TABLE private.audit_events TO localens_identity_rpc_owner;

CREATE OR REPLACE VIEW public.customer_payment_status_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT p.booking_id, b.status AS booking_status, p.status AS payment_status,
  p.amount_minor::text AS amount_minor, p.currency, p.updated_at
FROM public.payments AS p
JOIN public.bookings AS b ON b.id = p.booking_id
WHERE p.owner_user_id = (SELECT auth.uid());
ALTER VIEW public.customer_payment_status_v OWNER TO localens_payment_projection_owner;
REVOKE ALL ON public.customer_payment_status_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_payment_status_v TO authenticated;

-- Internal finalizer. The Edge caller must provide already-verified scalar
-- facts. No browser role receives execute on this function.
CREATE OR REPLACE FUNCTION private.finalize_stripe_event(
  p_event_id text,
  p_payload_hash text,
  p_session_id text,
  p_booking_id uuid,
  p_attempt_id uuid,
  p_amount_minor bigint,
  p_currency public.checkout_currency,
  p_livemode boolean,
  p_mode text,
  p_account_id text,
  p_endpoint_id text,
  p_event_type text,
  p_session_status text,
  p_provider_payment_status text,
  p_payment_intent_id text
)
RETURNS TABLE (
  event_status public.webhook_event_status,
  booking_status public.booking_status,
  payment_status public.payment_status,
  replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  settings_row private.stripe_test_settings%ROWTYPE;
  idempotency_row private.checkout_idempotency%ROWTYPE;
  attempt_row private.checkout_attempts%ROWTYPE;
  booking_row public.bookings%ROWTYPE;
  departure_row public.departures%ROWTYPE;
  quote_row public.custom_quotes%ROWTYPE;
  hold_row private.capacity_holds%ROWTYPE;
  payment_row public.payments%ROWTYPE;
  event_row private.webhook_events%ROWTYPE;
  current_time timestamptz;
  hold_is_active boolean := false;
  payment_was_finalized boolean := false;
  next_booking_status public.booking_status;
  next_payment_status public.payment_status := NULL;
BEGIN
  IF p_event_id IS NULL OR p_event_id !~ '^evt_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$'
     OR p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$'
     OR p_session_id IS NULL OR p_session_id !~ '^cs_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$'
     OR p_booking_id IS NULL OR p_attempt_id IS NULL
     OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 1 AND 9007199254740991
     OR p_currency IS NULL OR p_livemode IS DISTINCT FROM false
     OR p_mode IS DISTINCT FROM 'payment'
     OR p_account_id IS NULL OR p_endpoint_id IS NULL THEN
    RAISE EXCEPTION 'verified Stripe event rejected' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO settings_row FROM private.stripe_test_settings WHERE id = true FOR SHARE;
  IF NOT FOUND OR p_account_id IS DISTINCT FROM settings_row.stripe_test_account_id
     OR p_endpoint_id IS DISTINCT FROM settings_row.stripe_test_endpoint_id
     OR settings_row.livemode IS DISTINCT FROM false OR settings_row.mode IS DISTINCT FROM 'payment' THEN
    RAISE EXCEPTION 'Stripe Test account or endpoint rejected' USING ERRCODE = '42501';
  END IF;
  IF (p_event_type, p_session_status, p_provider_payment_status) NOT IN (
      ('checkout.session.completed', 'complete', 'paid'),
      ('checkout.session.expired', 'expired', 'unpaid')
    )
    OR (p_event_type = 'checkout.session.completed' AND (p_payment_intent_id IS NULL OR p_payment_intent_id !~ '^pi_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$'))
    OR (p_event_type = 'checkout.session.expired' AND p_payment_intent_id IS NOT NULL AND p_payment_intent_id !~ '^pi_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$') THEN
    RAISE EXCEPTION 'Stripe event facts rejected' USING ERRCODE = '22023';
  END IF;

  -- Reserve the event receipt before locking or changing booking/payment
  -- facts. ON CONFLICT plus the row lock makes same-event races wait for the
  -- original result instead of running side effects twice.
  INSERT INTO private.webhook_events (
    provider_event_id, payload_hash, event_type, provider_session_id,
    booking_id, attempt_id, provider_payment_intent_id, amount_minor, currency,
    livemode, mode, provider_account_id, provider_endpoint_id, status
  ) VALUES (
    p_event_id, p_payload_hash, p_event_type, p_session_id,
    p_booking_id, p_attempt_id, p_payment_intent_id, p_amount_minor, p_currency,
    false, 'payment', p_account_id, p_endpoint_id, 'received'::public.webhook_event_status
  ) ON CONFLICT (provider_event_id) DO NOTHING;
  SELECT * INTO event_row FROM private.webhook_events WHERE provider_event_id = p_event_id FOR UPDATE;
  IF event_row.payload_hash IS DISTINCT FROM p_payload_hash THEN
      PERFORM private.record_payment_audit_event(
        'webhook_conflict'::public.audit_event_type, NULL,
        'webhook_event'::public.audit_target_type, event_row.id,
        event_row.status::text, 'conflict', 'provider'::public.audit_metadata_key, 'stripe', NULL, NULL
      );
      -- Keep the original receipt/payment/booking facts intact. The caller
      -- receives a terminal conflict result while the safe audit row commits.
      event_status := 'conflict'::public.webhook_event_status;
      booking_status := event_row.result_booking_status;
      payment_status := event_row.result_payment_status;
      replayed := false;
      RETURN NEXT;
      RETURN;
  END IF;
  IF event_row.status <> 'received'::public.webhook_event_status THEN
    event_status := event_row.status;
    booking_status := event_row.result_booking_status;
    payment_status := event_row.result_payment_status;
    replayed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Shared checkout lock order: idempotency -> source -> booking -> hold ->
  -- attempt -> payment. The early webhook therefore cannot race a browser
  -- session record into a second payment or a different booking.
  SELECT * INTO idempotency_row FROM private.checkout_idempotency
    WHERE checkout_attempt_id = p_attempt_id FOR UPDATE;
  IF NOT FOUND OR idempotency_row.booking_id IS DISTINCT FROM p_booking_id THEN
    RAISE EXCEPTION 'checkout attempt idempotency unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO attempt_row FROM private.checkout_attempts WHERE id = p_attempt_id;
  IF NOT FOUND OR attempt_row.booking_id IS DISTINCT FROM p_booking_id THEN
    RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501';
  END IF;
  IF attempt_row.departure_id IS NOT NULL THEN
    SELECT * INTO departure_row FROM public.departures WHERE id = attempt_row.departure_id FOR UPDATE;
  ELSE
    SELECT * INTO quote_row FROM public.custom_quotes WHERE id = attempt_row.quote_id FOR UPDATE;
  END IF;
  SELECT * INTO booking_row FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR booking_row.checkout_amount_minor IS DISTINCT FROM p_amount_minor
     OR booking_row.checkout_currency IS DISTINCT FROM p_currency THEN
    RAISE EXCEPTION 'booking amount or currency mismatch' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO hold_row FROM private.capacity_holds
    WHERE booking_id = booking_row.id AND status = 'active'::public.hold_status FOR UPDATE;
  SELECT * INTO attempt_row FROM private.checkout_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND OR attempt_row.booking_id IS DISTINCT FROM booking_row.id THEN
    RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501';
  END IF;
  IF attempt_row.provider_session_id IS NOT NULL AND attempt_row.provider_session_id IS DISTINCT FROM p_session_id THEN
    RAISE EXCEPTION 'provider session conflict' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO payment_row FROM public.payments WHERE booking_id = booking_row.id FOR UPDATE;
  -- Sample only after the final payment lock. All expiry decisions and
  -- timestamps below use this post-lock time, so a wait cannot validate a
  -- hold or session against stale time.
  current_time := pg_catalog.clock_timestamp();
  hold_is_active := hold_row.id IS NOT NULL AND hold_row.expires_at > current_time AND booking_row.status IN ('pending_payment'::public.booking_status, 'payment_processing'::public.booking_status);
  IF hold_row.id IS NOT NULL AND NOT hold_is_active AND hold_row.expires_at <= current_time THEN
    PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
    UPDATE private.capacity_holds SET status = 'expired'::public.hold_status, released_at = current_time WHERE id = hold_row.id;
  END IF;
  IF attempt_row.provider_session_id IS NULL THEN
    PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
    UPDATE private.checkout_attempts
      SET provider_session_id = p_session_id,
          provider_expires_at = NULL,
          status = CASE WHEN status = 'created' THEN 'session_recorded' ELSE status END,
          updated_at = current_time
      WHERE id = attempt_row.id;
  END IF;
  IF p_event_type = 'checkout.session.completed' THEN
    IF payment_row.id IS NOT NULL THEN
      IF payment_row.provider_session_id IS DISTINCT FROM p_session_id
         OR payment_row.amount_minor IS DISTINCT FROM p_amount_minor
         OR payment_row.currency IS DISTINCT FROM p_currency
         OR payment_row.provider_account_id IS DISTINCT FROM p_account_id
         OR payment_row.provider_endpoint_id IS DISTINCT FROM p_endpoint_id
         OR payment_row.provider_payment_intent_id IS DISTINCT FROM p_payment_intent_id THEN
        RAISE EXCEPTION 'payment fact conflict' USING ERRCODE = 'P0001';
      END IF;
    ELSE
      INSERT INTO public.payments (
        booking_id, attempt_id, owner_user_id, provider_session_id,
        provider_payment_intent_id, provider_account_id, provider_endpoint_id,
        mode, amount_minor, currency, status
      ) VALUES (
        booking_row.id, attempt_row.id, booking_row.owner_user_id, p_session_id,
        p_payment_intent_id, p_account_id, p_endpoint_id, 'payment',
        p_amount_minor, p_currency, 'pending'::public.payment_status
      ) RETURNING * INTO payment_row;
    END IF;
    PERFORM pg_catalog.set_config('localens.payment_transition', 'on', true);
    IF payment_row.status = 'pending'::public.payment_status THEN
      UPDATE public.payments SET status = 'paid'::public.payment_status, updated_at = current_time WHERE id = payment_row.id;
      payment_row.status := 'paid'::public.payment_status;
      payment_was_finalized := true;
    END IF;
    next_payment_status := payment_row.status;
    IF NOT payment_was_finalized THEN
      -- A paid webhook never promotes an already reviewed/failed payment;
      -- review -> paid/failed belongs to audited admin reconciliation.
      next_booking_status := booking_row.status;
    ELSIF booking_row.status IN ('confirmed'::public.booking_status, 'payment_review'::public.booking_status) THEN
      next_booking_status := booking_row.status;
    ELSIF booking_row.status IN ('pending_payment'::public.booking_status, 'payment_processing'::public.booking_status) THEN
      -- pending_payment -> payment_processing is required before either a
      -- capacity-backed confirmation or a payment-review outcome.
      PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
      IF booking_row.status = 'pending_payment'::public.booking_status THEN
        UPDATE public.bookings SET status = 'payment_processing'::public.booking_status WHERE id = booking_row.id;
        booking_row.status := 'payment_processing'::public.booking_status;
      END IF;
      IF hold_is_active OR (quote_row.id IS NOT NULL AND booking_row.status = 'payment_processing'::public.booking_status) THEN
        IF hold_is_active THEN
          UPDATE private.capacity_holds SET status = 'consumed'::public.hold_status, consumed_at = current_time WHERE id = hold_row.id;
        END IF;
        UPDATE public.bookings SET status = 'confirmed'::public.booking_status WHERE id = booking_row.id;
        next_booking_status := 'confirmed'::public.booking_status;
      ELSE
        UPDATE public.bookings SET status = 'payment_review'::public.booking_status WHERE id = booking_row.id;
        next_booking_status := 'payment_review'::public.booking_status;
      END IF;
    ELSE
      -- A late paid fact is still recorded, but terminal/incompatible booking
      -- states are never forced through an invalid state transition.
      next_booking_status := booking_row.status;
    END IF;
    IF quote_row.id IS NOT NULL AND quote_row.status = 'checkout_pending'::public.quote_status THEN
      PERFORM pg_catalog.set_config('localens.quote_transition', 'on', true);
      UPDATE public.custom_quotes SET status = 'accepted'::public.quote_status WHERE id = quote_row.id;
    END IF;
  ELSE
    next_payment_status := CASE WHEN payment_row.id IS NULL THEN NULL ELSE payment_row.status END;
    IF hold_row.id IS NOT NULL AND hold_row.status = 'active'::public.hold_status THEN
      PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
      UPDATE private.capacity_holds
        SET status = CASE WHEN expires_at <= current_time THEN 'expired'::public.hold_status ELSE 'released'::public.hold_status END,
            released_at = current_time
        WHERE id = hold_row.id;
    END IF;
    IF booking_row.status IN ('confirmed'::public.booking_status, 'payment_review'::public.booking_status) THEN
      next_booking_status := booking_row.status;
    ELSE
      PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
      UPDATE public.bookings SET status = 'expired'::public.booking_status
        WHERE id = booking_row.id AND status IN ('pending_payment'::public.booking_status, 'payment_processing'::public.booking_status);
      next_booking_status := CASE WHEN FOUND THEN 'expired'::public.booking_status ELSE booking_row.status END;
    END IF;
  END IF;

  PERFORM pg_catalog.set_config('localens.payment_transition', 'on', true);
  UPDATE private.webhook_events
  SET status = 'processed'::public.webhook_event_status,
      result_booking_status = next_booking_status,
      result_payment_status = next_payment_status,
      processed_at = current_time
  WHERE id = event_row.id;
  PERFORM private.record_payment_audit_event(
    'webhook_processed'::public.audit_event_type, NULL,
    'webhook_event'::public.audit_target_type, event_row.id,
    'received', 'processed', 'provider'::public.audit_metadata_key, 'stripe', NULL, NULL
  );
  event_status := 'processed'::public.webhook_event_status;
  booking_status := next_booking_status;
  payment_status := next_payment_status;
  replayed := false;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION private.finalize_stripe_event(text, text, text, uuid, uuid, bigint, public.checkout_currency, boolean, text, text, text, text, text, text, text)
  OWNER TO localens_payment_rpc_owner;
REVOKE ALL ON FUNCTION private.finalize_stripe_event(text, text, text, uuid, uuid, bigint, public.checkout_currency, boolean, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.finalize_stripe_event(text, text, text, uuid, uuid, bigint, public.checkout_currency, boolean, text, text, text, text, text, text, text)
  TO localens_webhook_executor;

-- Minimal Task 9 replay hydration: if the finalizer won the race, the browser
-- session-recording retry returns the durable payment and booking states.
CREATE OR REPLACE FUNCTION private.record_checkout_session(
  p_booking_id uuid,
  p_attempt_id uuid,
  p_provider_session_id text,
  p_provider_expires_at timestamptz
)
RETURNS TABLE (
  booking_id uuid,
  booking_status public.booking_status,
  payment_status public.payment_status,
  quote_status public.quote_status,
  provider_session_id text,
  state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_user_id uuid := auth.uid();
  idempotency_row private.checkout_idempotency%ROWTYPE;
  attempt_booking_id uuid;
  attempt_owner_user_id uuid;
  attempt_source_kind text;
  attempt_departure_id uuid;
  attempt_quote_id uuid;
  attempt_status text;
  attempt_provider_session_id text;
  attempt_provider_expires_at timestamptz;
  booking_row public.bookings%ROWTYPE;
  departure_row public.departures%ROWTYPE;
  quote_row public.custom_quotes%ROWTYPE;
  hold_row private.capacity_holds%ROWTYPE;
  hold_found boolean := false;
  source_is_quote boolean := false;
  payment_id uuid;
  payment_booking_id uuid;
  payment_status_value public.payment_status;
  now_time timestamptz;
BEGIN
  IF actor_user_id IS NULL OR p_booking_id IS NULL OR p_attempt_id IS NULL OR p_provider_session_id IS NULL
     OR p_provider_session_id !~ '^cs_[A-Za-z0-9][A-Za-z0-9_-]{5,254}$' OR p_provider_expires_at IS NULL THEN
    RAISE EXCEPTION 'checkout session input rejected' USING ERRCODE = '22023';
  END IF;

  -- Lock order is idempotency -> source -> booking -> hold (fixed departure)
  -- -> attempt -> payment. The initial attempt read is non-locking routing
  -- data; its authoritative row is locked after the shared source/booking/hold
  -- locks, matching the webhook finalizer's attempt -> payment order.
  SELECT * INTO idempotency_row FROM private.checkout_idempotency
    WHERE owner_user_id = actor_user_id AND checkout_attempt_id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501'; END IF;

  SELECT booking_id, owner_user_id, source_kind, departure_id, quote_id, status,
         provider_session_id, provider_expires_at
    INTO attempt_booking_id, attempt_owner_user_id, attempt_source_kind,
         attempt_departure_id, attempt_quote_id, attempt_status,
         attempt_provider_session_id, attempt_provider_expires_at
  FROM private.checkout_attempts
  WHERE id = p_attempt_id;
  IF NOT FOUND OR attempt_booking_id IS DISTINCT FROM p_booking_id OR attempt_owner_user_id IS DISTINCT FROM actor_user_id THEN
    RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501';
  END IF;

  IF attempt_source_kind = 'departure' AND attempt_departure_id IS NOT NULL THEN
    SELECT * INTO departure_row FROM public.departures WHERE id = attempt_departure_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'checkout departure unavailable' USING ERRCODE = 'P0001'; END IF;
  ELSIF attempt_source_kind = 'quote' AND attempt_quote_id IS NOT NULL THEN
    source_is_quote := true;
    SELECT * INTO quote_row FROM public.custom_quotes WHERE id = attempt_quote_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'checkout quote unavailable' USING ERRCODE = 'P0001'; END IF;
  ELSE
    RAISE EXCEPTION 'checkout source unavailable' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO booking_row FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR booking_row.owner_user_id IS DISTINCT FROM actor_user_id THEN
    RAISE EXCEPTION 'checkout booking unavailable' USING ERRCODE = '42501';
  END IF;
  IF (attempt_source_kind = 'departure' AND (booking_row.departure_id IS DISTINCT FROM attempt_departure_id OR booking_row.quote_id IS NOT NULL))
     OR (attempt_source_kind = 'quote' AND (booking_row.quote_id IS DISTINCT FROM attempt_quote_id OR booking_row.departure_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'checkout source changed' USING ERRCODE = 'P0001';
  END IF;

  IF attempt_source_kind = 'departure' THEN
    SELECT * INTO hold_row
    FROM private.capacity_holds
    WHERE booking_id = p_booking_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    FOR UPDATE;
    hold_found := FOUND;
  END IF;

  SELECT booking_id, owner_user_id, source_kind, departure_id, quote_id, status,
         provider_session_id, provider_expires_at
    INTO attempt_booking_id, attempt_owner_user_id, attempt_source_kind,
         attempt_departure_id, attempt_quote_id, attempt_status,
         attempt_provider_session_id, attempt_provider_expires_at
  FROM private.checkout_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND OR attempt_booking_id IS DISTINCT FROM p_booking_id OR attempt_owner_user_id IS DISTINCT FROM actor_user_id THEN
    RAISE EXCEPTION 'checkout attempt unavailable' USING ERRCODE = '42501';
  END IF;

  -- Checkout only needs the named payment identity/status columns. FOR KEY
  -- SHARE provides a stable replay read without granting payment writes, and
  -- follows the same attempt -> payment order used by the webhook finalizer.
  SELECT id, booking_id, status
    INTO payment_id, payment_booking_id, payment_status_value
  FROM public.payments
  WHERE booking_id = p_booking_id
  FOR KEY SHARE;
  IF FOUND AND payment_booking_id IS DISTINCT FROM p_booking_id THEN
    RAISE EXCEPTION 'payment booking mismatch' USING ERRCODE = 'P0001';
  END IF;
  -- Sample database time only after all shared locks have been acquired.
  now_time := pg_catalog.clock_timestamp();

  IF attempt_provider_session_id IS NOT NULL THEN
    IF attempt_provider_session_id IS DISTINCT FROM p_provider_session_id THEN
      RAISE EXCEPTION 'checkout session conflict' USING ERRCODE = 'P0001';
    END IF;

    -- A finalizer may already have consumed/released the hold and moved the
    -- booking to a terminal result. Same-session replay remains readable and
    -- can hydrate the real provider expiry without a downgrade.
    IF attempt_provider_expires_at IS NULL THEN
      IF p_provider_expires_at >= booking_row.hold_expires_at
         OR (booking_row.status NOT IN ('confirmed'::public.booking_status, 'payment_review'::public.booking_status, 'expired'::public.booking_status, 'cancelled'::public.booking_status)
             AND p_provider_expires_at <= now_time) THEN
        RAISE EXCEPTION 'provider session expiry rejected' USING ERRCODE = 'P0001';
      END IF;
      PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
      UPDATE private.checkout_attempts
        SET provider_expires_at = p_provider_expires_at, updated_at = now_time
        WHERE id = p_attempt_id;
    ELSIF attempt_provider_expires_at IS DISTINCT FROM p_provider_expires_at THEN
      RAISE EXCEPTION 'provider session expiry conflict' USING ERRCODE = 'P0001';
    END IF;

    IF attempt_source_kind = 'departure'
       AND booking_row.status NOT IN ('confirmed'::public.booking_status, 'payment_review'::public.booking_status, 'expired'::public.booking_status, 'cancelled'::public.booking_status)
       AND (NOT hold_found OR hold_row.status <> 'active'::public.hold_status OR hold_row.expires_at <= now_time) THEN
      RAISE EXCEPTION 'checkout hold unavailable' USING ERRCODE = 'P0001';
    END IF;
    booking_id := booking_row.id; booking_status := booking_row.status;
    payment_status := payment_status_value;
    quote_status := CASE WHEN source_is_quote THEN quote_row.status ELSE NULL END;
    provider_session_id := attempt_provider_session_id; state := 'replayed'; RETURN NEXT; RETURN;
  END IF;

  IF booking_row.status <> 'pending_payment'::public.booking_status THEN
    RAISE EXCEPTION 'checkout booking unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF attempt_source_kind = 'departure'
     AND (NOT hold_found OR hold_row.status <> 'active'::public.hold_status OR hold_row.expires_at <= now_time) THEN
    RAISE EXCEPTION 'checkout hold unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF source_is_quote
     AND (quote_row.status <> 'checkout_pending'::public.quote_status OR quote_row.valid_until <= now_time) THEN
    RAISE EXCEPTION 'checkout quote is no longer pending' USING ERRCODE = 'P0001';
  END IF;
  IF p_provider_expires_at <= now_time OR p_provider_expires_at >= booking_row.hold_expires_at THEN
    RAISE EXCEPTION 'provider session expiry rejected' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
  IF source_is_quote THEN
    PERFORM pg_catalog.set_config('localens.quote_transition', 'on', true);
    UPDATE public.custom_quotes SET status = 'accepted'::public.quote_status WHERE id = quote_row.id;
  END IF;
  UPDATE private.checkout_attempts
    SET provider_session_id = p_provider_session_id, provider_expires_at = p_provider_expires_at,
        status = 'session_recorded', updated_at = now_time
    WHERE id = p_attempt_id;
  UPDATE public.bookings SET status = 'payment_processing'::public.booking_status WHERE id = booking_row.id;
  PERFORM private.record_checkout_audit_event(
    'checkout_session_recorded'::public.audit_event_type, actor_user_id,
    'checkout_attempt'::public.audit_target_type, p_attempt_id,
    'created', 'session_recorded', 'provider'::public.audit_metadata_key, 'stripe', NULL, NULL
  );
  booking_id := booking_row.id; booking_status := 'payment_processing'::public.booking_status;
  payment_status := NULL; quote_status := CASE WHEN source_is_quote THEN 'accepted'::public.quote_status ELSE NULL END;
  provider_session_id := p_provider_session_id; state := 'recorded'; RETURN NEXT;
END;
$function$;
ALTER FUNCTION private.record_checkout_session(uuid, uuid, text, timestamptz) OWNER TO localens_checkout_rpc_owner;
REVOKE ALL ON FUNCTION private.record_checkout_session(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.record_checkout_session(uuid, uuid, text, timestamptz) TO localens_checkout_rpc_owner;

-- Only an authenticated admin may resolve a payment-review booking. The
-- transition is audited and cannot be reached by direct table DML.
CREATE POLICY bookings_admin_reconciliation ON public.bookings
  FOR SELECT TO localens_admin_rpc_owner USING (current_user = 'localens_admin_rpc_owner');
CREATE POLICY bookings_admin_reconciliation_update ON public.bookings
  FOR UPDATE TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner')
  WITH CHECK (current_user = 'localens_admin_rpc_owner');

CREATE OR REPLACE FUNCTION public.reconcile_payment(
  p_booking_id uuid,
  p_resolution public.booking_status
)
RETURNS public.booking_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_user_id uuid := auth.uid();
  booking_row public.bookings%ROWTYPE;
  payment_row public.payments%ROWTYPE;
BEGIN
  IF actor_user_id IS NULL OR p_booking_id IS NULL OR p_resolution NOT IN ('confirmed'::public.booking_status, 'cancelled'::public.booking_status)
     OR NOT EXISTS (SELECT 1 FROM private.user_roles WHERE user_id = actor_user_id AND role = 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin reconciliation required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO booking_row FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR booking_row.status <> 'payment_review'::public.booking_status THEN
    RAISE EXCEPTION 'payment review unavailable' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO payment_row FROM public.payments WHERE booking_id = p_booking_id FOR UPDATE;
  IF payment_row.id IS NOT NULL AND payment_row.status = 'review'::public.payment_status THEN
    PERFORM pg_catalog.set_config('localens.payment_transition', 'on', true);
    UPDATE public.payments
      SET status = CASE WHEN p_resolution = 'confirmed'::public.booking_status THEN 'paid'::public.payment_status ELSE 'failed'::public.payment_status END,
          updated_at = pg_catalog.clock_timestamp()
      WHERE id = payment_row.id;
  END IF;
  PERFORM pg_catalog.set_config('localens.checkout_transition', 'on', true);
  UPDATE public.bookings SET status = p_resolution WHERE id = p_booking_id;
  PERFORM private.record_payment_audit_event(
    'payment_reconciled'::public.audit_event_type, actor_user_id,
    'booking'::public.audit_target_type, p_booking_id,
    'payment_review', p_resolution::text, 'source'::public.audit_metadata_key, 'admin', NULL, NULL
  );
  IF payment_row.id IS NOT NULL THEN
    PERFORM private.record_payment_audit_event(
      'payment_reconciled'::public.audit_event_type, actor_user_id,
      'payment'::public.audit_target_type, payment_row.id,
      'review', CASE WHEN p_resolution = 'confirmed'::public.booking_status THEN 'paid' ELSE 'failed' END,
      'source'::public.audit_metadata_key, 'admin', NULL, NULL
    );
  END IF;
  RETURN p_resolution;
END;
$function$;
ALTER FUNCTION public.reconcile_payment(uuid, public.booking_status) OWNER TO localens_admin_rpc_owner;
REVOKE ALL ON FUNCTION public.reconcile_payment(uuid, public.booking_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_payment(uuid, public.booking_status) TO authenticated;

COMMIT;
