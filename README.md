# LocalLens

LocalLens milestone A is a bilingual, local thesis demo of fixed tours,
customer-requested personalized tours, role-specific portals, and a simulated
payment journey.

This is a local thesis demo. Tour data, AI ranking and payment outcomes are simulated. Supabase/RLS/concurrency are not runtime-verified in milestone A.

## Run the accepted demo

Requirements: Node.js `>=24 <25` and pnpm `>=11 <12`.

```powershell
pnpm install --offline --frozen-lockfile
pnpm dev:demo
```

Open `http://127.0.0.1:3000/en/` or `http://127.0.0.1:3000/vi/`. Demo identities
for Customer, Guide and Administrator are available from the sign-in screen.
Use **Reset demo** there to remove only LocalLens-owned browser state and restore
the seeded in-memory fixture.

Milestone A provides deterministic, company-managed demo data; constrained
ranking/refinement over that data; five payment outcomes (`pending`,
`succeeded`, `failed`, `cancelled`, `expired`); retry/idempotency behavior; and
actor-scoped customer, guide and admin views. It does not prove production
persistence, live payment-provider behavior, database RLS, locking or
concurrency. The canonical specification and implementation plans live under
`docs/superpowers/`.

## Verify local runtime authentication

Task 6 adds a separate local Supabase acceptance command. It never enables the
demo fixture flag and never reuses the demo server:

```powershell
pnpm test:e2e:runtime-auth
```

The runner requires the exact project-local `supabase@2.115.0` package and
verifies that its resolved executable reports exactly `2.115.0`. It accepts only
the standard loopback API/database endpoints, resets and seeds only local
Supabase, and starts a clean Supabase-mode Next child on
`http://127.0.0.1:3200`. If runtime Auth password variables are absent, it
creates strong per-run values in memory. Control commands and status receive an
environment with every `LOCALENS_RUNTIME_*_PASSWORD` entry removed; only the
seed and Playwright children receive the three required passwords. Playwright
uses only its line reporter, disables traces/screenshots/video, and writes any
runner metadata to an owned temporary output directory removed in `finally`.
The runner captures local status/startup data rather than printing keys or
passwords. Supabase remains running for inspection; set
`LOCALENS_RUNTIME_STOP_DB=1` only when an explicit local stop is wanted.

Final B2.1 verification on 2026-09-02: exact `pnpm check` passed 86 files/1,024
tests and generated 24/24 demo routes; exact demo Playwright passed 25/25;
runtime Auth Playwright passed 3/3; and exact `pnpm db:verify` passed with zero
lint findings, 14 pgTAP files/1,433 tests, all 6/6 concurrency scenarios, and
the generated-type drift check. The database controller stopped the stack as
part of that gate, then local Supabase was restarted and its Auth health check
returned HTTP 200. These results verify B2.1 only; B2.2-B2.4, staging,
production deployment, and whole-product completion remain out of scope.

## Customer visual QA

The deterministic customer-route visual and accessibility smoke suite covers
`/en/`, `/vi/`, `/en/tours/`, `/en/planner/`, `/en/custom-request/`, and a
valid `/en/booking/` demo flow at 1488×1059, 768×1024, and 390×844. It clears
browser handoff state, emulates reduced motion, disables animation for
captures, waits for local fonts and images, and records full-page route evidence
under the ignored `test-results/customer-visual/` directory.

Run the focused suite with:

```bash
pnpm exec playwright test tests/e2e/customer-visual.spec.ts
```

Accepted home viewport evidence is stored under `docs/design/qa/`. The
selected green-white customer reference is the byte-identical
`docs/design/references/localens-green-home-selected.png` source, with
SHA-256
`4CE3DA5E08635D2B7F2F2BF3417B34878A029B0D8547964D5E7518082D75447D` and
dimensions `1487 x 1058`. The former
`docs/design/references/localens-editorial-home-selected.png` reference is
superseded for customer UI and remains only for historical comparison. The
desktop comparison uses documented
QA-only 1488×1059 derivatives with a deterministic one-pixel right/bottom
canvas extension. A screenshot or passing snapshot is not, by itself, visual
approval; see `design-qa.md` for the current verdict and evidence.
Database runtime verification remains a separate gate.

Evidence labels are scoped to the evidence actually recorded:

- `demo-wired` — connected to the local demo UI/adapter or fixture; not proof
  of production persistence or authorization.
- `contract-implemented` — typed boundary and validation/tests exist; not proof
  of a live runtime or provider.
- `runtime-verified` — exercised against the configured local runtime with
  recorded command/test evidence.
- `production-deployed` — released to the intended production environment with
  deployment and production-verification evidence.

## Food itinerary acceptance

The real-route acceptance suite covers approved English and Vietnamese food
stops, research-only fail-closed behavior, locked-food preservation, explicit
unlocked-food removal, mixed LocalLens payable quoting, zero-food museum
behavior, and the pay-at-vendor boundary:

```bash
pnpm exec playwright test tests/e2e/food-itinerary.spec.ts
```

Playwright's local development server enables
`NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES=1`; synthetic vendor/menu facts remain
test-only under `tests/e2e/` and are never runtime catalog or seed defaults.
When using an external or static server, build and start that server with the
same flag before running the suite; normal production builds leave it off.
Pay-at-vendor food remains in the displayed group estimate but is excluded from
`customerPayableVnd` and the Stripe Mock screen, which intentionally has no
charge amount. PostgreSQL/RLS runtime claims still require the separate
Supabase gate; this checkout reports `SUPABASE_CLI_NOT_FOUND` when that gate is
run without the pinned local CLI/runtime.

