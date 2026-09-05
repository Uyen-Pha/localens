BEGIN;

-- PostgreSQL 17 requires the current role to own an existing function/view
-- before it can be renamed or replaced. Grant only transaction-scoped build
-- capability, assume each named owner for its own artifacts, then revoke it.
GRANT CREATE ON SCHEMA private TO localens_plan_rpc_owner, localens_request_guard_owner, localens_request_admin_rpc_owner;
GRANT CREATE ON SCHEMA public TO localens_request_admin_rpc_owner, localens_request_customer_rpc_owner;
GRANT USAGE ON SCHEMA private TO localens_request_guard_owner;

-- Task 9 adds only append-safe columns.  Existing rows remain valid as
-- historical no-food revisions/quotes; every new write is checked by the
-- guarded RPCs below.
ALTER TABLE public.trip_plan_items
  ADD COLUMN IF NOT EXISTS food_selection_json jsonb,
  ADD COLUMN IF NOT EXISTS food_cost_min_vnd bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS food_cost_max_vnd bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_at_vendor_min_vnd bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_at_vendor_max_vnd bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_payable_vnd bigint NOT NULL DEFAULT 0;

ALTER TABLE public.trip_plan_items
  ADD CONSTRAINT trip_plan_items_food_selection_shape_check
    CHECK (food_selection_json IS NULL OR jsonb_typeof(food_selection_json) = 'object'),
  ADD CONSTRAINT trip_plan_items_food_min_check
    CHECK (food_cost_min_vnd BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT trip_plan_items_food_max_check
    CHECK (food_cost_max_vnd BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT trip_plan_items_pay_vendor_min_check
    CHECK (pay_at_vendor_min_vnd BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT trip_plan_items_pay_vendor_max_check
    CHECK (pay_at_vendor_max_vnd BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT trip_plan_items_customer_payable_check
    CHECK (customer_payable_vnd BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT trip_plan_items_food_range_check
    CHECK (food_cost_min_vnd <= food_cost_max_vnd AND pay_at_vendor_min_vnd <= pay_at_vendor_max_vnd),
  ADD CONSTRAINT trip_plan_items_food_no_selection_zero_check
    CHECK (food_selection_json IS NOT NULL OR
      (food_cost_min_vnd = 0 AND food_cost_max_vnd = 0 AND
       pay_at_vendor_min_vnd = 0 AND pay_at_vendor_max_vnd = 0));

ALTER TABLE public.custom_quotes
  ADD COLUMN IF NOT EXISTS food_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS food_estimate_min_vnd bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS food_estimate_max_vnd bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_at_vendor_min_vnd bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_at_vendor_max_vnd bigint NOT NULL DEFAULT 0;

ALTER TABLE public.custom_quotes
  ADD CONSTRAINT custom_quotes_food_snapshot_shape_check
    CHECK (jsonb_typeof(food_snapshot) = 'array'),
  ADD CONSTRAINT custom_quotes_food_min_check
    CHECK (food_estimate_min_vnd BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT custom_quotes_food_max_check
    CHECK (food_estimate_max_vnd BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT custom_quotes_pay_vendor_min_check
    CHECK (pay_at_vendor_min_vnd BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT custom_quotes_pay_vendor_max_check
    CHECK (pay_at_vendor_max_vnd BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT custom_quotes_food_range_check
    CHECK (food_estimate_min_vnd <= food_estimate_max_vnd AND
           pay_at_vendor_min_vnd <= pay_at_vendor_max_vnd AND
           food_estimate_min_vnd = pay_at_vendor_min_vnd AND
           food_estimate_max_vnd = pay_at_vendor_max_vnd);

-- Keep identifier drift visible before a migration reaches PostgreSQL's
-- 63-byte identifier limit.  This also protects later trigger additions.
DO $identifier_guard$
DECLARE
  identifier_name text;
BEGIN
  FOREACH identifier_name IN ARRAY ARRAY[
    'trip_plan_items_food_selection_shape_check',
    'trip_plan_items_food_no_selection_zero_check',
    'custom_quotes_food_snapshot_shape_check',
    'custom_quotes_food_range_check',
    'custom_quotes_food_snapshot_immutable',
    'catalog_snapshot_food_vendors_request_admin_select',
    'catalog_snapshot_food_items_request_admin_select',
    'catalog_snapshot_food_vendors_plan_rpc_owner_select',
    'catalog_snapshot_food_items_plan_rpc_owner_select'
  ] LOOP
    IF octet_length(identifier_name) > 63 THEN
      RAISE EXCEPTION 'PostgreSQL identifier exceeds 63 UTF-8 bytes: %', identifier_name;
    END IF;
  END LOOP;
END;
$identifier_guard$;

-- New customer/request RPC owners need read-only access to the immutable food
-- snapshot rows used to derive a quote.  No API role receives these grants.
CREATE POLICY catalog_snapshot_food_vendors_request_admin_select
  ON public.catalog_snapshot_food_vendors
  FOR SELECT TO localens_request_admin_rpc_owner
  USING (current_user = 'localens_request_admin_rpc_owner');
CREATE POLICY catalog_snapshot_food_vendors_plan_rpc_owner_select
  ON public.catalog_snapshot_food_vendors
  FOR SELECT TO localens_plan_rpc_owner
  USING (current_user = 'localens_plan_rpc_owner');
CREATE POLICY catalog_snapshot_food_vendor_translations_request_admin_select
  ON public.catalog_snapshot_food_vendor_translations
  FOR SELECT TO localens_request_admin_rpc_owner
  USING (current_user = 'localens_request_admin_rpc_owner');
CREATE POLICY catalog_snapshot_food_items_request_admin_select
  ON public.catalog_snapshot_food_items
  FOR SELECT TO localens_request_admin_rpc_owner
  USING (current_user = 'localens_request_admin_rpc_owner');
CREATE POLICY catalog_snapshot_food_items_plan_rpc_owner_select
  ON public.catalog_snapshot_food_items
  FOR SELECT TO localens_plan_rpc_owner
  USING (current_user = 'localens_plan_rpc_owner');
CREATE POLICY catalog_snapshot_food_item_translations_request_admin_select
  ON public.catalog_snapshot_food_item_translations
  FOR SELECT TO localens_request_admin_rpc_owner
  USING (current_user = 'localens_request_admin_rpc_owner');
GRANT SELECT ON TABLE
  public.catalog_snapshot_food_vendors,
  public.catalog_snapshot_food_vendor_translations,
  public.catalog_snapshot_food_items,
  public.catalog_snapshot_food_item_translations
  TO localens_request_admin_rpc_owner;
GRANT SELECT ON TABLE
  public.catalog_snapshot_food_vendors,
  public.catalog_snapshot_food_items
  TO localens_plan_rpc_owner;

GRANT SELECT (
  revision_id, position, catalog_snapshot_id, place_id, start_at, end_at,
  visit_duration_minutes, travel_minutes_before, transition_buffer_minutes_before,
  travel_cost_vnd_before, place_cost_vnd, score, food_selection_json,
  food_cost_min_vnd, food_cost_max_vnd, pay_at_vendor_min_vnd,
  pay_at_vendor_max_vnd, customer_payable_vnd
) ON TABLE public.trip_plan_items TO authenticated;
GRANT SELECT (
  id, request_id, status, amount_vnd_minor, checkout_currency,
  checkout_amount_minor, catalog_snapshot_id, travel_snapshot_id, fx_snapshot_id,
  fx_vnd_per_usd, title_en, title_vi, policy, created_at, valid_until,
  food_snapshot, food_estimate_min_vnd, food_estimate_max_vnd,
  pay_at_vendor_min_vnd, pay_at_vendor_max_vnd
) ON TABLE public.custom_quotes TO authenticated;
GRANT SELECT (food_selection_json, food_cost_min_vnd, food_cost_max_vnd,
  pay_at_vendor_min_vnd, pay_at_vendor_max_vnd, customer_payable_vnd)
  ON TABLE public.trip_plan_items TO localens_request_customer_rpc_owner,
    localens_request_admin_rpc_owner;
GRANT SELECT (food_snapshot, food_estimate_min_vnd, food_estimate_max_vnd,
  pay_at_vendor_min_vnd, pay_at_vendor_max_vnd)
  ON TABLE public.custom_quotes TO localens_request_customer_rpc_owner,
    localens_request_admin_rpc_owner;

-- The historical validator is retained under a private alias while the new
-- validator adds Task 8 food material checks.  The public function name stays
-- stable for Task 7 guest/authenticated persistence callers.
SET LOCAL ROLE localens_plan_rpc_owner;

ALTER FUNCTION private.validate_trip_plan_revision_dto(jsonb)
  RENAME TO validate_trip_plan_revision_dto_legacy;

CREATE OR REPLACE FUNCTION private.validate_food_plan_revision_dto(persistence_dto jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  item jsonb;
  result_item jsonb;
  food jsonb;
  result_food jsonb;
  legacy_item jsonb;
  legacy_result jsonb;
  legacy_items jsonb;
  legacy_result_items jsonb;
  legacy_dto jsonb;
  food_min numeric := 0;
  food_max numeric := 0;
  pay_min numeric := 0;
  pay_max numeric := 0;
  payable_total numeric := 0;
  item_food_min numeric;
  item_food_max numeric;
  item_pay_min numeric;
  item_pay_max numeric;
  item_payable numeric;
  quantity numeric;
  price_min numeric;
  price_max numeric;
  parsed_food jsonb;
  expected_item_keys constant text[] := ARRAY[
    'placeId', 'startAt', 'endAt', 'visitDurationMinutes', 'travelMinutesBefore',
    'transitionBufferMinutesBefore', 'travelCostVndBefore', 'placeCostVnd',
    'foodSelectionJson', 'foodCostMinVnd', 'foodCostMaxVnd',
    'payAtVendorMinVnd', 'payAtVendorMaxVnd', 'customerPayableVnd', 'score'
  ];
  expected_result_item_keys constant text[] := ARRAY[
    'placeId', 'startAt', 'endAt', 'visitDurationMinutes', 'travelMinutesBefore',
    'transitionBufferMinutesBefore', 'travelCostVndBefore', 'placeCostVnd',
    'foodSelection', 'foodCostMinVnd', 'foodCostMaxVnd',
    'payAtVendorMinVnd', 'payAtVendorMaxVnd', 'customerPayableVnd', 'score'
  ];
  expected_totals_keys constant text[] := ARRAY[
    'durationMinutes', 'visitMinutes', 'travelMinutes', 'transitionBufferMinutes',
    'admissionCostVnd', 'foodCostMinVnd', 'foodCostMaxVnd', 'travelCostVnd',
    'guideCostVnd', 'payAtVendorMinVnd', 'payAtVendorMaxVnd', 'customerPayableVnd',
    'groupCostMinVnd', 'groupCostMaxVnd', 'groupCostVnd', 'score'
  ];
  result_totals jsonb;
  totals_key text;
  legacy_mode boolean;
BEGIN
  IF persistence_dto IS NULL OR jsonb_typeof(persistence_dto) IS DISTINCT FROM 'object'
     OR jsonb_typeof(persistence_dto->'items') IS DISTINCT FROM 'array'
     OR jsonb_typeof(persistence_dto->'result') IS DISTINCT FROM 'object'
     OR jsonb_typeof(persistence_dto->'result'->'items') IS DISTINCT FROM 'array'
     OR jsonb_typeof(persistence_dto->'result'->'totals') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid food persistence DTO' USING ERRCODE = '22023';
  END IF;

  result_totals := persistence_dto->'result'->'totals';
  legacy_mode := NOT (result_totals ? 'foodCostMinVnd');
  IF legacy_mode AND (
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(persistence_dto->'items') AS values(value)
      WHERE EXISTS (SELECT 1 FROM jsonb_object_keys(values.value) AS keys(key_name)
                    WHERE key_name IN ('foodSelectionJson', 'foodCostMinVnd', 'foodCostMaxVnd',
                                       'payAtVendorMinVnd', 'payAtVendorMaxVnd', 'customerPayableVnd'))
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(persistence_dto->'result'->'items') AS values(value)
      WHERE EXISTS (SELECT 1 FROM jsonb_object_keys(values.value) AS keys(key_name)
                    WHERE key_name IN ('foodSelection', 'foodCostMinVnd', 'foodCostMaxVnd',
                                       'payAtVendorMinVnd', 'payAtVendorMaxVnd', 'customerPayableVnd'))
    )
  ) THEN
    RAISE EXCEPTION 'food persistence fields require complete food totals' USING ERRCODE = '22023';
  END IF;
  IF NOT legacy_mode AND ((SELECT count(*) FROM jsonb_object_keys(result_totals)) <> cardinality(expected_totals_keys)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(result_totals) AS keys(key_name)
                WHERE NOT (key_name = ANY(expected_totals_keys)))
     OR EXISTS (SELECT 1 FROM unnest(expected_totals_keys) AS keys(key_name)
                WHERE NOT (result_totals ? key_name))) THEN
    RAISE EXCEPTION 'invalid food result totals keys' USING ERRCODE = '22023';
  END IF;
  IF NOT legacy_mode THEN
    FOREACH totals_key IN ARRAY expected_totals_keys LOOP
      IF jsonb_typeof(result_totals->totals_key) IS DISTINCT FROM 'number'
         OR (totals_key <> 'score' AND result_totals->>totals_key !~ '^(?:0|[1-9][0-9]*)$')
         OR (totals_key = 'score' AND result_totals->>totals_key !~ '^-?(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,12})?$')
         OR (totals_key <> 'score' AND length(result_totals->>totals_key) > 16)
         OR (length(result_totals->>totals_key) = 16
             AND abs((result_totals->>totals_key)::numeric) > 9007199254740991) THEN
        RAISE EXCEPTION 'invalid food result total scalar' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  -- Let the existing hardened validator retain all auth-independent request,
  -- snapshot, timestamp, integer, lock-order, and CAS-shape checks.  Its
  -- historical item/totals key set is fed a projection without Task 9 keys.
  SELECT COALESCE(jsonb_agg(value - 'foodSelectionJson' - 'foodCostMinVnd'
      - 'foodCostMaxVnd' - 'payAtVendorMinVnd' - 'payAtVendorMaxVnd'
      - 'customerPayableVnd' ORDER BY ordinality), '[]'::jsonb)
    INTO legacy_items
  FROM jsonb_array_elements(persistence_dto->'items') WITH ORDINALITY AS values(value, ordinality);
  SELECT COALESCE(jsonb_agg(value - 'foodSelection' - 'foodCostMinVnd'
      - 'foodCostMaxVnd' - 'payAtVendorMinVnd' - 'payAtVendorMaxVnd'
      - 'customerPayableVnd' ORDER BY ordinality), '[]'::jsonb)
    INTO legacy_result_items
  FROM jsonb_array_elements(persistence_dto->'result'->'items') WITH ORDINALITY AS values(value, ordinality);
  legacy_result := persistence_dto->'result' || jsonb_build_object(
    'items', legacy_result_items,
    'totals', jsonb_build_object(
      'durationMinutes', result_totals->'durationMinutes',
      'visitMinutes', result_totals->'visitMinutes',
      'travelMinutes', result_totals->'travelMinutes',
      'transitionBufferMinutes', result_totals->'transitionBufferMinutes',
      'groupCostVnd', result_totals->'groupCostVnd',
      'score', result_totals->'score'
    )
  );
  legacy_dto := persistence_dto || jsonb_build_object('items', legacy_items, 'result', legacy_result);
  PERFORM private.validate_trip_plan_revision_dto_legacy(legacy_dto);

  -- Existing museum/history revisions created before Task 9 intentionally
  -- retain the old item/totals JSON shape and carry no food material.
  IF legacy_mode THEN
    RETURN persistence_dto;
  END IF;

  IF jsonb_array_length(persistence_dto->'items') <> jsonb_array_length(persistence_dto->'result'->'items') THEN
    RAISE EXCEPTION 'food DTO/result item count mismatch' USING ERRCODE = '23514';
  END IF;

  FOR item, result_item IN
    SELECT dto_values.item, result_values.item
    FROM jsonb_array_elements(persistence_dto->'items') WITH ORDINALITY AS dto_values(item, ordinal)
    JOIN jsonb_array_elements(persistence_dto->'result'->'items') WITH ORDINALITY AS result_values(item, ordinal)
      USING (ordinal)
  LOOP
    IF (SELECT count(*) FROM jsonb_object_keys(item)) <> cardinality(expected_item_keys)
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(item) AS keys(key_name)
                 WHERE NOT (key_name = ANY(expected_item_keys)))
       OR EXISTS (SELECT 1 FROM unnest(expected_item_keys) AS keys(key_name)
                 WHERE NOT (item ? key_name))
       OR (SELECT count(*) FROM jsonb_object_keys(result_item)) <> cardinality(expected_result_item_keys)
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(result_item) AS keys(key_name)
                 WHERE NOT (key_name = ANY(expected_result_item_keys)))
       OR EXISTS (SELECT 1 FROM unnest(expected_result_item_keys) AS keys(key_name)
                 WHERE NOT (result_item ? key_name)) THEN
      RAISE EXCEPTION 'invalid food item keys' USING ERRCODE = '22023';
    END IF;
    IF item->>'placeId' IS DISTINCT FROM result_item->>'placeId'
       OR item->>'startAt' IS DISTINCT FROM result_item->>'startAt'
       OR item->>'endAt' IS DISTINCT FROM result_item->>'endAt'
       OR item->>'visitDurationMinutes' IS DISTINCT FROM result_item->>'visitDurationMinutes'
       OR item->>'travelMinutesBefore' IS DISTINCT FROM result_item->>'travelMinutesBefore'
       OR item->>'transitionBufferMinutesBefore' IS DISTINCT FROM result_item->>'transitionBufferMinutesBefore'
       OR item->>'score' IS DISTINCT FROM result_item->>'score'
       OR item->>'travelCostVndBefore' IS DISTINCT FROM result_item->>'travelCostVndBefore'
       OR item->>'placeCostVnd' IS DISTINCT FROM result_item->>'placeCostVnd' THEN
      RAISE EXCEPTION 'food result item facts do not match persistence projection' USING ERRCODE = '23514';
    END IF;

    IF jsonb_typeof(item->'foodSelectionJson') = 'null' THEN
      parsed_food := 'null'::jsonb;
    ELSIF jsonb_typeof(item->'foodSelectionJson') = 'string' THEN
      BEGIN
        parsed_food := (item->>'foodSelectionJson')::jsonb;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'foodSelectionJson is malformed JSON' USING ERRCODE = '22023';
      END;
    ELSE
      RAISE EXCEPTION 'foodSelectionJson must be a JSON string or null' USING ERRCODE = '22023';
    END IF;
    result_food := result_item->'foodSelection';
    IF parsed_food IS DISTINCT FROM result_food THEN
      RAISE EXCEPTION 'food selection does not match immutable result' USING ERRCODE = '23514';
    END IF;
    IF result_food IS NULL OR jsonb_typeof(result_food) = 'null' THEN
      IF result_totals IS NULL THEN RAISE EXCEPTION 'invalid food totals' USING ERRCODE = '22023'; END IF;
      IF (item->>'foodCostMinVnd') <> '0' OR (item->>'foodCostMaxVnd') <> '0'
         OR (item->>'payAtVendorMinVnd') <> '0' OR (item->>'payAtVendorMaxVnd') <> '0' THEN
        RAISE EXCEPTION 'no-food item must have zero food amounts' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF jsonb_typeof(result_food) IS DISTINCT FROM 'object'
         OR (SELECT count(*) FROM jsonb_object_keys(result_food)) <> 7
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(result_food) AS keys(key_name)
                   WHERE key_name NOT IN ('vendorId', 'menuItemId', 'quantity', 'priceVndMin', 'priceVndMax', 'paymentMode', 'activity'))
         OR EXISTS (SELECT 1 FROM unnest(ARRAY['vendorId', 'menuItemId', 'quantity', 'priceVndMin', 'priceVndMax', 'paymentMode', 'activity']) AS keys(key_name)
                   WHERE NOT (result_food ? key_name)) THEN
        RAISE EXCEPTION 'invalid food selection shape' USING ERRCODE = '22023';
      END IF;
      IF result_food->>'vendorId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         OR result_food->>'menuItemId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         OR result_food->>'paymentMode' <> 'pay_at_vendor'
         OR result_food->>'activity' IS NULL
         OR result_food->>'activity' <> btrim(result_food->>'activity')
         OR result_food->>'activity' = ''
         OR result_food->>'activity' ~ '[[:cntrl:]]'
         OR jsonb_typeof(result_food->'quantity') IS DISTINCT FROM 'number'
         OR result_food->>'quantity' !~ '^[1-9][0-9]*$'
         OR length(result_food->>'quantity') > 3
         OR (length(result_food->>'quantity') = 3 AND result_food->>'quantity' > '100')
         OR jsonb_typeof(result_food->'priceVndMin') IS DISTINCT FROM 'number'
         OR jsonb_typeof(result_food->'priceVndMax') IS DISTINCT FROM 'number'
         OR result_food->>'priceVndMin' !~ '^(?:0|[1-9][0-9]*)$'
         OR result_food->>'priceVndMax' !~ '^(?:0|[1-9][0-9]*)$'
         OR length(result_food->>'priceVndMin') > 16
         OR length(result_food->>'priceVndMax') > 16
         OR (length(result_food->>'priceVndMin') = 16 AND result_food->>'priceVndMin' > '9007199254740991')
         OR (length(result_food->>'priceVndMax') = 16 AND result_food->>'priceVndMax' > '9007199254740991') THEN
        RAISE EXCEPTION 'invalid food selection scalar' USING ERRCODE = '22023';
      END IF;
      quantity := (result_food->>'quantity')::numeric;
      price_min := (result_food->>'priceVndMin')::numeric;
      price_max := (result_food->>'priceVndMax')::numeric;
      IF price_min > price_max OR quantity <> trunc(quantity) THEN
        RAISE EXCEPTION 'food quantity or price range is invalid' USING ERRCODE = '23514';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.catalog_snapshot_food_items AS food_items
        JOIN public.catalog_snapshot_food_vendors AS vendors
          ON vendors.snapshot_id = food_items.snapshot_id
         AND vendors.vendor_id = food_items.vendor_id
        WHERE food_items.snapshot_id = (persistence_dto->>'catalogSnapshotId')::uuid
          AND food_items.item_id = (result_food->>'menuItemId')::uuid
          AND food_items.vendor_id = (result_food->>'vendorId')::uuid
          AND food_items.place_id = (result_item->>'placeId')::uuid
          AND vendors.place_id = (result_item->>'placeId')::uuid
          AND food_items.status = 'published'::public.place_status
          AND food_items.available IS TRUE
          AND vendors.status = 'published'::public.place_status
          AND food_items.price_vnd_min = price_min::bigint
          AND food_items.price_vnd_max = price_max::bigint
          AND ((food_items.serving_unit = 'shared_set' AND quantity = 1)
               OR (food_items.serving_unit <> 'shared_set'
                   AND quantity = (persistence_dto->'request'->>'partySize')::numeric))
      ) THEN
        RAISE EXCEPTION 'food selection is not in the authoritative catalog snapshot' USING ERRCODE = '23514';
      END IF;
    END IF;

    IF jsonb_typeof(item->'foodCostMinVnd') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item->'foodCostMaxVnd') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item->'payAtVendorMinVnd') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item->'payAtVendorMaxVnd') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item->'customerPayableVnd') IS DISTINCT FROM 'string'
       OR jsonb_typeof(result_item->'foodCostMinVnd') IS DISTINCT FROM 'number'
       OR jsonb_typeof(result_item->'foodCostMaxVnd') IS DISTINCT FROM 'number'
       OR jsonb_typeof(result_item->'payAtVendorMinVnd') IS DISTINCT FROM 'number'
       OR jsonb_typeof(result_item->'payAtVendorMaxVnd') IS DISTINCT FROM 'number'
       OR jsonb_typeof(result_item->'customerPayableVnd') IS DISTINCT FROM 'number'
       OR item->>'foodCostMinVnd' !~ '^(?:0|[1-9][0-9]*)$'
       OR item->>'foodCostMaxVnd' !~ '^(?:0|[1-9][0-9]*)$'
       OR item->>'payAtVendorMinVnd' !~ '^(?:0|[1-9][0-9]*)$'
       OR item->>'payAtVendorMaxVnd' !~ '^(?:0|[1-9][0-9]*)$'
       OR item->>'customerPayableVnd' !~ '^(?:0|[1-9][0-9]*)$' THEN
      RAISE EXCEPTION 'invalid food persistence amount' USING ERRCODE = '22023';
    END IF;
    item_food_min := (item->>'foodCostMinVnd')::numeric;
    item_food_max := (item->>'foodCostMaxVnd')::numeric;
    item_pay_min := (item->>'payAtVendorMinVnd')::numeric;
    item_pay_max := (item->>'payAtVendorMaxVnd')::numeric;
    item_payable := (item->>'customerPayableVnd')::numeric;
    IF item_food_min > 9007199254740991 OR item_food_max > 9007199254740991
       OR item_pay_min > 9007199254740991 OR item_pay_max > 9007199254740991
       OR item_payable > 9007199254740991
       OR result_item->>'foodCostMinVnd' IS DISTINCT FROM item_food_min::text
       OR result_item->>'foodCostMaxVnd' IS DISTINCT FROM item_food_max::text
       OR result_item->>'payAtVendorMinVnd' IS DISTINCT FROM item_pay_min::text
       OR result_item->>'payAtVendorMaxVnd' IS DISTINCT FROM item_pay_max::text
       OR result_item->>'customerPayableVnd' IS DISTINCT FROM item_payable::text THEN
      RAISE EXCEPTION 'food result amount does not match persistence projection' USING ERRCODE = '23514';
    END IF;
    IF result_food IS NULL OR jsonb_typeof(result_food) = 'null' THEN
      IF item_food_min <> 0 OR item_food_max <> 0 OR item_pay_min <> 0 OR item_pay_max <> 0 THEN
        RAISE EXCEPTION 'no-food item amounts are not zero' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF item_food_min <> price_min * quantity OR item_food_max <> price_max * quantity
         OR item_pay_min <> item_food_min OR item_pay_max <> item_food_max THEN
        RAISE EXCEPTION 'food amount formula mismatch' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF item_payable <> (item->>'placeCostVnd')::numeric + (item->>'travelCostVndBefore')::numeric THEN
      RAISE EXCEPTION 'customer payable formula mismatch' USING ERRCODE = '23514';
    END IF;
    food_min := food_min + item_food_min;
    food_max := food_max + item_food_max;
    pay_min := pay_min + item_pay_min;
    pay_max := pay_max + item_pay_max;
    payable_total := payable_total + item_payable;
    IF food_min > 9007199254740991 OR food_max > 9007199254740991
       OR pay_min > 9007199254740991 OR pay_max > 9007199254740991
       OR payable_total > 9007199254740991 THEN
      RAISE EXCEPTION 'food amount overflow' USING ERRCODE = '22003';
    END IF;
  END LOOP;

  IF result_totals->>'foodCostMinVnd' IS DISTINCT FROM food_min::text
     OR result_totals->>'foodCostMaxVnd' IS DISTINCT FROM food_max::text
     OR result_totals->>'payAtVendorMinVnd' IS DISTINCT FROM pay_min::text
     OR result_totals->>'payAtVendorMaxVnd' IS DISTINCT FROM pay_max::text THEN
    RAISE EXCEPTION 'food totals mismatch' USING ERRCODE = '23514';
  END IF;
  IF result_totals->>'customerPayableVnd' IS DISTINCT FROM
       (payable_total + (result_totals->>'guideCostVnd')::numeric)::text THEN
    RAISE EXCEPTION 'customer payable totals mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN persistence_dto;
END;
$function$;
ALTER FUNCTION private.validate_food_plan_revision_dto(jsonb) OWNER TO localens_plan_rpc_owner;
REVOKE ALL ON FUNCTION private.validate_food_plan_revision_dto(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.validate_trip_plan_revision_dto(persistence_dto jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  RETURN private.validate_food_plan_revision_dto(persistence_dto);
END;
$function$;
REVOKE ALL ON FUNCTION private.validate_trip_plan_revision_dto(jsonb) FROM PUBLIC, anon, authenticated;

-- Replace the shared persistence helper while preserving guest capability,
-- authenticated ownership, plan-lock/CAS order, snapshot binding, and the
-- append-only recommendation history.
CREATE OR REPLACE FUNCTION private.persist_trip_plan_revision(
  p_plan_id uuid,
  p_base_revision_no integer,
  p_persistence_dto jsonb,
  p_actor_user_id uuid,
  p_guest_binding_id uuid,
  p_token_hash text,
  p_pepper_version smallint
)
RETURNS TABLE (revision_id uuid, revision_no integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  dto jsonb;
  plan_row public.trip_plans%ROWTYPE;
  binding_row private.guest_bindings%ROWTYPE;
  capability_row private.guest_capabilities%ROWTYPE;
  new_revision_id uuid;
  next_revision_no integer;
  item jsonb;
  locked_text text;
  locked_id uuid;
  locked_ordinal integer;
  previous_item_ordinal integer;
  last_locked_item_ordinal integer := 0;
BEGIN
  dto := private.validate_trip_plan_revision_dto(p_persistence_dto);
  IF p_plan_id IS NULL OR p_base_revision_no IS NULL OR p_base_revision_no < 0 OR p_base_revision_no > 2147483646 THEN
    RAISE EXCEPTION 'invalid revision authority' USING ERRCODE = '22023';
  END IF;
  IF (p_guest_binding_id IS NULL AND (p_actor_user_id IS NULL OR p_token_hash IS NOT NULL OR p_pepper_version IS NOT NULL))
     OR (p_guest_binding_id IS NOT NULL AND (p_actor_user_id IS NOT NULL OR p_token_hash IS NULL OR p_pepper_version IS NULL)) THEN
    RAISE EXCEPTION 'invalid revision authority' USING ERRCODE = '22023';
  END IF;
  IF p_guest_binding_id IS NOT NULL
     AND (p_token_hash !~ '^[0-9a-f]{64}$' OR p_pepper_version NOT BETWEEN 1 AND 2) THEN
    RAISE EXCEPTION 'invalid guest capability' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO plan_row FROM public.trip_plans AS plans WHERE plans.id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'trip plan authority required' USING ERRCODE = '42501'; END IF;
  IF p_guest_binding_id IS NULL THEN
    IF plan_row.owner_user_id IS DISTINCT FROM p_actor_user_id THEN
      RAISE EXCEPTION 'trip plan owner required' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT * INTO binding_row FROM private.guest_bindings AS bindings WHERE bindings.id = p_guest_binding_id;
    SELECT * INTO capability_row FROM private.guest_capabilities AS capabilities
      WHERE capabilities.binding_id = p_guest_binding_id
        AND capabilities.token_hash = p_token_hash
        AND capabilities.pepper_version = p_pepper_version;
    IF plan_row.owner_user_id IS NOT NULL OR plan_row.guest_binding_id IS DISTINCT FROM p_guest_binding_id
       OR NOT FOUND OR binding_row.id IS NULL OR binding_row.plan_id IS DISTINCT FROM p_plan_id
       OR binding_row.claimed_at IS NOT NULL OR binding_row.expires_at <= pg_catalog.clock_timestamp()
       OR capability_row.revoked_at IS NOT NULL OR capability_row.expires_at <= pg_catalog.clock_timestamp() THEN
      RAISE EXCEPTION 'guest capability rejected' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF plan_row.latest_revision_no <> p_base_revision_no THEN
    RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE = 'P0001', DETAIL = 'STALE_REVISION';
  END IF;
  next_revision_no := p_base_revision_no + 1;
  IF (dto->>'revisionNo')::integer <> next_revision_no THEN
    RAISE EXCEPTION 'revision number does not match compare-and-swap base' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_snapshots AS snapshots
    WHERE snapshots.id = (dto->>'catalogSnapshotId')::uuid AND snapshots.status = 'published'::public.snapshot_status
  ) OR NOT EXISTS (
    SELECT 1 FROM public.travel_snapshots AS travel
    WHERE travel.id = (dto->>'travelSnapshotId')::uuid
      AND travel.catalog_snapshot_id = (dto->>'catalogSnapshotId')::uuid
      AND travel.status = 'published'::public.snapshot_status
  ) THEN
    RAISE EXCEPTION 'snapshot membership mismatch' USING ERRCODE = '23514';
  END IF;
  IF (dto->>'currency') = 'USD' AND NOT EXISTS (
    SELECT 1 FROM public.fx_snapshots AS fx
    WHERE fx.id = (dto->>'fxSnapshotId')::uuid AND fx.vnd_per_usd = (dto->>'fxVndPerUsd')::numeric
  ) THEN
    RAISE EXCEPTION 'FX snapshot mismatch' USING ERRCODE = '23514';
  END IF;

  FOR locked_text, locked_ordinal IN
    SELECT values.value, values.ordinality::integer
    FROM jsonb_array_elements_text(dto->'lockedPlaceIds') WITH ORDINALITY AS values(value, ordinality)
  LOOP
    locked_id := locked_text::uuid;
    SELECT selected.item_ordinal::integer INTO previous_item_ordinal
    FROM jsonb_array_elements(dto->'items') WITH ORDINALITY AS selected(item, item_ordinal)
    WHERE selected.item->>'placeId' = locked_id::text;
    IF previous_item_ordinal IS NULL OR previous_item_ordinal <= last_locked_item_ordinal THEN
      RAISE EXCEPTION 'locked place order is invalid' USING ERRCODE = '23514';
    END IF;
    last_locked_item_ordinal := previous_item_ordinal;
  END LOOP;

  INSERT INTO public.trip_plan_revisions (
    plan_id, revision_no, base_revision_no, request_json, result_json, fingerprint,
    ranking_source, catalog_snapshot_id, travel_snapshot_id, fx_snapshot_id,
    fx_vnd_per_usd, currency, budget_vnd, total_cost_vnd,
    total_duration_minutes, locked_place_ids, actor_user_id
  ) VALUES (
    p_plan_id, next_revision_no, p_base_revision_no, dto->'request', dto->'result',
    dto->>'fingerprint', (dto->>'rankingSource')::public.ranking_source,
    (dto->>'catalogSnapshotId')::uuid, (dto->>'travelSnapshotId')::uuid,
    NULLIF(dto->>'fxSnapshotId', '')::uuid, NULLIF(dto->>'fxVndPerUsd', '')::numeric,
    (dto->>'currency')::public.currency_code, (dto->>'budgetVnd')::bigint,
    (dto->>'totalCostVnd')::bigint, (dto->>'totalDurationMinutes')::integer,
    COALESCE(ARRAY(SELECT values.value::uuid FROM jsonb_array_elements_text(dto->'lockedPlaceIds') AS values(value)), '{}'::uuid[]),
    p_actor_user_id
  ) ON CONFLICT ON CONSTRAINT trip_plan_revisions_plan_id_revision_no_key DO NOTHING RETURNING id INTO new_revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE = 'P0001', DETAIL = 'STALE_REVISION'; END IF;

  INSERT INTO public.trip_plan_items (
    revision_id, position, catalog_snapshot_id, place_id, start_at, end_at,
    visit_duration_minutes, travel_minutes_before, transition_buffer_minutes_before,
    travel_cost_vnd_before, place_cost_vnd, score, food_selection_json,
    food_cost_min_vnd, food_cost_max_vnd, pay_at_vendor_min_vnd,
    pay_at_vendor_max_vnd, customer_payable_vnd
  )
  SELECT new_revision_id, values.ordinality::integer, (dto->>'catalogSnapshotId')::uuid,
    (values.item->>'placeId')::uuid, (values.item->>'startAt')::timestamptz,
    (values.item->>'endAt')::timestamptz, (values.item->>'visitDurationMinutes')::smallint,
    (values.item->>'travelMinutesBefore')::smallint, (values.item->>'transitionBufferMinutesBefore')::smallint,
    (values.item->>'travelCostVndBefore')::bigint, (values.item->>'placeCostVnd')::bigint,
    (values.item->>'score')::numeric,
    CASE WHEN jsonb_typeof(values.item->'foodSelectionJson') = 'string'
         THEN (values.item->>'foodSelectionJson')::jsonb ELSE NULL END,
    COALESCE(NULLIF(values.item->>'foodCostMinVnd', '')::bigint, 0),
    COALESCE(NULLIF(values.item->>'foodCostMaxVnd', '')::bigint, 0),
    COALESCE(NULLIF(values.item->>'payAtVendorMinVnd', '')::bigint, 0),
    COALESCE(NULLIF(values.item->>'payAtVendorMaxVnd', '')::bigint, 0),
    COALESCE(NULLIF(values.item->>'customerPayableVnd', '')::bigint, 0)
  FROM jsonb_array_elements(dto->'items') WITH ORDINALITY AS values(item, ordinality);

  INSERT INTO private.recommendation_runs (
    plan_id, revision_id, actor_user_id, ranking_source, request_fingerprint,
    provider_attempted, outcome
  ) VALUES (
    p_plan_id, new_revision_id, p_actor_user_id, (dto->>'rankingSource')::public.ranking_source,
    dto->>'fingerprint', (dto->>'rankingSource') = 'ai', 'created'
  );
  UPDATE public.trip_plans AS plans SET latest_revision_no = next_revision_no WHERE plans.id = p_plan_id;
  revision_id := new_revision_id;
  revision_no := next_revision_no;
  RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION private.persist_trip_plan_revision(uuid, integer, jsonb, uuid, uuid, text, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.persist_trip_plan_revision(uuid, integer, jsonb, uuid, uuid, text, smallint) TO localens_guest_rpc_owner;
RESET ROLE;
SET LOCAL ROLE postgres;

-- Quote commercial facts remain immutable; only the existing guarded state
-- machine may change status after this migration.
SET LOCAL ROLE localens_request_guard_owner;

CREATE OR REPLACE FUNCTION private.reject_custom_quote_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.request_id IS DISTINCT FROM NEW.request_id
     OR OLD.amount_vnd_minor IS DISTINCT FROM NEW.amount_vnd_minor
     OR OLD.checkout_currency IS DISTINCT FROM NEW.checkout_currency
     OR OLD.checkout_amount_minor IS DISTINCT FROM NEW.checkout_amount_minor
     OR OLD.catalog_snapshot_id IS DISTINCT FROM NEW.catalog_snapshot_id
     OR OLD.travel_snapshot_id IS DISTINCT FROM NEW.travel_snapshot_id
     OR OLD.fx_snapshot_id IS DISTINCT FROM NEW.fx_snapshot_id
     OR OLD.fx_vnd_per_usd IS DISTINCT FROM NEW.fx_vnd_per_usd
     OR OLD.title_en IS DISTINCT FROM NEW.title_en
     OR OLD.title_vi IS DISTINCT FROM NEW.title_vi
     OR OLD.policy IS DISTINCT FROM NEW.policy
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.food_snapshot IS DISTINCT FROM NEW.food_snapshot
     OR OLD.food_estimate_min_vnd IS DISTINCT FROM NEW.food_estimate_min_vnd
     OR OLD.food_estimate_max_vnd IS DISTINCT FROM NEW.food_estimate_max_vnd
     OR OLD.pay_at_vendor_min_vnd IS DISTINCT FROM NEW.pay_at_vendor_min_vnd
     OR OLD.pay_at_vendor_max_vnd IS DISTINCT FROM NEW.pay_at_vendor_max_vnd THEN
    RAISE EXCEPTION 'custom quote commercial facts are immutable' USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.current_setting('localens.quote_transition', true) IS DISTINCT FROM 'on'
     OR OLD.status IS NOT DISTINCT FROM NEW.status
     OR NOT (
       (OLD.status = 'active'::public.quote_status AND NEW.status IN (
          'checkout_pending'::public.quote_status, 'expired'::public.quote_status, 'revoked'::public.quote_status))
       OR (OLD.status = 'checkout_pending'::public.quote_status AND NEW.status IN (
          'accepted'::public.quote_status, 'active'::public.quote_status,
          'expired'::public.quote_status, 'revoked'::public.quote_status))
     ) THEN
    RAISE EXCEPTION 'custom quote state transition is invalid' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.reject_custom_quote_mutation() FROM PUBLIC, anon, authenticated;
RESET ROLE;
SET LOCAL ROLE postgres;

SET LOCAL ROLE localens_request_admin_rpc_owner;

CREATE OR REPLACE FUNCTION private.create_custom_quote(
  p_request_id uuid,
  p_amount_vnd_minor bigint,
  p_checkout_currency public.checkout_currency,
  p_title_en text,
  p_title_vi text,
  p_policy text
)
RETURNS TABLE (quote_id uuid, status public.quote_status, valid_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  actor_user_id uuid := NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
  plan_row public.trip_plans%ROWTYPE;
  request_row public.custom_requests%ROWTYPE;
  revision_row public.trip_plan_revisions%ROWTYPE;
  existing_quote public.custom_quotes%ROWTYPE;
  fx_row public.fx_snapshots%ROWTYPE;
  created_quote public.custom_quotes%ROWTYPE;
  selection jsonb;
  selected_item jsonb;
  food_snapshot_value jsonb := '[]'::jsonb;
  food_min numeric := 0;
  food_max numeric := 0;
  food_quantity numeric;
  food_price_min numeric;
  food_price_max numeric;
  vendor_name_en text;
  vendor_name_vi text;
  menu_name_en text;
  menu_name_vi text;
  evidence_date date;
  checkout_amount numeric;
  localens_payable numeric;
  authority_time timestamptz;
  result_totals jsonb;
  totals_key text;
  food_total_material boolean := false;
  food_selection_count integer := 0;
  food_total_keys constant text[] := ARRAY[
    'foodCostMinVnd', 'foodCostMaxVnd', 'payAtVendorMinVnd',
    'payAtVendorMaxVnd', 'customerPayableVnd'
  ];
BEGIN
  IF actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.user_roles WHERE user_id = actor_user_id AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;
  IF p_request_id IS NULL OR p_amount_vnd_minor IS NULL OR p_amount_vnd_minor < 1
     OR p_amount_vnd_minor > 9007199254740991 OR p_checkout_currency IS NULL
     OR p_title_en IS NULL OR length(btrim(p_title_en)) NOT BETWEEN 1 AND 240 OR p_title_en ~ '[[:cntrl:]]'
     OR p_title_vi IS NULL OR length(btrim(p_title_vi)) NOT BETWEEN 1 AND 240 OR p_title_vi ~ '[[:cntrl:]]'
     OR p_policy IS NULL OR length(btrim(p_policy)) NOT BETWEEN 1 AND 4000 OR p_policy ~ '[[:cntrl:]]'
     OR p_title_en <> btrim(p_title_en) OR p_title_vi <> btrim(p_title_vi) OR p_policy <> btrim(p_policy) THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO request_row FROM public.custom_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO plan_row FROM public.trip_plans WHERE id = request_row.plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO revision_row FROM public.trip_plan_revisions WHERE id = request_row.revision_id FOR UPDATE;
  IF NOT FOUND OR revision_row.plan_id IS DISTINCT FROM request_row.plan_id
     OR revision_row.revision_no IS DISTINCT FROM request_row.revision_no THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO request_row FROM public.custom_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR request_row.status <> 'approved'::public.request_status
     OR request_row.plan_id IS DISTINCT FROM plan_row.id
     OR request_row.revision_id IS DISTINCT FROM revision_row.id
     OR request_row.revision_no IS DISTINCT FROM revision_row.revision_no THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO existing_quote FROM public.custom_quotes AS quotes
    WHERE quotes.request_id = request_row.id AND quotes.status IN ('active', 'checkout_pending')
    ORDER BY quotes.id LIMIT 1 FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001'; END IF;
  authority_time := pg_catalog.clock_timestamp();

  -- The selected immutable revision is the only source of food facts.  A
  -- malformed/unknown/changed ID, price, quantity, or payment mode fails
  -- closed.  MVP deliberately rejects included_in_quote.
  IF (revision_row.result_json ? 'items')
     AND jsonb_typeof(revision_row.result_json->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'food quote source items are malformed' USING ERRCODE = 'P0001';
  END IF;
  FOR selected_item IN SELECT value FROM jsonb_array_elements(revision_row.result_json->'items') LOOP
    IF jsonb_typeof(selected_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'food quote source item is malformed' USING ERRCODE = 'P0001';
    END IF;
    selection := selected_item->'foodSelection';
    IF selection IS NULL OR jsonb_typeof(selection) = 'null' THEN CONTINUE; END IF;
    IF jsonb_typeof(selection) IS DISTINCT FROM 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(selection)) <> 7
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(selection) AS keys(key_name)
                 WHERE key_name NOT IN ('vendorId', 'menuItemId', 'quantity', 'priceVndMin',
                                        'priceVndMax', 'paymentMode', 'activity'))
       OR EXISTS (SELECT 1 FROM unnest(ARRAY['vendorId', 'menuItemId', 'quantity', 'priceVndMin',
                                             'priceVndMax', 'paymentMode', 'activity']) AS keys(key_name)
                 WHERE NOT (selection ? key_name))
       OR selection->>'paymentMode' IS DISTINCT FROM 'pay_at_vendor'
       OR selected_item->>'placeId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR selection->>'vendorId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR selection->>'menuItemId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR selection->>'quantity' !~ '^[1-9][0-9]*$'
       OR selection->>'priceVndMin' !~ '^(?:0|[1-9][0-9]*)$'
       OR selection->>'priceVndMax' !~ '^(?:0|[1-9][0-9]*)$' THEN
      RAISE EXCEPTION 'food quote snapshot rejected' USING ERRCODE = 'P0001';
    END IF;
    food_quantity := (selection->>'quantity')::numeric;
    food_price_min := (selection->>'priceVndMin')::numeric;
    food_price_max := (selection->>'priceVndMax')::numeric;
    IF food_price_min > food_price_max
       OR food_price_min * food_quantity > 9007199254740991
       OR food_price_max * food_quantity > 9007199254740991 THEN
      RAISE EXCEPTION 'food quote snapshot quantity or price rejected' USING ERRCODE = 'P0001';
    END IF;
    SELECT food_vendors_translated.vendor_name_en, food_vendors_translated.vendor_name_vi,
           food_items_translated.menu_name_en, food_items_translated.menu_name_vi,
           food_items_translated.price_min, food_items_translated.price_max,
           food_items_translated.evidence_date
      INTO vendor_name_en, vendor_name_vi, menu_name_en, menu_name_vi,
           food_price_min, food_price_max, evidence_date
    FROM (
      SELECT vendors.vendor_id,
        max(vendor_translations.title) FILTER (WHERE vendor_translations.locale = 'en'::public.locale) AS vendor_name_en,
        max(vendor_translations.title) FILTER (WHERE vendor_translations.locale = 'vi'::public.locale) AS vendor_name_vi
      FROM public.catalog_snapshot_food_vendors AS vendors
      JOIN public.catalog_snapshot_food_vendor_translations AS vendor_translations
        ON vendor_translations.snapshot_id = vendors.snapshot_id
       AND vendor_translations.vendor_id = vendors.vendor_id
      WHERE vendors.snapshot_id = revision_row.catalog_snapshot_id
        AND vendors.vendor_id = (selection->>'vendorId')::uuid
        AND vendors.place_id = (selected_item->>'placeId')::uuid
        AND vendors.status = 'published'::public.place_status
      GROUP BY vendors.vendor_id
    ) AS food_vendors_translated
    JOIN (
      SELECT items.vendor_id, items.item_id,
        max(item_translations.title) FILTER (WHERE item_translations.locale = 'en'::public.locale) AS menu_name_en,
        max(item_translations.title) FILTER (WHERE item_translations.locale = 'vi'::public.locale) AS menu_name_vi,
        items.price_vnd_min AS price_min, items.price_vnd_max AS price_max,
        items.verified_at AS evidence_date
      FROM public.catalog_snapshot_food_items AS items
      JOIN public.catalog_snapshot_food_item_translations AS item_translations
        ON item_translations.snapshot_id = items.snapshot_id AND item_translations.item_id = items.item_id
      WHERE items.snapshot_id = revision_row.catalog_snapshot_id
        AND items.item_id = (selection->>'menuItemId')::uuid
        AND items.vendor_id = (selection->>'vendorId')::uuid
        AND items.place_id = (selected_item->>'placeId')::uuid
        AND items.status = 'published'::public.place_status
        AND items.available IS TRUE
        AND ((items.serving_unit = 'shared_set' AND food_quantity = 1)
             OR (items.serving_unit <> 'shared_set'
                 AND food_quantity = (revision_row.request_json->>'partySize')::numeric))
      GROUP BY items.vendor_id, items.item_id, items.price_vnd_min, items.price_vnd_max, items.verified_at
    ) AS food_items_translated
      ON food_items_translated.vendor_id = food_vendors_translated.vendor_id
    WHERE food_vendors_translated.vendor_name_en IS NOT NULL
      AND food_vendors_translated.vendor_name_vi IS NOT NULL
      AND food_items_translated.menu_name_en IS NOT NULL
      AND food_items_translated.menu_name_vi IS NOT NULL
      AND food_items_translated.price_min::numeric = (selection->>'priceVndMin')::numeric
      AND food_items_translated.price_max::numeric = (selection->>'priceVndMax')::numeric;
    IF NOT FOUND THEN RAISE EXCEPTION 'food quote snapshot source unavailable' USING ERRCODE = 'P0001'; END IF;
    food_selection_count := food_selection_count + 1;
    food_min := food_min + food_price_min * food_quantity;
    food_max := food_max + food_price_max * food_quantity;
    food_snapshot_value := food_snapshot_value || jsonb_build_array(jsonb_build_object(
      'vendor_id', selection->>'vendorId', 'vendor_name_en', vendor_name_en,
      'vendor_name_vi', vendor_name_vi, 'menu_item_id', selection->>'menuItemId',
      'menu_item_name_en', menu_name_en, 'menu_item_name_vi', menu_name_vi,
      'quantity', food_quantity::integer, 'price_vnd_min', food_price_min::bigint::text,
      'price_vnd_max', food_price_max::bigint::text, 'payment_mode', 'pay_at_vendor',
      'evidence_date', evidence_date::text
    ));
  END LOOP;
  IF food_min > 9007199254740991 OR food_max > 9007199254740991 THEN
    RAISE EXCEPTION 'food quote snapshot overflow' USING ERRCODE = '22003';
  END IF;
  result_totals := revision_row.result_json->'totals';
  IF (revision_row.result_json ? 'totals')
     AND jsonb_typeof(result_totals) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'food quote totals must be an object' USING ERRCODE = 'P0001';
  END IF;
  food_total_material := result_totals IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_object_keys(result_totals) AS keys(key_name)
    WHERE key_name = ANY(food_total_keys)
  );
  IF food_total_material THEN
    IF (SELECT count(*) FROM jsonb_object_keys(result_totals) AS keys(key_name)
        WHERE key_name = ANY(food_total_keys)) <> cardinality(food_total_keys)
       OR EXISTS (SELECT 1 FROM unnest(food_total_keys) AS keys(key_name)
                  WHERE NOT (result_totals ? key_name)) THEN
      RAISE EXCEPTION 'food totals material requires exact keys' USING ERRCODE = 'P0001';
    END IF;
    FOREACH totals_key IN ARRAY food_total_keys LOOP
      IF jsonb_typeof(result_totals->totals_key) IS DISTINCT FROM 'number'
         OR result_totals->>totals_key !~ '^(?:0|[1-9][0-9]*)$'
         OR length(result_totals->>totals_key) > 16
         OR (length(result_totals->>totals_key) = 16
             AND (result_totals->>totals_key)::numeric > 9007199254740991) THEN
        RAISE EXCEPTION 'food quote total scalar is invalid' USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
    IF result_totals->>'foodCostMinVnd' IS DISTINCT FROM food_min::text
       OR result_totals->>'foodCostMaxVnd' IS DISTINCT FROM food_max::text
       OR result_totals->>'payAtVendorMinVnd' IS DISTINCT FROM food_min::text
       OR result_totals->>'payAtVendorMaxVnd' IS DISTINCT FROM food_max::text THEN
      RAISE EXCEPTION 'food quote total mismatch' USING ERRCODE = 'P0001';
    END IF;
    localens_payable := (result_totals->>'customerPayableVnd')::numeric;
  ELSIF food_selection_count <> 0 THEN
    RAISE EXCEPTION 'food quote totals are missing' USING ERRCODE = 'P0001';
  ELSE
    -- Historical museum/history revisions predate Task 9 and have no food
    -- material. Preserve their old quote behavior unchanged: the existing
    -- admin-provided quote amount remains the sellable LocalLens amount.
    localens_payable := p_amount_vnd_minor::numeric;
  END IF;
  IF p_amount_vnd_minor::numeric IS DISTINCT FROM localens_payable THEN
    RAISE EXCEPTION 'quote amount must equal LocalLens payable amount' USING ERRCODE = 'P0001';
  END IF;

  IF p_checkout_currency = 'usd'::public.checkout_currency THEN
    SELECT * INTO fx_row FROM public.fx_snapshots
      WHERE environment = 'demo' AND is_demo = true
        AND observed_at <= authority_time AND observed_at >= authority_time - interval '7 days'
      ORDER BY observed_at DESC, id DESC LIMIT 1 FOR SHARE;
    IF NOT FOUND OR fx_row.observed_at > pg_catalog.clock_timestamp()
       OR fx_row.observed_at < pg_catalog.clock_timestamp() - interval '7 days' THEN
      RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
    END IF;
    checkout_amount := ceil(p_amount_vnd_minor::numeric * 100 / fx_row.vnd_per_usd);
  ELSE
    checkout_amount := p_amount_vnd_minor::numeric;
  END IF;
  IF checkout_amount < 1 OR checkout_amount > 9007199254740991 OR checkout_amount <> trunc(checkout_amount) THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    INSERT INTO public.custom_quotes (
      request_id, status, amount_vnd_minor, checkout_currency, checkout_amount_minor,
      catalog_snapshot_id, travel_snapshot_id, fx_snapshot_id, fx_vnd_per_usd,
      title_en, title_vi, policy, created_at, food_snapshot,
      food_estimate_min_vnd, food_estimate_max_vnd, pay_at_vendor_min_vnd, pay_at_vendor_max_vnd
    ) VALUES (
      request_row.id, 'active'::public.quote_status, p_amount_vnd_minor, p_checkout_currency,
      checkout_amount::bigint, revision_row.catalog_snapshot_id, revision_row.travel_snapshot_id,
      CASE WHEN p_checkout_currency = 'usd'::public.checkout_currency THEN fx_row.id ELSE NULL END,
      CASE WHEN p_checkout_currency = 'usd'::public.checkout_currency THEN fx_row.vnd_per_usd ELSE NULL END,
      p_title_en, p_title_vi, p_policy, authority_time, food_snapshot_value,
      food_min::bigint, food_max::bigint, food_min::bigint, food_max::bigint
    ) RETURNING * INTO created_quote;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'custom request operation failed' USING ERRCODE = 'P0001';
  END;
  PERFORM private.record_request_quote_audit_event(
    'quote_created'::public.audit_event_type, actor_user_id, 'admin'::public.app_role,
    'custom_quote'::public.audit_target_type, created_quote.id, NULL, 'active',
    'currency'::public.audit_metadata_key, p_checkout_currency::text, NULL
  );
  PERFORM private.record_request_quote_audit_event(
    'quote_created'::public.audit_event_type, actor_user_id, 'admin'::public.app_role,
    'custom_quote'::public.audit_target_type, created_quote.id, NULL, 'active',
    'amount_minor'::public.audit_metadata_key, NULL, created_quote.checkout_amount_minor
  );
  quote_id := created_quote.id; status := created_quote.status; valid_until := created_quote.valid_until;
  RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION private.create_custom_quote(uuid, bigint, public.checkout_currency, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.create_custom_quote(uuid, bigint, public.checkout_currency, text, text, text)
  TO localens_request_admin_rpc_owner;

-- The public quote wrapper keeps the original six-argument API and delegates
-- all food derivation to the guarded private function.
CREATE OR REPLACE FUNCTION public.create_custom_quote(
  request_id uuid,
  amount_vnd_minor bigint,
  checkout_currency public.checkout_currency,
  title_en text,
  title_vi text,
  policy text
)
RETURNS TABLE (quote_id uuid, status public.quote_status, valid_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
BEGIN
  RETURN QUERY SELECT created.quote_id, created.status, created.valid_until
  FROM private.create_custom_quote(request_id, amount_vnd_minor, checkout_currency, title_en, title_vi, policy) AS created;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_custom_quote(uuid, bigint, public.checkout_currency, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_custom_quote(uuid, bigint, public.checkout_currency, text, text, text) TO authenticated;
RESET ROLE;
SET LOCAL ROLE postgres;

-- Extend the safe customer view without exposing owner/admin fields.  The
-- checkout amount remains the LocalLens-payable amount; pay-at-vendor totals
-- are display-only estimates and are never read by Stripe checkout RPCs.
SET LOCAL ROLE localens_request_customer_rpc_owner;

CREATE OR REPLACE VIEW public.customer_custom_quotes_v
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  quotes.id,
  quotes.request_id,
  quotes.status,
  CASE WHEN owners.language = 'vi'::public.locale THEN quotes.title_vi ELSE quotes.title_en END AS title,
  quotes.amount_vnd_minor::text AS amount_vnd_minor,
  quotes.checkout_currency AS currency,
  quotes.checkout_amount_minor::text AS amount_minor,
  quotes.policy,
  pg_catalog.to_char(quotes.valid_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS valid_until,
  quotes.food_snapshot,
  quotes.food_estimate_min_vnd::text AS food_estimate_min_vnd,
  quotes.food_estimate_max_vnd::text AS food_estimate_max_vnd,
  quotes.pay_at_vendor_min_vnd::text AS pay_at_vendor_min_vnd,
  quotes.pay_at_vendor_max_vnd::text AS pay_at_vendor_max_vnd
FROM public.custom_quotes AS quotes
JOIN public.custom_requests AS requests ON requests.id = quotes.request_id
JOIN public.profiles AS owners ON owners.id = requests.owner_user_id
WHERE requests.owner_user_id = NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
REVOKE ALL ON public.customer_custom_quotes_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_custom_quotes_v TO authenticated;
RESET ROLE;
SET LOCAL ROLE postgres;

-- The existing start_checkout_tx and webhook finalizer continue to validate
-- only custom_quotes.amount_vnd_minor/checkout_amount_minor and currency.
-- They intentionally do not consult pay_at_vendor_min_vnd/max_vnd.

REVOKE CREATE ON SCHEMA private FROM localens_plan_rpc_owner, localens_request_guard_owner, localens_request_admin_rpc_owner;
REVOKE CREATE ON SCHEMA public FROM localens_request_admin_rpc_owner, localens_request_customer_rpc_owner;
REVOKE USAGE ON SCHEMA private FROM localens_request_guard_owner;

COMMIT;
