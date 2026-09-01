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
- Update `docs/security/data-access-matrix.json` as the reviewed inventory source, then regenerate the derived Markdown/manifests
- Update generated database types through the repository generator only
- Update `scripts/test-db-concurrency.mjs` and its focused unit test for the new public-boundary race
- Update focused SQL/security artifact tests if the generated object count changes

**TDD steps**

1. Add failing pgTAP for exact signature, owner, `SECURITY DEFINER`, empty search path, and grants.
2. Prove anon/guide/admin denial and authenticated-customer success under both legacy and JSON-only PostgREST claim formats.
3. Normalize JSON/legacy claims in the wrapper and owner-booking RLS; set the transaction-local legacy subject before calling the existing checkout transaction.
4. Reuse `private.checkout_canonical_payload` exactly, accept only a departure, and return only `booking_id`, `hold_expires_at`, and `state`.
5. Prove same-key replay and changed-payload conflicts independently for departure, party size, and locale.
6. Prove executable A→B and B→A cross-owner isolation through `customer_bookings_v` with JSON claims only.
7. Prove final `localens_checkout_rpc_owner` has no `CREATE` on `public`/`private` and only `authenticated` has wrapper execute.
8. Run a two-session authenticated no-oversell race through the public wrapper.
9. Reset local DB, run the focused pgTAP/concurrency files, regenerate types/security manifests, and pass drift checks.
10. Commit `feat: expose guarded fixed-tour hold RPC`.

## Task 3 — Local-only synthetic runtime fixture

**Write set**

- Create `scripts/seed-runtime-fixed-tour.mjs`
- Create `tests/unit/supabase/runtime-fixed-tour-seed.test.ts`
- Update `package.json` and `docs/runbooks/local-supabase.md`

**TDD steps**

1. Write failing tests for loopback URL/DB validation, exact Supabase CLI pin, secret redaction, database transaction rollback, and idempotency.
2. Add a second local customer without changing the B2.1 three-role acceptance identities.
3. Prove cross-system compensation: delete only a newly created Auth user when database work fails, never a reused user, preserve the primary redacted error, and suppress cleanup details.
4. Insert in guard-safe order: draft snapshot; area/place and EN/VI snapshot translations plus required support/hours; published travel snapshot for the same catalog; draft tour and EN/VI translations; draft version and EN/VI translations; contiguous stops referencing snapshot places with localized copy; publish version/tour/snapshot; fixed far-future 2099 departure.
5. Assert the seed never reads `data/sources` or `data/approvals` and never marks external research as approved.
6. Pass unit/lint/typecheck only during the parallel wave; defer both live seed runs until the serialized integration checkpoint after Task 2.
7. Commit `test: seed local fixed-tour runtime fixture`.

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
3. Wire the adapter only in Supabase composition; prove both directions: demo mode does not import Supabase runtime code and Supabase mode does not import demo repository/fixture code.
4. Pass focused tests, lint, typecheck, `build:supabase`, and bidirectional bundle/import-boundary tests.
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
- Add an explicit fixed-tour Playwright config and local orchestration script, or safely extend the owned runtime runner without weakening B2.1 secret isolation
- Update package scripts, README, and runbook

**TDD steps**

1. Serialize reset → migration/pgTAP → runtime Auth seed → fixed-tour seed twice, then own a clean Supabase Next server.
2. EN customer A: browse, hold, reload, new context, and verify own booking.
3. VI customer B: repeat with Vietnamese data and verify language persistence.
4. Verify A/B cross-owner isolation and anon/guide/admin RPC denial.
5. Verify idempotent replay, changed-payload conflict, and no browser-visible sensitive authority fields; customer-B password and database URL must never enter the owned Next server environment.
6. Run `build:supabase`, `pnpm db:verify`, exact `pnpm check`, exact demo E2E, runtime Auth E2E, and runtime fixed-tour E2E in the required host context.
7. Perform independent full-range review; fix Critical/Important findings with one TDD wave and re-review.
8. Commit final evidence without claiming B2.2b, B2.3, B2.4, staging, production, or whole-product completion.

## Delivery checkpoints

- Wave 1: Tasks 1–3 perform code/unit work in parallel. Only Task 2 may use the shared local database; live fixed-tour seed execution is serialized afterward.
- Wave 2: Task 4, then Task 5 after contracts/RPC are stable.
- Wave 3: Task 6, full review, exact gates, browser acceptance, and two open local demos.
- Preserve all pre-existing modified/untracked files; stage only task-owned paths.
- Do not merge, push, publish, reset, delete a worktree, or stop unknown processes without explicit approval.

## Completion record — 2026-09-02

- Tasks 1–6 are implemented and committed on `codex/localens-mvp`.
- Final gates passed: `pnpm check` (96 files/1,113 tests and 24/24 demo routes), `pnpm build:supabase` (24/24 routes), `pnpm db:verify` (15 pgTAP files/1,460 tests, zero lint findings, 6/6 concurrency scenarios, no type drift), demo E2E (25/25), runtime Auth E2E (3/3), and runtime fixed-tour E2E (4/4 plus the embedded 1,460-assertion pgTAP run).
- Review hardening is included: exact capacity progression, exact PostgREST RPC path/status and `42501` denial, stable cleanup reporting, and bounded directly owned demo-server cleanup on Windows.
- B2.2a is complete at `runtime-verified-local`; all later slices and deployment claims remain pending.
