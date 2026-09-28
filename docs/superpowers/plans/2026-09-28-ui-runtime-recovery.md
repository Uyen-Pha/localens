# LocalLens UI Runtime Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task and superpowers:verification-before-completion before claiming completion.

**Goal:** Restore the approved customer, tour, journey, booking, administrator, and guide visual interfaces on a new branch based on `origin/main`, while keeping the current Supabase runtime, business flows, database schema, and guide-calendar behavior intact.

**Architecture:** Adapt the existing runtime-facing components and styles in place. Import only presentation components, copy, assets, and narrowly scoped helpers from the historical worktrees. Keep runtime ports, Supabase adapters, auth gates, booking/payment state transitions, and portal data loading owned by the `origin/main` implementation.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Playwright, Supabase runtime adapters, Vercel Preview, pnpm via Corepack.

## Global Constraints

- Work only on `codex/ui-runtime-recovery`; never edit `main`.
- Do not delete, reset, or rewrite the historical worktrees.
- Preserve commit `3ad187f` and the current guide portal/runtime behavior.
- Do not add migrations or mutate seeded Supabase data unless an existing source record is proven to be missing and the change is explicitly required.
- Do not merge historical branches wholesale. Each imported change must be adapted to the current runtime component boundary.
- Do not represent unavailable proposal tours as bookable live records or create duplicate tour rows.
- Existing baseline failures must be separated from regression failures introduced by this recovery.

## Tasks

1. **Baseline and source map**
   - Record the current branch, commit, package versions, runtime component boundaries, and existing test failures.
   - Compare each requested historical worktree to `origin/main` and identify only UI/component/style/assets that can be ported safely.

2. **Customer and shell presentation**
   - Restore the green customer shell/home visual language in the current `customer-home` and shared styles without replacing the current runtime adapters.
   - Port the fixed-tour list/detail visual treatment into `RuntimeTourCatalog` and related current components.
   - Keep the current Supabase published-tour query, availability lookup, booking links, and details route.

3. **Planner journey**
   - Add the natural-language entry as the default first step.
   - Keep the current detailed form available through an explicit “Tự nhập chi tiết” option.
   - Reuse current personalization persistence and planner handoff; the parser may normalize input but must not bypass validation or approval/submission states.
   - Add focused tests for the default natural-language UI, manual-form toggle, parser failure, and handoff.

4. **Booking and portals**
   - Port the historical booking and portal presentation selectively into current `BookingFlow`, admin portal, and guide portal surfaces.
   - Preserve current checkout/payment, cancellation, role gates, assignment/calendar, and database reads/writes.

5. **Six-tour reconciliation**
   - Inspect the current source catalog and runtime query before changing data.
   - Reuse existing published records where present and deduplicate by stable slug/id.
   - If the historical three additional tours are not published/bookable records, expose them only through a clearly non-bookable presentation fallback or leave them out of the live catalog until a source-backed runtime record exists; never invent availability or duplicate Supabase rows.
   - Add a focused test for the reconciliation behavior.

6. **Verification**
   - Run targeted tests after each area, then typecheck, lint, full test suite, and production build.
   - Record pre-existing failures separately from changes introduced by this branch.
   - Start a Vercel Preview deployment only after local checks; do not use the production deployment command.
   - Inspect the Preview routes for customer, tours, planner, booking, guide, and admin/sign-in gates. Report the Preview URL and exact changed-file list before any merge to `main`.

## Review Focus

- No runtime port or Supabase adapter is replaced by an old demo/mock implementation.
- Planner natural-language mode is visible on first load and manual form remains reachable.
- Current guide calendar and portal assignment data remain intact.
- No schema, migration, or seed duplication is introduced.
- Every completion claim has command or Preview evidence.
