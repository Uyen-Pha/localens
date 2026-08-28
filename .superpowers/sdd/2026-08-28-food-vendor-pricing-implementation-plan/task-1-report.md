# Task 1 report: strict food contracts and zero-food compatibility

## Status

Complete. Task 1 defines the food vendor, menu item, payment-selection, and
itinerary cost contracts without introducing sellable food data.

## Implementation

- Added `lib/domain/food/contracts.ts` with strict Zod schemas and exported
  types for service type, serving unit, payment mode, vendor, menu item, and
  food selection.
- Bilingual `title` and `description` labels reject empty text; all nested
  objects reject unknown fields; support statuses, enums, VND prices, and
  quantities are validated strictly.
- Price ranges reject `priceVndMin > priceVndMax`; negative and unsafe
  integers and fractional quantities are rejected. The default MVP policy
  rejects `included_in_quote`, while `createFoodSelectionSchema` permits it
  only when an explicit future quote policy opts in.
- Extended itinerary candidates/items/totals with food data and separated
  admission, food, travel, guide, pay-at-vendor, LocalLens-payable, and group
  cost fields. `groupCostVnd` is validated as the backward-compatible alias
  of `groupCostMaxVnd`.
- Added explicit `foodVendors: []`, `foodSelection: null`, and zero food-cost
  values to existing museum/non-food fixtures and generated non-food results.
- Re-exported food domain types through `lib/domain/data/contracts.ts`.

## TDD and verification

1. The initial focused test run failed because the new food contract module was
   absent, confirming the tests were red for the intended reason.
2. Focused verification:

   `pnpm test:run tests/unit/food/contracts.test.ts tests/unit/itinerary/contracts.test.ts`

   Result: 2 files passed, 32 tests passed.
3. Type verification:

   `pnpm typecheck`

   Result: exit code 0.
4. Regression verification:

   `pnpm test:run`

   Result: 57 files passed, 578 tests passed.
5. `git diff --check` reported no whitespace errors. Generated
   `tsconfig.tsbuildinfo` was removed and is not included.

## Concerns / follow-up

- The food contract currently duplicates the existing itinerary opening-hour
  schema locally to avoid a runtime import cycle; later food scheduling work
  should consolidate or deliberately keep those boundaries aligned.
- Food catalog persistence, filtering, pricing arithmetic, quote separation,
  and UI serialization remain future tasks; no external vendor facts were
  added here.

## Fix round 1: parent links and opening-hour parity

### Status

Complete. This round addresses the two contract-review findings without
changing deferred Task 10 fingerprint behavior.

### Changed code and tests

- `lib/domain/food/contracts.ts` now requires every menu item's `vendorId` to
  equal its containing vendor ID. Food opening exceptions validate real
  calendar dates, closed-window rules, exception-window overlap, unique
  exception dates, and vendor weekly-window overlap using the same interval
  semantics as the itinerary contract.
- `lib/domain/itinerary/contracts.ts` now requires every vendor's `placeId` to
  equal its containing place ID. Catalog validation rejects duplicate food
  vendor IDs and duplicate menu-item IDs across all places.
- `tests/unit/food/contracts.test.ts` covers mismatched menu parents, invalid
  dates, weekly overlap, duplicate dates, and exception-window overlap.
- `tests/unit/itinerary/contracts.test.ts` covers mismatched place parents and
  duplicate vendor/menu IDs across places.

### Verification

- `pnpm test:run tests/unit/food/contracts.test.ts tests/unit/itinerary/contracts.test.ts`
  — 2 files passed, 36 tests passed.
- `pnpm typecheck` — exit code 0.
- Generated `tsconfig.tsbuildinfo` was removed and is not included.

## Fix round 1: parent-link and opening-hour invariants

### Status

Complete. This fix round addresses the two review findings and leaves the
deferred Task 10/fingerprint concerns unchanged.

### Changed code and tests

- `lib/domain/food/contracts.ts` now enforces
  `menuItem.vendorId === vendor.id`, real calendar dates, weekly opening
  overlap, unique exception dates, and exception-window overlap. Its food
  opening-hour checks now match the itinerary contract's interval semantics,
  including overnight windows and equal-time rejection.
- `lib/domain/itinerary/contracts.ts` now enforces
  `vendor.placeId === place.id` and rejects duplicate food vendor IDs and
  menu-item IDs across the complete catalog snapshot.
- `tests/unit/food/contracts.test.ts` covers mismatched menu parents, invalid
  dates, weekly overlap, duplicate exception dates, and exception-window
  overlap.
- `tests/unit/itinerary/contracts.test.ts` covers mismatched place parents and
  duplicate vendor/menu IDs across places.

### Verification

- Initial red run: the focused suite reported 4 failures for the new
  parent-link/date/overlap cases, confirming each regression was reproduced.
- `pnpm test:run tests/unit/food/contracts.test.ts tests/unit/itinerary/contracts.test.ts`
  — 2 files passed, 36 tests passed.
- `pnpm typecheck` — exit code 0.
- `git diff --check` — no whitespace errors.
- `tsconfig.tsbuildinfo` was removed and is not included.
