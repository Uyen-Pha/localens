# LocalLens B2.2a — Fixed-tour runtime local

**Status:** Runtime-verified local on 2026-09-02

**Goal:** Connect one complete fixed-tour booking-hold path to local Supabase/PostgreSQL: an authenticated customer reads a bilingual synthetic runtime tour, reads live availability, creates or resumes a 35-minute hold, and sees only their own durable booking after reload or a new browser context.

## Product boundary

B2.2a is a `runtime-verified-local` slice. It is not staging, production, a completed payment flow, or whole-product completion.

- Runtime data is a deterministic, synthetic, local-only fixture.
- Existing `research_only` and pending-approval catalog files are never promoted or imported.
- A created booking remains `pending_payment`; the UI must not claim payment success.
- Payment simulation, guide assignment, personalized tours, public catalog approval, and staging deployment remain later slices.
- Demo mode remains behaviorally unchanged and must not import the Supabase runtime adapter.

## Accepted customer flow

1. A local Supabase customer signs in.
2. `/[locale]/tours` reads `published_tours_v` for `en` or `vi` and joins the matching rows from `get_live_departure_availability()`.
3. The customer selects a scheduled departure and party size.
4. The browser sends only `departureId`, `partySize`, `locale`, and a client idempotency key.
5. A public authenticated RPC derives the JWT subject and canonical request hash server-side, calls `private.start_checkout_tx`, and returns only `bookingId`, `holdExpiresAt`, and `created|resumed`.
6. `/[locale]/account` reads `customer_bookings_v`; reload and a new browser context preserve the booking in PostgreSQL.

## Security and authority

- `auth.uid()`/JWT subject and the authoritative database role select the actor; no actor ID or role arrives from the browser.
- The RPC and owner-booking RLS normalize both PostgREST claim forms: legacy `request.jwt.claim.sub` and JSON `request.jwt.claims ->> 'sub'`. The wrapper sets the transaction-local legacy value before entering the existing checkout transaction so its canonical payload remains authoritative.
- Amount, currency, booking status, hold duration, title, policy, source snapshots, and provider idempotency values remain server-owned.
- The public RPC accepts only a departure source and exposes no generic quote checkout seam.
- Anonymous, guide, and admin callers cannot create a fixed-tour hold.
- `customer_bookings_v` remains owner-scoped by forced RLS; a second customer must receive zero rows for the first customer's booking.
- The wrapper is `SECURITY DEFINER`, has `search_path = ''`, a narrow non-login owner, exact grants, deterministic validation, and no service-role key in the browser bundle.
- Retry with the same idempotency key and normalized payload resumes the booking; a changed payload conflicts.

## Runtime fixture

The local-only fixture creates:

- one second customer for executable cross-owner checks;
- one synthetic published catalog snapshot and travel snapshot;
- one published tour/version with complete EN/VI translations and deterministic stops;
- at least one future scheduled departure with known capacity.

The seed must:

- require loopback Supabase API and database endpoints;
- fail closed outside local mode;
- be idempotent and transaction-safe;
- compensate across the non-transactional Auth boundary: delete only a newly created customer-B Auth user after a database failure, never a reused identity, and preserve the original redacted failure;
- redact credentials and connection strings;
- never read or mutate `data/sources/**` or `data/approvals/**`.

## Application ports

The browser-facing contract is intentionally narrower than the existing checkout engine DTO:

```ts
interface FixedTourRuntimePort {
  listPublishedTours(locale: Locale): Promise<PublishedTour[]>;
  listAvailability(): Promise<LiveDepartureAvailability[]>;
  beginBooking(input: {
    departureId: string;
    partySize: number;
    locale: Locale;
    idempotencyKey: string;
  }): Promise<{
    bookingId: string;
    holdExpiresAt: string;
    state: "created" | "resumed";
  }>;
  listOwnBookings(): Promise<CustomerBooking[]>;
}
```

Strict existing mappers remain authoritative for published tours, availability, and customer bookings. The new adapter validates exact RPC output and converts database failures to stable application errors without leaking SQL or credentials.

## UI behavior

- Demo mode keeps the existing deterministic catalog and booking flow.
- Supabase mode shows runtime data only after session initialization.
- EN and VI render localized tour content and bounded local-runtime disclosure.
- Sold-out or stale availability disables booking and forces a refresh before retry.
- A successful hold routes to the customer account and clearly states that payment is still pending.
- Loading, empty, invalid input, unauthenticated, forbidden, idempotency conflict, sold-out, and service-unavailable states are accessible and localized.

## Acceptance

B2.2a is complete only when all are true:

- EN customer A and VI customer B each see the localized synthetic tour and availability.
- Each can create a hold; reload and a new browser context preserve their own booking.
- Customer A cannot see B's booking and B cannot see A's booking.
- Anonymous, guide, and admin callers cannot invoke the hold RPC.
- Same-key/same-payload retry resumes; same-key/changed-payload conflicts.
- Two-session authenticated concurrency through `public.begin_fixed_tour_booking` proves no oversell.
- Browser/network payloads expose no actor ID, provider idempotency key, database URL, service-role key, or client-authored amount/status.
- pgTAP/RLS, generated security inventories, database types, `build:supabase`, `pnpm check`, demo E2E, runtime Auth E2E, and runtime fixed-tour E2E pass from clean owned servers.

## Deferred slices

- B2.2b: server-side simulated payment completion and booking status transitions.
- B2.3: personalized-tour runtime persistence and quote review.
- B2.4: guide/admin operational data and assignment flows.
- B3: staging deployment after credentials and targets are explicitly supplied.

## Verification record — 2026-09-02

- Exact `pnpm check`: lint and typecheck passed; Vitest passed 96 files/1,113 tests; demo build generated 24/24 routes.
- Exact `pnpm build:supabase`: generated 24/24 routes.
- Full local `pnpm db:verify` with both explicit loopback guards: schema lint returned zero findings; pgTAP passed 15 files/1,460 tests; all 6/6 two-session concurrency scenarios passed; generated database types had no drift; cleanup stopped the owned stack.
- Exact `pnpm test:e2e`: 25/25 demo browser cases passed in 2.3 minutes from a directly owned fixture server; port 3300 had no listener after cleanup.
- Exact `pnpm test:e2e:runtime-auth`: 3/3 role-authentication cases passed against local Supabase.
- Exact `pnpm test:e2e:runtime-fixed-tour`: pgTAP passed 1,460 assertions and Playwright passed 4/4 cases, including EN/VI holds, reload and new-context persistence, owner isolation, exact `42501` role denial, exact RPC request/response surfaces, idempotent replay, and changed-payload conflicts.
- Independent review findings for stale capacity, unreported cleanup failure, and weak RPC denial assertions were fixed and rerun. The Windows Playwright web-server teardown hang was removed by giving demo E2E a direct owned-server runner with bounded cleanup.

This evidence completes B2.2a only at `runtime-verified-local`. It does not complete payment, B2.2b–B2.4, staging, production deployment, or the whole product.
