# LocalLens B2.4 — Runtime Guide Assignment

**Status:** Approved for TDD implementation on 2026-09-02

**Goal:** Connect the fixed-departure guide-assignment vertical slice to local Supabase/PostgreSQL: an administrator assigns or reassigns an eligible guide to a confirmed scheduled booking, and only that guide can read the sanitized assignment after reload or a new browser session.

## Product boundary

- B2.4 is a local-runtime slice. It is not staging, production, personalized-tour assignment, or whole-product completion.
- The authoritative thesis clarification keeps the guide UI read-only. A forward migration revokes browser execution of the legacy accept/complete functions; the functions may remain internal historical seams but are not a customer-facing capability.
- Assignment is limited to confirmed fixed-departure bookings whose departure is still scheduled.
- The guide sees only title, schedule, meeting point, party size, language, and allowlisted structured mobility/dietary flags. Customer identity, contact data, free-form notes, payment facts, and admin facts are excluded.
- Demo mode retains its existing fixed-departure assignment behavior and remains isolated from Supabase adapters.

## Authority and security

- Actor identity comes only from the authenticated JWT.
- Admin assignment requires exactly the admin role and rejects additive guide/customer roles.
- Guide projections require exactly the guide role and reject additive admin/customer roles.
- Assignment targets must have exactly the guide role and a guide profile.
- The database rejects a guide whose active assignment overlaps the target departure interval. This check is repeated under the same lock discipline used by assignment mutation.
- Browser roles have no direct base-table access. Named projections/RPCs use dedicated least-privilege owners, pinned empty search paths, bounded statements, exact output columns, and redacted errors.
- Admin queue and eligible-guide projections are server-filtered; browser-side filtering is not authority.

## Mutation semantics

- The mutation locks the booking before the active assignment and rechecks booking status, source, departure status, and target eligibility under lock.
- An idempotency key is required. Same actor/key/payload returns the original result without closing or creating rows; changed payload conflicts.
- Repeating the same guide for the same booking is a stable no-op that returns the active assignment.
- A different guide closes the active assignment before creating one new active row.
- Concurrent calls never leave more than one active assignment and never expose an intermediate assignment to another guide.
- Competing bookings cannot concurrently allocate the same guide to overlapping departure intervals.
- The returned result is a decision-time snapshot with assignment ID, booking ID, guide ID, status, and outcome (`assigned`, `reassigned`, `unchanged`, or `replayed`).

## Runtime experience

- Admin receives a bilingual assignment queue containing only eligible bookings, the current guide if any, and eligible guide choices. Submission is disabled while pending; success reloads authoritative data and moves focus to a live result.
- Candidate data supports exact role/profile, stored language, and schedule checks. Area, expertise, certification, and availability preferences are not currently structured in the schema, so B2.4 presents manual admin selection and does not claim automatic suitability matching.
- Guide receives a bilingual read-only schedule of only active assignments. Empty, loading, denied, malformed-response, and retry states are explicit.
- Reload, new browser context, sign-out/sign-in, EN/VI routes, and cross-guide isolation preserve the authoritative database result.

## Acceptance

1. pgTAP proves exact-role checks, target eligibility, base-table denial, exact projections, stable replay, payload conflict, no-op repeat, reassignment history, departure/booking guards, browser denial of legacy lifecycle functions, and overlap rejection.
2. Two-session PostgreSQL tests prove duplicate and competing assignment calls leave one active assignment with deterministic history, and overlapping bookings cannot allocate the same guide twice.
3. Unit/component tests prove strict contracts, adapter error mapping, read-only guide UX, admin pending/success/error behavior, accessibility, and demo isolation.
4. Runtime Playwright proves admin assign/reassign, guide visibility, cross-guide denial, reload/new-context persistence, EN/VI copy, and no guide lifecycle controls.
5. `pnpm check`, `pnpm build:supabase`, `pnpm db:verify`, demo E2E, runtime Auth E2E, runtime fixed-tour E2E, and the B2.4 runtime E2E gate pass on the final commit.

## Explicit exclusions

- Guide accept/complete controls.
- Personalized-tour guide assignment.
- Guide profile editing and broad admin CRUD/reporting.
- Real payment, staging, production deployment, monitoring, backup, or rollback.
