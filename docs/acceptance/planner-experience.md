# Task 14 planner experience acceptance ledger

## Current status

This ledger records accepted local browser and database evidence for product
commit `0a4c8ecd87dc1413471c464730d4632f63278e41`, evidence commit
`392160d4948dd0e4d75988e6879f65f999cffe44`, and the public GitHub Actions
result for CI head `66d1b2c957cf16e9d10ac6ac2c8884007cffb099`.

| Field | Current value |
| --- | --- |
| Acceptance result | **PASS — product, evidence, and public CI accepted** |
| Evidence base SHA | `b9f08d589bb972d290c4c367e8a02c636224d512` |
| Final tested product SHA | `0a4c8ecd87dc1413471c464730d4632f63278e41` |
| Evidence commit SHA | `392160d4948dd0e4d75988e6879f65f999cffe44` |
| Final CI head SHA | `66d1b2c957cf16e9d10ac6ac2c8884007cffb099` |
| Final CI run | [GitHub Actions 33966418207](https://github.com/Uyen-Pha/localens/actions/runs/33966418207) — **PASS** |
| Approved local browser | Google Chrome |
| Chrome version recorded with the evidence | `152.0.7977.65` |
| Demo verification label | `demo-verified@0a4c8ecd87dc1413471c464730d4632f63278e41` |
| Local-runtime verification label | `runtime-verified-local@0a4c8ecd87dc1413471c464730d4632f63278e41` |

The base SHA is the commit checked out before Task 14. Product commit
`0a4c8ec` contains the reviewed 82-file implementation allowlist and was made
with the GitHub no-reply identity. Evidence files are intentionally committed
in `392160d`. CI portability commit `66d1b2c` changes only the runtime-auth test
fixture so it uses a cross-platform temporary-directory fallback. Public CI
accepted that final head, so both verification labels above are issued for the
unchanged product SHA.

Current product-SHA static evidence is PASS: lint, typecheck, database static
checks, both 25-route production builds, and full Vitest at **135 files / 1,888
tests**. The isolated database run passed **20 pgTAP files / 1,723 planned
assertions**, schema lint, generated-type drift, 10 general concurrency
scenarios, and 3 planner-operation concurrency scenarios.

## Demonstration boundary

| Surface | What the thesis demo demonstrates | What it does not prove |
| --- | --- | --- |
| Fixture demo | Bilingual browser flows, preference handoff, demo personas, cancellation, and clearly labelled simulated-payment states. | No deployed database, live AI provider, payment processor, real card entry, or production customer data. |
| Isolated local runtime | Local Supabase Auth/PostgreSQL/RLS/RPC/Edge Functions, persisted itinerary revisions, AI-contract success, deterministic fallback, quota behavior, and fixed-tour lifecycle on runner-owned loopback ports. | No remote Supabase project, live Gemini request or billing, staging, or production. |
| Visual evidence | Matched reference and implemented screenshots for five required states at desktop, tablet, and mobile widths. | Screenshot evidence alone does not prove full WCAG conformance, staging readiness, or production readiness. |
| Staging and production | Source and protected staging checks exist in the repository. | No accepted staging URL, successful final staging smoke, or production deployment is recorded here. |

## AI and payment disclosure

- AI is simulated for this thesis evidence. The fixture planner is
  deterministic. The isolated runtime uses a loopback fake
  Gemini-compatible provider to exercise the same structured integration
  contract without a live Gemini key or request.
- AI ranking remains advisory. LocalLens validates identifiers, timing, cost,
  and persistence, and switches to a deterministic safe fallback for malformed
  provider output. Exhausted demo quota returns an explicit quota error without
  creating a new proposal or making another provider call.
- Payment is explicitly simulated. No card details are collected, no payment
  processor is contacted, and no real charge occurs. Success and failure are
  demo states only.
- Eligible cancellation before simulated payment is immediate and customer
  scoped. The administrator view remains read-only and the guide view does not
  expose the customer cancellation action.

## Local Chrome gate results

These results passed against product commit `0a4c8ec` using the approved Google
Chrome channel. Public CI repeated the Chrome demo and isolated runtime gates
successfully at head `66d1b2c`. They remain local-runtime evidence, not staging
or production evidence.

| Gate | Current working-tree result | Scope demonstrated |
| --- | --- | --- |
| `corepack pnpm test:e2e` with `LOCALENS_RUNTIME_BROWSER=chrome` | **PASS — 34/34** after the mobile image-wait fix | Fixture demo journeys, simulated-payment disclosure and failure/retry, cancellation boundaries, responsive/keyboard/focus/overflow checks, and clean browser diagnostics covered by the suite. |
| `corepack pnpm test:e2e:runtime-itinerary` with `LOCALENS_RUNTIME_BROWSER=chrome` | **PASS — 3/3 on product SHA** | Homepage-to-sign-in handoff, explicit AI action, success notice, refinement and reload persistence, RLS isolation, malformed-output fallback, and quota refusal without a sixth provider call or new persistence. |
| `corepack pnpm test:e2e:runtime-auth` with `LOCALENS_RUNTIME_BROWSER=chrome` | **PASS — 3/3** | Isolated sign-up/sign-in/session behavior on runner-owned ports, including database and concurrency gates plus cleanup. |
| `corepack pnpm test:e2e:runtime-fixed-tour` with `LOCALENS_RUNTIME_BROWSER=chrome` | **PASS — 7/7** | Fixed-tour persistence, bilingual customer flows, isolation, idempotency, assignment visibility, simulated-payment lifecycle, and immediate cancellation. |
| `corepack pnpm test:e2e:runtime-guide-assignment` with `LOCALENS_RUNTIME_BROWSER=chrome` | **PASS — 1/1** | Guide assignment visibility and role boundary through the isolated runtime harness. |

## Visual evidence inventory

The visual QA folder contains:

- `reference/`: **18 PNGs** plus a capture report;
- `implemented/`: **18 PNGs** plus a capture report;
- `comparison/`: **15 PNGs**, one matched reference/implemented sheet for each
  required state and viewport;
- `locale-vi/`: **3 PNGs** for the Vietnamese homepage and personalization
  flow at desktop, tablet, and mobile sizes.

The 15 required comparisons cover homepage handoff, planner AI success,
planner deterministic fallback, account simulated payment, and the simulated
payment error at `1440 x 1024`, `768 x 1024`, and `390 x 844`. Each raw phase
also contains three additional fixture-planner fallback screenshots, bringing
its raw inventory to 18 PNGs. The capture reports record viewport-width page
metrics. Their fixture subset retains one historical desktop payment-error
console message containing HTTP 404 wording without a resource URL; the later
interactive Chrome fixture suite passed 34/34, including browser-diagnostic
assertions. The historical capture record is intentionally not rewritten.

See [`../design/qa/public-thesis-demo/README.md`](../design/qa/public-thesis-demo/README.md)
for the file-by-file matrix and evidence limits.

## Functional acceptance matrix

| Journey or property | Evidence source | Current result |
| --- | --- | --- |
| Homepage preferences survive sign-in return | Chrome runtime itinerary E2E | **PASS — product SHA; public CI accepted** |
| AI generation is explicit and does not run on planner load or reload | Chrome runtime itinerary E2E plus provider-call counter | **PASS — product SHA; public CI accepted** |
| Valid provider-contract output displays the AI notice and persists revision 1 | Chrome runtime itinerary E2E plus local Supabase assertions | **PASS — product SHA; public CI accepted** |
| A locked stop survives partial refinement and revision 2 persists | Chrome runtime itinerary E2E plus local Supabase assertions | **PASS — product SHA; public CI accepted** |
| Reload restores the visible revision 2 proposal without another provider call | Chrome runtime itinerary E2E plus owner-scoped queries | **PASS — product SHA; public CI accepted** |
| A different customer cannot read or refine the owner's plan | RLS queries and Edge Function response | **PASS — product SHA; public CI accepted** |
| Malformed provider output becomes a visible deterministic fallback | Chrome runtime itinerary E2E with loopback fake provider | **PASS — product SHA; public CI accepted** |
| Demo AI quota refuses the new operation without persisting a proposal or making a sixth provider call | Runtime itinerary E2E provider counter plus database assertions | **PASS — 3/3 product-SHA runtime gate** |
| Simulated-payment disclosure is visible and no card/real-charge action is offered | Chrome fixture and runtime fixed-tour E2E | **PASS — product SHA; public CI accepted** |
| Eligible cancellation before simulated payment is immediate and role-scoped | Chrome fixture and runtime fixed-tour E2E | **PASS — product SHA; public CI accepted** |
| English and Vietnamese exposed flows retain their disclosures and role boundaries | Chrome fixture/runtime E2E | **PASS — product SHA; public CI accepted** |
| Vietnamese visual layout remains readable at three responsive sizes | Chrome fixture screenshots plus visual inspection | **PASS — 3/3 in evidence commit `392160d`** |

## Final gate ledger

The database gate must use an isolated runner-owned Supabase project. Never run
mutating verification against the presentation project `localens-mvp`.

| Order | Gate | Final-SHA result | Evidence |
| ---: | --- | --- | --- |
| 1 | `corepack pnpm lint` | **PASS — product SHA** | Exit 0 |
| 2 | `corepack pnpm typecheck` | **PASS — product SHA** | Exit 0 after generated type synchronization |
| 3 | full `corepack pnpm test:run --no-file-parallelism --testTimeout=30000` | **PASS — 135 files / 1,888 tests** | Exit 0 in 518.06 s |
| 4 | isolated database gate through the guarded runtime harness | **PASS — product SHA** | 20 pgTAP files / 1,723 planned assertions; schema lint; generated types; 10/10 general and 3/3 planner-operation races; cleanup |
| 5 | `corepack pnpm build:demo` | **PASS — 25/25 routes** | Build-only demo mode |
| 6 | `corepack pnpm build:supabase` | **PASS — 25/25 routes** | Explicit build-only public variables, not runtime credentials |
| 7 | Chrome `corepack pnpm test:e2e` | **PASS — 34/34 product SHA** | Final fixture run completed in 3.0 minutes |
| 8 | Chrome `corepack pnpm test:e2e:runtime-itinerary` | **PASS — 3/3 product SHA** | Final isolated run includes terminal quota refusal and cleanup |
| 9 | Chrome `corepack pnpm test:e2e:runtime-auth` | **PASS — 3/3 product SHA** | Isolated runtime and cleanup |
| 10 | Chrome `corepack pnpm test:e2e:runtime-fixed-tour` | **PASS — 7/7 product SHA** | Isolated runtime and cleanup after stable booking/guide selection fixes |
| 11 | Chrome `corepack pnpm test:e2e:runtime-guide-assignment` | **PASS — 1/1 product SHA** | Authoritative guide IDs prove A-to-B-to-A reassignment and cleanup |
| 12 | Required matched visual comparisons | **PASS — 15/15 inspected** | Five states x three viewports in evidence commit `392160d` |
| 13 | Vietnamese responsive visual spot-check | **PASS — 3/3 inspected** | Desktop, tablet, and mobile current implementation in evidence commit `392160d` |
| 14 | Final GitHub Actions run | **PASS — CI head `66d1b2c`** | Quality-demo, Chrome demo E2E, runtime-local, and Supabase build passed; staging smoke skipped because no staging URL is configured |

## Promotion rule

Task 14 is **FINAL ACCEPTED** for product SHA `0a4c8ec`: the evidence commit is
public, the final GitHub Actions run is linked and accepted, and both
verification labels are issued. This result remains a fixture demo plus
isolated local-runtime acceptance; it does not promote staging or production.
