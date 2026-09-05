BEGIN;

GRANT CREATE ON SCHEMA private TO localens_admin_rpc_owner, localens_catalog_guard_owner;
GRANT CREATE ON SCHEMA public TO localens_admin_rpc_owner;

-- Task 11: the mutable food catalog has one authenticated review boundary.
-- The existing place_status enum remains the persistence vocabulary:
-- draft is research-only and published is sellable.  Review audit rows reuse
-- the closed request_approved/request_rejected audit events with the existing
-- catalog_snapshot target type, so the earlier exhaustive enums stay stable.

ALTER TABLE private.audit_events
  ADD COLUMN rejection_note text;

ALTER TABLE private.audit_events
  ADD CONSTRAINT audit_events_rejection_note_check CHECK (
    rejection_note IS NULL
    OR (
      length(btrim(rejection_note)) BETWEEN 1 AND 1000
      AND rejection_note = btrim(rejection_note)
      AND rejection_note !~ '[[:cntrl:]]'
    )
  );

-- The admin review owner reads the complete mutable projection and is the only
-- role allowed to transition a food item or vendor through this RPC.
CREATE POLICY food_vendors_admin_review_select ON public.food_vendors
  FOR SELECT TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner');
CREATE POLICY food_vendor_translations_admin_review_select ON public.food_vendor_translations
  FOR SELECT TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner');
CREATE POLICY food_vendor_supports_admin_review_select ON public.food_vendor_supports
  FOR SELECT TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner');
CREATE POLICY food_vendor_opening_hours_admin_review_select ON public.food_vendor_opening_hours
  FOR SELECT TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner');
CREATE POLICY food_vendor_opening_exceptions_admin_review_select ON public.food_vendor_opening_exceptions
  FOR SELECT TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner');
CREATE POLICY food_vendor_exception_windows_admin_review_select ON public.food_vendor_opening_exception_windows
  FOR SELECT TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner');
CREATE POLICY food_items_admin_review_select ON public.food_items
  FOR SELECT TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner');
CREATE POLICY food_item_translations_admin_review_select ON public.food_item_translations
  FOR SELECT TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner');
CREATE POLICY food_item_supports_admin_review_select ON public.food_item_supports
  FOR SELECT TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner');

CREATE POLICY food_vendors_admin_review_update ON public.food_vendors
  FOR UPDATE TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner')
  WITH CHECK (current_user = 'localens_admin_rpc_owner');
CREATE POLICY food_items_admin_review_update ON public.food_items
  FOR UPDATE TO localens_admin_rpc_owner
  USING (current_user = 'localens_admin_rpc_owner')
  WITH CHECK (current_user = 'localens_admin_rpc_owner');

GRANT SELECT ON TABLE
  public.food_vendors, public.food_vendor_translations, public.food_vendor_supports,
  public.food_vendor_opening_hours, public.food_vendor_opening_exceptions,
  public.food_vendor_opening_exception_windows, public.food_items,
  public.food_item_translations, public.food_item_supports
  TO localens_admin_rpc_owner;
GRANT UPDATE (status) ON TABLE public.food_vendors TO localens_admin_rpc_owner;
GRANT UPDATE (status) ON TABLE public.food_items TO localens_admin_rpc_owner;

CREATE POLICY audit_events_food_catalog_admin_insert ON private.audit_events
  FOR INSERT TO localens_admin_rpc_owner
  WITH CHECK (
    current_user = 'localens_admin_rpc_owner'
    AND target_type = 'catalog_snapshot'::public.audit_target_type
    AND event_type IN ('request_approved'::public.audit_event_type, 'request_rejected'::public.audit_event_type)
    AND actor_role = 'admin'::public.app_role
  );
GRANT INSERT ON TABLE private.audit_events TO localens_admin_rpc_owner;

SET LOCAL ROLE localens_admin_rpc_owner;

CREATE OR REPLACE FUNCTION private.assert_catalog_review_admin()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  actor uuid;
BEGIN
  actor := NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM private.user_roles AS roles
    WHERE roles.user_id = actor
      AND roles.role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;
  RETURN actor;
END;
$function$;
ALTER FUNCTION private.assert_catalog_review_admin() OWNER TO localens_admin_rpc_owner;
REVOKE ALL ON FUNCTION private.assert_catalog_review_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE private.user_roles TO localens_admin_rpc_owner;
GRANT EXECUTE ON FUNCTION private.assert_catalog_review_admin() TO localens_admin_rpc_owner;
SET LOCAL ROLE postgres;

-- This guard is intentionally stricter than the older publication trigger:
-- every evidence field that the queue asks an admin to confirm must be a real
-- database row, and unknown support statuses never pass the sellable gate.
SET LOCAL ROLE localens_catalog_guard_owner;

CREATE OR REPLACE FUNCTION private.assert_food_catalog_review_complete(target_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  item_row public.food_items%ROWTYPE;
  vendor_row public.food_vendors%ROWTYPE;
  parent_status public.place_status;
BEGIN
  IF target_item_id IS NULL THEN
    RAISE EXCEPTION 'food catalog evidence is incomplete' USING ERRCODE = '23514';
  END IF;

  -- The public RPC locks both mutable parent rows before calling this
  -- read-only guard. This helper takes the same advisory locks and re-reads
  -- the rows so every completeness check uses the RPC's locked snapshot.
  SELECT * INTO item_row
  FROM public.food_items
  WHERE id = target_item_id;
  IF NOT FOUND OR item_row.status <> 'draft'::public.place_status THEN
    RAISE EXCEPTION 'food catalog evidence is incomplete' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO vendor_row
  FROM public.food_vendors
  WHERE id = item_row.food_vendor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'food catalog evidence is incomplete' USING ERRCODE = '23514';
  END IF;

  -- Match the writer namespace and lock parents before children. This keeps a
  -- review serialized with catalog edits and avoids a lock-order cycle.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('localens:food-vendor:' || vendor_row.id::text, 0::bigint)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('localens:food-item:' || target_item_id::text, 0::bigint)
  );

  -- Re-read after the locks so the remainder of the guard always evaluates
  -- the rows that the RPC will transition, not the pre-lock snapshot.
  SELECT * INTO item_row
  FROM public.food_items
  WHERE id = target_item_id;
  IF NOT FOUND
     OR item_row.status <> 'draft'::public.place_status
     OR item_row.food_vendor_id IS DISTINCT FROM vendor_row.id THEN
    RAISE EXCEPTION 'food catalog evidence is incomplete' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO vendor_row
  FROM public.food_vendors
  WHERE id = item_row.food_vendor_id;
  IF NOT FOUND OR vendor_row.status NOT IN ('draft'::public.place_status, 'published'::public.place_status) THEN
    RAISE EXCEPTION 'food catalog evidence is incomplete' USING ERRCODE = '23514';
  END IF;

  SELECT status INTO parent_status
  FROM public.places
  WHERE id = vendor_row.place_id;
  IF NOT FOUND OR parent_status <> 'published'::public.place_status THEN
    RAISE EXCEPTION 'food catalog evidence is incomplete' USING ERRCODE = '23514';
  END IF;

  IF vendor_row.source_url IS NULL OR vendor_row.verified_at IS NULL
     OR vendor_row.attribution IS NULL OR btrim(vendor_row.attribution) = ''
     OR btrim(vendor_row.location_note) = '' OR btrim(vendor_row.capacity_note) = '' THEN
    RAISE EXCEPTION 'food catalog evidence is incomplete' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM public.food_vendor_translations
      WHERE food_vendor_id = vendor_row.id
        AND locale IN ('en'::public.locale, 'vi'::public.locale)) <> 2
     OR (SELECT count(*) FROM public.food_vendor_translations
         WHERE food_vendor_id = vendor_row.id
           AND locale IN ('en'::public.locale, 'vi'::public.locale)
           AND btrim(title) <> '' AND btrim(description) <> '') <> 2 THEN
    RAISE EXCEPTION 'food catalog evidence is incomplete' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.food_vendor_opening_hours
    WHERE food_vendor_id = vendor_row.id
  ) THEN
    RAISE EXCEPTION 'food catalog evidence is incomplete' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.food_vendor_opening_exceptions AS exceptions
    WHERE exceptions.food_vendor_id = vendor_row.id
      AND (
        (exceptions.closed IS FALSE AND NOT EXISTS (
          SELECT 1
          FROM public.food_vendor_opening_exception_windows AS windows
          WHERE windows.food_vendor_id = exceptions.food_vendor_id
            AND windows.exception_id = exceptions.id
        ))
        OR (exceptions.closed IS TRUE AND EXISTS (
          SELECT 1
          FROM public.food_vendor_opening_exception_windows AS windows
          WHERE windows.food_vendor_id = exceptions.food_vendor_id
            AND windows.exception_id = exceptions.id
        ))
      )
  ) THEN
    RAISE EXCEPTION 'food catalog evidence is incomplete' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.food_vendor_supports
    WHERE food_vendor_id = vendor_row.id AND support_kind = 'dietary'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.food_vendor_supports
    WHERE food_vendor_id = vendor_row.id AND support_kind = 'mobility'
  ) OR EXISTS (
    SELECT 1 FROM public.food_vendor_supports
    WHERE food_vendor_id = vendor_row.id
      AND support_kind IN ('dietary', 'mobility')
      AND status = 'unknown'
  ) THEN
    RAISE EXCEPTION 'food catalog evidence is incomplete' USING ERRCODE = '23514';
  END IF;

  IF item_row.source_url IS NULL OR item_row.verified_at IS NULL
     OR item_row.attribution IS NULL OR btrim(item_row.attribution) = ''
     OR item_row.serving_unit IS NULL OR btrim(item_row.serving_unit) = ''
     OR item_row.portion_description IS NULL OR btrim(item_row.portion_description) = ''
     OR item_row.price_vnd_min IS NULL OR item_row.price_vnd_max IS NULL
     OR item_row.price_vnd_min NOT BETWEEN 0 AND 9007199254740991
     OR item_row.price_vnd_max NOT BETWEEN 0 AND 9007199254740991
     OR item_row.price_vnd_min > item_row.price_vnd_max
     OR item_row.available IS NOT TRUE THEN
    RAISE EXCEPTION 'food catalog evidence is incomplete' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM public.food_item_translations
      WHERE food_item_id = item_row.id
        AND locale IN ('en'::public.locale, 'vi'::public.locale)) <> 2
     OR (SELECT count(*) FROM public.food_item_translations
         WHERE food_item_id = item_row.id
           AND locale IN ('en'::public.locale, 'vi'::public.locale)
           AND btrim(title) <> '' AND btrim(description) <> '') <> 2 THEN
    RAISE EXCEPTION 'food catalog evidence is incomplete' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.food_item_supports
    WHERE food_item_id = item_row.id AND support_kind = 'dietary'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.food_item_supports
    WHERE food_item_id = item_row.id AND support_kind = 'allergen'
  ) OR EXISTS (
    SELECT 1 FROM public.food_item_supports
    WHERE food_item_id = item_row.id
      AND support_kind IN ('dietary', 'allergen')
      AND status = 'unknown'
  ) THEN
    RAISE EXCEPTION 'food catalog evidence is incomplete' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(item_row.allergens) AS listed(allergen_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.food_item_supports AS support
      WHERE support.food_item_id = item_row.id
        AND support.support_kind = 'allergen'
        AND support.requirement = listed.allergen_name
        AND support.status IN ('supported', 'unsupported')
    )
  ) THEN
    RAISE EXCEPTION 'food catalog evidence is incomplete' USING ERRCODE = '23514';
  END IF;
END;
$function$;
ALTER FUNCTION private.assert_food_catalog_review_complete(uuid) OWNER TO localens_catalog_guard_owner;
REVOKE ALL ON FUNCTION private.assert_food_catalog_review_complete(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.assert_food_catalog_review_complete(uuid) TO localens_admin_rpc_owner;
SET LOCAL ROLE postgres;

SET LOCAL ROLE localens_admin_rpc_owner;

CREATE OR REPLACE VIEW public.admin_food_catalog_review_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  item.id AS item_id,
  vendor.id AS vendor_id,
  vendor.place_id,
  jsonb_build_object(
    'slug', vendor.slug,
    'title', COALESCE((
      SELECT jsonb_object_agg(translations.locale::text, translations.title ORDER BY translations.locale::text)
      FROM public.food_vendor_translations AS translations
      WHERE translations.food_vendor_id = vendor.id
    ), '{}'::jsonb),
    'description', COALESCE((
      SELECT jsonb_object_agg(translations.locale::text, translations.description ORDER BY translations.locale::text)
      FROM public.food_vendor_translations AS translations
      WHERE translations.food_vendor_id = vendor.id
    ), '{}'::jsonb),
    'location_note', vendor.location_note,
    'service_type', vendor.service_type,
    'capacity_note', vendor.capacity_note,
    'dietary_support', COALESCE((
      SELECT jsonb_object_agg(support.requirement, support.status ORDER BY support.requirement)
      FROM LATERAL (
        SELECT requirement, status
        FROM public.food_vendor_supports
        WHERE food_vendor_id = vendor.id AND support_kind = 'dietary'
        ORDER BY requirement
        LIMIT 100
      ) AS support
    ), '{}'::jsonb),
    'mobility_support', COALESCE((
      SELECT jsonb_object_agg(support.requirement, support.status ORDER BY support.requirement)
      FROM LATERAL (
        SELECT requirement, status
        FROM public.food_vendor_supports
        WHERE food_vendor_id = vendor.id AND support_kind = 'mobility'
        ORDER BY requirement
        LIMIT 100
      ) AS support
    ), '{}'::jsonb),
    'opening_hours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'weekday', hours.weekday,
        'opens_at', hours.opens_at::text,
        'closes_at', hours.closes_at::text
      ) ORDER BY hours.weekday, hours.opens_at, hours.closes_at, hours.id)
      FROM LATERAL (
        SELECT id, weekday, opens_at, closes_at
        FROM public.food_vendor_opening_hours
        WHERE food_vendor_id = vendor.id
        ORDER BY weekday, opens_at, closes_at, id
        LIMIT 100
      ) AS hours
    ), '[]'::jsonb),
    'opening_exceptions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'local_date', exceptions.local_date::text,
        'closed', exceptions.closed,
        'windows', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'opens_at', windows.opens_at::text,
            'closes_at', windows.closes_at::text
          ) ORDER BY windows.opens_at, windows.closes_at, windows.id)
          FROM LATERAL (
            SELECT id, opens_at, closes_at
            FROM public.food_vendor_opening_exception_windows
            WHERE food_vendor_id = exceptions.food_vendor_id
              AND exception_id = exceptions.id
            ORDER BY opens_at, closes_at, id
            LIMIT 100
          ) AS windows
        ), '[]'::jsonb)
      ) ORDER BY exceptions.local_date, exceptions.id)
      FROM LATERAL (
        SELECT id, food_vendor_id, local_date, closed
        FROM public.food_vendor_opening_exceptions
        WHERE food_vendor_id = vendor.id
        ORDER BY local_date, id
        LIMIT 100
      ) AS exceptions
    ), '[]'::jsonb),
    'status', vendor.status::text,
    'source_url', vendor.source_url,
    'verified_at', vendor.verified_at::text,
    'attribution', vendor.attribution
  ) AS vendor,
  jsonb_build_object(
    'slug', item.slug,
    'title', COALESCE((
      SELECT jsonb_object_agg(translations.locale::text, translations.title ORDER BY translations.locale::text)
      FROM public.food_item_translations AS translations
      WHERE translations.food_item_id = item.id
    ), '{}'::jsonb),
    'description', COALESCE((
      SELECT jsonb_object_agg(translations.locale::text, translations.description ORDER BY translations.locale::text)
      FROM public.food_item_translations AS translations
      WHERE translations.food_item_id = item.id
    ), '{}'::jsonb),
    'serving_unit', item.serving_unit,
    'price_vnd_min', item.price_vnd_min::text,
    'price_vnd_max', item.price_vnd_max::text,
    'portion_description', item.portion_description,
    'dietary_support', COALESCE((
      SELECT jsonb_object_agg(support.requirement, support.status ORDER BY support.requirement)
      FROM LATERAL (
        SELECT requirement, status
        FROM public.food_item_supports
        WHERE food_item_id = item.id AND support_kind = 'dietary'
        ORDER BY requirement
        LIMIT 100
      ) AS support
    ), '{}'::jsonb),
    'allergen_support', COALESCE((
      SELECT jsonb_object_agg(support.requirement, support.status ORDER BY support.requirement)
      FROM LATERAL (
        SELECT requirement, status
        FROM public.food_item_supports
        WHERE food_item_id = item.id AND support_kind = 'allergen'
        ORDER BY requirement
        LIMIT 100
      ) AS support
    ), '{}'::jsonb),
    'allergens', CASE WHEN cardinality(item.allergens) <= 100 THEN COALESCE(to_jsonb(item.allergens), '[]'::jsonb) ELSE '[]'::jsonb END,
    'available', item.available,
    'status', item.status::text,
    'source_url', item.source_url,
    'verified_at', item.verified_at::text,
    'attribution', item.attribution
  ) AS item,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'event_id', events.id,
      'decision', CASE WHEN events.event_type = 'request_approved'::public.audit_event_type THEN 'approved' ELSE 'rejected' END,
      'rejection_note', events.rejection_note,
      'actor_user_id', events.actor_user_id,
      'reviewed_at', events.created_at::text
    ) ORDER BY events.created_at DESC, events.id)
    FROM LATERAL (
      SELECT id, event_type, rejection_note, actor_user_id, created_at
      FROM private.audit_events
      WHERE target_type = 'catalog_snapshot'::public.audit_target_type
        AND target_id = item.id
        AND event_type IN ('request_approved'::public.audit_event_type, 'request_rejected'::public.audit_event_type)
      ORDER BY created_at DESC, id
      LIMIT 100
    ) AS events
  ), '[]'::jsonb) AS audit_history
FROM public.food_items AS item
JOIN public.food_vendors AS vendor ON vendor.id = item.food_vendor_id
WHERE item.status IN ('draft'::public.place_status, 'published'::public.place_status)
  AND vendor.status IN ('draft'::public.place_status, 'published'::public.place_status)
  AND EXISTS (
    SELECT 1 FROM private.user_roles AS roles
    WHERE roles.user_id = NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
      AND roles.role = 'admin'::public.app_role
  );
ALTER VIEW public.admin_food_catalog_review_v OWNER TO localens_admin_rpc_owner;
REVOKE ALL ON public.admin_food_catalog_review_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_food_catalog_review_v TO localens_admin_rpc_owner, authenticated;

-- Read access is also guarded by the database role check. The browser can
-- request a bounded page, while ordinary authenticated users receive 42501
-- rather than an empty result that could be mistaken for an admin queue.
CREATE OR REPLACE FUNCTION public.get_admin_food_catalog_review_queue(
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.admin_food_catalog_review_v
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  PERFORM private.assert_catalog_review_admin();
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 2147483000 THEN
    RAISE EXCEPTION 'invalid food catalog review pagination' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT queue.*
  FROM public.admin_food_catalog_review_v AS queue
  WHERE queue.item ->> 'status' = 'draft'
  ORDER BY queue.item_id
  LIMIT p_limit OFFSET p_offset;
END;
$function$;
ALTER FUNCTION public.get_admin_food_catalog_review_queue(integer, integer) OWNER TO localens_admin_rpc_owner;
REVOKE ALL ON FUNCTION public.get_admin_food_catalog_review_queue(integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_food_catalog_review_queue(integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_food_catalog_item(
  p_item_id uuid,
  p_vendor_id uuid,
  p_decision text,
  p_checklist jsonb,
  p_rejection_note text
)
RETURNS SETOF public.admin_food_catalog_review_v
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  actor uuid;
  item_row public.food_items%ROWTYPE;
  vendor_row public.food_vendors%ROWTYPE;
  vendor_was_draft boolean;
  target_vendor_id uuid;
  checklist_key text;
  returned_rows integer;
BEGIN
  actor := private.assert_catalog_review_admin();
  IF p_item_id IS NULL OR p_decision IS NULL OR p_decision NOT IN ('research_only', 'sellable') THEN
    RAISE EXCEPTION 'invalid food catalog review decision' USING ERRCODE = '22023';
  END IF;
  IF p_checklist IS NULL OR pg_catalog.jsonb_typeof(p_checklist) <> 'object'
     OR NOT (p_checklist ?& ARRAY[
       'source_checked', 'bilingual_name_checked', 'location_checked', 'hours_checked',
       'price_checked', 'availability_checked', 'dietary_allergen_checked', 'mobility_checked'
     ])
     OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_checklist)) <> 8 THEN
    RAISE EXCEPTION 'invalid food catalog review checklist' USING ERRCODE = '22023';
  END IF;
  FOR checklist_key IN SELECT key FROM pg_catalog.jsonb_each(p_checklist)
  LOOP
    IF pg_catalog.jsonb_typeof(p_checklist -> checklist_key) <> 'boolean' THEN
      RAISE EXCEPTION 'invalid food catalog review checklist' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_decision = 'sellable'
     AND EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_each(p_checklist)
       WHERE value <> 'true'::jsonb
     ) THEN
    RAISE EXCEPTION 'food catalog review checklist is incomplete' USING ERRCODE = '23514';
  END IF;
  IF p_decision = 'sellable' AND p_rejection_note IS NOT NULL THEN
    RAISE EXCEPTION 'rejection note is only valid for research-only decisions' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'research_only'
     AND (p_rejection_note IS NULL OR length(btrim(p_rejection_note)) = 0) THEN
    RAISE EXCEPTION 'rejection note is required' USING ERRCODE = '22023';
  END IF;
  IF p_rejection_note IS NOT NULL
     AND (length(btrim(p_rejection_note)) > 1000 OR p_rejection_note <> btrim(p_rejection_note) OR p_rejection_note ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'rejection note is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT item_row_source.* INTO item_row
  FROM public.food_items AS item_row_source
  WHERE item_row_source.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'food catalog review target was not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_vendor_id IS NULL OR item_row.food_vendor_id IS DISTINCT FROM p_vendor_id THEN
    RAISE EXCEPTION 'food catalog review vendor does not match item' USING ERRCODE = '22023';
  END IF;
  target_vendor_id := p_vendor_id;
  -- Lock the parent before the child, matching every food writer advisory
  -- lock path. Re-read the child after both locks for stale-parent safety.
  SELECT vendor_source.* INTO vendor_row
  FROM public.food_vendors AS vendor_source
  WHERE vendor_source.id = target_vendor_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'food catalog review vendor was not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT item_row_source.* INTO item_row
  FROM public.food_items AS item_row_source
  WHERE item_row_source.id = p_item_id
  FOR UPDATE;
  IF NOT FOUND OR item_row.food_vendor_id IS DISTINCT FROM vendor_row.id THEN
    RAISE EXCEPTION 'food catalog review vendor does not match item' USING ERRCODE = '22023';
  END IF;
  IF item_row.status <> 'draft'::public.place_status THEN
    RAISE EXCEPTION 'food catalog review target is not research-only' USING ERRCODE = '23514';
  END IF;
  -- The projection intentionally excludes archived/temporarily-closed
  -- vendors. Reject before any status transition or audit insert so a stale
  -- parent cannot produce a successful write followed by an empty response.
  IF vendor_row.status NOT IN ('draft'::public.place_status, 'published'::public.place_status) THEN
    RAISE EXCEPTION 'food catalog review vendor is not reviewable' USING ERRCODE = '23514';
  END IF;
  vendor_was_draft := vendor_row.status = 'draft'::public.place_status;

  IF p_decision = 'sellable' THEN
    PERFORM private.assert_food_catalog_review_complete(item_row.id);
    UPDATE public.food_items
    SET status = 'published'::public.place_status
    WHERE id = item_row.id;
    IF vendor_was_draft THEN
      UPDATE public.food_vendors
      SET status = 'published'::public.place_status
      WHERE id = vendor_row.id;
    END IF;
  END IF;

  INSERT INTO private.audit_events (
    event_type, actor_user_id, actor_role, target_type, target_id,
    from_state, to_state, metadata_key, metadata_text, rejection_note, created_at
  ) VALUES (
    CASE WHEN p_decision = 'sellable' THEN 'request_approved'::public.audit_event_type ELSE 'request_rejected'::public.audit_event_type END,
    actor, 'admin'::public.app_role, 'catalog_snapshot'::public.audit_target_type, item_row.id,
    'draft', CASE WHEN p_decision = 'sellable' THEN 'published' ELSE 'draft' END,
    'decision'::public.audit_metadata_key,
    CASE WHEN p_decision = 'sellable' THEN 'approved' ELSE 'rejected' END,
    p_rejection_note, pg_catalog.clock_timestamp()
  );

  IF p_decision = 'sellable' AND vendor_was_draft THEN
    INSERT INTO private.audit_events (
      event_type, actor_user_id, actor_role, target_type, target_id,
      from_state, to_state, metadata_key, metadata_text, created_at
    ) VALUES (
      'request_approved'::public.audit_event_type, actor, 'admin'::public.app_role,
      'catalog_snapshot'::public.audit_target_type, vendor_row.id,
      'draft', 'published', 'decision'::public.audit_metadata_key, 'approved', pg_catalog.clock_timestamp()
    );
  END IF;

  RETURN QUERY
  SELECT queue.*
  FROM public.admin_food_catalog_review_v AS queue
  WHERE queue.item_id = item_row.id
    AND queue.vendor_id = item_row.food_vendor_id;
  GET DIAGNOSTICS returned_rows = ROW_COUNT;
  IF returned_rows <> 1 THEN
    RAISE EXCEPTION 'food catalog review result is invalid' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;
ALTER FUNCTION public.review_food_catalog_item(uuid, uuid, text, jsonb, text) OWNER TO localens_admin_rpc_owner;
REVOKE ALL ON FUNCTION public.review_food_catalog_item(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_food_catalog_item(uuid, uuid, text, jsonb, text) TO authenticated;
SET LOCAL ROLE postgres;

REVOKE CREATE ON SCHEMA private FROM localens_admin_rpc_owner, localens_catalog_guard_owner;
REVOKE CREATE ON SCHEMA public FROM localens_admin_rpc_owner;

COMMIT;
