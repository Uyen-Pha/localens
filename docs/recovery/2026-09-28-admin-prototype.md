# Admin prototype recovery — 2026-09-28

## Approved scope

Separate /vi/admin/prototype/ route with synthetic, in-memory data. No Supabase writes, schema changes, migrations, main merge or production deployment.

Screens: overview, accounts, places, fixed tours, departures, read-only bookings/payments, reports.
Planner, quote/deadline, guide/assignment, booking cancellation and existing payment/runtime components remain untouched.
Reload resets prototype edits. Navigation between sections preserves edits.

## Behavior

- Departure creation requires a published tour. Created version, start/end and capacity are immutable.
- Tour publication and departures share one in-memory workspace; cancellation updates tour history and archive eligibility.
- Archived tours retain readable departure history, with creation disabled.
- Remaining sample capacity is capacity minus valid sample bookings minus active sample holds. Fixtures are examples, not a live booking ledger.
- No buttons navigate from this prototype into existing Admin mutation routes.
- Tour dialog drafts are separate from the selected-tour editor.
- Bookings/payments/reports are read-only synthetic examples, not synchronized with actual bookings.

## Verification

- Red/green regression tests: modal preserves unsaved editor, shared tour/departure lifecycle, archived departure history.
- Initial full suite: 2261 passed / 77 failed; all 77 failure names match the earlier baseline (2219 passed / 77 failed). This run predates the last three regression tests.
- Final focused suite: 45/45 passed across 12 files; typecheck, changed-file lint and build:demo passed.
- No database tests or migrations executed because this change has no database path.
- Browser checked section navigation, departure create dialog, breadcrumb staying on prototype, mobile page overflow and console errors.
- Earlier recovered legacy fixtures and CSS came selectively from localens-guide-release, not a branch merge.

## Files

New Admin prototype shell/navigation and six screen component/CSS pairs in components/admin.
New fixture-only application/domain helpers in lib/application/admin-* and lib/infrastructure/demo/admin-*.
New read-only fixtures in components/dev/admin-*-fixture.ts.
Dependencies: components/customer/review-modal.tsx, components/ui/money-input.tsx, lib/format-money-input.ts.
New isolated app/[locale]/admin/prototype/page.tsx and focused tests.

Existing runtime routes and protected modules were not edited.
