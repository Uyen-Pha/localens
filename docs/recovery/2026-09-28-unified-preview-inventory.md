# Unified Preview inventory and execution ledger

Plan: docs/superpowers/plans/2026-09-28-unified-preview.md

## Preserved checkpoints

- main: b791d3d56fd3656bcfe0ddce0ded7d20d281d6f6; backup codex/backup-main-before-unified-20260928.
- fetched origin/main: 3ad187ff61e1898cc20049a31ae1ece98761fb32.
- recovery: 5a67488dd063f7bacc2fb821c721b0cb4691f9ae; backup codex/backup-recovery-before-unified-20260928.
- Production inspected read-only: dpl_25gE3NcfK4XCynHevS6U4aP7dK3R, localens-eh0q0kw9t-local-lens2.vercel.app, READY; alias localens-ashen unchanged. Its source SHA has not been established.
- No old branches merged or worktrees reset/deleted.

## Existing consolidated source

| Surface | Evidence | Mode |
| --- | --- | --- |
| Six tour catalog | f3dff0e compact cards | existing runtime catalog |
| Tour detail/booking | f7923f6 combined entry | existing departure IDs and adapter |
| Bookings | 71edcfb personalized-first, 6c76964 quote table | existing customer adapters |
| Personalized checkout | 6c76964 | existing RPC; simulated payment |
| Planner | 5a67488 72-hour guard and no-area budget hint | existing research Edge service |
| Guide | effb8cb banner/profile/calendar | existing guide adapter |
| Admin catalog | 9c1d809 | in-memory prototype, no Supabase writes |
| Admin orders/assignment | existing RuntimeBookingManagement/RuntimeGuideAssignmentQueue | existing runtime ports |

## Decisions and boundaries

### Latest approved update

- Departure-time guard: eligible assignment rows and counts exclude startAt <= current time; UI refreshes once per second and on window focus. Selected started tours become read-only. Confirmation rechecks Date.now, and the local fixture mutation independently rejects started/invalid departures before any write. No Supabase/RPC changes. 10 focused tests passed, including exact-start and stale-open confirmation cases.

- Overview follow-up: user clarified that overview must be navigation only. Removed old connected orders/assignment widgets from overview; reused the eight management shortcut cards. Five sidebar/shortcut tests and changed-file lint passed. Individual management screens/data modes unchanged.

- Follow-up: user also approved sample assignment data. Assignments tab now uses restored AdminAssignmentsFixture (20 rows, 7 unassigned, 13 assigned); manual confirmation updates only component memory. Existing overview runtime widgets and personalized quote runtime remain unchanged.
- Orders detail panel now receives focus and scrolls into view on load, success or failure. Regression checks cover selecting two distinct orders.
- Latest follow-up tests: 11 passed across sample assignment, order detail focus, existing sample orders and sidebar integration. TypeScript and lint passed.

- User approved sample data for the Orders tab to match the supplied screenshot. This supersedes the earlier runtime-orders-only decision for that tab. The overview retains its existing read-only runtime widget.
- Orders tab reuses AdminBookingsPreview and its existing fixture port; no database writes.
- Sidebar order: overview, orders, assignments, departures, accounts, places, fixed tours, personalized tours, reports.
- Personalized administration now reuses the source research-demo Supabase adapter and RPCs, not fixture decisions or quotes. The earlier missing-port blocker below is superseded by this restoration.
- Connected screens remount on activation to reload data. Prototype screens preserve their in-memory workspace.
- Latest focused checks: 12 tests passed; TypeScript and changed-source lint passed. Full earlier suite: 2287 passed, 82 failed; not a release-ready result.
- Candidate Preview: https://localens-q3ru1syu2-local-lens2.vercel.app/vi/admin/ (deployment verification pending at writing).
- No main merge, Production deployment, schema changes, migrations or database mutations.

- Pre-flight: Task 2 admin entry consumes session/role guard already used by Task 3 login tests; preserve it rather than new authentication.
- Ruling: runtime admin overview retains existing orders and assignment widgets, with new sidebar slots for each; avoids replacing real ports with preview booking fixtures. Cost: existing widget layouts remain inside the new shell.
- Ruling: existing SupabasePortalShell has no admin research quote port or screen. Do not invent a parallel adapter or substitute demo quote records. Full quote administration remains a release blocker, not a completed feature.
- Ruling: production metadata and branch backups are separate evidence; cached origin/main is not proof of deployed Production source.
- Ruling: retain clear temporary-data notices for in-memory screens; no misleading claim that prototype edits persist.
- RED: unified-entry failed on missing authenticated identity; integration sign-out tests failed on missing new admin navigation.
- GREEN: 56 tests across unified-entry, admin prototype and Supabase portal passed, including existing wrong-role and sign-out checks.
- Task 1 inventory complete for current candidate; not a claim that every historical design branch is fully restored.
- Remaining: full suite comparison, build, Preview, authenticated three-role acceptance, quote administration gap.
