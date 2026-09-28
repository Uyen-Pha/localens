# Approved tour visual restoration

User selected: restore individual images, compact spacing, hours/minutes duration and historical budget filters. Continue on `codex/recovery-review`; Preview only. Keep green homepage/map, six-card identities, existing detail disclosures and real-departure booking guard. No database, Supabase configuration, payment, booking or guide changes.

## Recovered source

Read-only reference: `C:/Users/Admin/Documents/Project/localens-guide-release`.

- Three original PNGs copied byte-for-byte into `public/images/tours`; SHA-256 source/destination comparison passed. Historical source files untouched. These remain illustrative artwork, not verified location photography.
- `lib/domain/data/tour-illustrations.ts` maps `ll-f04`, `ll-f05`, `ll-f06` to their individual images, with explicit illustrative alternative text.
- `components/customer/runtime-tour-catalog.tsx` reuses existing `formatTourDuration` and restores budget choices: below 300,000; 300,000 to below 600,000; 600,000 to below 1,000,000; at least 1,000,000 VND per guest.
- `lib/application/fixed-tour/search.ts` adds those filter predicates without removing legacy values used elsewhere. Boundary tests prevent overlap and omission.
- `app/styles/runtime-tours.css` selectively restores compact heading, vertical spacing, toolbar and readable metadata. Existing responsive grid, details and unavailable states retained.
- `tests/components/customer/recovered-tour-cards.test.tsx` adds price-boundary, image/duration and real UI-filter checks.

## Verification

- RED: six new tests failed for missing price predicates, wrong default artwork and absent filter choice.
- GREEN: 16 focused catalog/search/merge tests passed. Existing real-departure identity and unavailable-booking tests retained.
- Typecheck, lint and local webpack demo build passed. Full suite: 2,197 passed / 77 failed / 2,274 total. No new failing names versus `tours-final-suite.json`; named inherited failures remain in `2026-09-28-preview-remaining-failures.md`. This comparison does not establish all underlying failures are harmless. Raw report: `Project/output/recovery-audit-20260928/tours-visual-suite.json`.
- Independent read-only review found no blocking functional regression. It identified the original PNGs' combined 8.97 MB download size with unoptimized images. Exact source recovery is retained for this Preview; image compression is deferred, not claimed resolved.
- No frontend production deployment or main merge is authorized.

Deployment and final checks will be recorded below after verification.
