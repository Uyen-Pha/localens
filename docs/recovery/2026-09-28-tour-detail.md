# Fixed tour detail and daily departures recovery

## Scope

- Catalog image/title -> `/[locale]/tours/detail/?tour=<slug>` -> select a date -> existing booking route with real departure ID.
- All six tour descriptions, pictures, meeting points, itinerary, inclusions, exclusions and cancellation terms are visible on a separate detail page.
- Date selection uses HCMC (UTC+7). Booking links require a matching future, scheduled departure with remaining seats.
- Current reviewed booking, payment, cancellation and guide business functions are unchanged. Shared presentation metadata now recognizes all six existing tours.
- Preview only. No main merge or production release.

## Important correction from direct database evidence

Earlier statements that three additional tours lacked database departures were incorrect. Read-only Management API queries on `twsdtfotrkljgbfsrmgz` found all six tours already populated in `public.reviewed_demo_departures`.

Each tour has exactly 94 existing daily departures from 2026-09-29 through 2026-12-31, capacity 15. No insert, update, delete, migration or schema change was necessary or performed.

| Tour | HCMC start | Price VND |
|---|---|---:|
| Củ Chi / Bến Đình | 07:30 | 990000 |
| Cà phê vợt / Tân Định | 08:00 | 490000 |
| Dấu ấn Sài Gòn | 08:30 | 790000 |
| Chợ Lớn / Phú Bình | 09:00 | 1990000 |
| Bình Tây / bữa cơm | 10:00 | 290000 |
| Mỹ thuật / sông chiều tối | 15:00 | 1590000 |

Root cause: catalog used only past base dates, while booking used expanded daily identifiers. Additional tour presentation records were missing from the shared reviewed dataset even though their departure rows already existed. Catalog now uses the same daily identifiers as booking and gates available seats through the existing database availability RPC. Non-Supabase catalog mode does not invent available seats.

## Changed files

- app/[locale]/tours/detail/page.tsx
- app/styles/runtime-tours.css
- components/customer/runtime-tour-catalog.tsx
- components/customer/runtime-tour-detail.tsx
- components/customer/tour-detail-route.tsx
- components/dev/booking-local-preview.tsx
- components/dev/reviewed-departures.ts
- components/dev/reviewed-tours.ts
- tests/components/customer/recovered-tour-cards.test.tsx
- tests/components/customer/tour-detail.test.tsx
- tests/components/customer/tour-detail-daily.test.tsx
- this report

## Verification boundary

18 focused tests passed after observed RED failures. Typecheck passed after correcting a nullable meeting point; lint passed. Local webpack static build and Vercel Turbopack build both passed.

Full suite: 2203 passed / 77 failed / 2280 total. All 77 failing full names match the prior `tours-visual-suite.json` baseline; none added or removed. This name comparison is not a claim that every baseline defect is harmless. Failure names are tracked in `2026-09-28-preview-remaining-failures.md`; fresh report: `C:/Users/Admin/Documents/Project/output/recovery-audit-20260928/tour-detail-final-suite.json`.

Product checkpoint: `ee7cea51b9a026da5c428391a428764b398c2fc7`. Complete-history backup verified at `C:/Users/Admin/Documents/Project/output/recovery-audit-20260928/recovery-tour-detail.bundle`.

Preview: https://localens-n4ntqprpm-local-lens2.vercel.app/vi/tours/
Deployment: `dpl_4MHgruXSWbbYmDb6dCtvzHASC7P5`, READY. No production release or main push.

Live read-only browser checks: six catalog cards, all six detail routes and all six booking routes render matching titles, 29 September dates and 15 remaining seats. Changed Cu Chi to 30 September using native keyboard input and followed the link: booking retained 07:30-15:00, price 990000 VND and the selected date. Automated date `fill()` changed the input DOM without updating React state in this browser connector; keyboard input exercised the real change successfully. Mobile viewport 390px: clientWidth=scrollWidth=375px. Screenshots saved as `tour-detail-preview-desktop.png` and `tour-detail-preview-mobile.png` under the audit output directory. No booking/payment form was submitted.

With explicit user approval, appended only the exact new Preview origin to ALLOWED_ORIGINS, verified prior configuration digest before writing and all other secret hashes unchanged afterwards. All seven allowed origins returned OPTIONS 204 with matching ACAO; unapproved.example returned 403. No database rows were modified.

Payments remain simulated. No real booking or payment is submitted during this read-only UI verification. English prose for the three additional tours is still the existing Vietnamese source text; translation is not claimed complete.
