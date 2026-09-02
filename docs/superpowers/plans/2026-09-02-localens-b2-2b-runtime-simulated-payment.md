# LocalLens B2.2b Runtime Simulated Payment Implementation Plan

> Execute with test-driven development and review checkpoints. Preserve all pre-existing dirty files.

**Goal:** Add a local-runtime, PostgreSQL-authoritative fixed-tour payment simulation with durable owner-scoped status and monotonic booking/hold transitions.

**Architecture:** A dedicated simulated-payment table and narrow customer RPC remain separate from Stripe/provider facts. The existing Supabase runtime adapter exposes strict contracts. The account UI reloads authoritative booking and payment projections after each mutation.

## Task 1: Database contract tests first

**Files:**
- Create: `supabase/tests/database/runtime_simulated_payment_test.sql`
- Modify: `scripts/test-db-concurrency.mjs`
- Modify focused gate tests if the concurrency scenario registration changes.

Write failing pgTAP and two-session cases for role ownership, RLS/grants, projection shape, success/expiry transitions, exact replay, conflict, cross-owner denial, real-payment exclusion, compensation hardening, and single-result races. Run the focused red tests and record the expected failures.

## Task 2: Database implementation

**Files:**
- Create: `supabase/migrations/20260902120000_runtime_simulated_payment.sql`
- Regenerate: `lib/infrastructure/supabase/database.types.ts`

Create named least-privilege roles, private receipt storage, owner-scoped projection, strict RPC, exact replay/conflict rules, shared lock order, database-time expiry decisions, and terminal transitions. Do not alter or invoke the Stripe finalizer. Run pgTAP, concurrency, lint, reset, and generated-type drift gates.

## Task 3: Application contracts and adapter

**Files:**
- Modify: `lib/application/fixed-tour/contracts.ts`
- Modify: `lib/infrastructure/supabase/fixed-tour-runtime-adapter.ts`
- Create/modify focused tests under `tests/unit/fixed-tour/` and `tests/unit/supabase/`.

Write failing tests for exact input/output parsing, idempotency keys, row cardinality, malformed projection rows, nullable expired results, error mapping, and session requirements. Then implement `listOwnPaymentStatuses` and `completeSimulatedPayment` with strict mapping and no authority leakage.

## Task 4: Account UI and bilingual copy

**Files:**
- Modify: `components/customer/runtime-fixed-tour-account.tsx`
- Modify: `lib/i18n/fixed-tour-runtime.ts`
- Modify: `tests/components/customer/runtime-fixed-tour-account.test.tsx`

Write failing component tests for status separation, EN/VI disclosure/action, submitting/disabled state, successful completion, authoritative expired result, reload, conflict/service errors, and absence of actions on terminal bookings. Implement the smallest accessible UI that passes them.

## Task 5: Runtime acceptance

**Files:**
- Modify: `tests/e2e/runtime-fixed-tour.spec.ts`
- Modify the seed or runtime runner only if deterministic isolation requires it.

Extend the local-runtime acceptance flow to cover successful confirmation in EN/VI, persistence, owner isolation, denied roles, replay/conflict, authoritative expiry, and absence of demo storage/provider secrets. Keep the clean owned server and isolated Next cache guarantees from B2.2a.

## Task 6: Review and final gates

Run focused tests after every task, then:

1. `pnpm db:verify`
2. `pnpm test:e2e:runtime-fixed-tour`
3. `pnpm test:e2e`
4. `pnpm test:e2e:runtime-auth`
5. `pnpm check`
6. `pnpm build:supabase`

Request independent code review, fix every Critical/Important finding with regression tests, rerun affected gates, commit only task-owned files, and report B2.2b separately from staging/production readiness.
