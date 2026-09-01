# LocalLens milestone A acceptance evidence

## Verdict

Milestone A is accepted as a local thesis demo at tested code commit
`231c6ff` on branch `codex/localens-a-acceptance`. This verdict does not claim a
production deployment or runtime database verification.

## Fresh evidence — 2026-09-01

| Gate | Result |
| --- | --- |
| Focused Playwright acceptance | 25/25 passed |
| Full discovered Playwright suite | 25/25 passed with exit code 0 against the verified demo server; all 25 cases also completed on a clean test-owned server at port 3100 |
| Vitest | 75 files, 915 tests passed |
| ESLint | passed with zero warnings |
| TypeScript | passed |
| Next.js build | passed; 24 static/SSG routes generated |
| Supabase artifact check | passed; 18 migrations checked |
| Patch whitespace check | passed |

The Windows Playwright process did not exit after its test-owned Next.js server
finished the final clean-server case. It was interrupted only after all 25 case
lines had completed, and port 3100 was then verified to have no listener. The
external-server run of the same complete 25-test discovery set exited normally.

## Visual and accessibility acceptance

Tested viewports:

- Desktop: `1488 x 1059`
- Tablet: `768 x 1024`
- Mobile: `390 x 844`

The accepted screenshots are stored in `docs/design/qa/` and were visually
inspected after the final Playwright run. The customer-route audit covers EN/VI
home plus tours, planner, custom request and booking surfaces.

- Contrast: visible text and controls pass the automated contrast gate;
  non-text focus indicators meet the 3:1 treatment requirement.
- Keyboard: natural Tab traversal reaches each unique control without
  programmatic focus injection; focused controls remain at least 50% visible.
- Overflow: no horizontal page overflow was detected at any accepted viewport.
- Composition: the desktop home viewport includes all four starting-point
  headings and rules; tablet and mobile CTA/navigation remain readable and
  unobstructed.

## Functional acceptance

- EN and VI fixed tour: customer sign-in, hold, failed payment, retry, success,
  one paid booking, admin assignment and assigned-guide visibility.
- EN and VI personalized tour: generate/refine/lock, explicit revision
  confirmation, customer request, admin approval, quote, acceptance, simulated
  checkout and account visibility.
- Food-only requests preserve approved vendor/menu facts, remain pay-at-vendor,
  and do not fabricate a quote or LocalLens payment. `research_only` data fails
  closed.
- Cancellation, expiry, role mismatch, customer data isolation, guide
  projection limits, idempotent replay and demo reset have automated coverage.
- Confirmed personalized revisions are stored as immutable fingerprinted
  snapshots; quote amount is request-authoritative, customer acceptance is
  persisted, and checkout enforces owner, approval and the 48-hour quote limit.
- Fixed bookings are scoped by customer through browser storage and the portal;
  a late failed attempt cannot downgrade an already-paid booking.

## Exact milestone B blocker

`pnpm db:types:check` remains outside milestone A and currently exits nonzero:

```text
SUPABASE_CLI_NOT_FOUND: project-local Supabase CLI is required; install the pinned dev dependency only after a local container runtime is available
```

Therefore Supabase runtime, RLS and concurrency remain unverified. Production
readiness also requires a real persistence/runtime gate and provider-backed
deployment evidence; local fixture and static migration checks are not proof of
those properties.
