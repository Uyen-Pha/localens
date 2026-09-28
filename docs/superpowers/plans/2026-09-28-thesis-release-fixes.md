# Thesis Release Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve release-relevant failures without reverting approved UI or expanding the thesis prototype into a commercial system.

**Architecture:** Continue recovery/unified-preview at d44c101. Preserve existing runtime/demo boundaries. Classify failures before editing expectations or implementation; no blanket skips or replacement of real mutations with local success.

**Tech Stack:** Next.js, React, TypeScript, Vitest, pnpm 10.17.1, existing Supabase adapters, Vercel.

**Spec:** User's latest implementation authorization and approved business/UI decisions in this conversation; Word 030239230281_PhamThiTuUyen.docx for business ambiguities. This plan supersedes the earlier preview-only release restriction only after verification, under the user's existing conditional Production authorization.

## Global Constraints

- Preserve approved UI, all recovery branches/worktrees and unrelated design-qa.md / tsconfig.tsbuildinfo edits.
- No hosted migration, schema/RPC modification, backfill, or existing booking data changes.
- No disabling safety tests merely to obtain a passing run.
- Ask immediately before deciding an unresolved business rule; give a recommendation and alternatives.
- No production patching after divergence; use recorded rollback deployment.
- Hosted write-based smoke tests require an explicitly identified test account and permitted disposable records.

## Review Focus

- Duplicate booking submission preserves one idempotency key and creates no duplicate hold.
- Wrong-role and signed-out access remains denied; safe return URLs preserved.
- Planner boundary uses exactly 72 hours; optional area does not block budget hints.
- Started/full/cancelled departures cannot regain booking or assignment actions through presentation changes.
- Cancellation UI must not assume the unexecuted migration exists.

## Task 1: Classify and repair stale presentation tests

Files: tests/components/admin/admin-prototype.test.tsx; tests/components/customer/runtime-fixed-tour.test.tsx; tests/components/customer/personalization-form.test.tsx; tests/unit/portal/routes/pages.test.ts; docs/recovery/2026-09-28-release-failure-classification.md (new).

Interfaces: existing AdminPrototype, RuntimeFixedTourBooking, PersonalizationForm and account route; no new runtime interface.

- [ ] Reproduce each affected failure in isolation and record assertion, current behavior, approved requirement and classification.
- [ ] Update obsolete banner/button/route assertions only; retain no-network, mutation payload, duplicate-submit and failure-state assertions.
- [ ] Split mixed tests where outdated UI selectors prevent reaching meaningful business assertions.
- [ ] Run each affected file and commit scoped changes after reviewing remaining failures.

## Task 2: Fix demonstrated runtime regressions

Files: components/customer/runtime-fixed-tour-booking.tsx; components/customer/personalization-form.tsx; components/portals/supabase-portal-surface.tsx; corresponding tests from Task 1 and tests/components/portals/supabase-portal-surface.test.tsx.

Interfaces: existing SupabasePortalShell, fixedTour.beginBooking, session and planner composition; preserve signatures.

- [ ] Follow remaining failing assertions into existing handlers/adapters; record root cause before editing.
- [ ] Add a failing regression test for each confirmed defect (duplicate submit, permission, 72-hour boundary, unavailable service); ask if intended behavior is ambiguous.
- [ ] Apply smallest production fix; do not redesign UI or introduce new data paths.
- [ ] Run affected tests, typecheck and changed-file lint; report failures individually.

## Task 3: Separate cancellation audit from release (decision required)

Files to inspect: supabase/migrations/20260928100000_booking_cancellation_rules.sql; docs/security/data-access-matrix.json; docs/security/data-access-matrix.md; docs/security/grants-manifest.json; tests/unit/supabase/cancellation-rules-migration.test.ts; supabase/tests/database/runtime_cancellation_test.sql; supabase/tests/database/bookings_holds_idempotency_test.sql; lib/application/portal/cancellation-policy.ts; components/customer/booking-cancellation-dialog.tsx.

- [ ] Confirm user choice: retain audited SQL on backup/audit branch and exclude it from active release migrations (recommended), or retain it in release source with an explicit non-execution boundary.
- [ ] Trace cancellation presentation and adapter dependencies before separating changes. Do not indiscriminately restore whole files containing other approved changes.
- [ ] Compare effective release migration tree with origin/main; keep existing migration history unchanged.
- [ ] Verify prototype policy tests and record any real-runtime mismatch without mutating hosted data.

## Task 4: Acceptance and publication

Files: docs/recovery/2026-09-28-production-release-gate.md; acceptance report to be added alongside it.

- [ ] Run full tests, typecheck, changed-file lint and Supabase-mode build. Separate evidenced baseline failures from introduced failures; unresolved critical flow failures block release.
- [ ] Verify candidate Preview with customer/guide/admin login and seven routes. Confirm exact source commit and whether test writes are authorized.
- [ ] Recheck backup refs, current Production deployment and final main diff; commit/push only approved changes.
- [ ] Merge/push main and deploy that exact commit only after the release gate is met.
- [ ] Smoke-test Production; rollback on divergence. Report commit, deployment, route results, prototype boundaries and no hosted migration execution.

## Execution handoff

Recommend inline execution: tasks share runtime boundaries, and avoiding parallel edits reduces overlap. Review this plan and resolve Task 3 before implementation; do not repeatedly request approval for already settled UI decisions.
