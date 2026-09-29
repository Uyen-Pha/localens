# Cancellation SQL Local Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete and verify cancellation SQL locally, with a separately approved hosted rollout.

**Architecture:** Preserve existing cancellation RPC/adapter boundaries. Separate public booking, reviewed-demo booking, and research booking evidence; one passing SQL suite does not certify another runtime. Diagnose baseline access-inventory failures before changing declarations or permissions.

**Tech Stack:** PostgreSQL/Supabase, pgTAP, TypeScript, Vitest, Docker on Windows.

**Spec:** User-approved option 2; `docs/reports/cancellation-local-20260929.md`; original Word `C:/Users/Admin/Downloads/030239230281_PhamThiTuUyen.docx` (recheck cancellation passages before implementation).

## Global Constraints

- Work only in `codex/cancellation-local`; preserve all other worktrees.
- No push, merge, deploy, hosted SQL, hosted backfill, or real booking changes.
- Preserve approved UI and prototype/runtime split; no automatic refund feature.
- Pending-payment cancellation requires an unexpired deadline and no paid/processing payment. The 48-hour rule applies to confirmed bookings, not pending ones.
- Preserve historical migration semantics. Do not rewrite applied history or widen privileges merely to satisfy static tests. Any necessary new security migration outside cancellation requires a separate scope decision.

## Review Focus

- Other customer's booking: rejected with no data or capacity change.
- Exact deadline and 48-hour boundary: authoritative server clock, including lock waits.
- Lost response/replay: one cancellation and one capacity release only.
- Concurrent payment: no paid-and-cancelled contradiction.
- Upgrade/rerun: existing records retained, rollback described without resurrecting cancelled bookings.

## Task 1: Classify nine existing failures

> Historical checklist below records the initial plan, not the final result. The user subsequently approved bounded local permission completion beyond cancellation. Current evidence and deviations are recorded in `docs/reports/cancellation-permissions-final-20260929.md`; no hosted execution is authorized by this checklist.

**Files:** `tests/unit/supabase/artifacts.test.ts`, `tests/unit/supabase/rls-matrix.test.ts`, `tests/unit/supabase/thesis-demo-cloud-seed.test.ts`; report only initially.

- [ ] Run these three files and record each failure with its source migration and checker assertion.
- [ ] Compare failures against main in an isolated checkout, without changing the protected main checkout.
- [ ] Classify each as stale declaration, parser/test defect, actual SQL security defect, or seed fixture mismatch. Do not lower assertions or accept unsafe owners.

## Task 2: Reconcile declarations and seed coverage

**Candidate files:** `docs/security/data-access-matrix.json`, `docs/security/data-access-matrix.md`, `docs/security/grants-manifest.json`, `docs/security/policies-manifest.json`, `scripts/seed-thesis-demo-cloud.mjs`, `scripts/lib/thesis-demo-seed.mjs`, and their existing tests.

- [ ] Pin a failing regression for each confirmed parser/fixture defect before editing implementation.
- [ ] Update only declarations demonstrably matching safe final SQL; use the existing Markdown generator for mechanical output.
- [ ] Preserve transactional seed ownership/classification and exact graph validation. Never execute the hosted seed CLI.
- [ ] Rerun the three suites. If making them pass requires changing unrelated runtime privileges, document the required scope and stop for approval rather than silently expanding SQL changes.

## Task 3: Cancellation contracts and local SQL

**Candidate files:** `supabase/migrations/20260928100000_booking_cancellation_rules.sql`, `supabase/migrations/20260928230000_research_booking_cancellation.sql`, `supabase/tests/database/runtime_cancellation_test.sql`, `supabase/tests/research/research_booking_cancellation_test.sql`; inspect reviewed-demo cancellation migrations read-only first.

- [ ] Map Word acceptance criteria to each actually used RPC and adapter.
- [ ] Add missing pgTAP coverage for ownership, pending expiry, exact 48-hour boundary, replay, and atomic capacity release before implementation changes.
- [ ] Fix only proven cancellation defects; retain signatures and existing data.
- [ ] Use dedicated local containers to test clean apply, upgrade, rerun, permissions, and concurrent cancellation/payment; never reset an existing shared stack.
- [ ] Run guarded local research cancellation, integration, and concurrency scripts plus public cancellation tests. Report each runtime separately.

## Task 4: Verification and approval report

- [ ] Run focused UI/adapter tests, full Vitest suite, typecheck, changed-file lint and local build. List baseline failures individually.
- [ ] Obtain independent review of SQL changes, permission boundaries and rollback plan.
- [ ] Record `Change | Reason | Required by Word? | DB/data impact | Test | Apply recommendation` in a new local report, with exact commit and commands.
- [ ] Separate tested local status from unverified hosted status; provide a transaction-based deployment/rollback proposal that preserves live business records.
- [ ] Commit only reviewed local files if checks pass; preserve unrelated `.local-cancellation-suite.json`.
- [ ] Stop for hosted approval. No Production deployment in this plan.

## Execution closeout (29/09/2026)

- [x] Preserve isolated branch and historical migrations; no hosted writes.
- [x] Complete seed inventory in preceding local commit `21bfeb2`.
- [x] Add final-state SQL parser regressions, bounded Auth access checks and exact function inventory.
- [x] Reconcile matrix/manifests against 58 migration files without blessing postgres-owned definers.
- [x] Implement approved additive reviewed/guide/research permissions with API/body/data invariance tests.
- [x] Independent static and SQL review; correct proven findings with regression tests.
- [x] Rerun local permission/guide/research/cancellation/deadline and concurrency suites.
- [x] Build, typecheck, changed-file lint and focused gates pass.
- [x] Finish final whole-project test rerun and record its exact result: 2633/2633, zero failures/skips.
- [x] Verify and stage focused local files; local commit only, no push.
- [ ] Hosted rollout remains a separate approval; do not push/merge/deploy here.

The separate main-checkout baseline rerun was not performed: source comparison and named failing test evidence were used instead. No claim is made that an untouched main checkout passed these gates.
