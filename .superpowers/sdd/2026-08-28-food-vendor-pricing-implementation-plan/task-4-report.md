# Task 4 implementation report — food catalog adapter

## Current status

Complete for the TypeScript adapter boundary. `mapCatalogSnapshot(rows,
foodRows)` now accepts the exact `{ vendors, items }` bundle, maps published
food projections to domain `sellable` records, joins every vendor and menu item
against the same immutable snapshot and parent IDs, and preserves `[]` for
places without food. Venue mapping remains unchanged apart from the required
explicit empty food bundle at callers.

## TDD and verification evidence

RED:

- Added `catalog-adapter-food.test.ts` and updated venue adapter callers to
  pass `{ vendors: [], items: [] }`.
- The first focused run failed 5 food tests because the existing adapter
  ignored the food bundle and did not reject malformed food rows.

GREEN:

- `pnpm test:run tests/unit/infrastructure/catalog-adapter.test.ts tests/unit/infrastructure/catalog-adapter-food.test.ts` — 2 files, 18 tests passed.
- `pnpm test:run` — 58 files, 599 tests passed.
- `pnpm lint` — exit 0 with no errors or warnings.
- `pnpm typecheck` — exit 0.
- `git diff --check` — exit 0; no whitespace errors.

## Changed files

- `lib/infrastructure/supabase/catalog-adapter.ts` — strict food bundle,
  bilingual/support/hour/date/enum parsing, decimal-safe food prices through
  `Number.MAX_SAFE_INTEGER`, status mapping, duplicate checks, and
  snapshot/place/vendor joins.
- `tests/unit/infrastructure/catalog-adapter.test.ts` — explicit zero-food
  bundle at all existing call sites.
- `tests/unit/infrastructure/catalog-adapter-food.test.ts` — exact mapping,
  zero-food, malformed nested data, price safety/order, duplicate, orphan,
  cross-snapshot and cross-parent coverage.

## Self-review

- Projection objects and nested JSON are exact/strict; sparse arrays, unknown
  fields, null dense values, malformed dates/times, unsafe IDs and unsupported
  enums fail closed.
- Vendor rows require a matching `(snapshot_id, place_id)` venue. Item rows
  require a matching `(snapshot_id, place_id, vendor_id)` vendor; no orphan or
  cross-snapshot facts are dropped.
- Only DB `published` status maps to domain `sellable`; item `available` is
  copied verbatim. Food prices accept canonical unsigned decimal strings only,
  use `BigInt` for the bound check, and do not reuse the venue admission cap.
- `tsconfig.tsbuildinfo` was removed after typecheck. Pre-existing untracked
  `AGENTS.md`, `CLAUDE.md`, and `next-env.d.ts` were not touched or staged.

Commit follows after final diff review.
