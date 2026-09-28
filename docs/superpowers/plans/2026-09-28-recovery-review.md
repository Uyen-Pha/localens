# LocalLens guided recovery implementation plan

> Execute in this chat, with user-selected visual checkpoints. The user's request to choose between meaningful options overrides automatic continuation across visual decisions.

**Goal:** Recover the user's previously edited LocalLens interfaces, assemble one reviewable version, and preserve working runtime behavior and recoverable source history.

**Architecture:** Integrate selected changes into current runtime components on `codex/recovery-review`, initially based on `b902531`. Compare historical files and recovery worktrees before porting presentation. Keep runtime verification separate from visual acceptance.

**Tech Stack:** Next.js 16.3.2, React, TypeScript, pnpm 10.17.1, Vitest, Supabase, Vercel Preview.

**Spec:** User request on 28 September 2026 and `C:/Users/Admin/Documents/Project/output/recovery-audit-20260928/BAO-CAO-KHOI-PHUC.md`.

## Global constraints

- This worktree is the integration destination. Existing worktrees and broken-Git source folders are read-only references.
- Preserve the guide-calendar baseline `3ad187f` and existing Supabase ports, ownership checks, booking/payment transitions and role gates.
- Do not merge an entire historical branch or replace runtime adapters with demo adapters.
- Do not apply database migrations, seed records, or promote Production during visual review.
- Default planner entry stays natural language; manual entry remains available.
- Personalized quote expiry is min(issuedAt + 48 hours, departureAt - 24 hours); it is distinct from cancellation's 48-hour condition.
- Existing inherited cancellation and later guide/quote migrations require separate real-database verification.
- Six visible tour cards are not proof of six bookable database records.
- Present at most 2–3 concrete options at each meaningful visual/behavioral fork, recommend one and record the user's choice. Do not ask again about already-settled rules.
- Preserve all approved stages in separate commits and keep a ledger before Preview handoff.

## Task 1: Safe baseline and isolated review

Files: this plan; `docs/recovery/review-ledger.md`.

- [x] Verify current task/worktree state and prior backup.
- [x] Create isolated branch `codex/recovery-review` from b902531.
- [x] Install pinned dependencies and run existing recovery tests: 27/27 baseline tests passed.
- [x] Record baseline failures separately from introduced regressions: no failures in the five selected test files; full-suite/build not yet run.
- [x] Keep the independent Account changes reviewable and covered by their existing tests: 4d7ac77 and 648d0d7, followed by 28/28 tests, typecheck and changed-file lint passing.

## Task 2: Planner checkpoint

Files to compare: `components/customer/planner-surface.tsx`, `natural-language-personalization-form.tsx`, `personalization-form.tsx`, `research-planner-flow.tsx`, related CSS; historical `research-itinerary-timeline.tsx`, `research-guided-adjustments.tsx`, `research-request-revision.tsx`.

- [x] Show actual recovered vs historical screens, including natural input, manual form and return action.
- [x] Obtain the user's layout choice before changing a disputed layout. User chose A (compact form) on 28 September.
- [ ] Trace presentation inputs against `ResearchPlannerFlow`, the current planner port, saved preferences and request/revision state. Port only components with compatible boundaries.
- [ ] Verify natural-to-manual switching, preferences preservation, itinerary display, and confirmation/submission availability without claiming missing backend operations work.
- [ ] Run relevant component/unit tests, typecheck, changed-file lint and build; commit the accepted unit.

## Task 3: Home and fixed tours checkpoint

Files: `components/customer/customer-home.tsx`, `runtime-tour-catalog.tsx`, `runtime-tour-detail.tsx` when present, `app/styles/editorial-home-green.css`, `app/styles/runtime-tours.css`, `lib/application/fixed-tour/recovered-catalog.ts`.

- [ ] Compare recovered screens with historical green-customer/design-tours and guide-release source.
- [ ] Keep stable tour identity and existing availability/query sources; distinguish proposed tour cards from bookable records.
- [ ] Review layout with the user; verify navigation, filtering, detail and booking links; commit.

## Task 4: Booking, personalized requests and quotes checkpoint

Files: `components/customer/runtime-fixed-tour-booking.tsx`, `runtime-fixed-tour-account.tsx`, `custom-request-flow.tsx`, related booking styles, source `research-demo-requests.tsx`, `research-quote-checkout.tsx`, quote-recovery changes.

- [ ] Compare fixed checkout and personalized checkout separately; preserve fixed-tour hold and personalized quote deadline semantics.
- [ ] Restore appropriate presentation and request pagination only after checking the current data contract.
- [ ] Show the user the chosen screens and explicitly identify any database-dependent operation still pending.
- [ ] Verify existing booking/payment/cancellation tests and accepted layout, then commit.

## Task 5: Admin and guide checkpoint

Files: `components/portals/supabase-portal-surface.tsx`, `components/admin/runtime-booking-management.tsx`, `runtime-guide-assignment-queue.tsx`, `components/guide/runtime-guide-portal.tsx`, `guide-schedule.tsx`, related styles.

- [ ] Keep the month calendar and inspect separate demo/runtime entry points.
- [ ] Restore accepted profile/calendar/detail/admin presentation against existing runtime ports.
- [ ] Review the de7766c guide-assignment migration as a separate business change, not a UI recovery patch.
- [ ] Verify role routes, list/calendar/filter/detail behavior and responsive overflow; commit.

## Task 6: Unified preview and handoff

- [ ] Run typecheck, lint, relevant tests and build, recording baseline failures if any.
- [ ] Create Vercel Preview only for the accepted integration SHA; verify Preview runtime settings and origin handling.
- [ ] Check customer, guide and admin routes, then deliver Preview URL, SHA, changed-file list and unresolved live-database limits.
- [ ] Production remains a separate user decision.

## Review focus

- UI approval is not runtime/database acceptance.
- Natural-language switching must not discard a customer's prepared request silently.
- Personalization request confirmation is not booking/payment confirmation.
- Multiple recovery branches overlap in shared dictionaries, shell composition and contracts.
- Existing source folders may change through other tasks; use backup hashes and recheck before copying.
