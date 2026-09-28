# Admin prototype recovery — 2026-09-28

Preview: https://localens-ozxhumjo6-local-lens2.vercel.app/vi/admin/prototype/
Product commit: 9c1d809. Vercel build succeeded. Browser opened overview and departures on this Preview, confirmed simulation notice, and reported no console errors.
Screenshot: C:/Users/Admin/Documents/Project/output/recovery-audit-20260928/admin-preview-final.png.
Recovery bundle: C:/Users/Admin/Documents/Project/output/recovery-audit-20260928/admin-prototype-9c1d809.bundle (verified).
No production alias or Planner allowed-origin changes were made.

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

## Exact product file list (9c1d809)

- app/[locale]/admin/prototype/page.tsx
- components/admin/admin-accounts.module.css
- components/admin/admin-accounts.tsx
- components/admin/admin-bookings-preview.module.css
- components/admin/admin-bookings-preview.tsx
- components/admin/admin-departures.module.css
- components/admin/admin-departures.tsx
- components/admin/admin-places.module.css
- components/admin/admin-places.tsx
- components/admin/admin-prototype-navigation.tsx
- components/admin/admin-prototype.module.css
- components/admin/admin-prototype.tsx
- components/admin/admin-reports-preview.module.css
- components/admin/admin-reports-preview.tsx
- components/admin/admin-tours.module.css
- components/admin/admin-tours.tsx
- components/customer/review-modal.tsx
- components/dev/admin-bookings-fixture.ts
- components/dev/admin-reports-fixture.ts
- components/ui/money-input.tsx
- design-qa.md
- docs/recovery/2026-09-28-admin-prototype.md
- lib/application/admin-accounts.ts
- lib/application/admin-bookings-preview.ts
- lib/application/admin-departures.ts
- lib/application/admin-places.ts
- lib/application/admin-reports-preview.ts
- lib/application/admin-tours.ts
- lib/format-money-input.ts
- lib/infrastructure/demo/admin-accounts.ts
- lib/infrastructure/demo/admin-places.ts
- lib/infrastructure/demo/admin-tours.ts
- lib/infrastructure/demo/admin-workspace.ts
- tests/components/admin/admin-accounts.test.tsx
- tests/components/admin/admin-bookings-preview.test.tsx
- tests/components/admin/admin-departures.test.tsx
- tests/components/admin/admin-places.test.tsx
- tests/components/admin/admin-prototype.test.tsx
- tests/components/admin/admin-reports-preview.test.tsx
- tests/components/admin/admin-tours.test.tsx
- tests/unit/admin-accounts.test.ts
- tests/unit/admin-departures.test.ts
- tests/unit/admin-places.test.ts
- tests/unit/admin-tours.test.ts
- tests/unit/admin-workspace.test.ts
