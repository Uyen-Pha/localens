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
