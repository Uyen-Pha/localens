# Local AI itinerary runtime acceptance

## Status

- Result: **NOT RUN**
- Verified product SHA: **UNRECORDED**
- Acceptance label: **UNAVAILABLE**
- Verification window: **UNRECORDED**

This file is an evidence template, not a pass claim. Do not mint
`runtime-verified-local@<SHA>` until every required command below exits `0` on
the same clean product SHA and the exact evidence fields have been filled in.

## Scope

The local gate verifies the authenticated Supabase itinerary runtime only:

- browser sign-in provides the real customer session used at the Edge boundary;
- recommendation persists immutable revision 1 and survives a browser reload;
- partial refinement advances the same plan to revision 2;
- another authenticated customer cannot read or refine the owner's plan;
- a loopback fake Gemini service covers valid structured output and malformed-output fallback;
- the sixth request for one fresh Gemini IP/device bucket falls back without a sixth provider call;
- no real Gemini key, real payment, staging environment, or production deployment is exercised.

The planner UI is intentionally out of scope for this gate. The browser is used
for authentication; the test calls the local Edge HTTP endpoints and inspects
owner-scoped persistence directly until the separate planner-UI plan is wired.

## Required environment contract

The bounded runtime runner must provide these test-only values without printing
their contents:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `LOCALENS_RUNTIME_CUSTOMER_PASSWORD`
- `LOCALENS_RUNTIME_FIXED_TOUR_CUSTOMER_PASSWORD`
- `LOCALENS_RUNTIME_GEMINI_CONTROL_URL`, a credential-free loopback HTTP URL
- `LOCALENS_RUNTIME_GEMINI_CONTROL_TOKEN`, a random per-run header credential
- `LOCALENS_RUNTIME_BROWSER=chrome` or `msedge` for the user-approved local browser; CI uses bundled Chromium

The fake-provider control endpoint must support:

- `POST {"reset":true,"scenario":"valid"}` and return
  `{"requests":0,"scenario":"valid"}`;
- `POST {"reset":true,"scenario":"malformed"}` and return
  `{"requests":0,"scenario":"malformed"}`;
- `GET` and return the current `{requests,scenario}` state.

The runner, not CI configuration or this document, owns any dummy provider key
and all process lifecycle cleanup. It must never require a real provider key.

## Required command order

Run from the repository root with the pinned project toolchain:

```text
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:run -- --no-file-parallelism --testTimeout=30000
corepack pnpm db:verify
corepack pnpm test:e2e:runtime-itinerary
corepack pnpm build:demo
corepack pnpm build:supabase
```

Record results only after the sequence finishes:

| Order | Command | Started (ISO 8601) | Finished (ISO 8601) | Exit | Exact count/evidence |
| ---: | --- | --- | --- | ---: | --- |
| 1 | `corepack pnpm lint` | NOT RUN | NOT RUN | — | NOT RUN |
| 2 | `corepack pnpm typecheck` | NOT RUN | NOT RUN | — | NOT RUN |
| 3 | `corepack pnpm test:run -- --no-file-parallelism --testTimeout=30000` | NOT RUN | NOT RUN | — | NOT RUN |
| 4 | `corepack pnpm db:verify` | NOT RUN | NOT RUN | — | NOT RUN |
| 5 | `corepack pnpm test:e2e:runtime-itinerary` | NOT RUN | NOT RUN | — | NOT RUN |
| 6 | `corepack pnpm build:demo` | NOT RUN | NOT RUN | — | NOT RUN |
| 7 | `corepack pnpm build:supabase` | NOT RUN | NOT RUN | — | NOT RUN |

## Tool and revision evidence

| Evidence | Exact value |
| --- | --- |
| `git rev-parse HEAD` | UNRECORDED |
| `git status --short` scoped review | UNRECORDED |
| `node --version` | UNRECORDED |
| `corepack pnpm --version` | UNRECORDED |
| `corepack pnpm exec supabase --version` | UNRECORDED |
| `corepack pnpm exec playwright --version` | UNRECORDED |
| OS/container runtime | UNRECORDED |

## Runtime scenario evidence

| Scenario | Expected evidence | Result |
| --- | --- | --- |
| Browser authentication | Seeded owner reaches the Supabase account portal and yields a persisted browser session | NOT RUN |
| Recommendation | HTTP 200, `advisoryOnly: true`, AI ranking, unique plan, revision 1 | NOT RUN |
| Reload persistence | A fresh client from the reloaded browser session reads the same plan and revision 1 | NOT RUN |
| Partial refinement | HTTP 200, same plan, base revision 1, revision 2, locked stop retained | NOT RUN |
| Cross-customer denial | Other customer sees zero plan/revision/item rows and refinement returns safe 404 | NOT RUN |
| Malformed provider output | HTTP 200 deterministic fallback, degraded flag, persisted revision 1 | NOT RUN |
| Gemini quota exhaustion | First five provider attempts use AI; sixth falls back; fake provider count remains five | NOT RUN |

## Promotion rule

Keep the status as **NOT RUN** or change it to **FAILED** whenever any command is
missing, skipped, run on a different SHA, or exits non-zero. Only after all rows
are complete and green may the recorder set:

```text
Result: PASS
Verified product SHA: <full git SHA>
Acceptance label: runtime-verified-local@<full git SHA>
Verification window: <start ISO 8601> to <finish ISO 8601>
```

This local label is not evidence of staging readiness, production deployment,
approved public catalog data, real AI billing, or real payment processing.
