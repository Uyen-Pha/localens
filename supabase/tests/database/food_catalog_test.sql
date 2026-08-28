-- Task 3A pgTAP coverage for the canonical mutable food catalog base schema.
-- The assertions are metadata/security checks only; this fixture is
-- intentionally rollback-only and contains no vendor/menu source facts.
BEGIN;

SELECT plan(108);

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

-- Task 3B immutable snapshot relations mirror every canonical food relation.
SELECT ok(to_regclass('public.catalog_snapshot_food_vendors') IS NOT NULL, 'snapshot food vendors exists');
SELECT ok(to_regclass('public.catalog_snapshot_food_vendor_translations') IS NOT NULL, 'snapshot food vendor translations exists');
SELECT ok(to_regclass('public.catalog_snapshot_food_vendor_supports') IS NOT NULL, 'snapshot food vendor supports exists');
SELECT ok(to_regclass('public.catalog_snapshot_food_vendor_opening_hours') IS NOT NULL, 'snapshot food vendor opening hours exists');
SELECT ok(to_regclass('public.catalog_snapshot_food_vendor_opening_exceptions') IS NOT NULL, 'snapshot food vendor opening exceptions exists');
SELECT ok(to_regclass('public.catalog_snapshot_food_vendor_opening_exception_windows') IS NOT NULL, 'snapshot food vendor exception windows exists');
SELECT ok(to_regclass('public.catalog_snapshot_food_items') IS NOT NULL, 'snapshot food items exists');
SELECT ok(to_regclass('public.catalog_snapshot_food_item_translations') IS NOT NULL, 'snapshot food item translations exists');
SELECT ok(to_regclass('public.catalog_snapshot_food_item_supports') IS NOT NULL, 'snapshot food item supports exists');

SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_food_vendors'::regclass), 'snapshot food vendors have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_food_vendor_translations'::regclass), 'snapshot food vendor translations have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_food_vendor_supports'::regclass), 'snapshot food vendor supports have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_food_vendor_opening_hours'::regclass), 'snapshot food vendor opening hours have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_food_vendor_opening_exceptions'::regclass), 'snapshot food vendor opening exceptions have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_food_vendor_opening_exception_windows'::regclass), 'snapshot food vendor exception windows have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_food_items'::regclass), 'snapshot food items have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_food_item_translations'::regclass), 'snapshot food item translations have forced RLS');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.catalog_snapshot_food_item_supports'::regclass), 'snapshot food item supports have forced RLS');

SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.catalog_snapshot_food_vendors'::regclass AND contype = 'p' AND pg_get_constraintdef(oid) LIKE '%snapshot_id, vendor_id%'), 'snapshot vendors use snapshot and vendor identity');
SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.catalog_snapshot_food_vendors'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%snapshot_id, place_id%ON DELETE RESTRICT%'), 'snapshot vendors require same-snapshot place membership');
SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.catalog_snapshot_food_vendors'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) LIKE '%snapshot_id, place_id, vendor_id%'), 'snapshot vendor exposes unique place/vendor membership');
SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.catalog_snapshot_food_items'::regclass AND contype = 'p' AND pg_get_constraintdef(oid) LIKE '%snapshot_id, item_id%'), 'snapshot items use snapshot and item identity');
SELECT ok((SELECT count(*) = 1 FROM pg_constraint WHERE conrelid = 'public.catalog_snapshot_food_items'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%snapshot_id, place_id, vendor_id%ON DELETE RESTRICT%'), 'snapshot items require same-snapshot vendor membership');
SELECT ok((SELECT count(*) = 7 FROM pg_constraint WHERE conrelid IN (
  'public.catalog_snapshot_food_vendor_translations'::regclass,
  'public.catalog_snapshot_food_vendor_supports'::regclass,
  'public.catalog_snapshot_food_vendor_opening_hours'::regclass,
  'public.catalog_snapshot_food_vendor_opening_exceptions'::regclass,
  'public.catalog_snapshot_food_vendor_opening_exception_windows'::regclass,
  'public.catalog_snapshot_food_item_translations'::regclass,
  'public.catalog_snapshot_food_item_supports'::regclass
 ) AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%'), 'snapshot children retain restrictive parent references');
SELECT ok((SELECT count(*) = 3 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'catalog_snapshot_food_items' AND column_name IN ('snapshot_id', 'place_id', 'vendor_id') AND is_nullable = 'NO'), 'snapshot items retain the snapshot/place/vendor keys');
SELECT ok((SELECT count(*) = 3 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'catalog_snapshot_food_vendors' AND column_name IN ('source_url', 'verified_at', 'attribution') AND is_nullable = 'NO'), 'snapshot vendors require provenance facts');
SELECT ok((SELECT count(*) = 9 FROM pg_trigger WHERE tgname IN (
  'catalog_snapshot_food_vendors_append_only',
  'catalog_snapshot_food_vendor_translations_append_only',
  'catalog_snapshot_food_vendor_supports_append_only',
  'catalog_snapshot_food_vendor_opening_hours_append_only',
  'catalog_snapshot_food_vendor_opening_exceptions_append_only',
  'catalog_snapshot_food_vendor_ex_windows_append_only',
  'catalog_snapshot_food_items_append_only',
  'catalog_snapshot_food_item_translations_append_only',
  'catalog_snapshot_food_item_supports_append_only'
)), 'snapshot child append-only triggers are present');
SELECT ok((SELECT count(*) = 9 FROM pg_trigger WHERE tgname IN (
  'catalog_snapshot_food_vendors_append_only_truncate',
  'catalog_snapshot_food_vendor_translations_append_only_truncate',
  'catalog_snapshot_food_vendor_supports_append_only_truncate',
  'catalog_snapshot_food_vendor_opening_hours_append_only_truncate',
  'catalog_snapshot_food_vendor_opening_exceptions_truncate',
  'catalog_snapshot_food_vendor_ex_windows_truncate',
  'catalog_snapshot_food_items_append_only_truncate',
  'catalog_snapshot_food_item_translations_append_only_truncate',
  'catalog_snapshot_food_item_supports_append_only_truncate'
)), 'snapshot child truncate protections are present');

SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'private.assert_published_food_vendor_complete(uuid)'::regprocedure), 'localens_catalog_guard_owner', 'vendor completeness helper has guard owner');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'private.assert_published_food_item_complete(uuid)'::regprocedure), 'localens_catalog_guard_owner', 'item completeness helper has guard owner');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'private.assert_published_food_item_vendor_row()'::regprocedure), 'localens_catalog_guard_owner', 'food item vendor row guard has guard owner');
SELECT ok((SELECT proconfig @> ARRAY['search_path='] AND proconfig @> ARRAY['statement_timeout=5s'] FROM pg_proc WHERE oid = 'private.assert_published_food_vendor_complete(uuid)'::regprocedure), 'vendor completeness helper pins search path and timeout');
SELECT ok((SELECT proconfig @> ARRAY['search_path='] AND proconfig @> ARRAY['statement_timeout=5s'] FROM pg_proc WHERE oid = 'private.assert_published_food_item_complete(uuid)'::regprocedure), 'item completeness helper pins search path and timeout');
SELECT ok((SELECT count(*) = 1 FROM pg_trigger WHERE tgname = 'food_items_vendor_completeness' AND tgrelid = 'public.food_items'::regclass AND NOT tgisinternal), 'food item writes guard their published vendor');
SELECT ok((SELECT count(*) = 2 FROM pg_trigger WHERE tgname IN ('food_item_translations_published_completeness', 'food_item_supports_published_completeness') AND tgrelid IN ('public.food_item_translations'::regclass, 'public.food_item_supports'::regclass) AND NOT tgisinternal), 'food item child guards retain self-completeness');
SELECT ok((SELECT pg_get_functiondef('private.assert_published_food_vendor_complete(uuid)'::regprocedure) LIKE '%source_url IS NULL%' AND pg_get_functiondef('private.assert_published_food_vendor_complete(uuid)'::regprocedure) ~ $$locale[[:space:]]+IN[[:space:]]*\('en'::public\.locale,[[:space:]]*'vi'::public\.locale\)$$ AND pg_get_functiondef('private.assert_published_food_vendor_complete(uuid)'::regprocedure) LIKE '%support_kind = ''mobility''%' AND pg_get_functiondef('private.assert_published_food_vendor_complete(uuid)'::regprocedure) LIKE '%food_items%'), 'vendor completeness checks provenance translations support and a menu item');
SELECT ok((SELECT pg_get_functiondef('private.assert_published_food_item_complete(uuid)'::regprocedure) LIKE '%source_url IS NULL%' AND pg_get_functiondef('private.assert_published_food_item_complete(uuid)'::regprocedure) ~ $$locale[[:space:]]+IN[[:space:]]*\('en'::public\.locale,[[:space:]]*'vi'::public\.locale\)$$ AND pg_get_functiondef('private.assert_published_food_item_complete(uuid)'::regprocedure) LIKE '%support_kind = ''dietary''%' AND pg_get_functiondef('private.assert_published_food_item_complete(uuid)'::regprocedure) LIKE '%support_kind = ''allergen''%'), 'item completeness checks provenance translations and explicit support evidence');

SELECT ok((SELECT prosecdef AND proconfig @> ARRAY['search_path='] AND proconfig @> ARRAY['statement_timeout=5s'] FROM pg_proc WHERE oid = 'private.create_catalog_snapshot()'::regprocedure), 'food snapshot creator remains pinned SECURITY DEFINER');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'private.create_catalog_snapshot()'::regprocedure), 'localens_catalog_rpc_owner', 'food snapshot creator keeps named owner');
SELECT ok((SELECT pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%p.price_vnd_per_person%' AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%p.visit_duration_minutes%' AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%INSERT INTO public.catalog_snapshot_food_vendors%' AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%INSERT INTO public.catalog_snapshot_food_items%'), 'snapshot creator preserves venue copy and adds food copy');
SELECT ok((SELECT pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%v.status = ''published''%public.place_status%' AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%i.available%' AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%i.status = ''published''%public.place_status%'), 'snapshot creator copies only published available food facts');
SELECT ok((SELECT pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.areas IN SHARE ROW EXCLUSIVE MODE%' AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.area_translations IN SHARE ROW EXCLUSIVE MODE%' AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.places IN SHARE ROW EXCLUSIVE MODE%' AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.food_vendors IN SHARE ROW EXCLUSIVE MODE%' AND pg_get_functiondef('private.create_catalog_snapshot()'::regprocedure) LIKE '%LOCK TABLE public.food_items IN SHARE ROW EXCLUSIVE MODE%'), 'snapshot creator keeps venue locks before deterministic food locks');

SELECT ok(NOT has_table_privilege('anon', 'public.catalog_snapshot_food_vendors', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.catalog_snapshot_food_items', 'SELECT'), 'API roles cannot read food snapshot tables directly');
SELECT ok(NOT has_table_privilege('anon', 'public.catalog_snapshot_food_vendors', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.catalog_snapshot_food_items', 'UPDATE'), 'API roles cannot write food snapshot tables');
SELECT ok((SELECT bool_and(has_table_privilege('localens_catalog_rpc_owner', format('public.%s', table_name), 'INSERT')) FROM unnest(ARRAY[
  'catalog_snapshot_food_vendors', 'catalog_snapshot_food_vendor_translations', 'catalog_snapshot_food_vendor_supports',
  'catalog_snapshot_food_vendor_opening_hours', 'catalog_snapshot_food_vendor_opening_exceptions',
  'catalog_snapshot_food_vendor_opening_exception_windows', 'catalog_snapshot_food_items',
  'catalog_snapshot_food_item_translations', 'catalog_snapshot_food_item_supports'
]) AS table_name), 'catalog RPC owner can create all food snapshot rows');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'catalog_snapshot_food_%' AND (roles @> ARRAY['anon'::name] OR roles @> ARRAY['authenticated'::name])), 0, 'food snapshots have no direct API policies before a projection slice');
SELECT is((SELECT count(*)::integer FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname LIKE 'catalog_snapshot_food_%_v'), 0, 'food snapshot projection views are deferred');

-- Synthetic rollback-only publication and copy fixture.  It uses the complete
-- behavior place from the catalog snapshot suite and never introduces a real
-- vendor or menu fact into the checked-in source manifests.
INSERT INTO public.areas (id, slug)
VALUES ('00000000-0000-0000-0000-000000000101'::uuid, 'food-behavior-area');
INSERT INTO public.area_translations (area_id, locale, name, description) VALUES
  ('00000000-0000-0000-0000-000000000101'::uuid, 'en', 'Food behavior area', 'Synthetic area'),
  ('00000000-0000-0000-0000-000000000101'::uuid, 'vi', 'Khu an tong hop', 'Khu vuc tong hop');
INSERT INTO public.places (
  id, area_id, slug, price_vnd_per_person, visit_duration_minutes,
  source_url, verified_at, attribution
)
VALUES (
  '00000000-0000-0000-0000-000000000201'::uuid,
  '00000000-0000-0000-0000-000000000101'::uuid,
  'food-behavior-place', 0, 60, 'https://example.invalid/food-place', DATE '2026-08-20', 'Synthetic fixture'
);
INSERT INTO public.place_translations (place_id, locale, title, summary, description) VALUES
  ('00000000-0000-0000-0000-000000000201'::uuid, 'en', 'Food behavior place', 'Synthetic place', 'Synthetic English place'),
  ('00000000-0000-0000-0000-000000000201'::uuid, 'vi', 'Dia diem an tong hop', 'Dia diem tong hop', 'Mo ta dia diem tong hop');
INSERT INTO public.place_experience_types (place_id, experience_type)
VALUES ('00000000-0000-0000-0000-000000000201'::uuid, 'street_food');
INSERT INTO public.place_guide_languages (place_id, language)
VALUES ('00000000-0000-0000-0000-000000000201'::uuid, 'en');
INSERT INTO public.place_opening_hours (place_id, weekday, opens_at, closes_at)
VALUES ('00000000-0000-0000-0000-000000000201'::uuid, 1, TIME '08:00', TIME '18:00');
UPDATE public.places SET status = 'published' WHERE id = '00000000-0000-0000-0000-000000000201'::uuid;

INSERT INTO public.food_vendors (
  id, place_id, slug, status, service_type, location_note, capacity_note,
  source_url, verified_at, attribution
)
VALUES (
  '00000000-0000-0000-0000-000000000401'::uuid,
  '00000000-0000-0000-0000-000000000201'::uuid,
  'synthetic-stall', 'draft', 'stall', 'Synthetic aisle', 'Synthetic group note',
  'https://example.invalid/food-vendor', DATE '2026-08-20', 'Synthetic fixture'
);
INSERT INTO public.food_vendor_translations (food_vendor_id, locale, title, description) VALUES
  ('00000000-0000-0000-0000-000000000401'::uuid, 'en', 'Synthetic stall', 'Synthetic English description'),
  ('00000000-0000-0000-0000-000000000401'::uuid, 'vi', 'Sạp tổng hợp', 'Mô tả tổng hợp');
INSERT INTO public.food_vendor_supports (food_vendor_id, support_kind, requirement, status) VALUES
  ('00000000-0000-0000-0000-000000000401'::uuid, 'dietary', 'vegetarian', 'supported'),
  ('00000000-0000-0000-0000-000000000401'::uuid, 'mobility', 'step_free', 'unknown');
INSERT INTO public.food_vendor_opening_hours (food_vendor_id, weekday, opens_at, closes_at)
VALUES ('00000000-0000-0000-0000-000000000401'::uuid, 1, TIME '08:00', TIME '12:00');
INSERT INTO public.food_items (
  id, food_vendor_id, slug, status, serving_unit, price_vnd_min, price_vnd_max,
  portion_description, available, allergens, source_url, verified_at, attribution
)
VALUES (
  '00000000-0000-0000-0000-000000000402'::uuid,
  '00000000-0000-0000-0000-000000000401'::uuid,
  'synthetic-dish', 'draft', 'portion', 40000, 50000, 'One synthetic portion', true,
  ARRAY['peanut'], 'https://example.invalid/food-item', DATE '2026-08-20', 'Synthetic fixture'
);
INSERT INTO public.food_item_translations (food_item_id, locale, title, description) VALUES
  ('00000000-0000-0000-0000-000000000402'::uuid, 'en', 'Synthetic dish', 'Synthetic English dish description'),
  ('00000000-0000-0000-0000-000000000402'::uuid, 'vi', 'Món tổng hợp', 'Mô tả món tổng hợp');
INSERT INTO public.food_item_supports (food_item_id, support_kind, requirement, status) VALUES
  ('00000000-0000-0000-0000-000000000402'::uuid, 'dietary', 'vegetarian', 'supported'),
  ('00000000-0000-0000-0000-000000000402'::uuid, 'allergen', 'peanut', 'unknown');
UPDATE public.food_items SET status = 'published' WHERE id = '00000000-0000-0000-0000-000000000402'::uuid;
UPDATE public.food_vendors SET status = 'published' WHERE id = '00000000-0000-0000-0000-000000000401'::uuid;

SELECT throws_ok($$INSERT INTO public.food_vendors (id, place_id, slug, status, service_type, location_note, capacity_note)
  VALUES ('00000000-0000-0000-0000-000000000403'::uuid, '00000000-0000-0000-0000-000000000201'::uuid, 'incomplete-stall', 'published', 'stall', 'Missing evidence', 'Missing evidence')$$,
  '23514', NULL, 'published vendor requires complete source and child facts');
SELECT throws_ok($$INSERT INTO public.food_items (id, food_vendor_id, slug, status, serving_unit, price_vnd_min, price_vnd_max, portion_description, available)
  VALUES ('00000000-0000-0000-0000-000000000404'::uuid, '00000000-0000-0000-0000-000000000401'::uuid, 'incomplete-dish', 'published', 'portion', 1, 1, 'Missing evidence', true)$$,
  '23514', NULL, 'published item requires complete source and child facts');

INSERT INTO public.food_vendors (id, place_id, slug, status, service_type, location_note, capacity_note)
VALUES ('00000000-0000-0000-0000-000000000405'::uuid, '00000000-0000-0000-0000-000000000201'::uuid, 'draft-target-stall', 'draft', 'stall', 'Draft target', 'Draft target');
SELECT throws_ok($$UPDATE public.food_items SET available = false WHERE id = '00000000-0000-0000-0000-000000000402'::uuid$$,
  '23514', NULL, 'published vendor cannot lose its sole available item');
SELECT throws_ok($$UPDATE public.food_items SET status = 'draft' WHERE id = '00000000-0000-0000-0000-000000000402'::uuid$$,
  '23514', NULL, 'published vendor cannot lose its sole published item');
SELECT throws_ok($$UPDATE public.food_items SET food_vendor_id = '00000000-0000-0000-0000-000000000405'::uuid WHERE id = '00000000-0000-0000-0000-000000000402'::uuid$$,
  '23514', NULL, 'published vendor cannot lose its sole item by reparenting');
SELECT throws_ok($$DELETE FROM public.food_items WHERE id = '00000000-0000-0000-0000-000000000402'::uuid$$,
  '23514', NULL, 'published vendor cannot delete its sole item');

INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000905'::uuid, 'authenticated', 'authenticated', 'food-catalog-admin@example.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO private.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000000905'::uuid, 'admin'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;
SET LOCAL ROLE localens_admin_rpc_owner;
CREATE TEMP TABLE pg_temp.food_snapshot_ids (name text PRIMARY KEY, snapshot_id uuid NOT NULL);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000905', true);
SELECT lives_ok($$INSERT INTO pg_temp.food_snapshot_ids (name, snapshot_id) VALUES ('old', private.create_catalog_snapshot())$$, 'admin snapshot RPC copies complete food facts atomically');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.catalog_snapshot_food_vendors WHERE vendor_id = '00000000-0000-0000-0000-000000000401'::uuid), 1, 'published vendor is copied into snapshot');
SELECT is((SELECT count(*)::integer FROM public.catalog_snapshot_food_items WHERE item_id = '00000000-0000-0000-0000-000000000402'::uuid AND price_vnd_min = 40000 AND price_vnd_max = 50000), 1, 'published available item copies exact price bounds');
SELECT is((SELECT count(*)::integer FROM public.catalog_snapshot_food_vendors WHERE vendor_id = '00000000-0000-0000-0000-000000000403'::uuid), 0, 'incomplete published vendor is never copied');

UPDATE public.food_items SET price_vnd_min = 60000, price_vnd_max = 70000 WHERE id = '00000000-0000-0000-0000-000000000402'::uuid;
SET LOCAL ROLE localens_admin_rpc_owner;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000905', true);
SELECT lives_ok($$INSERT INTO pg_temp.food_snapshot_ids (name, snapshot_id) VALUES ('new', private.create_catalog_snapshot())$$, 'second snapshot captures the updated food price');
RESET ROLE;
SELECT is((SELECT price_vnd_min FROM public.catalog_snapshot_food_items WHERE snapshot_id = (SELECT snapshot_id FROM pg_temp.food_snapshot_ids WHERE name = 'old') AND item_id = '00000000-0000-0000-0000-000000000402'::uuid), 40000::bigint, 'old snapshot retains old minimum price');
SELECT is((SELECT price_vnd_min FROM public.catalog_snapshot_food_items WHERE snapshot_id = (SELECT snapshot_id FROM pg_temp.food_snapshot_ids WHERE name = 'new') AND item_id = '00000000-0000-0000-0000-000000000402'::uuid), 60000::bigint, 'new snapshot records new minimum price');
SELECT throws_ok($$UPDATE public.catalog_snapshot_food_items SET price_vnd_min = 1 WHERE item_id = '00000000-0000-0000-0000-000000000402'::uuid$$,
  '42501', NULL, 'food snapshot item update is rejected');
SELECT throws_ok($$TRUNCATE public.catalog_snapshot_food_items$$,
  '42501', NULL, 'food snapshot item truncate is rejected');

SELECT * FROM finish();
ROLLBACK;
