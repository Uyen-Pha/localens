# Customer bookings UI recovery

Approved target: the user's two bookings screenshots; green compact layout, personalized requests first, fixed bookings below, independent five-item pagination. Preserve current Supabase adapters, database, payment/cancellation policies and all unrelated recovered pages. Preview only.

## Product changes

- `components/portals/customer-account.tsx`: render requests before reviewed fixed bookings.
- `components/portals/customer-account.module.css`: bounded page width and smaller responsive heading.
- `components/customer/research-request-list.tsx`: request/destination search, status filter, newest/oldest sort, refresh, first-page reset on controls, compact itinerary metadata; retain submitted itinerary/history disclosures.
- `components/customer/research-request-list.module.css`: compact desktop columns, stacked mobile content, wrapping controls and visible keyboard focus.
- `components/customer/reviewed-bookings.module.css`: smaller thumbnails/cards, wrapping actions/metadata, responsive booking details.
- Tests: request filtering/sorting/refresh/pagination and account section order.

## Boundaries and unresolved pre-existing issues

- ResearchRequestPort currently exposes request status and itinerary only. It does not expose quotes or quote payment actions. The restored request list intentionally does not fabricate a payable quote from an approved request. Full legacy quotation/payment UI restoration is NOT included in this UI-only checkpoint.
- The older Preview visibly shows a separate RuntimeFixedTourAccount service error below the working reviewed-bookings list. That runtime/service is preserved, not silently hidden or replaced.
- No orders, payments, cancellations, migrations or database records were created/changed during verification.
- Full suite was already failing before this change; do not claim an all-green suite.

## Verification

Two new request tests failed before implementation (missing search and sorting), then passed. Existing fixed booking, detail, payment-status and cancellation tests also passed. Independent read-only review identified low-contrast keyboard focus; focus color was darkened to #287258.

Typecheck and lint passed. Local Supabase-mode webpack compilation passed using the actual project URL and an explicitly nonfunctional build-only public-key placeholder; this proves compilation, NOT authenticated connectivity. Remote Preview must use its existing real environment.

Final test/deployment and screenshot evidence will be recorded after completion. No production release or main merge is authorized by this checkpoint.
