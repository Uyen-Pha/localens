# Local AI itinerary runtime acceptance

## Status

- Result: **PASS**
- Verified product SHA: **4855c01ec83d31e6c2a5e4dafbcadc221a82c9ae**
- Acceptance label: **runtime-verified-local@4855c01ec83d31e6c2a5e4dafbcadc221a82c9ae**
- Verification window: **2026-09-05T00:58:48.1192533+07:00 to 2026-09-05T01:21:50.3680522+07:00**

This is a local-only pass claim for the exact product SHA above. It does not
promote staging or production readiness.

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
corepack pnpm test:run --no-file-parallelism --testTimeout=30000
corepack pnpm db:verify
corepack pnpm test:e2e:runtime-itinerary
corepack pnpm build:demo
corepack pnpm build:supabase
```

Record results only after the sequence finishes:

| Order | Command | Started (ISO 8601) | Finished (ISO 8601) | Exit | Exact count/evidence |
| ---: | --- | --- | --- | ---: | --- |
| 1 | `corepack pnpm lint` | 2026-09-05T00:58:48.1192533+07:00 | 2026-09-05T00:58:58.0619112+07:00 | 0 | ESLint completed with zero warnings. |
| 2 | `corepack pnpm typecheck` | 2026-09-05T00:59:04.0657714+07:00 | 2026-09-05T00:59:19.5036199+07:00 | 0 | TypeScript completed with no errors. |
| 3 | `corepack pnpm test:run --no-file-parallelism --testTimeout=30000` | 2026-09-05T00:59:27.1181705+07:00 | 2026-09-05T01:04:59.7703485+07:00 | 0 | Vitest: 121/121 files and 1496/1496 tests passed. |
| 4 | `corepack pnpm db:verify` | 2026-09-05T01:13:54.5321721+07:00 | 2026-09-05T01:16:36.1293384+07:00 | 0 | Clean isolated checkout on the same SHA: 29 migrations; schema lint empty; pgTAP 19/19 files and 1669/1669 assertions; 10/10 two-session concurrency scenarios; generated types matched; owned stack stopped with backup. |
| 5 | `$env:LOCALENS_RUNTIME_BROWSER='chrome'; corepack pnpm test:e2e:runtime-itinerary` (PowerShell) | 2026-09-05T01:18:10.0298760+07:00 | 2026-09-05T01:20:32.4076721+07:00 | 0 | Google Chrome: 3/3 full-stack scenarios passed; the runner reset and stopped only its nonstandard-port temporary Supabase project. |
| 6 | `corepack pnpm build:demo` | 2026-09-05T01:21:02.9254204+07:00 | 2026-09-05T01:21:24.7924417+07:00 | 0 | Next.js production build generated 24/24 static routes. |
| 7 | `corepack pnpm build:supabase` | 2026-09-05T01:21:32.1300281+07:00 | 2026-09-05T01:21:50.3680522+07:00 | 0 | CI-equivalent build-only public variables; Next.js production build generated 24/24 static routes. |

## Tool and revision evidence

| Evidence | Exact value |
| --- | --- |
| `git rev-parse HEAD` | `4855c01ec83d31e6c2a5e4dafbcadc221a82c9ae` |
| `git status --short` scoped review | Product checkout clean before the sequence and after both builds, before this evidence-only document update. |
| `node --version` | `v24.19.0` |
| `corepack pnpm --version` | `10.17.1` |
| `corepack pnpm exec supabase --version` | `2.115.0` |
| `corepack pnpm exec playwright --version` | `1.62.1` |
| Approved browser | Google Chrome `152.0.7977.65` |
| OS/container runtime | Microsoft Windows 11 Pro `10.0.26200` build `26200`; Docker Desktop Linux context `desktop-linux`, server `29.7.2` |

## Runtime scenario evidence

| Scenario | Expected evidence | Result |
| --- | --- | --- |
| Browser authentication | Seeded owner reaches the Supabase account portal and yields a persisted browser session | PASS |
| Recommendation | HTTP 200, `advisoryOnly: true`, AI ranking, unique plan, revision 1 | PASS |
| Reload persistence | A fresh client from the reloaded browser session reads the same plan and revision 1 | PASS |
| Partial refinement | HTTP 200, same plan, base revision 1, revision 2, locked stop retained | PASS |
| Cross-customer denial | Other customer sees zero plan/revision/item rows and refinement returns safe 404 | PASS |
| Malformed provider output | HTTP 200 deterministic fallback, degraded flag, persisted revision 1 | PASS |
| Gemini quota exhaustion | First five provider attempts use AI; sixth falls back; fake provider count remains five | PASS |

## Presentation-data safety evidence

- The data-bearing `localens-mvp` stack was never reset. Before its bounded
  stop, a local custom-format backup was verified with 2247 table-of-contents
  entries and SHA-256
  `56CA405824B7D0E11C7E4D04AB6B28CFB3A06B457C583C3D0BB6C1F73A851B61`;
  the dump remains outside the repository.
- `db:verify` ran in the separate clean project
  `localens-task7-db-gate-4855c01b` on the exact verified SHA. Its standard-port
  stack was stopped before the presentation stack was restarted.
- Presentation counts matched before and after the gate: 19 auth users, 19
  profiles, 12 bookings, 1 payment, 4 guide assignments, 12 trip plans, 11
  revisions, 7 plan items, 9 tours, and 9 departures. The latest migration
  remained `20260904150000`.

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
