BEGIN;

-- Owner projection reads the same subject shape accepted by PostgREST. This
-- keeps direct view reads correct even before a wrapper call normalizes the
-- legacy per-claim setting for the existing private checkout transaction.
DROP POLICY bookings_projection_owner_select ON public.bookings;
CREATE POLICY bookings_projection_owner_select ON public.bookings
  FOR SELECT TO localens_booking_projection_owner
  USING (
    COALESCE(
      NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      pg_catalog.jsonb_extract_path_text(
        NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
        'sub'
      )
    )::uuid = owner_user_id
  );

-- The browser-facing wrapper reuses the existing checkout owner and transaction.
-- CREATE is temporary and revoked after ownership/grants are finalized.
GRANT CREATE ON SCHEMA public TO localens_checkout_rpc_owner;

CREATE OR REPLACE FUNCTION public.begin_fixed_tour_booking(
  departure_id uuid,
  party_size integer,
  booking_locale public.locale,
  idempotency_key text
)
RETURNS TABLE (
  booking_id uuid,
  hold_expires_at timestamptz,
  state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  actor_user_id uuid;
  canonical_request_hash text;
BEGIN
  actor_user_id := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    pg_catalog.jsonb_extract_path_text(
      NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      'sub'
    )
  )::uuid;

  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'checkout authentication required' USING ERRCODE = '42501';
  END IF;

  -- The authenticated actor and fixed source kind are never accepted from the
  -- browser. The internal transaction independently recomputes this hash.
  canonical_request_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        private.checkout_canonical_payload(
          actor_user_id,
          'departure',
          departure_id,
          party_size,
          booking_locale
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  -- Keep the existing checkout role gate, lock order, capacity hold, and
  -- idempotency receipt authoritative. JSON PostgREST claims are normalized
  -- to the legacy per-claim setting consumed by the internal transaction.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', actor_user_id::text, true);

  RETURN QUERY
  SELECT
    checkout_result.booking_id,
    checkout_result.hold_expires_at,
    checkout_result.state
  FROM private.start_checkout_tx(
    'departure',
    departure_id,
    party_size,
    booking_locale,
    idempotency_key,
    canonical_request_hash
  ) AS checkout_result;
END;
$function$;

ALTER FUNCTION public.begin_fixed_tour_booking(uuid, integer, public.locale, text)
  OWNER TO localens_checkout_rpc_owner;
SET LOCAL ROLE localens_checkout_rpc_owner;
REVOKE ALL ON FUNCTION public.begin_fixed_tour_booking(uuid, integer, public.locale, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_fixed_tour_booking(uuid, integer, public.locale, text)
  TO authenticated;
RESET ROLE;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA public FROM localens_checkout_rpc_owner;

COMMIT;
