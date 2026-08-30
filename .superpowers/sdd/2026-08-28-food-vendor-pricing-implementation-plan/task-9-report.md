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
