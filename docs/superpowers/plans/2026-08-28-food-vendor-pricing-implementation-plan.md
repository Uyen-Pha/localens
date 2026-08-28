# Food Vendor and Meal Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an evidence-backed market → vendor/stall → menu-item model so LocalLens can propose concrete food stops, calculate a bounded group food estimate, schedule vendor hours, and keep food paid directly to vendors separate from Stripe Mock.

**Architecture:** Keep the existing venue (`places`) admission and opening-hours model unchanged, and attach normalized food vendors and menu items to a venue. Catalog facts are copied into immutable published snapshots; the deterministic engine filters and schedules only approved IDs, while AI ranks an allowlist and never invents a vendor or price. Itinerary, quote, and UI projections carry the food selection and separate `pay_at_vendor` totals from the LocalLens checkout amount.

**Tech Stack:** Next.js 16 App Router, TypeScript 6, React 19, Zod 4, Supabase/PostgreSQL with RLS and SQL migrations, Vitest 4, Playwright, Gemini ranking adapter, Stripe Test/Mock contracts, pnpm 11.

**Spec:** `docs/superpowers/specs/2026-08-28-food-vendor-pricing-design.md`

## Global Constraints

- Never invent a vendor, menu item, price, operating hour, dietary claim, accessibility claim, or source URL; unknown facts stay explicit and non-sellable.
- `places.priceVndPerPerson` means venue admission or the LocalLens planning component only; it is never a guessed meal price.
- All money is integer VND at domain and persistence boundaries; never use floating point for a price or total.
- A hard budget check uses `groupCostMaxVnd` (the upper bound of every documented food range), not the lower bound.
- `pay_at_vendor` food is displayed and budget-validated but excluded from `amount_vnd_minor`/Stripe Mock; the customer pays the vendor directly.
- Only `sellable` source facts mapped to the published catalog snapshot may reach the planner; `research_only` and `temporarily_closed` data is excluded.
- AI receives only already-filtered vendor/menu IDs and catalog facts; it cannot approve data, change price, confirm availability, collect money, or book a table.
- User-submitted venue/vendor facts are evidence for human review, never automatic publication.
- Existing plan, quote, and booking records remain immutable against their catalog/travel/FX snapshots.
- Preserve RLS, fixed lock order, append-only history, stale-revision protection, and the existing error-contract conventions.
- Keep the free stack: Next.js SEO routes, Supabase Free, Gemini free-tier adapter, and Stripe Test/Mock only; no online vendor ordering, payouts, delivery, inventory, or real charges.

---

## File Map

Create or modify only these focused boundaries:

- `lib/domain/food/contracts.ts`: strict food vendor/menu/selection schemas and payment literals.
- `lib/domain/itinerary/contracts.ts`: embed food candidates, selection, cost breakdown, and zero-food defaults in existing engine DTOs.
- `lib/domain/itinerary/food-cost.ts`: integer VND range arithmetic and LocalLens/pay-at-vendor split.
- `lib/domain/itinerary/food-filter.ts`: sellability, availability, support, hours, and price filtering for concrete food choices.
- `lib/domain/itinerary/candidate-filter.ts`, `scheduler.ts`, `validator.ts`, `repair.ts`, `engine.ts`: compose the food boundary with the existing venue itinerary engine.
- `lib/infrastructure/supabase/catalog-adapter.ts`: map published food snapshot projections with strict allowlists and safe bigint parsing.
- `lib/infrastructure/supabase/plan-revision-adapter.ts`, `lib/domain/data/contracts.ts`: persist food selections and their snapshot money safely.
- `lib/infrastructure/supabase/request-quote-adapter.ts`, `lib/infrastructure/supabase/checkout-contracts.ts`, relevant SQL: snapshot food lines and exclude pay-at-vendor money from checkout.
- `supabase/migrations/20260828120000_food_catalog_snapshots.sql`: base food tables, snapshot tables, projection views, snapshot-copy function replacement, RLS, and append-only guards.
- `supabase/tests/database/food_catalog_test.sql`: database constraints, RLS, snapshot immutability, and quote separation assertions.
- `scripts/source-approval.mjs`, `scripts/generate-supabase-seed.mjs`: validate and gate nested vendor/menu evidence without making current research-only data sellable.
- `data/sources/hcmc-places.v1.json`, `data/sources/source-hashes.v1.json`, `data/approvals/hcmc-catalog.v1.json`: add only human-verified nested facts and recompute hashes; no placeholder vendor becomes sellable.
- `lib/application/api/read-only-api.ts`, `lib/application/planner/demo-planner.ts`, `components/customer/itinerary-preview.tsx`, `components/customer/planner-flow.tsx`, `components/customer/custom-request-flow.tsx`, `lib/i18n/dictionaries.ts`: serialize and display exact food stop, quantity, range, payment responsibility, and quote totals in EN/VI.
- `app/[locale]/admin/catalog/page.tsx`, `components/admin/catalog-review-queue.tsx`, `lib/infrastructure/supabase/catalog-review-adapter.ts`: authenticated human review of vendor/menu evidence.
- `tests/unit/food/*`, `tests/unit/itinerary/*`, `tests/unit/infrastructure/*`, `tests/components/customer/*`, `tests/components/admin/*`, `tests/e2e/*`: TDD coverage for each contract and acceptance criterion.

## Implementation Tasks

### Task 1: Define strict food contracts and preserve zero-food compatibility

**Files:**
- Create: `lib/domain/food/contracts.ts`
- Modify: `lib/domain/itinerary/contracts.ts`
- Modify: `lib/domain/data/contracts.ts`
- Test: `tests/unit/food/contracts.test.ts`, `tests/unit/itinerary/contracts.test.ts`, `tests/fixtures/itinerary/catalog.v1.ts`

**Interfaces:**
- Produce `FoodServiceType = "stall" | "shop" | "food_court" | "street_vendor"`, `ServingUnit = "portion" | "bowl" | "piece" | "drink" | "shared_set"`, `FoodPaymentMode = "pay_at_vendor" | "included_in_quote"`.
- Produce `FoodVendorCandidate` with `id`, `placeId`, `slug`, `title`, `description`, `locationNote`, `serviceType`, `capacityNote`, `dietarySupport`, `mobilitySupport`, `openingHours`, `openingExceptions`, `status`, and `menuItems`.
- Produce `FoodMenuItemCandidate` with `id`, `vendorId`, `slug`, `title`, `description`, `servingUnit`, integer `priceVndMin`/`priceVndMax`, `portionDescription`, `dietarySupport`, `allergens`, `available`, `status`, and `verifiedAt`.
- Produce `FoodSelection = { vendorId; menuItemId; quantity; priceVndMin; priceVndMax; paymentMode: FoodPaymentMode; activity: string }`; `quantity` is a whole number for the group and `shared_set` is never fractional.
- Extend `PlaceCandidate` with `foodVendors: readonly FoodVendorCandidate[]`; extend `ItineraryItem` with `foodSelection: FoodSelection | null`, `foodCostMinVnd`, `foodCostMaxVnd`, `payAtVendorMinVnd`, `payAtVendorMaxVnd`, and `customerPayableVnd`; define totals explicitly as `admissionCostVnd`, `foodCostMinVnd`, `foodCostMaxVnd`, `travelCostVnd`, `guideCostVnd`, `payAtVendorMinVnd`, `payAtVendorMaxVnd`, `customerPayableVnd`, `groupCostMinVnd`, `groupCostMaxVnd`, and backward-compatible `groupCostVnd = groupCostMaxVnd`, plus the existing duration/score fields.
- Add Zod schemas that reject unknown fields, negative/unsafe integers, empty bilingual labels, `priceVndMin > priceVndMax`, non-whole quantities, and `included_in_quote` unless explicitly enabled by a future quote policy.

- [ ] **Step 1: Write failing contract tests** for exact vendor/menu fields, price-range ordering, quantity `0/1`, fractional quantity rejection, unknown support rejection, and a museum candidate with `foodVendors: []` plus all food costs equal to zero.
- [ ] **Step 2: Run `pnpm test:run tests/unit/food/contracts.test.ts tests/unit/itinerary/contracts.test.ts`** and confirm the new symbols/fields fail before implementation.
- [ ] **Step 3: Implement the schemas and type exports** in the three contract files, updating every existing fixture object to supply empty arrays/null selection/zero food costs rather than optional `any` fields.
- [ ] **Step 4: Run the two focused test files and `pnpm typecheck`**; confirm old non-food itinerary assertions still pass and malformed food records fail closed.
- [ ] **Step 5: Commit** with `git add lib/domain/food lib/domain/itinerary/contracts.ts lib/domain/data/contracts.ts tests/unit/food tests/unit/itinerary/contracts.test.ts tests/fixtures/itinerary/catalog.v1.ts && git commit -m "feat: define food vendor itinerary contracts"`.

### Task 2: Add nested source-manifest validation and seed gating

**Files:**
- Modify: `scripts/source-approval.mjs`
- Modify: `scripts/generate-supabase-seed.mjs`
- Modify: `data/sources/hcmc-places.v1.json` only for verified nested facts supplied by an authorized reviewer
- Modify: `data/sources/source-hashes.v1.json`, `data/approvals/hcmc-catalog.v1.json` when the manifest changes
- Test: `tests/unit/supabase/source-approval.test.ts`, `tests/unit/supabase/seed-readiness.test.ts`

**Interfaces:**
- Produce `checkFoodVendor(place, vendor, index, registry, errors)` and `checkFoodMenuItem(vendor, item, index, registry, errors)` inside the existing source gate.
- Require every vendor/menu source URL to use the existing exact HTTPS allowlist; require bilingual names, explicit `research_only`/`sellable` status, verified date, hours, support statuses, availability, and integer price bounds.
- Require a `sellable` food place to contain at least one `sellable` vendor with at least one `sellable`, available menu item with known price; otherwise keep the place research-only and fail runtime seed readiness with a named issue.

- [ ] **Step 1: Add failing fixture mutations** that inject an unknown vendor URL, a missing English title, `priceVndMin > priceVndMax`, a stale/unknown price, and a sellable market with no sellable menu item; assert the checker names the nested path and never treats unknown price as zero.
- [ ] **Step 2: Run `pnpm test:run tests/unit/supabase/source-approval.test.ts tests/unit/supabase/seed-readiness.test.ts`** and confirm each new mutation fails for the intended reason.
- [ ] **Step 3: Implement nested validation and readiness checks** while defaulting absent `foodVendors` to `[]` for non-food places; preserve current 4/30/8 counts and the existing source-hash/approval-date rules.
- [ ] **Step 4: Run `pnpm test:run tests/unit/supabase/source-approval.test.ts tests/unit/supabase/seed-readiness.test.ts`** and `node scripts/source-approval.mjs`; confirm the current catalog remains draft/research-only where vendor facts are not approved.
- [ ] **Step 5: Commit** with `git add scripts/source-approval.mjs scripts/generate-supabase-seed.mjs tests/unit/supabase/source-approval.test.ts tests/unit/supabase/seed-readiness.test.ts && git commit -m "feat: gate food catalog evidence"`.

### Task 3: Create canonical and immutable PostgreSQL food catalog snapshots

**Files:**
- Create: `supabase/migrations/20260828120000_food_catalog_snapshots.sql`
- Test: `supabase/tests/database/food_catalog_test.sql`, `tests/unit/supabase/artifacts.test.ts`, `tests/unit/supabase/rls-matrix.test.ts`
- Modify: `scripts/check-supabase-artifacts.mjs`, `scripts/write-generated-db-types.mjs` only when the new schema requires generated-type assertions

**Interfaces:**
- Create base `public.food_vendors`, translation, support, opening-hour, and exception tables linked to `public.places`; create `public.food_items`, translations, supports, and availability/price evidence columns linked to a vendor.
- Use existing `public.place_status` mapping (`sellable` source → `published`, `research_only` → `draft`, `temporarily_closed` → `archived`) instead of adding an incompatible enum; enforce `price_vnd_min/max BETWEEN 0 AND 9007199254740991`, `min <= max`, valid serving units, exact source/verification fields, and no empty labels.
- Create matching `catalog_snapshot_food_vendors`, `catalog_snapshot_food_vendor_*`, `catalog_snapshot_food_items`, and child snapshot tables with `(snapshot_id, parent_id)` foreign keys. Expose both `catalog_snapshot_food_vendors_v` and `catalog_snapshot_food_items_v` as published-only projections with decimal-safe money strings.
- Replace `private.create_catalog_snapshot()` in this migration with a fixed lock order that locks venue tables, then food parent/child tables, copies only published/complete facts, and publishes one immutable snapshot; each projection carries the snapshot and parent IDs needed to reject cross-snapshot selections.
- Force RLS on every new base/snapshot table; grant writes only to the existing catalog RPC owner and reads only through published views. Add append-only triggers to snapshot rows and deny anonymous/authenticated direct writes.

- [ ] **Step 1: Write SQL tests** for invalid price bounds, invalid status/support values, direct anon/authenticated write denial, catalog-owner-only writes, snapshot row immutability, vendor/item parent foreign keys, and a new snapshot retaining old prices after a base update.
- [ ] **Step 2: Run `pnpm db:reset` then `pnpm db:test`** and confirm the new pgTAP tests fail because the tables/views do not exist.
- [ ] **Step 3: Implement the migration** with the exact columns and fixed lock order above; update artifact allowlists so generated SQL/type checks know every table, view, policy, trigger, and grant.
- [ ] **Step 4: Run `pnpm db:lint`, `pnpm db:test`, `pnpm db:static`, and `pnpm db:types:check`**; confirm RLS, append-only, snapshot-copy, and projection checks pass without weakening existing policies.
- [ ] **Step 5: Commit** with `git add supabase/migrations/20260828120000_food_catalog_snapshots.sql supabase/tests/database/food_catalog_test.sql scripts/check-supabase-artifacts.mjs scripts/write-generated-db-types.mjs tests/unit/supabase/artifacts.test.ts tests/unit/supabase/rls-matrix.test.ts && git commit -m "feat: add immutable food catalog snapshots"`.

### Task 4: Map food snapshot projections into the engine catalog

**Files:**
- Modify: `lib/infrastructure/supabase/catalog-adapter.ts`
- Test: `tests/unit/infrastructure/catalog-adapter.test.ts`, `tests/unit/infrastructure/catalog-adapter-food.test.ts`

**Interfaces:**
- Produce `mapCatalogSnapshot(rows: unknown, foodRows: unknown): Result<CatalogSnapshot, DataAdapterError>` that joins each food row by `snapshot_id`, `place_id`, and `vendor_id` and returns strict `CatalogSnapshot.places[].foodVendors`; callers pass `[]` when the published snapshot has no food rows.
- Accept only the named view fields; parse bigint prices with the existing safe-integer helper; reject duplicate snapshot IDs, cross-snapshot parents, duplicate vendor/menu IDs, unknown enum values, malformed hours, and unrecognized keys.

- [ ] **Step 1: Write failing adapter tests** for one vendor with one exact-price item, one ranged item, empty food rows, cross-snapshot mismatch, unsafe price, unknown support, and an extra projection field.
- [ ] **Step 2: Run `pnpm test:run tests/unit/infrastructure/catalog-adapter.test.ts tests/unit/infrastructure/catalog-adapter-food.test.ts`** and verify failures identify the missing food projection mapping.
- [ ] **Step 3: Implement strict food row parsing** and preserve existing place-row mapping; make a zero-food place map to `foodVendors: []` rather than `undefined`.
- [ ] **Step 4: Run the focused adapter tests plus `pnpm typecheck`** and confirm every mapped price remains safe integer VND.
- [ ] **Step 5: Commit** with `git add lib/infrastructure/supabase/catalog-adapter.ts tests/unit/infrastructure/catalog-adapter.test.ts tests/unit/infrastructure/catalog-adapter-food.test.ts && git commit -m "feat: map food catalog snapshots"`.

### Task 5: Implement integer food cost breakdown and payment responsibility

**Files:**
- Create: `lib/domain/itinerary/food-cost.ts`
- Modify: `lib/domain/itinerary/contracts.ts`, `lib/domain/itinerary/money.ts`
- Test: `tests/unit/itinerary/food-cost.test.ts`, `tests/unit/itinerary/money.test.ts`, `tests/unit/itinerary/invariants.test.ts`

**Interfaces:**
- Produce `calculateFoodSelectionCost(selection: FoodSelection, menuItem: FoodMenuItemCandidate, partySize: number): Result<{ minVnd: number; maxVnd: number; payAtVendorMinVnd: number; payAtVendorMaxVnd: number; customerPayableVnd: number }, CostError>`.
- Produce `calculateItineraryCostBreakdown(items, travelCostVnd, guideCostVnd): { admissionCostVnd; foodCostMinVnd; foodCostMaxVnd; travelCostVnd; guideCostVnd; groupCostMinVnd; groupCostMaxVnd; payAtVendorMinVnd; payAtVendorMaxVnd; customerPayableVnd }`; set `groupCostVnd = groupCostMaxVnd` for backward compatibility.
- `quantity` multiplies the selected item’s snapshot price bounds; `pay_at_vendor` contributes to the displayed estimate and hard budget but contributes `0` to `customerPayableVnd`; `included_in_quote` is rejected by the MVP policy.

- [ ] **Step 1: Write failing tests** for exact price, ranged price, group quantity, shared-set whole-unit behavior, zero selection, overflow above `Number.MAX_SAFE_INTEGER`, and a budget that fits the lower price but fails the upper price.
- [ ] **Step 2: Run `pnpm test:run tests/unit/itinerary/food-cost.test.ts tests/unit/itinerary/money.test.ts tests/unit/itinerary/invariants.test.ts`** and confirm arithmetic helpers are absent/failing.
- [ ] **Step 3: Implement integer-only multiplication/summation** with explicit safe bounds and the payment split; never coerce unknown price to zero.
- [ ] **Step 4: Run focused tests and `pnpm typecheck`**; confirm museum/heritage items with `foodSelection: null` retain their admission totals exactly.
- [ ] **Step 5: Commit** with `git add lib/domain/itinerary/food-cost.ts lib/domain/itinerary/contracts.ts lib/domain/itinerary/money.ts tests/unit/itinerary/food-cost.test.ts tests/unit/itinerary/money.test.ts tests/unit/itinerary/invariants.test.ts && git commit -m "feat: calculate bounded food costs"`.

### Task 6: Filter concrete vendors and menu items before ranking

**Files:**
- Create: `lib/domain/itinerary/food-filter.ts`
- Modify: `lib/domain/itinerary/candidate-filter.ts`
- Test: `tests/unit/itinerary/food-filter.test.ts`, `tests/unit/itinerary/candidate-filter.test.ts`

**Interfaces:**
- Produce `filterFoodVendors(place, request, visitDate, preferredInterval): FoodVendorCandidate[]` and `chooseFoodSelection(vendor, request, remainingBudgetVnd): Result<FoodSelection, FoodSelectionError>`.
- Require parent place and child vendor/item to be sellable in the same snapshot, item `available === true`, known price, required dietary/mobility statuses `supported` (never `unknown`), vendor/item hours covering the whole activity interval, and upper-bound food cost within the remaining budget.
- Return structured no-feasible reasons (`NO_SELLABLE_VENDOR`, `NO_SELLABLE_MENU_ITEM`, `UNKNOWN_PRICE`, `SUPPORT_UNKNOWN`, `VENDOR_CLOSED`, `FOOD_OVER_BUDGET`) for UI/AI fallback.

- [ ] **Step 1: Write failing tests** for a market with free admission and one exact vendor/menu result, unknown dietary support exclusion, unavailable item exclusion, vendor closed while market open, and ranged-price upper-bound rejection.
- [ ] **Step 2: Run `pnpm test:run tests/unit/itinerary/food-filter.test.ts tests/unit/itinerary/candidate-filter.test.ts`** and confirm no concrete food selection is returned yet.
- [ ] **Step 3: Implement the filter and selector** using the existing opening-hours utilities and `FoodSelection` snapshot prices; keep generic markets eligible only when a concrete menu selection exists for a food-priority request.
- [ ] **Step 4: Run focused tests plus `pnpm typecheck`**; confirm normal museum/history candidate filtering is unchanged.
- [ ] **Step 5: Commit** with `git add lib/domain/itinerary/food-filter.ts lib/domain/itinerary/candidate-filter.ts tests/unit/itinerary/food-filter.test.ts tests/unit/itinerary/candidate-filter.test.ts && git commit -m "feat: filter approved food stops"`.

### Task 7: Schedule, validate, and repair food stops with revision locks

**Files:**
- Modify: `lib/domain/itinerary/scheduler.ts`, `lib/domain/itinerary/validator.ts`, `lib/domain/itinerary/repair.ts`, `lib/domain/itinerary/engine.ts`
- Test: `tests/unit/itinerary/scheduler.test.ts`, `tests/unit/itinerary/validator.test.ts`, `tests/unit/itinerary/repair.test.ts`, `tests/unit/itinerary/engine.test.ts`

**Interfaces:**
- Extend scheduling input with an optional `foodSelection`; schedule its activity interval against the vendor’s hours, not only the parent market’s hours.
- Recompute all item and total costs from the catalog snapshot in `validator.ts`; reject stale/mismatched vendor/menu IDs, unknown support, food upper-bound budget overflow, and an activity interval outside vendor exceptions.
- `repairItinerary(baseResult, feedback, lockedItemIds)` may replace/remove only unlocked food selections; a locked item preserves vendor ID, menu ID, quantity, snapshot price bounds, and payment mode. Return `NO_FEASIBLE_ITINERARY` when no verified choice remains.

- [ ] **Step 1: Add failing scheduler/validator/repair tests** for vendor-hours rejection despite an open parent market, upper-bound budget rejection, concrete food timeline output, unlocked replacement, locked preservation, and no-feasible error.
- [ ] **Step 2: Run `pnpm test:run tests/unit/itinerary/scheduler.test.ts tests/unit/itinerary/validator.test.ts tests/unit/itinerary/repair.test.ts tests/unit/itinerary/engine.test.ts`** and observe failures.
- [ ] **Step 3: Implement food-aware scheduling and authoritative validation** while leaving the existing 10-minute transition/travel behavior and non-food path intact.
- [ ] **Step 4: Run the focused suite and `pnpm test:run tests/unit/itinerary`**; confirm all existing museum/heritage fixtures still have zero food cost and deterministic chronology.
- [ ] **Step 5: Commit** with `git add lib/domain/itinerary/scheduler.ts lib/domain/itinerary/validator.ts lib/domain/itinerary/repair.ts lib/domain/itinerary/engine.ts tests/unit/itinerary && git commit -m "feat: schedule and validate food stops"`.

### Task 8: Enforce allowlisted food IDs in AI recommendation and refinement

**Files:**
- Modify: `lib/application/itinerary/recommend.ts`
- Modify: `supabase/functions/_shared/recommend-itinerary.ts`, `supabase/functions/_shared/refine-itinerary.ts`
- Test: `tests/unit/itinerary/recommend.test.ts`, `tests/unit/supabase/recommend-itinerary-handler.test.ts`, `tests/unit/supabase/refine-itinerary-handler.test.ts`

**Interfaces:**
- The ranking port receives `readonly allowedVendorIds` and `readonly allowedMenuItemIds` alongside the existing place allowlist.
- AI output parses into `FoodSelection` only after exact ID membership, snapshot-price equality, whole quantity, and payment-policy checks; an unknown ID, invented name/price, malformed quantity, or `included_in_quote` output causes deterministic fallback.
- Deterministic fallback uses the already filtered vendor/menu candidates and returns a visible `NO_FEASIBLE_ITINERARY` warning when the list is empty; no raw PII/free-form dietary text is sent to the provider.

- [ ] **Step 1: Add failing handler tests** for an unknown vendor ID, menu from another vendor, changed price, fractional quantity, AI timeout/quota, and deterministic fallback preserving the same allowlist.
- [ ] **Step 2: Run `pnpm test:run tests/unit/itinerary/recommend.test.ts tests/unit/supabase/recommend-itinerary-handler.test.ts tests/unit/supabase/refine-itinerary-handler.test.ts`** and confirm malformed AI output is rejected.
- [ ] **Step 3: Implement the allowlist prompt/parse boundary and fallback**; keep AI as a recommender only and preserve `rankingSource` (`ai` or `deterministic`).
- [ ] **Step 4: Run focused tests plus `pnpm typecheck`** and inspect the serialized provider payload in tests to confirm no raw special-needs text or unapproved IDs leave the backend.
- [ ] **Step 5: Commit** with `git add lib/application/itinerary/recommend.ts supabase/functions/_shared/recommend-itinerary.ts supabase/functions/_shared/refine-itinerary.ts tests/unit/itinerary/recommend.test.ts tests/unit/supabase/recommend-itinerary-handler.test.ts tests/unit/supabase/refine-itinerary-handler.test.ts && git commit -m "feat: constrain AI food recommendations"`.

### Task 9: Persist food selections in immutable revisions and quotes

**Files:**
- Modify: `lib/domain/data/contracts.ts`, `lib/infrastructure/supabase/plan-revision-adapter.ts`, `lib/infrastructure/supabase/request-quote-adapter.ts`, `lib/infrastructure/supabase/checkout-contracts.ts`
- Create: `supabase/migrations/20260828123000_food_plan_quote_snapshots.sql`
- Test: `tests/unit/infrastructure/plan-revision-adapter.test.ts`, `tests/unit/infrastructure/request-quote-adapter.test.ts`, `tests/unit/infrastructure/checkout-contracts.test.ts`, `supabase/tests/database/requests_quotes_test.sql`, `supabase/tests/database/trip_plan_revisions_test.sql`

**Interfaces:**
- Extend `PlanRevisionItem` with `foodSelectionJson` (strictly validated serialized `FoodSelection`) and decimal-safe `foodCostMinVnd`, `foodCostMaxVnd`, `payAtVendorMinVnd`, `payAtVendorMaxVnd`, and `customerPayableVnd` strings; the RPC cross-checks result JSON against these columns.
- Add quote snapshot columns `food_snapshot jsonb`, `food_estimate_min_vnd`, `food_estimate_max_vnd`, `pay_at_vendor_min_vnd`, `pay_at_vendor_max_vnd`; retain `amount_vnd_minor` as the LocalLens-payable amount used by checkout.
- The quote RPC derives food snapshot facts from the selected immutable revision, rejects unknown/changed IDs and `included_in_quote`, and stores vendor/menu names, quantity, price bounds, payment mode, and evidence date. Checkout/webhook validates only LocalLens payable amount/currency.

- [ ] **Step 1: Write failing adapter/SQL tests** for food item persistence, decimal-safe strings, quote snapshot immutability, pay-at-vendor estimate exclusion from Stripe amount, and an unchanged museum quote.
- [ ] **Step 2: Run focused Vitest and pgTAP commands** (`pnpm test:run tests/unit/infrastructure/plan-revision-adapter.test.ts tests/unit/infrastructure/request-quote-adapter.test.ts tests/unit/infrastructure/checkout-contracts.test.ts`; `pnpm db:test`) and confirm the new fields are rejected/missing.
- [ ] **Step 3: Implement the DTO projection, the new SQL columns/constraints and guarded RPC replacements in `20260828123000_food_plan_quote_snapshots.sql`, the quote snapshot, and checkout amount calculation** without accepting client-provided commercial facts over the revision snapshot.
- [ ] **Step 4: Run focused tests, `pnpm db:test`, `pnpm db:lint`, and `pnpm typecheck`**; assert Stripe line items never include `payAtVendor*` totals.
- [ ] **Step 5: Commit** with `git add lib/domain/data/contracts.ts lib/infrastructure/supabase/plan-revision-adapter.ts lib/infrastructure/supabase/request-quote-adapter.ts lib/infrastructure/supabase/checkout-contracts.ts supabase/migrations/20260828123000_food_plan_quote_snapshots.sql supabase/tests/database/requests_quotes_test.sql supabase/tests/database/trip_plan_revisions_test.sql tests/unit/infrastructure && git commit -m "feat: snapshot food costs in plans and quotes"`.

### Task 10: Render exact food stops and separated totals in customer flows

**Files:**
- Modify: `lib/application/api/read-only-api.ts`, `lib/application/planner/demo-planner.ts`, `components/customer/itinerary-preview.tsx`, `components/customer/planner-flow.tsx`, `components/customer/custom-request-flow.tsx`, `lib/i18n/dictionaries.ts`
- Test: `tests/components/customer/itinerary-preview.test.tsx`, `tests/components/customer/planner-flow.test.tsx`, `tests/components/customer/custom-request-flow.test.tsx`, `tests/unit/i18n/dictionaries.test.ts`

**Interfaces:**
- Extend `ItineraryPreviewDto` and the existing adapter/demo-planner serialization with `foodSelection` details: market/venue title, vendor title, location note, menu title, serving unit, group quantity, unit/range price, activity, dietary/allergen caveat, and `paymentMode`; replace the current generic “District 1 Street Food” demo stop with an explicit `foodSelection: null`/“Food not selected” state until a real approved vendor fixture exists.
- Display an explicit `Food not selected` state for non-food stops; never display a generic market admission as a meal.
- Render totals as venue/admission, food estimate min–max, travel, guide, LocalLens payable, and `Pay directly at vendors`; preserve the proposal-only and Stripe Mock disclosures.
- Add EN/VI dictionary keys for “vendor/stall”, “menu item”, “quantity”, “estimated range”, “pay at vendor”, “food cost unavailable”, and vendor/accessibility warnings.

- [ ] **Step 1: Add failing component tests** asserting exact stall/menu/quantity/range/payment labels, food-not-selected state, upper-bound budget warning, and both locales.
- [ ] **Step 2: Run `pnpm test:run tests/components/customer/itinerary-preview.test.tsx tests/components/customer/planner-flow.test.tsx tests/components/customer/custom-request-flow.test.tsx tests/unit/i18n/dictionaries.test.ts`** and confirm the UI does not yet expose food facts.
- [ ] **Step 3: Implement the DTO wiring and accessible cards/totals** with semantic lists, visible warnings, and no “included” wording for `pay_at_vendor`.
- [ ] **Step 4: Run focused component tests, `pnpm lint`, and `pnpm typecheck`**; confirm keyboard focus/error behavior still works after adding food fields and the demo never presents a generic market as a meal.
- [ ] **Step 5: Commit** with `git add components/customer lib/i18n/dictionaries.ts tests/components/customer tests/unit/i18n/dictionaries.test.ts && git commit -m "feat: show concrete food stops to customers"`.

### Task 11: Add authenticated admin review for vendor/menu evidence

**Files:**
- Create: `app/[locale]/admin/catalog/page.tsx`
- Create: `components/admin/catalog-review-queue.tsx`
- Create: `lib/infrastructure/supabase/catalog-review-adapter.ts`
- Test: `tests/components/admin/catalog-review-queue.test.tsx`, `tests/unit/infrastructure/catalog-review-adapter.test.ts`, `supabase/tests/database/food_catalog_test.sql`

**Interfaces:**
- Produce `mapAdminFoodReviewRow(row)` and `reviewFoodCatalogItem(input)`; the adapter accepts only exact fields and the SQL RPC requires an authenticated `admin` role.
- The review queue shows source URL/attribution, bilingual name, location note, hours/exceptions, price evidence, availability, dietary/allergen and mobility evidence, then offers only `research_only → sellable` after every checklist item is explicitly confirmed.
- A rejected/unknown field keeps the row research-only and records an audit event; the UI never mutates source JSON directly and never lets a customer self-approve.

- [ ] **Step 1: Write failing adapter/component/SQL tests** for non-admin denial, missing evidence, successful sellable transition, rejection note, and audit history.
- [ ] **Step 2: Run `pnpm test:run tests/unit/infrastructure/catalog-review-adapter.test.ts tests/components/admin/catalog-review-queue.test.tsx` and `pnpm db:test`**; confirm the review surface is absent/denied.
- [ ] **Step 3: Implement the server page, review queue, strict adapter, guarded RPC, and bilingual copy**; make the page show “not verified” rather than infer accessibility from missing information.
- [ ] **Step 4: Run focused tests plus `pnpm lint`, `pnpm typecheck`, and `pnpm db:lint`**; confirm ordinary customers cannot read the admin queue and no review action publishes incomplete facts.
- [ ] **Step 5: Commit** with `git add app/[locale]/admin/catalog components/admin lib/infrastructure/supabase/catalog-review-adapter.ts tests/components/admin tests/unit/infrastructure/catalog-review-adapter.test.ts supabase/tests/database/food_catalog_test.sql && git commit -m "feat: add human food catalog review"`.

### Task 12: Exercise acceptance paths and document operational limits

**Files:**
- Create: `tests/e2e/food-itinerary.spec.ts`
- Modify: `README.md`, `docs/superpowers/specs/2026-08-28-food-vendor-pricing-design.md` only for implementation notes and verified behavior
- Test: all focused unit/component/SQL suites and the repository quality gate

**Interfaces:**
- The browser flow must cover: free market admission `0 VND` → named vendor → named menu item → group quantity → ranged food estimate → “pay at vendor” → LocalLens-only Stripe Mock amount.
- The negative path must show no feasible plan for a market lacking an approved vendor/menu item, and the refinement path must preserve locked food selections while replacing unlocked ones.

- [ ] **Step 1: Add an E2E fixture backed by a test snapshot** with one approved market/vendor/menu and one research-only market; assert exact timeline and totals in EN and VI.
- [ ] **Step 2: Run `pnpm test:e2e -- tests/e2e/food-itinerary.spec.ts`** and confirm the acceptance flow fails before the complete implementation is wired.
- [ ] **Step 3: Implement only the test harness/documentation needed** to exercise the existing routes; document that vendor food is not ordered/reserved/collected by LocalLens in the MVP.
- [ ] **Step 4: Run the full gate `pnpm check`, then `pnpm db:verify` when Docker/Supabase local runtime is available**; record any runtime gate as blocked rather than claiming static scaffolding is runtime verification.
- [ ] **Step 5: Commit** with `git add tests/e2e README.md docs/superpowers/specs/2026-08-28-food-vendor-pricing-design.md && git commit -m "test: verify food itinerary acceptance paths"`.

## Self-Review Checklist

- [ ] Every requirement in the approved spec has a task: normalized vendors/menu items, evidence/approval, snapshots/RLS, cost range, vendor hours, AI allowlist, refinement locks, quote snapshot, Stripe separation, customer UI, admin review, and acceptance tests.
- [ ] No task seeds the example vendor or price from the spec; current user-provided market facts remain venue evidence until a human supplies and approves exact vendor/menu evidence.
- [ ] All interfaces use the same names: `FoodSelection`, `foodVendors`, `foodCostMinVnd`, `foodCostMaxVnd`, `payAtVendorMinVnd`, `payAtVendorMaxVnd`, `customerPayableVnd`, and `groupCostVnd = groupCostMaxVnd`.
- [ ] All database/adapter boundaries retain snapshot IDs, safe decimal strings, RLS, append-only history, and current non-food behavior.
- [ ] Placeholder scan, `git diff --check`, focused tests, and the final quality gate are required before claiming implementation complete.
