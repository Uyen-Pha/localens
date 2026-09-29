# Approved booking coverage handoff

The selected direction is Supabase LOCAL for the approved booking journey. Do not
add offline booking, join the two runtimes, use hosted services, or drop the old
journey assertions before equivalent reviewed-booking acceptance exists.

## Current evidence

`integrated-demo-flow.spec.ts` still contains the legacy browser-demo booking
journeys. `runtime-fixed-tour.spec.ts` exercises `begin_fixed_tour_booking` and
`complete_simulated_fixed_tour_payment` with the `b220...0043` fixture. It does
not exercise the approved `BookingLocalPreview` / `PaymentPreview` adapter.

The approved route creates holds through `reviewed_demo_begin`, navigates to
`/payment-preview/?booking=...`, pays through `reviewed_demo_checkout`, and reads
the same booking through `reviewed_demo_read`. These are not interchangeable
with the older RPCs.

## Assertion mapping required before retiring legacy journeys

| Existing behavior | Demo boundary coverage | Supabase LOCAL reviewed acceptance required |
| --- | --- | --- |
| Catalog and departure selection, EN/VI | Approved detail links; no fabricated live capacity | Catalog availability, reviewed departure, party size and price |
| Signed-out booking intent | Submit routes to sign-in with a safe local return path; external return-to rejected | Password sign-in resumes the same approved departure and party size |
| Hold creation and expiry | No offline hold or payment can be created | Observe `reviewed_demo_begin`; assert persisted ID, owner, party size, total, expiry and reload recovery |
| Declined payment and retry | No runtime means no payment success | Fill actual checkout contact/passenger fields; declined result then successful retry on the same booking; no duplicate booking/charge state |
| Customer confirmation | No invented confirmed booking in browser-demo storage | `reviewed_demo_checkout` and `reviewed_demo_read` agree on confirmed/paid state after reload and relogin |
| Admin assignment and guide visibility | Test AdminAssignmentsFixture local rows/history independently | Retain guide visibility/authorization tests against its existing assignment adapter (`assign_fixed_departure_guide` / `get_guide_schedule`); do not invent a bridge from reviewed bookings to the Admin demo |
| Ownership and authority | Staff cannot access customer content | A second customer, anonymous user and staff cannot mutate/read another customer's booking outside their authorized views |

## Additional coordinated scope

1. Provide an isolated loopback-only Supabase LOCAL instance or explicit ownership
   of the existing local database, plus approved reviewed departure and account
   fixtures with a future departure and deterministic availability.
2. Add a dedicated reviewed-booking Playwright entry point and browser tests for
   the mapping above. Preserve the older runtime suite for its distinct RPCs.
3. Coordinate runner/fixture work with the scripts/database owner. The existing
   fixed-tour runner executes `db:reset` and seeds the older fixed-tour fixture;
   do not launch it against a database used by another task.
4. Run the reviewed journey locally and record results before replacing the
   legacy demo journey with signed-out/no-runtime boundary tests. No assertion
   should disappear merely because the demo runtime cannot perform it.

No reviewed-booking LOCAL browser acceptance has been run by this frontend task.

## Confirmed assignment boundary

The approved Admin prototype mounts `AdminAssignmentsFixture`, which changes
in-memory sample rows/history. The Supabase Guide portal uses its separate
assignment adapter. Neither is a reviewed-booking assignment integration.
Requiring a common reviewed-booking ID across them would expand the approved
prototype, so that bridge is explicitly out of scope.

## Coordinated local verification, 2026-09-29

The dedicated `pnpm test:e2e:runtime-reviewed-booking` runner is now implemented
and included in the local CI job. Chrome passed both EN/VI journeys against an
owned ephemeral Supabase stack, including cleanup (session 91016, exit 0).
The network guard regression suite separately passed five tests. Browser HTTP
and WebSocket requests remain restricted to owned loopback origins; redirects
are not followed and service workers are blocked.

This confirms the customer journey assertions implemented in the new spec, not
every row of the broader mapping above. Legacy RPC replay/conflict, staff and
anonymous authority, expiry enforcement, cancellation projections and guide
assignment retain their separate suites. Their stale browser setup still needs
to be decoupled from the older UI before claiming the entire runtime CI passes.
Do not delete those assertions or connect the Admin fixture to reviewed bookings.
