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

## Verified Preview

- Product source: `645ba13a126b097411e1ff45db8cbba69ea89302`. Complete-history bundle verified: `Project/output/recovery-audit-20260928/recovery-tour-visuals.bundle`.
- URL: https://localens-ky8urh7pf-local-lens2.vercel.app/vi/tours/
- Homepage: https://localens-ky8urh7pf-local-lens2.vercel.app/vi/
- Deployment `dpl_AxoCkZqSvJDBFmzxrKs8WJYCfJ9a`: remote build passed, READY, explicit Preview target. No main merge, GitHub push or production promotion.
- Browser: six cards; all six image elements complete with nonzero natural widths; individual artwork for all three additions. Correct hours/minutes visible. Each of four budget options tested against live catalog: 1 / 1 / 2 / 2 results; Clear filters restores six.
- Desktop and mobile catalog client/scroll widths matched (1265/1265 and 375/375); expanded mobile itinerary readable. Temporary viewport reset. Screenshots: `Project/output/recovery-audit-20260928/tours-restored-artwork.png` and `tours-restored-mobile.png`.
- Homepage map remains visible. One automated pointer attempt on the homepage tour link did not navigate; keyboard activation navigated and loaded six cards. Do not claim complete pointer-path acceptance from this check.
- Live records still have no eligible future bookable departure; UI shows unavailable/no-departure notes. No schedules or reservations created.

## Separately approved Planner origin

After the deployment URL was known, the user explicitly approved adding only `https://localens-ky8urh7pf-local-lens2.vercel.app` to the existing five-origin list. A fresh SHA-256 guard verified the prior exact value before writing `ALLOWED_ORIGINS`; all other existing secret digests remained unchanged. New digest: `8e77c9ac5223c741bc3dead88fa51cfca5ecd64f5ea8b98ae997b6ec6a49133c`.

Read-only research-planner OPTIONS: all six approved origins return 204 with their own Access-Control-Allow-Origin. Unapproved example still returns 403 without allow-origin. No wildcard, database write, migration, authentication change or Edge code deployment. This verifies CORS permission, not generation/refinement/submission; the previously reported disabled adjustment controls remain unresolved.
