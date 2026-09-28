# Unified LocalLens Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One review deployment containing the approved customer, planner, booking, admin and guide UI, with correct role navigation and preserved runtime behavior.

**Architecture:** Reuse `codex/recovery-review` at `5a67488`, rather than merge old design branches. Make the approved admin shell the authenticated admin entry while retaining existing runtime quote/assignment functionality and isolated in-memory catalog screens. Never replace runtime data with fixture data implicitly.

**Tech Stack:** Next.js, React, TypeScript, pnpm 10.17.1, Vitest, existing Supabase adapters, Vercel Preview.

**Spec:** User-approved six-step consolidation proposal in this conversation: backup, inventory, role navigation, preserve Supabase and prototype distinction, test a unified Preview, stop before main/Production.

## Global Constraints

- No main merge/push or Production deployment.
- No schema, migration, RPC, database rows, payment or cancellation rule changes.
- Preserve existing worktrees and guide changes originating at `3ad187f`.
- Never remove persistence/payment caveats in a way that represents temporary prototype actions as saved real transactions.
- Exact new Preview origin needs user approval before adding to allowed origins.
- Authenticated tests must not create bookings/payments/assignments without separately scoped test authorization.

## Review Focus

- Signed-out and wrong-role users must not gain admin access through either admin route.
- Admin prototype navigation must not hide existing quote and assignment functionality.
- Customer safe return-to must preserve booking/request identifiers; external destinations rejected.
- Planner 72-hour guard must use departure time, not calendar date alone; no-area budget hints visible.
- Expired/full/cancelled departures must not become bookable through restored UI.

## Task 1: Preserve and inventory

Files: `docs/recovery/2026-09-28-unified-preview-inventory.md` (create).

- [ ] Fetch origin read-only and record current main, origin/main, recovery HEAD and worktree status; do not assume cached origin/main matches Production.
- [ ] Create non-overwriting backup refs for main and recovery HEAD. Read Vercel Production deployment metadata without promoting anything.
- [ ] Record each approved surface, component, commit and data mode; compare design branches without merging. Include homepage, six tour catalog/detail, booking/payment, requests/bookings, planner, admin and guide.
- [ ] Record missing surfaces and baseline failing tests before edits.

## Task 2: Authenticated unified admin entry

Files: `app/[locale]/admin/page.tsx`, `app/[locale]/admin/prototype/page.tsx`, `components/admin/admin-prototype.tsx`, `components/portals/portal-surface.tsx`, `components/portals/supabase-portal-surface.tsx`; add `tests/components/admin/unified-entry.test.tsx`.

Interfaces: reuse `PortalSurface({locale, expectedRole: 'admin'})` authentication and current runtime composition; reuse `AdminPrototype` screen components for approved temporary-data operations. Extract a shared shell only if required; no replacement auth system or duplicated mutation layer.

- [ ] Write failing tests for signed-out/wrong-role rejection, admin access to new navigation, and reachable existing quote/assignment screens.
- [ ] Run focused test to establish failure before implementing.
- [ ] Integrate the approved navigation at `/vi/admin/` and `/en/admin/`, retaining runtime capabilities; make prototype route share the guarded entry or explicit compatible alias.
- [ ] Keep role logout and current account identity; do not show fixture identity as authenticated account.
- [ ] Run focused tests; commit only scoped files.

## Task 3: Cross-surface navigation and regressions

Files: `lib/navigation/safe-return-to.ts`, relevant existing customer/guide tests; repair only confirmed consolidation regressions.

- [ ] Test customer login destination and safe return-to, admin/guide role destinations, query identifiers for each of six tours, and expired/full departure handling.
- [ ] Test both planner entry forms, 72-hour boundaries and final submission check; retain budget suggestions without areas.
- [ ] Run existing booking, payment, requests and guide tests; distinguish stale test expectations from product defects before modifying assertions.
- [ ] Run full Vitest suite and compare exact failures with `output/recovery-audit-20260928/compact-tour-suite.json`; unresolved failures must remain disclosed and block Production readiness.
- [ ] Run typecheck, changed-file lint and build; commit scoped fixes.

## Task 4: Unified Preview acceptance

Files: `docs/recovery/2026-09-28-unified-preview-acceptance.md` (create).

- [ ] Deploy explicit Vercel Preview to existing project, never `--prod`.
- [ ] Verify public desktop/mobile UI and direct-route navigation; inspect for overflow.
- [ ] Ask for exact-domain connection approval if needed, preserving all old origins; verify preflight and rejected unapproved origin.
- [ ] Have user sign in for each role; perform read-only coverage first. Do not claim authenticated flows verified from redirects or static tests alone.
- [ ] Record deployment URL, source commit, changed files, pass/fail coverage and remaining blockers. Stop for user review; no main merge or Production promotion.
