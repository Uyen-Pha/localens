# Restore personalized requests, quote detail and payment navigation

## Root cause and scope

The prior bookings UI checkpoint only exposed ResearchRequestSummary's request fields. The deployed `research_demo_list` still returns `quotes`, `processingDueAt`, and `processingCompletedAt`, but the newer Zod schema stripped them. Read-only `pg_get_functiondef` verification confirmed existing `research_demo_booking(p_quote,p_create)` and `research_demo_checkout(p_quote,p_details)` RPCs and their payloads. No database recovery, record duplication, schema migration, or backend-policy changes were needed.

The customer table now follows the supplied reference: request code, itinerary, submitted/processing timestamps, request/quote status, and actions. Search, status filter, sorting, refresh and five-row pagination remain. On narrow screens rows stack into labeled cards.

## Routes and controls

- View details / View quote: `/[locale]/personalized-request/?request=...&quote=...` (quote optional).
- Pay / View result: `/[locale]/personalized-payment/?request=...&quote=...`.
- The separate detail page includes submitted itinerary, processing history, issued quotes, amount, conditions and expiry.
- The separate payment page reads the existing booking with `p_create=false`. Only explicit confirmation creates a booking. Traveler fields match the deployed RPC: name, ISO country, international phone, email. A second confirmation submits the simulated payment.
- Expired/unapproved/past-departure requests cannot be paid; confirmed bookings show their result instead of a new form. A failed/unknown request disables repeat payment until refresh. Quote status `accepted` is not assumed to mean paid: the payment page reads the actual booking.
- No 15-minute hold countdown for personalized quotes. Uses the existing server-provided quote/payment deadline.
- Exact safe sign-in return paths added for the two new pages, with no change to customer fallback or other roles.

## Review and verification

Expected RED tests confirmed the missing quote fields and payment links, then passed after recovery. Independent review found stale content across query-only navigation and lost traveler data on Edit; both were reproduced with failing tests and fixed using query-keyed page state and a retained draft.

46 focused tests passed after fixes; nine additional fixed-booking/order tests also passed. Typecheck, lint and local Supabase-mode webpack build passed (local build used a nonfunctional build-only public key, so this is compilation evidence only). Full suite: 2,219 passed / 77 failed / 2,296 total, with no new failure names versus bookings-suite.json. The full report includes all nine new payment-page tests passing, including both review fixes. Baseline failure names remain in docs/recovery/2026-09-28-preview-remaining-failures.md; machine report: C:/Users/Admin/Documents/Project/output/recovery-audit-20260928/personalized-checkout-suite.json.

Browser testing must not create/pay/cancel real records. Visual QA is pending authenticated access to the new Preview, not implied by a successful build.

## Changed files

- lib/infrastructure/supabase/research-request-adapter.ts
- lib/navigation/safe-return-to.ts
- components/customer/research-request-list.tsx
- components/customer/research-request-list.module.css
- components/customer/personalized-request-page.tsx
- components/customer/personalized-request-page.module.css
- app/[locale]/personalized-request/page.tsx
- app/[locale]/personalized-payment/page.tsx
- tests/unit/supabase/research-request-adapter.test.ts
- tests/unit/navigation/safe-return-to.test.ts
- tests/components/customer/research-request-list.test.tsx
- tests/components/customer/personalized-request-page.test.tsx

Existing fixed-booking, admin, guide, planner, database and payment business logic are preserved. No production deployment or main merge.
