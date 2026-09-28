# Production release checkpoint

The user authorized publishing the approved thesis prototype to GitHub main and localens-ashen.vercel.app. Publication remains gated; do not interpret this checkpoint as a successful deployment.

## Recovery points

- GitHub main backup: `backup/main-before-thesis-release-20260928-2111` at `3ad187f`.
- Approved unified source backup: `backup/approved-unified-preview-20260928-2111` at `8255939`.
- Current Production deployment observed via Vercel inspect: `dpl_25gE3NcfK4XCynHevS6U4aP7dK3R`, https://localens-eh0q0kw9t-local-lens2.vercel.app, serving localens-ashen.vercel.app.

## Current changes

Remove technical persistence banners from admin and portal surfaces. Keep action errors and the no-real-charge payment disclosure. Targeted unified-entry checks: 6 passed; lint of the five changed source/test files passed.

## Unresolved gate

The full test run reports failures in fixed booking, portal/auth composition, planner, and SQL artifact checks. Some expectations visibly reference superseded UI, but failures have not all been classified. Do not claim the full suite passed or treat every failure as baseline.

The branch still includes `supabase/migrations/20260928100000_booking_cancellation_rules.sql` and related manifest/test changes under audit. These are not approved for execution. No migration, backfill, or hosted database modification was performed during this release attempt. Main and Production were not changed.

Preserve recovery branches/worktrees and unrelated local design-qa.md / tsconfig.tsbuildinfo modifications. Before release, reconcile audited SQL scope, classify test failures, verify the exact candidate, and then smoke-test all seven routes and authenticated roles. Roll back on divergence from the approved release; do not patch Production in place.
