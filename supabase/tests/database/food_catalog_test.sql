-- Task 3A pgTAP coverage for the canonical mutable food catalog base schema.
-- The assertions are metadata/security checks only; this fixture is
-- intentionally rollback-only and contains no vendor/menu source facts.
BEGIN;

SELECT plan(46);

-- Every base relation is present.
SELECT ok(to_regclass('public.food_vendors') IS NOT NULL, 'food vendors exists');
SELECT ok(to_regclass('public.food_vendor_translations') IS NOT NULL, 'food vendor translations exists');
SELECT ok(to_regclass('public.food_vendor_supports') IS NOT NULL, 'food vendor supports exists');
SELECT ok(to_regclass('public.food_vendor_opening_hours') IS NOT NULL, 'food vendor opening hours exists');
SELECT ok(to_regclass('public.food_vendor_opening_exceptions') IS NOT NULL, 'food vendor opening exceptions exists');
SELECT ok(to_regclass('public.food_vendor_opening_exception_windows') IS NOT NULL, 'food vendor exception windows exists');
SELECT ok(to_regclass('public.food_items') IS NOT NULL, 'food items exists');
SELECT ok(to_regclass('public.food_item_translations') IS NOT NULL, 'food item translations exists');
SELECT ok(to_regclass('public.food_item_supports') IS NOT NULL, 'food item supports exists');

-- Every base relation is forced through RLS.
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.food_vendors'::regclass), 'food vendors have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.food_vendor_translations'::regclass), 'food vendor translations have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.food_vendor_supports'::regclass), 'food vendor supports have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.food_vendor_opening_hours'::regclass), 'food vendor opening hours have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.food_vendor_opening_exceptions'::regclass), 'food vendor opening exceptions have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.food_vendor_opening_exception_windows'::regclass), 'food vendor exception windows have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.food_items'::regclass), 'food items have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.food_item_translations'::regclass), 'food item translations have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.food_item_supports'::regclass), 'food item supports have forced RLS');

-- Scalar and evidence constraints are database-enforced.
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_items'::regclass AND conname = 'food_items_price_min_check') = 1, 'food minimum price uses the safe non-negative bound');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_items'::regclass AND conname = 'food_items_price_max_check') = 1, 'food maximum price uses the safe non-negative bound');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_items'::regclass AND conname = 'food_items_price_order_check') = 1, 'food minimum price cannot exceed maximum price');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_items'::regclass AND conname = 'food_items_serving_unit_check') = 1, 'food serving unit is closed');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_vendor_supports'::regclass AND conname = 'food_vendor_supports_kind_check') = 1, 'vendor support kind is closed');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_item_supports'::regclass AND conname = 'food_item_supports_kind_check') = 1, 'item support kind is closed');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_vendor_supports'::regclass AND conname = 'food_vendor_supports_status_check') = 1, 'vendor support status is tri-state');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_item_supports'::regclass AND conname = 'food_item_supports_status_check') = 1, 'item support status is tri-state');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_vendors'::regclass AND conname = 'food_vendors_capacity_note_check') = 1, 'vendor capacity note is bounded and non-empty');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_items'::regclass AND conname = 'food_items_portion_description_check') = 1, 'item portion description is bounded and non-empty');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_vendor_opening_hours'::regclass AND conname = 'food_vendor_opening_hours_weekday_check') = 1, 'vendor opening weekday is constrained');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_vendor_opening_hours'::regclass AND conname = 'food_vendor_opening_hours_time_check') = 1, 'vendor opening window cannot have equal endpoints');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_vendor_opening_exception_windows'::regclass AND conname = 'food_vendor_exception_windows_time_check') = 1, 'vendor exception window cannot have equal endpoints');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_vendor_opening_exceptions'::regclass AND conname = 'food_vendor_opening_exceptions_unique_date') = 1, 'vendor exception date is unique');

-- Parent relationships are restrictive and composite where a child has a
-- parent-local identifier.
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_vendors'::regclass AND conname = 'food_vendors_place_id_fkey' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'vendor requires a venue parent');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_vendor_translations'::regclass AND conname = 'food_vendor_translations_vendor_id_fkey' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'vendor translations require a vendor parent');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_vendor_supports'::regclass AND conname = 'food_vendor_supports_vendor_id_fkey' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'vendor supports require a vendor parent');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_vendor_opening_hours'::regclass AND conname = 'food_vendor_opening_hours_vendor_id_fkey' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'vendor hours require a vendor parent');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_vendor_opening_exceptions'::regclass AND conname = 'food_vendor_opening_exceptions_vendor_id_fkey' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'vendor exceptions require a vendor parent');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_vendor_opening_exception_windows'::regclass AND conname = 'food_vendor_exception_windows_parent_fkey' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'vendor exception windows require the matching exception parent');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_items'::regclass AND conname = 'food_items_vendor_id_fkey' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'items require a vendor parent');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_item_translations'::regclass AND conname = 'food_item_translations_item_id_fkey' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'item translations require an item parent');
SELECT ok((SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.food_item_supports'::regclass AND conname = 'food_item_supports_item_id_fkey' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%') = 1, 'item supports require an item parent');

-- Opening overlap/closed-exception behavior is guarded by named triggers.
SELECT ok((SELECT count(*) FROM pg_trigger WHERE tgname IN ('food_vendor_opening_hours_no_overlap', 'food_vendor_exception_windows_no_overlap', 'food_vendor_exception_consistency')) = 3, 'vendor opening and exception guards exist');

-- API roles have no direct base-table privileges, while the catalog owner has
-- the write privileges used by the future admin RPC.
SELECT ok(NOT has_table_privilege('anon', 'public.food_vendors', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.food_items', 'SELECT'), 'API roles cannot read food base rows');
SELECT ok(NOT has_table_privilege('anon', 'public.food_vendors', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.food_items', 'UPDATE'), 'API roles cannot write food base rows');
SELECT ok(has_table_privilege('localens_catalog_rpc_owner', 'public.food_vendors', 'INSERT') AND has_table_privilege('localens_catalog_rpc_owner', 'public.food_items', 'UPDATE'), 'catalog owner can write food base rows');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname = 'public' AND policyname = 'catalog_owner_all' AND tablename LIKE 'food_%'), 9, 'every food base table has a catalog-owner ALL policy');

SELECT * FROM finish();
ROLLBACK;
