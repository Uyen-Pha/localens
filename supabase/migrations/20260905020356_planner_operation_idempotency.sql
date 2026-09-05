BEGIN;

-- This table is an internal server-side idempotency ledger.  It intentionally
-- stores only validated operation metadata and immutable persistence pointers;
-- raw prompts, feedback, provider payloads, locale, and other PII do not
-- cross this boundary.
CREATE TABLE private.runtime_planner_operations (
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('recommend', 'refine')),
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  target_plan_id uuid REFERENCES public.trip_plans(id) ON DELETE RESTRICT,
  base_revision_no integer,
  recommend_plan_id uuid,
  planner_reservation_id uuid NOT NULL,
  gemini_reservation_id uuid NOT NULL,
  lease_token uuid NOT NULL,
  lease_version integer NOT NULL DEFAULT 1 CHECK (lease_version >= 1),
  state text NOT NULL DEFAULT 'claimed'
    CHECK (state IN ('claimed', 'completed', 'rejected', 'interrupted')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  claimed_at timestamptz NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  rejected_at timestamptz,
  interrupted_at timestamptz,
  result_plan_id uuid,
  result_revision_no integer,
  rejection_code text,
  CONSTRAINT runtime_planner_operations_owner_operation_key
    UNIQUE (owner_user_id, operation_id),
  CONSTRAINT runtime_planner_operations_planner_reservation_key
    UNIQUE (planner_reservation_id),
  CONSTRAINT runtime_planner_operations_gemini_reservation_key
    UNIQUE (gemini_reservation_id),
  CONSTRAINT runtime_planner_operations_lease_token_key
    UNIQUE (lease_token),
  CONSTRAINT runtime_planner_operations_recommend_plan_key
    UNIQUE (recommend_plan_id),
  CONSTRAINT runtime_planner_operations_distinct_reservations_check
    CHECK (planner_reservation_id <> gemini_reservation_id),
  CONSTRAINT runtime_planner_operations_kind_binding_check
    CHECK (
      (kind = 'recommend'
       AND target_plan_id IS NULL
       AND base_revision_no IS NULL
       AND recommend_plan_id IS NOT NULL)
      OR
      (kind = 'refine'
       AND target_plan_id IS NOT NULL
       AND base_revision_no BETWEEN 1 AND 2147483646
       AND recommend_plan_id IS NULL)
    ),
  CONSTRAINT runtime_planner_operations_lease_window_check
    CHECK (
      created_at <= claimed_at
      AND lease_expires_at = claimed_at + INTERVAL '60 seconds'
    ),
  CONSTRAINT runtime_planner_operations_rejection_code_check
    CHECK (
      rejection_code IS NULL OR rejection_code IN (
        'QUOTA_EXCEEDED',
        'CATALOG_UNAVAILABLE',
        'TRAVEL_DATA_UNAVAILABLE',
        'FX_UNAVAILABLE',
        'STALE_REVISION',
        'INVALID_ITINERARY_INPUT',
        'USD_DISABLED',
        'NO_FEASIBLE_ITINERARY',
        'ITINERARY_SEARCH_LIMIT',
        'INVALID_ITINERARY_RESULT',
        'PLAN_NOT_FOUND',
        'PLAN_UNAVAILABLE',
        'SNAPSHOT_MISMATCH',
        'LOCKED_ITEM_INVALID'
      )
    ),
  CONSTRAINT runtime_planner_operations_result_binding_check
    CHECK (
      (result_plan_id IS NULL AND result_revision_no IS NULL)
      OR (
        result_plan_id IS NOT NULL
        AND result_revision_no BETWEEN 1 AND 2147483647
        AND (
          (kind = 'recommend'
           AND result_plan_id = recommend_plan_id
           AND result_revision_no = 1)
          OR
          (kind = 'refine'
           AND result_plan_id = target_plan_id
           AND result_revision_no = base_revision_no + 1)
        )
      )
    ),
  CONSTRAINT runtime_planner_operations_state_fields_check
    CHECK (
      (state = 'claimed'
       AND completed_at IS NULL
       AND rejected_at IS NULL
       AND interrupted_at IS NULL
       AND result_plan_id IS NULL
       AND result_revision_no IS NULL
       AND rejection_code IS NULL)
      OR
      (state = 'completed'
       AND completed_at IS NOT NULL
       AND rejected_at IS NULL
       AND interrupted_at IS NULL
       AND result_plan_id IS NOT NULL
       AND result_revision_no IS NOT NULL
       AND rejection_code IS NULL)
      OR
      (state = 'rejected'
       AND completed_at IS NULL
       AND rejected_at IS NOT NULL
       AND interrupted_at IS NULL
       AND result_plan_id IS NULL
       AND result_revision_no IS NULL
       AND rejection_code IS NOT NULL)
      OR
      (state = 'interrupted'
       AND completed_at IS NULL
       AND rejected_at IS NULL
       AND interrupted_at IS NOT NULL
       AND result_plan_id IS NULL
       AND result_revision_no IS NULL
       AND rejection_code IS NULL)
    ),
  CONSTRAINT runtime_planner_operations_terminal_time_check
    CHECK (
      (completed_at IS NULL OR completed_at >= claimed_at)
      AND (rejected_at IS NULL OR rejected_at >= claimed_at)
      AND (interrupted_at IS NULL OR interrupted_at >= claimed_at)
    )
);

ALTER TABLE private.runtime_planner_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.runtime_planner_operations FORCE ROW LEVEL SECURITY;

CREATE POLICY runtime_planner_operations_plan_rpc_owner_all
  ON private.runtime_planner_operations
  FOR ALL TO localens_plan_rpc_owner
  USING (current_user = 'localens_plan_rpc_owner')
  WITH CHECK (current_user = 'localens_plan_rpc_owner');

GRANT USAGE ON SCHEMA private TO localens_plan_rpc_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE private.runtime_planner_operations TO localens_plan_rpc_owner;
REVOKE ALL ON TABLE private.runtime_planner_operations FROM PUBLIC, anon, authenticated, service_role;

-- The row is immutable after a terminal result.  The only non-terminal update
-- allowed is the one-time post-lock timestamp restamp for a newly inserted
-- claim; all operation identity, digest, reservation, and lease-token fields
-- remain fixed for the lifetime of the row.
CREATE OR REPLACE FUNCTION private.guard_runtime_planner_operation_transition()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'planner operation rows are immutable' USING ERRCODE = 'P0001';
  END IF;

  IF OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
     OR OLD.operation_id IS DISTINCT FROM NEW.operation_id
     OR OLD.kind IS DISTINCT FROM NEW.kind
     OR OLD.request_digest IS DISTINCT FROM NEW.request_digest
     OR OLD.target_plan_id IS DISTINCT FROM NEW.target_plan_id
     OR OLD.base_revision_no IS DISTINCT FROM NEW.base_revision_no
     OR OLD.recommend_plan_id IS DISTINCT FROM NEW.recommend_plan_id
     OR OLD.planner_reservation_id IS DISTINCT FROM NEW.planner_reservation_id
     OR OLD.gemini_reservation_id IS DISTINCT FROM NEW.gemini_reservation_id
     OR OLD.lease_token IS DISTINCT FROM NEW.lease_token
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'planner operation identity is immutable' USING ERRCODE = 'P0001';
  END IF;

  IF OLD.state IN ('completed', 'rejected', 'interrupted') THEN
    RAISE EXCEPTION 'terminal planner operation is immutable' USING ERRCODE = 'P0001';
  END IF;

  IF OLD.state IS DISTINCT FROM 'claimed'
     OR NEW.state NOT IN ('claimed', 'completed', 'rejected', 'interrupted') THEN
    RAISE EXCEPTION 'invalid planner operation transition' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.state = 'claimed' THEN
    IF OLD.claimed_at IS DISTINCT FROM OLD.created_at
       OR NEW.lease_version IS DISTINCT FROM OLD.lease_version
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
       OR NEW.interrupted_at IS DISTINCT FROM OLD.interrupted_at
       OR NEW.result_plan_id IS DISTINCT FROM OLD.result_plan_id
       OR NEW.result_revision_no IS DISTINCT FROM OLD.result_revision_no
       OR NEW.rejection_code IS DISTINCT FROM OLD.rejection_code
       OR NEW.lease_expires_at IS DISTINCT FROM NEW.claimed_at + INTERVAL '60 seconds'
       OR NEW.claimed_at < OLD.claimed_at THEN
      RAISE EXCEPTION 'claimed planner operation fields are immutable' USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.lease_version IS DISTINCT FROM OLD.lease_version + 1 THEN
    RAISE EXCEPTION 'planner operation lease version mismatch' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;
GRANT CREATE ON SCHEMA private TO localens_plan_rpc_owner;
ALTER FUNCTION private.guard_runtime_planner_operation_transition() OWNER TO localens_plan_rpc_owner;
REVOKE CREATE ON SCHEMA private FROM localens_plan_rpc_owner;
REVOKE ALL ON FUNCTION private.guard_runtime_planner_operation_transition() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER runtime_planner_operations_transition_guard
BEFORE UPDATE OR DELETE ON private.runtime_planner_operations
FOR EACH ROW
EXECUTE FUNCTION private.guard_runtime_planner_operation_transition();

CREATE TRIGGER runtime_planner_operations_truncate_guard
BEFORE TRUNCATE ON private.runtime_planner_operations
FOR EACH STATEMENT
EXECUTE FUNCTION private.guard_runtime_planner_operation_transition();

-- PostgreSQL requires the target owner to have CREATE on the containing schema
-- while ownership changes. Finish all table-owner-only DDL first, then keep that
-- capability transaction-local in effect by revoking it immediately afterward.
GRANT CREATE ON SCHEMA private TO localens_plan_rpc_owner;
ALTER TABLE private.runtime_planner_operations OWNER TO localens_plan_rpc_owner;
REVOKE CREATE ON SCHEMA private FROM localens_plan_rpc_owner;

-- Claim atomically serializes the unique owner/operation key, binds the input
-- scope, and creates every server-owned UUID exactly once.  An existing key is
-- locked and compared before refine target validation; a genuinely new refine
-- validates its target before INSERT.  The explicit row lock is reacquired
-- after INSERT ... ON CONFLICT so a concurrent creator is compared under the
-- same lock; expiry is sampled only after that lock and never from a browser
-- clock.
CREATE OR REPLACE FUNCTION public.claim_runtime_planner_operation(
  p_actor_user_id uuid,
  p_operation_id uuid,
  p_kind text,
  p_request_digest text,
  p_target_plan_id uuid,
  p_base_revision integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  operation_row private.runtime_planner_operations%ROWTYPE;
  claim_time timestamptz;
  now_at timestamptz;
  inserted_count integer;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM private.user_roles AS roles
    WHERE roles.user_id = p_actor_user_id
      AND roles.role = 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION 'customer role required' USING ERRCODE = '42501';
  END IF;

  IF p_operation_id IS NULL
     OR p_request_digest IS NULL
     OR p_request_digest !~ '^[0-9a-f]{64}$'
     OR p_kind IS NULL
     OR p_kind NOT IN ('recommend', 'refine') THEN
    RAISE EXCEPTION 'invalid planner operation claim' USING ERRCODE = '22023';
  END IF;
  inserted_count := 0;
  SELECT *
  INTO operation_row
  FROM private.runtime_planner_operations AS operations
  WHERE operations.owner_user_id = p_actor_user_id
    AND operations.operation_id = p_operation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_kind = 'recommend'
       AND (p_target_plan_id IS NOT NULL OR p_base_revision IS NOT NULL) THEN
      RAISE EXCEPTION 'recommendation claim cannot bind a refinement target' USING ERRCODE = '22023';
    END IF;
    IF p_kind = 'refine'
       AND (p_target_plan_id IS NULL OR p_base_revision IS NULL OR p_base_revision NOT BETWEEN 1 AND 2147483646) THEN
      RAISE EXCEPTION 'refinement claim requires a valid target and base revision' USING ERRCODE = '22023';
    END IF;
    IF p_kind = 'refine' AND NOT EXISTS (
      SELECT 1
      FROM public.trip_plans AS plans
      WHERE plans.id = p_target_plan_id
        AND plans.owner_user_id = p_actor_user_id
    ) THEN
      RAISE EXCEPTION 'PLAN_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    claim_time := pg_catalog.clock_timestamp();
    INSERT INTO private.runtime_planner_operations (
      owner_user_id,
      operation_id,
      kind,
      request_digest,
      target_plan_id,
      base_revision_no,
      recommend_plan_id,
      planner_reservation_id,
      gemini_reservation_id,
      lease_token,
      state,
      created_at,
      claimed_at,
      lease_expires_at
    ) VALUES (
      p_actor_user_id,
      p_operation_id,
      p_kind,
      p_request_digest,
      p_target_plan_id,
      p_base_revision,
      CASE WHEN p_kind = 'recommend' THEN pg_catalog.gen_random_uuid() ELSE NULL END,
      pg_catalog.gen_random_uuid(),
      pg_catalog.gen_random_uuid(),
      pg_catalog.gen_random_uuid(),
      'claimed',
      claim_time,
      claim_time,
      claim_time + INTERVAL '60 seconds'
    )
    ON CONFLICT (owner_user_id, operation_id) DO NOTHING;
    GET DIAGNOSTICS inserted_count = ROW_COUNT;

    SELECT *
    INTO operation_row
    FROM private.runtime_planner_operations AS operations
    WHERE operations.owner_user_id = p_actor_user_id
      AND operations.operation_id = p_operation_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'planner operation claim could not be serialized' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF operation_row.kind IS DISTINCT FROM p_kind
     OR operation_row.request_digest IS DISTINCT FROM p_request_digest
     OR operation_row.target_plan_id IS DISTINCT FROM p_target_plan_id
     OR operation_row.base_revision_no IS DISTINCT FROM p_base_revision THEN
    RETURN jsonb_build_object('state', 'conflict');
  END IF;

  IF inserted_count = 1 THEN
    -- Restamp a new row after SELECT ... FOR UPDATE so both the persisted
    -- claim and its sixty-second expiry use the post-lock database clock.
    now_at := pg_catalog.clock_timestamp();
    UPDATE private.runtime_planner_operations AS operations
    SET claimed_at = now_at,
        lease_expires_at = now_at + INTERVAL '60 seconds'
    WHERE operations.owner_user_id = p_actor_user_id
      AND operations.operation_id = p_operation_id;
    SELECT *
    INTO operation_row
    FROM private.runtime_planner_operations AS operations
    WHERE operations.owner_user_id = p_actor_user_id
      AND operations.operation_id = p_operation_id
    FOR UPDATE;
    RETURN jsonb_build_object(
      'state', 'claimed',
      'leaseToken', operation_row.lease_token::text,
      'leaseExpiresAt', pg_catalog.to_char(operation_row.lease_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'planId', COALESCE(operation_row.recommend_plan_id, operation_row.target_plan_id)::text,
      'plannerReservationId', operation_row.planner_reservation_id::text,
      'geminiReservationId', operation_row.gemini_reservation_id::text
    );
  END IF;

  IF operation_row.state = 'completed' THEN
    RETURN jsonb_build_object(
      'state', 'completed',
      'planId', operation_row.result_plan_id::text,
      'revision', operation_row.result_revision_no
    );
  ELSIF operation_row.state = 'rejected' THEN
    RETURN jsonb_build_object(
      'state', 'rejected',
      'errorCode', operation_row.rejection_code
    );
  ELSIF operation_row.state = 'interrupted' THEN
    RETURN jsonb_build_object('state', 'interrupted');
  ELSIF operation_row.state = 'claimed' THEN
    now_at := pg_catalog.clock_timestamp();
    IF now_at >= operation_row.lease_expires_at THEN
      UPDATE private.runtime_planner_operations AS operations
      SET state = 'interrupted',
          interrupted_at = now_at,
          lease_version = operations.lease_version + 1
      WHERE operations.owner_user_id = p_actor_user_id
        AND operations.operation_id = p_operation_id;
      RETURN jsonb_build_object('state', 'interrupted');
    END IF;
    RETURN jsonb_build_object('state', 'in_progress');
  END IF;

  RAISE EXCEPTION 'invalid persisted planner operation state' USING ERRCODE = 'P0001';
END;
$function$;
GRANT CREATE ON SCHEMA public TO localens_plan_rpc_owner;
ALTER FUNCTION public.claim_runtime_planner_operation(uuid, uuid, text, text, uuid, integer)
  OWNER TO localens_plan_rpc_owner;

-- Read-only status never takes a row lock, checks expiry, or changes state.
CREATE OR REPLACE FUNCTION public.get_runtime_planner_operation(
  p_actor_user_id uuid,
  p_operation_id uuid,
  p_request_digest text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  operation_row private.runtime_planner_operations%ROWTYPE;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM private.user_roles AS roles
    WHERE roles.user_id = p_actor_user_id
      AND roles.role = 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION 'customer role required' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL
     OR p_request_digest IS NULL
     OR p_request_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid planner operation lookup' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO operation_row
  FROM private.runtime_planner_operations AS operations
  WHERE operations.owner_user_id = p_actor_user_id
    AND operations.operation_id = p_operation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'missing');
  END IF;
  IF operation_row.request_digest IS DISTINCT FROM p_request_digest THEN
    RETURN jsonb_build_object('state', 'conflict');
  END IF;
  IF operation_row.state = 'completed' THEN
    RETURN jsonb_build_object(
      'state', 'completed',
      'planId', operation_row.result_plan_id::text,
      'revision', operation_row.result_revision_no
    );
  ELSIF operation_row.state = 'rejected' THEN
    RETURN jsonb_build_object(
      'state', 'rejected',
      'errorCode', operation_row.rejection_code
    );
  ELSIF operation_row.state = 'interrupted' THEN
    RETURN jsonb_build_object('state', 'interrupted');
  ELSIF operation_row.state = 'claimed' THEN
    RETURN jsonb_build_object('state', 'in_progress');
  END IF;

  RAISE EXCEPTION 'invalid persisted planner operation state' USING ERRCODE = 'P0001';
END;
$function$;
ALTER FUNCTION public.get_runtime_planner_operation(uuid, uuid, text)
  OWNER TO localens_plan_rpc_owner;

-- Completion delegates to the already-audited persistence routines.  The
-- operation row remains locked while the delegated write and final pointer
-- update execute in this transaction, so a committed plan always has the
-- matching completed operation record.
CREATE OR REPLACE FUNCTION public.complete_runtime_recommendation(
  p_actor_user_id uuid,
  p_operation_id uuid,
  p_request_digest text,
  p_lease_token uuid,
  p_persistence_dto jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  operation_row private.runtime_planner_operations%ROWTYPE;
  persisted_plan_id uuid;
  persisted_revision_no integer;
  now_at timestamptz;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM private.user_roles AS roles
    WHERE roles.user_id = p_actor_user_id
      AND roles.role = 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION 'customer role required' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL
     OR p_request_digest IS NULL
     OR p_request_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid planner operation completion' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO operation_row
  FROM private.runtime_planner_operations AS operations
  WHERE operations.owner_user_id = p_actor_user_id
    AND operations.operation_id = p_operation_id
  FOR UPDATE;
  IF NOT FOUND
     OR operation_row.request_digest IS DISTINCT FROM p_request_digest
     OR operation_row.kind IS DISTINCT FROM 'recommend' THEN
    RETURN jsonb_build_object('state', 'conflict');
  END IF;
  IF operation_row.state = 'completed' THEN
    RETURN jsonb_build_object(
      'state', 'completed',
      'planId', operation_row.result_plan_id::text,
      'revision', operation_row.result_revision_no
    );
  ELSIF operation_row.state = 'rejected' THEN
    RETURN jsonb_build_object('state', 'rejected', 'errorCode', operation_row.rejection_code);
  ELSIF operation_row.state = 'interrupted' THEN
    RETURN jsonb_build_object('state', 'interrupted');
  END IF;

  now_at := pg_catalog.clock_timestamp();
  IF now_at >= operation_row.lease_expires_at THEN
    UPDATE private.runtime_planner_operations AS operations
    SET state = 'interrupted',
        interrupted_at = now_at,
        lease_version = operations.lease_version + 1
    WHERE operations.owner_user_id = p_actor_user_id
      AND operations.operation_id = p_operation_id;
    RETURN jsonb_build_object('state', 'interrupted');
  END IF;
  IF p_lease_token IS NULL OR p_lease_token IS DISTINCT FROM operation_row.lease_token THEN
    RETURN jsonb_build_object('state', 'conflict');
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  SELECT created.plan_id, created.revision_no
  INTO persisted_plan_id, persisted_revision_no
  FROM public.create_authenticated_trip_plan(
    operation_row.recommend_plan_id,
    p_persistence_dto
  ) AS created;
  IF NOT FOUND
     OR persisted_plan_id IS DISTINCT FROM operation_row.recommend_plan_id
     OR persisted_revision_no IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'invalid persisted recommendation result' USING ERRCODE = 'P0001';
  END IF;

  UPDATE private.runtime_planner_operations AS operations
  SET state = 'completed',
      completed_at = pg_catalog.clock_timestamp(),
      result_plan_id = persisted_plan_id,
      result_revision_no = persisted_revision_no,
      lease_version = operations.lease_version + 1
  WHERE operations.owner_user_id = p_actor_user_id
    AND operations.operation_id = p_operation_id;
  RETURN jsonb_build_object(
    'state', 'completed',
    'planId', persisted_plan_id::text,
    'revision', persisted_revision_no
  );
END;
$function$;
ALTER FUNCTION public.complete_runtime_recommendation(uuid, uuid, text, uuid, jsonb)
  OWNER TO localens_plan_rpc_owner;

CREATE OR REPLACE FUNCTION public.complete_runtime_refinement(
  p_actor_user_id uuid,
  p_operation_id uuid,
  p_request_digest text,
  p_lease_token uuid,
  p_persistence_dto jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  operation_row private.runtime_planner_operations%ROWTYPE;
  persisted_revision_no integer;
  now_at timestamptz;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM private.user_roles AS roles
    WHERE roles.user_id = p_actor_user_id
      AND roles.role = 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION 'customer role required' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL
     OR p_request_digest IS NULL
     OR p_request_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid planner operation completion' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO operation_row
  FROM private.runtime_planner_operations AS operations
  WHERE operations.owner_user_id = p_actor_user_id
    AND operations.operation_id = p_operation_id
  FOR UPDATE;
  IF NOT FOUND
     OR operation_row.request_digest IS DISTINCT FROM p_request_digest
     OR operation_row.kind IS DISTINCT FROM 'refine' THEN
    RETURN jsonb_build_object('state', 'conflict');
  END IF;
  IF operation_row.state = 'completed' THEN
    RETURN jsonb_build_object(
      'state', 'completed',
      'planId', operation_row.result_plan_id::text,
      'revision', operation_row.result_revision_no
    );
  ELSIF operation_row.state = 'rejected' THEN
    RETURN jsonb_build_object('state', 'rejected', 'errorCode', operation_row.rejection_code);
  ELSIF operation_row.state = 'interrupted' THEN
    RETURN jsonb_build_object('state', 'interrupted');
  END IF;

  now_at := pg_catalog.clock_timestamp();
  IF now_at >= operation_row.lease_expires_at THEN
    UPDATE private.runtime_planner_operations AS operations
    SET state = 'interrupted',
        interrupted_at = now_at,
        lease_version = operations.lease_version + 1
    WHERE operations.owner_user_id = p_actor_user_id
      AND operations.operation_id = p_operation_id;
    RETURN jsonb_build_object('state', 'interrupted');
  END IF;
  IF p_lease_token IS NULL OR p_lease_token IS DISTINCT FROM operation_row.lease_token THEN
    RETURN jsonb_build_object('state', 'conflict');
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  SELECT advanced.revision_no
  INTO persisted_revision_no
  FROM public.advance_authenticated_trip_plan_revision(
    operation_row.target_plan_id,
    operation_row.base_revision_no,
    p_persistence_dto
  ) AS advanced;
  IF NOT FOUND
     OR persisted_revision_no IS DISTINCT FROM operation_row.base_revision_no + 1 THEN
    RAISE EXCEPTION 'invalid persisted refinement result' USING ERRCODE = 'P0001';
  END IF;

  UPDATE private.runtime_planner_operations AS operations
  SET state = 'completed',
      completed_at = pg_catalog.clock_timestamp(),
      result_plan_id = operation_row.target_plan_id,
      result_revision_no = persisted_revision_no,
      lease_version = operations.lease_version + 1
  WHERE operations.owner_user_id = p_actor_user_id
    AND operations.operation_id = p_operation_id;
  RETURN jsonb_build_object(
    'state', 'completed',
    'planId', operation_row.target_plan_id::text,
    'revision', persisted_revision_no
  );
END;
$function$;
ALTER FUNCTION public.complete_runtime_refinement(uuid, uuid, text, uuid, jsonb)
  OWNER TO localens_plan_rpc_owner;

CREATE OR REPLACE FUNCTION public.reject_runtime_planner_operation(
  p_actor_user_id uuid,
  p_operation_id uuid,
  p_request_digest text,
  p_lease_token uuid,
  p_error_code text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  operation_row private.runtime_planner_operations%ROWTYPE;
  now_at timestamptz;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM private.user_roles AS roles
    WHERE roles.user_id = p_actor_user_id
      AND roles.role = 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION 'customer role required' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL
     OR p_request_digest IS NULL
     OR p_request_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid planner operation rejection' USING ERRCODE = '22023';
  END IF;
  IF p_error_code IS NULL OR p_error_code NOT IN (
    'QUOTA_EXCEEDED',
    'CATALOG_UNAVAILABLE',
    'TRAVEL_DATA_UNAVAILABLE',
    'FX_UNAVAILABLE',
    'STALE_REVISION',
    'INVALID_ITINERARY_INPUT',
    'USD_DISABLED',
    'NO_FEASIBLE_ITINERARY',
    'ITINERARY_SEARCH_LIMIT',
    'INVALID_ITINERARY_RESULT',
    'PLAN_NOT_FOUND',
    'PLAN_UNAVAILABLE',
    'SNAPSHOT_MISMATCH',
    'LOCKED_ITEM_INVALID'
  ) THEN
    RAISE EXCEPTION 'invalid rejection code' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO operation_row
  FROM private.runtime_planner_operations AS operations
  WHERE operations.owner_user_id = p_actor_user_id
    AND operations.operation_id = p_operation_id
  FOR UPDATE;
  IF NOT FOUND OR operation_row.request_digest IS DISTINCT FROM p_request_digest THEN
    RETURN jsonb_build_object('state', 'conflict');
  END IF;
  IF operation_row.state = 'completed' THEN
    RETURN jsonb_build_object(
      'state', 'completed',
      'planId', operation_row.result_plan_id::text,
      'revision', operation_row.result_revision_no
    );
  ELSIF operation_row.state = 'rejected' THEN
    RETURN jsonb_build_object('state', 'rejected', 'errorCode', operation_row.rejection_code);
  ELSIF operation_row.state = 'interrupted' THEN
    RETURN jsonb_build_object('state', 'interrupted');
  END IF;

  now_at := pg_catalog.clock_timestamp();
  IF now_at >= operation_row.lease_expires_at THEN
    UPDATE private.runtime_planner_operations AS operations
    SET state = 'interrupted',
        interrupted_at = now_at,
        lease_version = operations.lease_version + 1
    WHERE operations.owner_user_id = p_actor_user_id
      AND operations.operation_id = p_operation_id;
    RETURN jsonb_build_object('state', 'interrupted');
  END IF;
  IF p_lease_token IS NULL OR p_lease_token IS DISTINCT FROM operation_row.lease_token THEN
    RETURN jsonb_build_object('state', 'conflict');
  END IF;

  UPDATE private.runtime_planner_operations AS operations
  SET state = 'rejected',
      rejected_at = pg_catalog.clock_timestamp(),
      rejection_code = p_error_code,
      lease_version = operations.lease_version + 1
  WHERE operations.owner_user_id = p_actor_user_id
    AND operations.operation_id = p_operation_id;
  RETURN jsonb_build_object('state', 'rejected', 'errorCode', p_error_code);
END;
$function$;
ALTER FUNCTION public.reject_runtime_planner_operation(uuid, uuid, text, uuid, text)
  OWNER TO localens_plan_rpc_owner;
REVOKE CREATE ON SCHEMA public FROM localens_plan_rpc_owner;

-- The new wrappers are the only external operation API.  Existing routines
-- remain callable by their named owner inside these definer wrappers, but no
-- API role can reach the legacy write routes directly.
SET LOCAL ROLE localens_plan_rpc_owner;
REVOKE ALL ON FUNCTION public.claim_runtime_planner_operation(uuid, uuid, text, text, uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_runtime_planner_operation(uuid, uuid, text, text, uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.get_runtime_planner_operation(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_runtime_planner_operation(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.complete_runtime_recommendation(uuid, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_runtime_recommendation(uuid, uuid, text, uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.complete_runtime_refinement(uuid, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_runtime_refinement(uuid, uuid, text, uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.reject_runtime_planner_operation(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_runtime_planner_operation(uuid, uuid, text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.create_authenticated_trip_plan(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.advance_authenticated_trip_plan_revision(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.advance_trip_plan_revision(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated, service_role;
RESET ROLE;

COMMIT;
