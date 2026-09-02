# LocalLens B2.3 Runtime Cancellation Specification

## Outcome

Replace the demo-only cancellation seam with a local Supabase runtime vertical slice. A customer requests cancellation and an administrator decides it. The customer may request cancellation only while the booking is `pending_payment` (the thesis state `Chờ xác nhận`).

## Business boundary

- Customer action is a cancellation request, not a direct booking transition.
- Creating a request leaves the booking and active capacity hold unchanged.
- Administrator approval changes `pending_payment -> cancelled` and `active -> released` atomically.
- Administrator rejection leaves the booking and hold unchanged.
- Payment, expiry, or any other non-`pending_payment` state makes approval fail closed.
- Guide users cannot request, read the admin queue, or decide cancellation.

## Authority and data

- Store a private immutable request identity with booking, owner, reason, idempotency key, request time, status, administrator decision note, actor, and decision time.
- Browser customer input is exactly booking ID, reason, and idempotency key.
- Browser administrator input is exactly request ID, decision, note, and idempotency key.
- Customer projection exposes only its own request status and sanitized decision facts.
- Administrator projection exposes the review queue without payment-provider or private checkout facts.
- Exact replay returns the existing authoritative result; changed payload under the same key conflicts.
- Customer/admin/guide and cross-owner/cross-role access fail closed at the RPC boundary.

## Concurrency

- Reuse the checkout routing row and the established order: checkout idempotency, departure, booking, hold, then cancellation request.
- Approval racing simulated payment has one winner. A cancelled booking cannot be paid; a paid/confirmed booking cannot be cancelled.
- Approval releases capacity once. Replay never releases it twice.
- Compensation cannot downgrade a cancellation decision or paid simulation.

## Runtime UX

- Customer account offers the request action only for `pending_payment` with no existing request.
- The form requires a bounded reason and explicitly says the administrator decides the request.
- Customer and admin mutations reload authoritative projections before announcing success.
- EN and VI cover pending, approved, rejected, denied, conflict, loading, and error states.
- Admin portal shows a runtime cancellation queue and approve/reject controls only to administrators.
- Demo mode remains separate; no local/session storage is business authority in Supabase mode.

## Acceptance

- pgTAP proves schema, least privilege, exact payloads, owner/role isolation, state eligibility, replay/conflict, approve/reject, capacity release, and terminal-state denial.
- A two-session race proves payment-versus-approval has exactly one terminal winner.
- Component and contract tests cover both locales and accessibility announcements.
- Runtime Playwright covers customer request, administrator decision, relogin persistence, denial, replay/conflict, and no demo storage.

## Out of scope

- Cancellation after payment/confirmation.
- Refunds, real payment-provider cancellation, email/SMS, guide action, and production deployment.
