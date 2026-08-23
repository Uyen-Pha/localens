BEGIN;

-- LocalLens uses pgcrypto only for database-owned UUIDs. No application secret is stored here.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Keep operational helpers outside every PostgREST-exposed schema.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

CREATE TYPE public.app_role AS ENUM (
  'customer',
  'guide',
  'admin'
);

CREATE TYPE public.locale AS ENUM (
  'en',
  'vi'
);

CREATE TYPE public.place_status AS ENUM (
  'draft',
  'published',
  'archived'
);

CREATE TYPE public.tour_status AS ENUM (
  'draft',
  'published',
  'archived'
);

CREATE TYPE public.tour_version_status AS ENUM (
  'draft',
  'published',
  'retired'
);

CREATE TYPE public.departure_status AS ENUM (
  'scheduled',
  'sold_out',
  'cancelled',
  'completed'
);

CREATE TYPE public.snapshot_status AS ENUM (
  'building',
  'published',
  'retired'
);

CREATE TYPE public.request_status AS ENUM (
  'draft',
  'pending_review',
  'changes_requested',
  'approved',
  'rejected'
);

CREATE TYPE public.quote_status AS ENUM (
  'active',
  'checkout_pending',
  'accepted',
  'expired',
  'revoked'
);

CREATE TYPE public.hold_status AS ENUM (
  'active',
  'consumed',
  'released',
  'expired'
);

CREATE TYPE public.booking_status AS ENUM (
  'pending_payment',
  'payment_processing',
  'confirmed',
  'payment_failed',
  'payment_review',
  'expired',
  'cancelled',
  'completed'
);

CREATE TYPE public.payment_status AS ENUM (
  'pending',
  'paid',
  'failed',
  'review'
);

CREATE TYPE public.webhook_event_status AS ENUM (
  'received',
  'processed',
  'ignored',
  'failed',
  'conflict'
);

CREATE TYPE public.assignment_status AS ENUM (
  'assigned',
  'accepted',
  'completed',
  'closed'
);

CREATE TYPE public.content_status AS ENUM (
  'draft',
  'publishing',
  'published',
  'failed'
);

CREATE TYPE public.ranking_source AS ENUM (
  'ai',
  'deterministic'
);

CREATE TYPE public.currency_code AS ENUM (
  'VND',
  'USD'
);

CREATE TYPE public.checkout_currency AS ENUM (
  'vnd',
  'usd'
);

CREATE TYPE public.audit_event_type AS ENUM (
  'role_provisioned',
  'role_revoked',
  'plan_claimed',
  'request_submitted',
  'request_changes_requested',
  'request_approved',
  'request_rejected',
  'quote_created',
  'quote_checkout_started',
  'quote_accepted',
  'quote_reactivated',
  'quote_expired',
  'quote_revoked',
  'checkout_started',
  'checkout_session_recorded',
  'checkout_compensated',
  'booking_status_changed',
  'webhook_processed',
  'webhook_ignored',
  'webhook_failed',
  'webhook_conflict',
  'payment_reconciled',
  'guide_assigned',
  'guide_reassigned',
  'guide_accepted',
  'guide_completed',
  'content_publish_started',
  'content_published',
  'content_publish_failed'
);

-- Audit metadata is a closed scalar vocabulary. Values are constrained by key
-- in the identity migration; this enum prevents arbitrary JSON-like keys.
CREATE TYPE public.audit_metadata_key AS ENUM (
  'role',
  'source',
  'status',
  'state',
  'decision',
  'provider',
  'currency',
  'count',
  'revision',
  'attempt_no',
  'amount_minor',
  'replayed',
  'is_demo'
);

COMMIT;
