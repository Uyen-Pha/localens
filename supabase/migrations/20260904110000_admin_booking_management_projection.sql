BEGIN;

-- The superseded request queue used this owner for its administrator view.
-- Keep the role, but reduce its remaining authority to the exact columns used
-- by the immutable cancellation history and all-bookings management views.
REVOKE USAGE ON SCHEMA auth FROM localens_cancellation_admin_projection_owner;
REVOKE SELECT (id, display_name)
  ON TABLE public.profiles FROM localens_cancellation_admin_projection_owner;
REVOKE SELECT (id, status, owner_user_id, title_en, title_vi)
  ON TABLE public.bookings FROM localens_cancellation_admin_projection_owner;
REVOKE SELECT ON TABLE private.booking_cancellations
  FROM localens_cancellation_admin_projection_owner;
REVOKE SELECT ON TABLE private.user_roles
  FROM localens_cancellation_admin_projection_owner;
DROP POLICY IF EXISTS profiles_cancellation_admin_projection_select
  ON public.profiles;

GRANT SELECT (id, owner_user_id, source_kind, title_en, title_vi, status, created_at)
  ON TABLE public.bookings TO localens_cancellation_admin_projection_owner;
GRANT SELECT (
  id,
  booking_id,
  customer_user_id,
  source_kind,
  reason_code,
  other_reason,
  request_idempotency_key,
  cancelled_at
) ON TABLE private.booking_cancellations TO localens_cancellation_admin_projection_owner;
GRANT SELECT (user_id, role)
  ON TABLE private.user_roles TO localens_cancellation_admin_projection_owner;

GRANT CREATE ON SCHEMA public TO localens_cancellation_admin_projection_owner;
SET LOCAL ROLE localens_cancellation_admin_projection_owner;
CREATE OR REPLACE VIEW public.admin_booking_management_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  bookings.id AS booking_id,
  bookings.owner_user_id AS customer_user_id,
  bookings.source_kind,
  bookings.title_en,
  bookings.title_vi,
  bookings.status AS booking_status,
  bookings.created_at,
  cancellations.id AS cancellation_id,
  cancellations.reason_code AS cancellation_reason_code,
  cancellations.other_reason AS cancellation_other_reason,
  cancellations.request_idempotency_key AS cancellation_idempotency_key,
  cancellations.cancelled_at
FROM public.bookings AS bookings
LEFT JOIN private.booking_cancellations AS cancellations
  ON cancellations.booking_id = bookings.id
WHERE EXISTS (
    SELECT 1
    FROM private.user_roles AS roles
    WHERE roles.user_id = COALESCE(
        NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        pg_catalog.jsonb_extract_path_text(
          NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
          'sub'
        )
      )::uuid
      AND roles.role = 'admin'::public.app_role
  )
  AND NOT EXISTS (
    SELECT 1
    FROM private.user_roles AS roles
    WHERE roles.user_id = COALESCE(
        NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        pg_catalog.jsonb_extract_path_text(
          NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
          'sub'
        )
      )::uuid
      AND roles.role <> 'admin'::public.app_role
  );
ALTER VIEW public.admin_booking_management_v
  OWNER TO localens_cancellation_admin_projection_owner;
REVOKE ALL ON TABLE public.admin_booking_management_v
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.admin_booking_management_v TO authenticated;
RESET ROLE;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA public FROM localens_cancellation_admin_projection_owner;

COMMIT;
