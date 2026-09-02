# LocalLens B2.4 Runtime Guide Assignment Implementation Plan

> **Execution:** Use Superpowers test-driven and subagent-driven development. Preserve protected user files and commit task-owned files only.

**Goal:** Deliver the fixed-departure admin-assignment to guide-read-only runtime slice defined in `docs/superpowers/specs/2026-09-02-localens-b2-4-runtime-guide-assignment.md`.

## Task 1 — RED database contract

- Add a new additive migration test and pgTAP file for exact-role authority, exact admin/guide projections, idempotent assign/reassign, scheduled-departure enforcement, browser denial of legacy lifecycle functions, overlap rejection, and stable result snapshots.
- Extend the two-session harness with duplicate/competing assignment and overlapping-booking scenarios.
- Run focused static/unit tests and capture the expected failures before implementation.

## Task 2 — GREEN database boundary

- Add `20260902130000_runtime_guide_assignment.sql`; do not rewrite historical migrations.
- Harden existing assignment functions to exact-role checks and scheduled-departure validation.
- Revoke authenticated execution of legacy guide accept/complete RPCs so the backend matches the read-only thesis UI boundary.
- Add a guarded idempotency ledger and browser-facing versioned assignment RPC.
- Enforce guide schedule non-overlap under database locks; do not claim automated area/expertise matching without structured source data.
- Add exact admin assignment-queue and eligible-guide projections.
- Add assignment ID to the guide projection while retaining its PII/payment exclusions.
- Update generated security artifacts/types only through repository scripts.

## Task 3 — RED/GREEN TypeScript adapters

- Define focused runtime assignment contracts separate from broad demo portal ports.
- Add exact row/result parsers and Supabase adapter calls for admin queue, eligible guides, assignment mutation, and guide list.
- Reject unknown/missing fields and map database errors without leaking values.
- Compose the adapter into `SupabasePortalShell`; verify Supabase mode never imports the demo repository.

## Task 4 — RED/GREEN bilingual runtime UI

- Add an admin assignment queue with stable form labels, pending state, authoritative reload, live result, and focus management.
- Add a guide read-only assignment schedule with structured requirement labels and no accept/complete controls.
- Cover EN/VI, loading, empty, denied, malformed, conflict, and retry states.
- Keep existing customer payment/cancellation surfaces unchanged.

## Task 5 — Runtime seed and browser acceptance

- Extend local-only seed data with a confirmed fixed booking and two pure-guide candidates without importing research-only catalog data.
- Add an isolated B2.4 runner/config/spec using an owned clean Supabase-mode server.
- Prove admin assign/reassign, assigned-guide visibility, other-guide isolation, reload/new context, session persistence, exact network surfaces, and no demo storage.

## Task 6 — Review and complete gates

- Request independent security/spec review; fix every Critical/Important finding with a fresh TDD wave and re-review.
- Run focused tests, `pnpm db:static`, `pnpm check`, `pnpm build:supabase`, full local `pnpm db:verify`, demo E2E, runtime Auth E2E, runtime fixed-tour E2E, and B2.4 runtime E2E.
- Record exact evidence in the spec/runbook, restore generated artifacts, verify protected files are untouched, and commit only task-owned paths.
- Report B2.4 as `runtime-verified-local` only when every gate passes; keep staging and production explicitly pending.
