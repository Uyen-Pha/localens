# Task 9 report — food plan and quote snapshots

## Status

`DONE_WITH_CONCERNS`: Task 9 implementation and static/unit verification are complete. PostgreSQL runtime verification is unavailable on this workstation.

## Commit and files

Commit subject: `feat: snapshot food costs in plans and quotes`

Changed files:

- `lib/domain/data/contracts.ts`
- `lib/infrastructure/supabase/checkout-contracts.ts`
- `lib/infrastructure/supabase/plan-revision-adapter.ts`
- `lib/infrastructure/supabase/request-quote-adapter.ts`
- `supabase/migrations/20260828123000_food_plan_quote_snapshots.sql`
- `supabase/tests/database/requests_quotes_test.sql`
- `supabase/tests/database/trip_plan_revisions_test.sql`
- `tests/unit/infrastructure/checkout-contracts.test.ts`
- `tests/unit/infrastructure/plan-revision-adapter.test.ts`
- `tests/unit/infrastructure/request-quote-adapter.test.ts`
- `docs/security/data-access-matrix.json`
- `docs/security/data-access-matrix.md`
- `docs/security/grants-manifest.json`

The security artifacts were regenerated because the additive migration introduces guarded snapshot policies, grants, and the internal validator function.

## TDD evidence

RED was captured before production changes:

- `pnpm test:run tests/unit/infrastructure/plan-revision-adapter.test.ts -t "serializes a canonical food selection"` failed because the adapter projection had no food selection/cost fields.
- `pnpm test:run tests/unit/infrastructure/request-quote-adapter.test.ts -t "maps exact customer/admin request projections"` failed with `UNKNOWN_FIELD row.food_snapshot` because the quote projection did not yet accept the snapshot columns.

GREEN after implementation:

- Focused: `pnpm test:run tests/unit/infrastructure/plan-revision-adapter.test.ts tests/unit/infrastructure/request-quote-adapter.test.ts tests/unit/infrastructure/checkout-contracts.test.ts` — 3 files, 34 tests passed.
- Full Vitest: `pnpm test:run` — 60 files, 689 tests passed.
- Static SQL/security artifacts: `pnpm db:static` — 17 migrations checked successfully.
- `pnpm typecheck` passed.
- `pnpm lint` passed with zero warnings.

## Runtime and self-review

Both required runtime commands were attempted once and are blocked by the same environment condition:

```text
SUPABASE_CLI_NOT_FOUND: project-local Supabase CLI is required; install the pinned dev dependency only after a local container runtime is available
```

This exact blocker was returned by both `pnpm db:test` and `pnpm db:lint`. Therefore pgTAP, PostgreSQL parser/execution, RLS, locking/CAS, and concurrent quote/revision behavior remain unverified here.

The migration keeps the existing immutable guards, snapshot binding, auth/RLS owners and grants, stale-revision CAS, idempotency, and museum quote path. Food selections are validated from the canonical Task 8 shape, only `pay_at_vendor` is accepted, snapshot quote facts are derived from the immutable revision and catalog snapshot, and Stripe checkout continues to consume only the server-owned LocalLens payable amount/currency. Decimal arithmetic uses PostgreSQL numeric and JavaScript BigInt checks with fail-closed bounds.

Concern for the runtime gate: run `pnpm db:test` and `pnpm db:lint` with the pinned Supabase CLI and a local container runtime before production readiness is claimed.

## Fix round 1/5 — unavailable catalog items and fail-closed quote totals

### Status

`DONE_WITH_CONCERNS`: the two reported SQL root causes are fixed and regression fixtures/static checks pass. PostgreSQL/pgTAP execution remains blocked by the workstation runtime gate.

### Root causes fixed

- The revision validator and quote snapshot source now require both `status = 'published'` and `available IS TRUE` for food items.
- Quote validation now distinguishes wholly absent legacy food material from partial food material. Any food total key activates an exact five-key guard; every required value must be a non-null JSON number, an integer decimal string, and within the safe bound before casts. Food totals, source totals, and the LocalLens payable amount use explicit `IS DISTINCT FROM` checks.
- Regression fixtures exercise valid food persistence, unavailable/unknown/cross-vendor/changed-price/included-mode/malformed-selection rejection, every missing food total key, null/string/mismatched totals, valid immutable quote snapshots, pay-at-vendor estimate separation, included-mode quote rejection, and quote snapshot immutability.

### TDD evidence

RED was captured before the SQL production fix:

```text
pnpm test:run tests/unit/infrastructure/plan-revision-adapter.test.ts tests/unit/infrastructure/request-quote-adapter.test.ts -t "SQL contract|migration contract"
Test Files  2 failed (2)
Tests  2 failed | 12 passed | 12 skipped (26)
Failures: missing /food_items\.available\s+IS\s+TRUE/ and /items\.available\s+IS\s+TRUE/ assertions
```

GREEN after the migration and regression fixtures:

- `pnpm test:run tests/unit/infrastructure/plan-revision-adapter.test.ts tests/unit/infrastructure/request-quote-adapter.test.ts` — 2 files, 27/27 passed.
- `pnpm test:run` — 60 files, 690/690 tests passed.
- `pnpm db:static` — 17 migration files checked successfully.
- `pnpm typecheck` — passed (`tsc --noEmit`).
- `pnpm lint` — passed (`eslint . --max-warnings=0`).
- `git diff --check` — passed; Git emitted only the existing LF-to-CRLF working-copy warnings.
- Exact pgTAP fixture assertion plans are mechanically checked as `112` (`trip_plan_revisions_test.sql`) and `164` (`requests_quotes_test.sql`). They are not runtime results.

### Runtime blocker

`pnpm db:test` was run once in this fix round and returned exactly:

```text
$ node scripts/supabase-local.mjs test db --local
SUPABASE_CLI_NOT_FOUND: project-local Supabase CLI is required; install the pinned dev dependency only after a local container runtime is available
[ELIFECYCLE] Command failed with exit code 2.
```

`pnpm db:lint` was also attempted and returned the same `SUPABASE_CLI_NOT_FOUND` line and exit code `2`. Therefore pgTAP execution, PostgreSQL parsing, RLS, locking/CAS, and concurrency behavior remain unverified.

### Fix-round files and commit

- `supabase/migrations/20260828123000_food_plan_quote_snapshots.sql`
- `supabase/tests/database/requests_quotes_test.sql`
- `supabase/tests/database/trip_plan_revisions_test.sql`
- `tests/unit/infrastructure/plan-revision-adapter.test.ts`
- `tests/unit/infrastructure/request-quote-adapter.test.ts`
- Fix commit: `edb66cf fix: harden food snapshot validation`. The report append is committed in the follow-up report commit.

### Self-review and concerns

The migration remains additive and keeps the existing SECURITY DEFINER owners, empty `search_path`, RLS/grants, append-only guards, snapshot binding, stale-revision CAS, idempotency, checkout payable/currency authority, and legacy museum quote behavior. No client-supplied commercial facts are accepted as quote authority. Generated security artifacts were not changed because this round adds no policy, grant, table, or function surface. The sole remaining concern is the unavailable pinned Supabase CLI/local container runtime; production readiness must wait for that gate.

## Fix round 2/5 — exact pgTAP plan accounting

### Status

`DONE_WITH_CONCERNS`: the trip-plan pgTAP plan/checker mismatch is fixed. The quote fixture remains exactly balanced at `164/164`. PostgreSQL/pgTAP execution is still blocked by the runtime gate recorded above.

### TDD evidence

RED was captured after adding `lives_ok` to the focused assertion counter but before updating the SQL plan:

```text
pnpm test:run tests/unit/infrastructure/plan-revision-adapter.test.ts -t "executable food revision fixture"
Test Files  1 failed (1)
Tests  1 failed | 19 skipped (20)
AssertionError: expected 116 to be 112
```

GREEN after updating `trip_plan_revisions_test.sql` to `SELECT plan(116);`:

```text
pnpm test:run tests/unit/infrastructure/plan-revision-adapter.test.ts -t "executable food revision fixture"
Test Files  1 passed (1)
Tests  1 passed | 19 skipped (20)
```

The checker remains anchored to executable `SELECT` assertion lines, so comments/helper definitions are not counted, and now includes `ok`, `is`, `isnt`, `like`, `unlike`, `throws_ok`, `lives_ok`, `has_table_privilege`, and `has_function_privilege`.

### Exact count evidence

- `trip_plan_revisions_test.sql`: `SELECT plan(116);`; `is=44`, `lives_ok=4`, `ok=32`, `throws_ok=36`, total `116`.
- `requests_quotes_test.sql`: `SELECT plan(164);`, total `164`; no quote plan change.
- The exact-count checker hard-codes the corrected trip expectation `116` and verifies the mechanically counted total.

### Fix-round verification

- `pnpm test:run tests/unit/infrastructure/plan-revision-adapter.test.ts tests/unit/infrastructure/request-quote-adapter.test.ts` — focused adapter/static suite passed.
- `pnpm test:run` — full unit suite passed with `60` files and `690` tests.
- `pnpm db:static` — `17` migration files checked successfully.
- `pnpm typecheck` — passed (`tsc --noEmit`).
- `pnpm lint` — passed (`eslint . --max-warnings=0`).
- `git diff --check` — passed; only existing LF-to-CRLF warnings were emitted.

### Files and commit

- `supabase/tests/database/trip_plan_revisions_test.sql`
- `tests/unit/infrastructure/plan-revision-adapter.test.ts`
- `tests/unit/infrastructure/request-quote-adapter.test.ts`
- This report
- Fix commit: `f0be97b fix: align task 9 pgTAP assertion plan`. This hash line is recorded in the follow-up report commit.

### Self-review and concerns

The change is test-gate only: it does not alter production migration behavior, adapter UUID/quantity behavior, auth/RLS, or quote controls. The exact counter is intentionally anchored and explicit about supported forms. The remaining concern is unchanged: the pinned Supabase CLI/local container runtime is unavailable, so pgTAP execution and PostgreSQL behavior are not claimed.
