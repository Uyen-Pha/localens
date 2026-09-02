# LocalLens B2.2b Runtime Simulated Payment Specification

**Date:** 2026-09-02
**Status:** Approved for implementation
**Scope:** Local runtime fixed-tour payment simulation only

## 1. Outcome

B2.2b turns a B2.2a PostgreSQL-backed fixed-tour hold into an authoritative payment and booking result. The browser may choose a thesis-demo outcome, but PostgreSQL derives the customer, booking, amount, currency, hold, and legal state transition. No real charge is created and no card details are collected.

The business label remains **Payment / Thanh toán**. Every action and result is explicitly disclosed as **simulated for the thesis demo**.

## 2. Supported outcome

The browser does not submit an outcome. The public operation means only “complete this thesis payment simulation”:

- With an active hold: `pending_payment -> payment_processing -> confirmed`, simulated payment `paid`, hold `consumed`.
- After the hold has expired: the server expires the stale hold and booking, records no paid payment, and returns the authoritative expired result. A late click never restores capacity or fabricates payment success.

Failure/retry needs a non-terminal attempt model and is a follow-up after this success-path checkpoint. It must not set the durable payment to terminal `failed` while advertising retry. Cancellation is not a payment outcome; customer cancellation and administrator resolution remain B2.3.

## 3. Authority and persistence

Add a dedicated runtime-simulation authority; do not call the Stripe finalizer and do not fabricate `cs_`, `pi_`, `evt_`, account, endpoint, or webhook facts.

- A private simulated-payment receipt stores one terminal simulation result per booking, including an expired result with no paid payment.
- A public SECURITY DEFINER RPC derives the JWT subject and verifies the database role is `customer`.
- The RPC accepts only `booking_id` and `idempotency_key`.
- Amount, currency, owner, checkout attempt, departure, and hold are loaded from server-owned rows.
- A named `NOLOGIN`, `NOBYPASSRLS`, `NOINHERIT` owner receives only the grants needed for the transaction.
- Browser roles receive no direct access to booking, hold, checkout-attempt, real-payment, or simulated-payment base tables.
- A separate owner-scoped projection exposes only booking id, booking status, nullable simulated payment status, amount, currency, and simulation time.

## 4. Idempotency and locking

The canonical request identity is customer + booking + idempotency key.

- Exact replay returns the durable original result with `state = replayed` and performs no new mutation.
- Reusing an idempotency key for another booking returns `IDEMPOTENCY_CONFLICT`.
- A booking can have only one terminal simulated-payment receipt. A second terminalization request returns the original result only when it is an exact replay; otherwise it conflicts.
- Lock order follows the existing checkout/payment order: checkout idempotency -> departure -> booking -> hold -> checkout attempt -> real payment check -> simulated receipt.
- Database time is sampled after locks. The browser cannot submit or influence timestamps.
- If a real payment already exists for the booking, simulation fails closed.
- Existing checkout compensation must replay without cancelling or expiring a booking that already has a paid simulated receipt.

## 5. Browser contract

Extend `FixedTourRuntimePort` with:

- `listOwnPaymentStatuses()` for the owner-scoped projection.
- `completeSimulatedPayment({ bookingId, idempotencyKey })` returning exactly `bookingId`, `bookingStatus`, nullable `paymentStatus`, `simulatedAt`, and `state`.

All input and output objects use exact-field validation. Unknown fields, malformed UUIDs, unsupported outcomes, unsafe keys, extra rows, and malformed status rows fail closed.

## 6. Account experience

For each fixed-tour booking, the account surface displays booking status and payment status separately.

- A pending booking exposes one action: complete simulated payment.
- The disclosure states that no card details are requested and no real charge occurs.
- While submitting, both actions are disabled and a live status is announced.
- On success, the component reloads authoritative bookings and payment statuses rather than applying an optimistic terminal state.
- Confirmed, failed, review, expired, cancelled, and completed bookings expose no payment action.
- EN and VI labels, loading, empty, unavailable, denied, conflict, and terminal states are covered.

## 7. Acceptance

B2.2b is accepted only when all of the following pass:

1. pgTAP proves ownership, grants, projection isolation, success/expiry transitions, exact replay, conflicts, compensation hardening, real-payment exclusion, and no provider-fact fabrication.
2. Two-session concurrency proves one terminal receipt and one monotonic booking/hold transition.
3. Unit/component tests prove strict contracts, adapter error mapping, EN/VI UI, disabled/submitting behavior, authoritative reload, and no action on terminal bookings.
4. Runtime Playwright proves EN and VI customers can complete payment, persistence after reload/new context, owner isolation, denied anonymous/guide/admin calls, exact replay, and conflict behavior against local Supabase.
5. `pnpm check`, `pnpm build:supabase`, `pnpm db:verify`, and the runtime fixed-tour E2E gate pass on the final commit.

## 8. Explicit exclusions

- Real Stripe Checkout or production payment processing.
- Card collection, refunds, receipts, or financial settlement.
- Customer cancellation and admin cancellation resolution (B2.3).
- Guide assignment and guide lifecycle (B2.4).
- Staging or production deployment.
