# LocalLens B2.2a runtime fixed-tour implementation plan

> Execute with Superpowers TDD, subagent-driven development, independent review after each wave, and verification-before-completion.

**Goal:** Deliver the bounded fixed-tour local-runtime flow defined in `docs/superpowers/specs/2026-09-02-localens-b2-2a-runtime-fixed-tour.md` without changing demo behavior or promoting unapproved catalog data.

**Expected effort:** 6–8 focused hours with 3–5 disjoint workers. Stop claims at `runtime-verified-local`.

## Task 1 — Browser-safe contracts

**Write set**

- Create `lib/application/fixed-tour/contracts.ts`
- Create `tests/unit/fixed-tour/contracts.test.ts`

**TDD steps**

1. Write failing exact-shape tests for list tours, availability, begin booking, and own bookings.
2. Reject unknown keys, actor IDs, role, amount, currency, status, hold duration, and provider fields.
3. Reuse `PublishedTour`, `LiveDepartureAvailability`, `CustomerBooking`, and `Locale` without duplicating persistence schemas.
4. Run focused tests, lint, and typecheck.
5. Commit `feat: define fixed-tour runtime contracts`.

## Task 2 — Authenticated public hold RPC

**Write set**

- Create `supabase/migrations/20260902*_runtime_fixed_tour_booking.sql`
- Create `supabase/tests/database/runtime_fixed_tour_booking_test.sql`
- Update generated database types and mandatory security inventory files through repository generators only
- Update focused SQL/security artifact tests if the generated object count changes

**TDD steps**

1. Add failing pgTAP for exact signature, owner, `SECURITY DEFINER`, empty search path, and grants.
2. Prove anon/guide/admin denial and authenticated-customer success.
3. Prove the wrapper derives the JWT actor and canonical hash, accepts only a departure, and returns only `booking_id`, `hold_expires_at`, and `state`.
4. Prove same-key replay and changed-payload conflict.
5. Prove executable cross-owner visibility through `customer_bookings_v`.
6. Implement the narrow wrapper around `private.start_checkout_tx` using the existing non-login checkout owner.
7. Reset local DB, run the focused pgTAP file, regenerate types/security manifests, and pass drift checks.
8. Commit `feat: expose guarded fixed-tour hold RPC`.

## Task 3 — Local-only synthetic runtime fixture

**Write set**

- Create `scripts/seed-runtime-fixed-tour.mjs`
- Create `tests/unit/supabase/runtime-fixed-tour-seed.test.ts`
- Update `package.json` and `docs/runbooks/local-supabase.md`

**TDD steps**

1. Write failing tests for loopback URL/DB validation, exact Supabase CLI pin, secret redaction, transaction rollback, and idempotency.
2. Add a second local customer without changing the B2.1 three-role acceptance identities.
3. Seed one complete synthetic EN/VI catalog/tour/departure graph with future deterministic dates and capacity.
4. Assert the seed never reads `data/sources` or `data/approvals` and never marks external research as approved.
5. Run the CLI twice against local Supabase and verify stable IDs/counts.
6. Commit `test: seed local fixed-tour runtime fixture`.

## Task 4 — Supabase adapter and composition

**Depends on:** Tasks 1–3

**Write set**

- Create `lib/infrastructure/supabase/fixed-tour-runtime-adapter.ts`
- Create `lib/application/fixed-tour/composition.ts`
- Update `lib/application/portal/supabase-shell.ts`
- Create focused unit tests under `tests/unit/fixed-tour/` and `tests/unit/infrastructure/`

**TDD steps**

1. Write failing adapter tests for locale-filtered tours, availability mapping, bounded hold RPC output, and owner booking mapping.
2. Reject malformed rows, extra sensitive fields, unsafe integer strings, and unstable error details.
3. Wire the adapter only in Supabase composition; prove demo imports remain absent from the Supabase dependency graph.
4. Pass focused tests, lint, typecheck, and bundle-boundary tests.
5. Commit `feat: add Supabase fixed-tour runtime adapter`.

## Task 5 — Mode-aware EN/VI customer UI

**Depends on:** Task 4

**Write set**

- Add runtime fixed-tour components under `components/customer/`
- Make `/[locale]/tours`, `/[locale]/booking`, and `/[locale]/account` select the mode-specific surface
- Update localized copy and component tests

**TDD steps**

1. Write failing tests for loading, localized catalog, availability, party size validation, pending-payment hold success, conflict, sold-out, unauthenticated, and service error.
2. Preserve the existing demo components byte-for-behavior through mode-selected dynamic imports.
3. Route a successful hold to the owner account and display durable booking details plus pending-payment disclosure.
4. Verify keyboard, labels, live regions, focus, and EN/VI copy.
5. Run all customer/portal component tests and demo portal E2E.
6. Commit `feat: add runtime fixed-tour customer flow`.

## Task 6 — Clean runtime fixed-tour acceptance

**Depends on:** Tasks 1–5

**Write set**

- Create `tests/e2e/runtime-fixed-tour.spec.ts`
- Add a local orchestration script/config or safely extend the owned runtime runner without weakening B2.1 secret isolation
- Update package scripts, README, and runbook

**TDD steps**

1. Start/reset local Supabase, seed runtime auth and fixed-tour fixtures, and own a clean Supabase Next server.
2. EN customer A: browse, hold, reload, new context, and verify own booking.
3. VI customer B: repeat with Vietnamese data and verify language persistence.
4. Verify A/B cross-owner isolation and anon/guide/admin RPC denial.
5. Verify idempotent replay, changed-payload conflict, and no browser-visible sensitive authority fields.
6. Run `pnpm db:verify`, exact `pnpm check`, exact demo E2E, runtime Auth E2E, and runtime fixed-tour E2E in the required host context.
7. Perform independent full-range review; fix Critical/Important findings with one TDD wave and re-review.
8. Commit final evidence without claiming B2.2b, B2.3, B2.4, staging, production, or whole-product completion.

## Delivery checkpoints

- Wave 1: Tasks 1–3 in parallel, then integration review.
- Wave 2: Task 4, then Task 5 after contracts/RPC are stable.
- Wave 3: Task 6, full review, exact gates, browser acceptance, and two open local demos.
- Preserve all pre-existing modified/untracked files; stage only task-owned paths.
- Do not merge, push, publish, reset, delete a worktree, or stop unknown processes without explicit approval.

