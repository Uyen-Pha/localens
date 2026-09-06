# LocalLens thesis demo release candidate

## Decision

### Task 20 resume observation — 2026-09-06

#### Reviewed preview candidate and cloud CORS correction

- Candidate `dd9aafc37c3d8980930fc5998935817143f514e5` is pushed on
  `codex/thesis-release-final`. Independent Astra review accepted the CI/env,
  CORS and plan changes for preview validation. Local focused verification:
  **5 files / 93 tests passed**; TypeScript, lint and Supabase build passed
  before the final two-header CORS change; the latter has its own 15 passing
  gateway tests within those 93.
- Public CI [34027779656](https://github.com/Uyen-Pha/localens/actions/runs/34027779656)
  completed successfully at that exact SHA: quality-demo, demo-e2e and
  runtime-local all PASS. Protected cloud smoke was intentionally skipped.
- Vercel preview `3Vt329LR56ZCkvxw7ehPxAzDmBUf` is **Ready** at that SHA after
  rebuilding without cache with the exact Preview APP_URL
  `https://localens-git-codex-thesis-release-final-local-lens2.vercel.app`.
  Immutable hostname: `localens-kqq7w1trk-local-lens2.vercel.app`.
  Bootstrap deployment `EQCKxNHfHyiBTd3EwX4wAP5HGYrF` is superseded.
- Both Functions were deployed from an explicit 38-file package (35 assets
  each). Readback after origin configuration: version **25**, ACTIVE,
  `verify_jwt=true`; recommend package SHA-256
  `fe292957f26cb84e9031b6542959dc5580e928e61c4b076cd011fc9986940849`,
  refine `877eff33d73643fb09ca551d96466cfe0ef520bccb116335e26a4a587a0009e6`.
- Production-origin HTTP preflight/auth boundary: **8/8** checks passed
  (SDK headers 204, unknown header 403, foreign origin 403, unauthenticated
  POST 401, on each Function). Exact preview-origin SDK preflight also
  returns 204 on both Functions. These probes perform no product mutations.
- ALLOWED_ORIGINS now contains exactly the production and release-preview
  origins. The former production-only value was verified by matching its
  SHA-256 digest before replacement. Auth Site URL remains production;
  redirect allowlist now has six exact URLs: `/`, `/vi/sign-in/`,
  `/en/sign-in/` on each origin. The earlier `/**` entry was removed.
- Chrome with the operator's Vercel session renders the preview homepage
  and bilingual catalog with all three cloud thesis tours. The catalog's
  outdated local-runtime wording is a newly observed UX issue under repair.
  An unauthenticated HTTP request reaches Vercel authentication, not the
  app; preview public accessibility and app response headers remain pending.
- A Gemini key now exists in the Edge secret store; its value was not read.
  The enabled-switch digest matches `0`. No provider invocation was made.
- Authenticated browser scenarios, unused QA-operation attestation, recovery
  rehearsal and production acceptance remain pending. No G20–G22 PASS is
  inferred from deployment readiness or these read-only observations.

Read-only QA preflight joined reserved operation UUIDs across **all owners**:
`qa-03` and `qa-04` recommend operations are already completed under the demo
customer, each with one planner reservation and zero provider attempts.
They must not be reused for a fresh fallback smoke. `qa-01`/`qa-02` booking
and reserved planner-operation rows were absent at this snapshot; this does
not establish current device/IP quota availability. Browser checkout on those
reserved departures requires their exact existing session-storage idempotency
keys (qa-01 payment, qa-02 cancellation). Record that as preconditioned browser
QA; it does not prove random-key checkout on a fresh reserved QA session.

#### Earlier resume baseline

The active execution branch is now `codex/thesis-release-final`, based on
`b58f4260b9b034e91fe1b16ab45ec14b46ef5e7d`. The earlier manifest below records
Task 19 acceptance, not acceptance of subsequent changes.

Live GitHub readback found push CI
[34021339001](https://github.com/Uyen-Pha/localens/actions/runs/34021339001)
successful at `b58f426`. The manual runs `34021350285` and `34022301409` failed
only the protected cloud job; quality, Chrome demo E2E and isolated runtime
jobs passed. The latter reported `SMOKE_QUOTA_REPLAY_UNPROVEN` after the
before-fallback attestation and restored/read back the kill switch. No cloud
rerun was dispatched during this resume inspection.

The signed-in Vercel dashboard confirms project `local-lens2/localens`
(`prj_ylyIAmAJi902Gytbc20QDpruhoh7`, team `team_fPPAvdJrHQJHtFDHPFMZZVai`),
production deployment `BV7tybWR2pUrDS2sV5KAsoj1BKyh`, source `b58f426`, and
public URL <https://localens-ashen.vercel.app>. Home and password sign-in render
in Google Chrome. These observations do not establish authenticated browser
acceptance, G21 scenarios, or rollback readiness. Supabase Auth Site URL is
that same production origin; at the initial inspection the redirect entry was
`https://localens-ashen.vercel.app/**`, since replaced as recorded above.

The current production branch is `codex/task7-clean-typecheck`; pushing there
would update production automatically. New changes are being prepared on the
separate preview branch, preserving unrelated dirty files. The existing
publishable-key variable was extended to Preview without changing its value
or Production scope. A separate Preview APP_URL initially used the observed
production origin for bootstrap; it was then replaced and rebuilt as above.

Overall acceptance remains **19/22**. Tasks 20–22 are not complete merely
because an older deployment exists.

### Historical Task 19 acceptance manifest

Task 18 accepted the dedicated Supabase Cloud backend at historical baseline
`d5b8ea8`. Task 19 is accepted for the thesis-demo scope at the fallback-only
AI boundary: migration 32, the `thesis-demo.v2` registry/seed, bounded Edge
Function packages, exact cloud readback, and the protected fallback smoke are
complete. A billed/live Gemini request is intentionally not required because
AI is demo-only; Vercel preview, product QA on a web origin, and production
remain separate pending gates.

| Field | Recorded value |
| --- | --- |
| Repository | [Uyen-Pha/localens](https://github.com/Uyen-Pha/localens) — **PUBLIC** |
| Candidate branch | `codex/task7-clean-typecheck` |
| Candidate SHA | `ef485673b2f90280d1717cf2a3a1b597ae44157b` |
| Default branch at capture | `main` at `b9f08d589bb972d290c4c367e8a02c636224d512` |
| Candidate relation to `main` | 30 commits ahead, 0 commits behind |
| Product implementation SHA | `0a4c8ecd87dc1413471c464730d4632f63278e41` |
| Evidence SHA | `392160d4948dd0e4d75988e6879f65f999cffe44` |
| CI portability SHA | `66d1b2c957cf16e9d10ac6ac2c8884007cffb099` |
| Task 14 acceptance SHA | `11ced60a1e7127b1e7507722de346ce00339182d` |
| Task 15 release-document SHA | `b86dc3dbbe0d220f734b58d3345bf9b716ab32e7` |
| Task 17 seed product SHA | `caeb182acceb9a3c5b4604500de7a5b732925de2` |
| Task 17 acceptance SHA | `f476e83c40c1b8ee65df696f6a1fd9e7654332ba` |
| Task 18 cloud-guard SHA | `5bba6564e80bb3abf259409c475d2f81e000a4b3` |
| Task 18 hosted-migration SHA | `d5b8ea89b5ffddbca9e0d0a0d0f960a7920afca6` |
| Historical Task 18 CI | [GitHub Actions 33983849459](https://github.com/Uyen-Pha/localens/actions/runs/33983849459) — **PASS** at `d5b8ea8` |
| Current candidate CI | [GitHub Actions 34012526072](https://github.com/Uyen-Pha/localens/actions/runs/34012526072) — **PASS** at `ef48567` |
| Captured on | 2026-09-06, Asia/Ho_Chi_Minh |
| Candidate label | `thesis-demo-cloud-smoke-fallback@ef485673b2f90280d1717cf2a3a1b597ae44157b` |

The candidate remains on its public candidate branch and has not been merged
into `main`. Its Supabase backend is provisioned, but it has not been deployed
to a Vercel preview or promoted to a public production web origin.

## Layer status

Overall project progress: **19/22 — 86%**. Task 20 remains the active gate.

| Layer | Status | Evidence and limit |
| --- | --- | --- |
| Fixture demo | **PASS** | Google Chrome fixture acceptance passed 34/34. This is deterministic demo behavior, not cloud runtime. |
| Isolated local runtime | **PASS** | Local Supabase Auth/PostgreSQL/RLS/RPC/Edge integration passed on runner-owned random ports. Task 17 additionally passed 1,744 pgTAP assertions, apply-twice exact graph verification, rollback probes, and a real cancellation RPC rolled back to the seed graph. The presentation database on standard ports was not mutated. |
| Public repository | **PASS** | Repository visibility is public; candidate and evidence commits are pushed to the branch above. |
| Public CI | **PASS** | At exact candidate `ef48567`, `quality-demo`, Chrome `demo-e2e`, `runtime-local`, and the protected fallback cloud smoke passed; `staging-smoke` was correctly skipped because no web origin is configured. |
| Supabase Cloud backend | **PASS — Task 18 plus Task 19 prerequisites** | Dedicated healthy project; 32/32 migration readback and up-to-date dry-run; two active JWT-verified Function version 3 deployments; Auth signup lock; corrected quota-HMAC secret readback; exact idempotent `thesis-demo.v2` seed/registry. |
| AI demo cloud smoke | **PASS — Task 19** | Protected fallback-only smoke passed with `provider=0`; no billed/live Gemini request is claimed or required. |
| Vercel preview | **PENDING — Task 20** | No project link, deployment ID, preview URL, or browser-origin acceptance is recorded. |
| Product acceptance on cloud | **PENDING — Task 21** | The 20 cloud scenarios and cloud screenshots have not run. |
| Final production URL | **PENDING acceptance — Task 22** | A deployment at `b58f426` is now observed; final browser acceptance, rollback rehearsal and owner sign-off remain pending. |

Payment remains strictly simulated in every layer. No card details are
collected and no real payment processor is contacted.

## Historical Task 18 changeset and current Task 19 delta

The historical Task 18 cloud-backend candidate is the baseline `b9f08d5` plus
12 commits:

| Commit | Scope |
| --- | --- |
| `0a4c8ec` | Product implementation; reviewed allowlist of 82 paths. |
| `392160d` | Acceptance and visual evidence; 60 paths. |
| `66d1b2c` | One cross-platform runtime-auth test fixture; strict runtime output guards unchanged. |
| `11ced60` | One Task 14 acceptance ledger update. |
| `b86dc3d` | Task 15 release-candidate record and Vietnamese cloud runbook. |
| `eec6a05` | Task 16 public-repository and accepted CI evidence. |
| `caeb182` | Guarded thesis-demo v1 dataset, cloud seeder, migration marker, and tests. |
| `f476e83` | Task 17 acceptance evidence and final public CI-bound branch head. |
| `5bba656` | Fail-closed cloud seed mode and exact project-name guards with regression tests. |
| `ab1189a` | Initial Task 18 cloud-preflight documentation; superseded by this evidence. |
| `76e61cc` | First hosted-role migration compatibility candidate; superseded after cloud history-write evidence. |
| `d5b8ea8` | Final hosted migration session-role fix, mutation tests, and accepted public CI. |

The current Task 19 candidate adds 14 reviewed commits after `d5b8ea8`. They
introduce the protected smoke runner, v2 QA-slot migration/dataset/seed
serialization, persisted replay and provider-attempt attestation, and the
bounded Edge deployment import maps. The exact current delta is available from
`git diff --name-only
d5b8ea89b5ffddbca9e0d0a0d0f960a7920afca6..0dde28879d8becae0ea90e05e20b0b6235a87bb3`.
Any later product, seed, smoke-runner, environment, or deployment change
requires a new candidate SHA and the applicable gates in the release plan.

## Ordered migration manifest

Hashes are lowercase SHA-256 of Git blobs at candidate `0dde288`, in filename
order. They are independent of checkout CRLF/LF conversion.
The current migration head is
`20260905150000_thesis_demo_qa_slots.sql`.

| Order | Migration | SHA-256 |
| ---: | --- | --- |
| 1 | `20260823090000_extensions_enums.sql` | `a7453a261c827918fa9e768831caf7a63a5820a61ae5be1c21679039a799b272` |
| 2 | `20260823091000_identity_roles.sql` | `2bf411c6ffb6148ad64b1ccb3a52bf3dbc30dcf17d84dafa3e5a86d9ca4929df` |
| 3 | `20260823092000_catalog_snapshots.sql` | `bf455b5bc47b919ffdb6865a207ba157bd45b8e63e4758eaac7ec253fca1c95b` |
| 4 | `20260823093000_travel_fx_snapshots.sql` | `b2c6f3b63837ed57516ce98ba45ea09d3f14dba9e5aed7f8436557c8f4e4cb05` |
| 5 | `20260823094000_tours_departures.sql` | `bdc658d160f3fe292e40da52623d25dff2c725416db3a0c71694e23485311740` |
| 6 | `20260823095000_trip_plans_revisions.sql` | `2df758cde20f4dab015e99eca139055f0df1ccc3c10abf12a240712dfdffd57f` |
| 7 | `20260823100000_guest_quota.sql` | `73478452404ea6cd6c71f073142eafe6e8b5705c915ac4fcd187371d113d33e3` |
| 8 | `20260823101000_requests_quotes.sql` | `77112a6ef7faaebcb8bc73d53d8f20b3cb132e6c99d35641e84c3dcc086e947f` |
| 9 | `20260823102000_bookings_holds_idempotency.sql` | `2bc7b211cbb4a82da289456a82cd433a081ac1f683a6a1ffe60cc518f15373b3` |
| 10 | `20260823103000_payments_webhooks.sql` | `ce8b8c8a030efcb00edf01934911e49c474ce026162ea892279ffa26ca882c3e` |
| 11 | `20260823104000_guide_assignments.sql` | `be6625e78b623be70f97d069e1a3027674351ce5cd0fc9954a9969d07f490622` |
| 12 | `20260823105000_content_audit.sql` | `a64abade8752e2d108255a896456ceb3f246f66c0e46c1e1b1c60489fa841b56` |
| 13 | `20260823110000_rls_rpc_security.sql` | `764ee5c6aa973d8c39ae582d86a3d396696cb214603a02d21c9e7d2ff27781f1` |
| 14 | `20260824090000_travel_fx_projection_fixes.sql` | `d2fc31373bf0a7c87762754da63323c3b3b3a525459a313880fa9ffd7854a1e7` |
| 15 | `20260824100000_guard_lock_privileges.sql` | `3034ae42e3d766d0a9622fe524122c46999c0c23adf752dd5af28d5e117d338d` |
| 16 | `20260828120000_food_catalog_snapshots.sql` | `ccd9cc443a712d6d5fd9a3bc47aacfc25a8ce62e3a8986ccfa98355261f3102a` |
| 17 | `20260828123000_food_plan_quote_snapshots.sql` | `537f30017a419578356f6bd4a24b17f0c88ed1b29d75b5c9a4280c717e6d2020` |
| 18 | `20260831100000_food_catalog_review.sql` | `9c1715951c735084ff5d050081766ac8a206634c0ec2bab6967f236c90e6eb32` |
| 19 | `20260901140000_runtime_portal_identity.sql` | `fc12e44a27d30d826e61199bc0510dc4599594768819e5c7f883d672cededf42` |
| 20 | `20260902100000_runtime_fixed_tour_booking.sql` | `2707017ba486eeb4fc7adbc7e9de9d792586bf42f6c5e0f799d8c51f755beb59` |
| 21 | `20260902110000_runtime_simulated_payment.sql` | `73079f706f2f170f4ec71f8a609ab359e354d268f182e1d5dbe0e5d8c94088bd` |
| 22 | `20260902120000_runtime_cancellation.sql` | `e5084e3394085eb24a861e988ca815ad7af4a64a024fae4e1d745ba008f23a4a` |
| 23 | `20260902130000_runtime_guide_assignment.sql` | `49a6c09efb3bdbbcd1047e579ca4227e032bd56d1e469021ca9faed85b374581` |
| 24 | `20260904100000_automatic_booking_cancellation.sql` | `41a26e601adf59a5e5e6c3afe52b20ef2a0768528c2c6e90b44d0046ede44e45` |
| 25 | `20260904110000_admin_booking_management_projection.sql` | `713029db8b0c8c69f6cb1e550927590970ce8f7aa1e8b2198026da1c87df0142` |
| 26 | `20260904120000_authenticated_ai_runtime.sql` | `50e236dc47a2b40f14ff64f7b53abd4aad22a88aee68091ffaf817b78bdb886a` |
| 27 | `20260904130000_owner_rls_jwt_claims.sql` | `99b3a54fd1b10fe3e60b6f8131cbe8063d3756fdf168a883f30efa872f34ad03` |
| 28 | `20260904140000_itinerary_snapshot_history.sql` | `cc390ddfe48b310d56e69a584f86205502f6b121c5216a1b0d5c92bcfaeb9d20` |
| 29 | `20260904150000_authenticated_revision_wrapper.sql` | `bb1c59ec95fb1c936f274d2973d1fd2da715bccae703d0d35d5cfce160023c0d` |
| 30 | `20260905020356_planner_operation_idempotency.sql` | `c5f92639096975865472563ae125fb2fc28702191ef5e9f3a5c75293b451fdad` |
| 31 | `20260905140000_thesis_demo_manifest.sql` | `d3117772a2589a6ef4348777dc40068a24ab9dd9c0b7e327074227c0576315ec` |
| 32 | `20260905150000_thesis_demo_qa_slots.sql` | `69ba35cb54d59c78d09f15cade496c61a6e27bab71a738b177c97dc393a426bf` |

## Edge Function deployment manifest

Both configured functions require JWT verification in `supabase/config.toml`.
Hashes below are SHA-256 of Git blobs at candidate `0dde288`. This source table
is intentionally limited to the entrypoints, import maps, and shared modules
under `supabase/functions/**`; it is a human-review index, not a claim that the
transitive bundle contains only these files. The project-bound deployment
bundle hashes below cover the complete CLI-bundled import closure, including
imports from `lib/**` and external packages.

| Source | SHA-256 |
| --- | --- |
| `supabase/functions/recommend-itinerary/index.ts` | `41ac660226c8c752f1110f586fccf3a6d4ba0f3d2d600cbf0985ba980573f89e` |
| `supabase/functions/refine-itinerary/index.ts` | `81565b120212f6ef89bbd33bae076d077807460b5725d9f14c0a03482052217d` |
| `supabase/functions/recommend-itinerary/deno.json` | `8592b6746b19dfe965cef783f8935fce1b1c400b4aecd45c8289942ebc0ec586` |
| `supabase/functions/refine-itinerary/deno.json` | `8592b6746b19dfe965cef783f8935fce1b1c400b4aecd45c8289942ebc0ec586` |
| `_shared/edge-env.ts` | `3060c63d546709f352f82ecb61925bb4edeaf1abcab2aa7fe4babae667aa4532` |
| `_shared/gateway.ts` | `e903dbd5a487661f803dddcca1b82139115309bd6c69bfd6037d1e39d6fb8a6b` |
| `_shared/gemini-ranker.ts` | `35e11b3ef97898b7e0bccdc8c273da534a738f210b70feba8d2792e8b608470b` |
| `_shared/itinerary-wire-response.ts` | `e404149497f835a26cf65a34c266d4812352ea7308fec5c06489676538757143` |
| `_shared/planner-operation.ts` | `9b9569f5ce5ca310bf8826faf9de14ec0c25b39b956092773a1c0536f12ce1f4` |
| `_shared/recommend-itinerary.ts` | `9b1caabd55bfd1148a561a1408fa3df6115e2446a979d99b6e62cda5c800895f` |
| `_shared/refine-itinerary.ts` | `296802b21c3e263c79c29e39897a19c4e47862c42f2e7ae619e0d130c3f6b5f3` |
| `_shared/refinement-signals.ts` | `04e364ebb1a8c446cdab10b53d1c2596c61e9f799f62c62318bc4034d7560175` |
| `_shared/supabase-itinerary-adapter.ts` | `423a014e6e49467500fadecdc3b88675ab659a415ce9fc119a265849d0942bba` |

Project-bound readback from `supabase functions list --output json`:

| Function | Version | JWT | Deployment bundle SHA-256 (`ezbr_sha256`) |
| --- | ---: | --- | --- |
| `recommend-itinerary` | 3 | required | `432b9bfbe206c768e9a318c9432c37317d158d69d812c7d0cce1444fde477ecc` |
| `refine-itinerary` | 3 | required | `5caaaf1bb7caf7745cb23976ab2b951b96a1ff03a65222744bbbc64b20a90738` |

Cloud readback on the independently selected project returned exactly two
Functions: `recommend-itinerary` and `refine-itinerary`. Both are `ACTIVE`,
version `3`, and `verify_jwt=true`. Version 2 was deployed from a temporary
38-file allowlist; each Function uploaded exactly 35 pinned assets and no
`.git`, `.next`, secret, or unrelated project file. Correcting the previously
mis-serialized quota-HMAC secret produced version 3 without changing source;
digest readback now matches the encrypted bundle, and both Functions return the
expected `401` for valid-body missing/invalid-JWT probes. Function IDs and
project identifiers are intentionally omitted from Git. Task 19 must still
prove bounded live-provider and deterministic-fallback behavior; `ACTIVE` and
denial probes alone are not that evidence.

## Seed and dataset version

| Field | Status |
| --- | --- |
| `supabase/seed.sql` | **ABSENT by design at this candidate** |
| Thesis demo dataset version | **PASS — `thesis-demo.v2`, SHA-256 `2291c33fcd18762098301dab66c47cb51857903c687d8239b1c3e362ad035314`** |
| Guarded cloud seeder | **PASS — library `0cec031c47b1d5e352adfad25bd8c86efd0aa858397144fbd48ef717f69a5f5f`; entrypoint `d490babe91bf9c39a2166206133f4b1be3150ebd662bc3ad47fd7185f8d7e41c`** |
| Cloud seed manifest row | **PASS — one exact `thesis-demo.v2` marker on the selected project** |
| Cloud demo identities | **PASS — four exact demo identities; credentials remain outside Git and evidence** |

The current research approval/readiness generator remains fail-closed and was
not bypassed. The v2 dry-run was read-only; apply followed by a second apply
reused all four existing Auth identities and finished with an exact graph and
readback. The allowlisted inventory contains 87 relations including the four
deterministic QA slots; no reset, truncate, or down migration was used.

## Browser-safe build variables

Only names and authoritative sources are recorded. Values must be entered in
the deployment platform and must not be committed.

| Variable | Required release value/source | Current cloud status |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Exact accepted Vercel origin; validated as HTTP(S) by `lib/env/public.ts` and normalized by `lib/seo/metadata.ts`. | **PENDING** |
| `NEXT_PUBLIC_LOCALLENS_RUNTIME` | Literal `supabase`; parsed fail-closed by `lib/env/runtime.ts` and `next.config.ts`. | **PENDING** |
| `NEXT_PUBLIC_SUPABASE_URL` | HTTPS API URL from the independently verified Supabase project. | **SOURCE VERIFIED; VERCEL PENDING** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable key from that same project. | **SOURCE VERIFIED; VERCEL PENDING** |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional when no Turnstile integration is used; supplied values remain non-empty. The Task 20 candidate adds environment and real-admin-parser regression coverage for omission. No CAPTCHA protection is removed. | **CANDIDATE CHANGE; DEPLOYMENT PENDING** |
| `NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES` | **Must be absent** from preview and production. This browser-visible switch is reserved for the owned E2E fixture runner. | **ABSENT REQUIRED** |

The strings `sb_publishable_ci_build_only` and `ci-build-only` used by CI prove
only that the application compiles. They are not runtime credentials and must
never be copied to preview or production. A value of `1` for
`NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES` enables fixture-only browser behavior, so
the variable must be removed rather than set to `0` on cloud targets.

Supabase readback contains its seven platform-managed entries plus exactly four
Task 18 custom names: `LOCALLENS_QUOTA_HMAC_KEY`, `ALLOWED_ORIGINS`,
`LOCALLENS_GEMINI_ENABLED`, and `GEMINI_MODEL`. AI is locked off with
`LOCALLENS_GEMINI_ENABLED=0`; `GEMINI_API_KEY` and the local-only
`LOCALLENS_GEMINI_TEST_ENDPOINT_BASE` are absent. The temporary origin remains
`https://localens.invalid` until Task 20 supplies an accepted Vercel origin.
The quota-HMAC digest now matches the encrypted operator bundle; PowerShell
`SecureString` values must be converted in-process before invoking the CLI and
must never be cast directly to text.
No secret value, digest, database password, or connection URL is recorded here.

## Toolchain and reproducibility

| Tool or artifact | Version/hash |
| --- | --- |
| Node.js | `24.19.0` |
| pnpm through Corepack | `10.17.1` |
| Next.js | `16.3.2` |
| Supabase CLI | `2.115.0` |
| Playwright | `1.62.1` |
| Google Chrome used for local visual/browser acceptance | `152.0.7977.65` |
| Git | `2.53.0.windows.1` |
| GitHub CLI | `2.98.0` |
| `package.json` SHA-256 | `c156d19ac36f6b466f06ade12c9c2cd11fd5613e18b6582e25a6b4c721889c6b` |
| `pnpm-lock.yaml` SHA-256 | `9e66f87f2587e435593e58966b874b81e1ae4b9a57fe2dd18afbd372471dc4fa` |
| `.github/workflows/ci.yml` SHA-256 | `75ef9a7e1784639577884fbbf3140eea54f40665df814810c1a90df4f91b3e86` |
| `supabase/config.toml` SHA-256 | `8d5c1eef1a9c2a08b5c8df683bd9931e17d3b2a454354e9abd2fe7ffd11962db` |

## Rollback and stop path

At the historical Task 19 checkpoint, no Vercel deployment was recorded and
the Functions were version 3 with the v2 synthetic seed. On 2026-09-06,
Vercel deployment `BV7tybWR2pUrDS2sV5KAsoj1BKyh` at `b58f426` was observed;
both Functions were version 23 with the same package hashes recorded above.
That deployment has not yet passed compatibility and recovery acceptance.
Function version 1 remains historical and is not an accepted rollback target.

GitHub contains eight older `staging` deployment records, all with latest state
`failure` and no environment URL. They are failed workflow records, not a
Vercel deployment or a rollback target.

- AI kill switch: set the Edge secret/config
  `LOCALLENS_GEMINI_ENABLED=0`. The adapter then omits the Gemini ranker and the
  validated deterministic path remains available. The state must be read back
  and smoke-tested after any change.
- Frontend stop path: temporarily suspend public access or publish a maintenance
  response through the hosting platform. Do not invent a rollback URL.
- Function stop path: AI is already disabled. If either Function is unsafe,
  close access or forward-deploy a reviewed compatible version. Do not restore
  version 1 until compatibility is separately proved.
- Database rollback: migrations are forward-only. Never run a remote reset or
  destructive down migration. If a release is unsafe, stop traffic and
  forward-fix.
- The planner-operation migration revokes legacy write RPCs. Any future
  rollback target must be compatible with that schema; do not restore old RPC
  grants to make an obsolete Function work.

## Task 16 repository and CI acceptance

The public scope at `b86dc3d` contains two reachable branches, 387 reachable
commits, and no tags. `origin` resolves to the public
`Uyen-Pha/localens` repository. The candidate is five commits ahead of and zero
commits behind `origin/main`.

Repository history was scanned without printing matched values:

- GitHub secret scanning and push protection are enabled. The redacted alerts
  API returned zero alerts. This covers GitHub-supported provider patterns; it
  is not represented as a universal arbitrary-secret proof.
- Gitleaks 8.30.1 scanned `git log --all --full-history`, covering all 387
  reachable commits. The initial redacted report contained 11 detector hits:
  two private-key-shaped redaction fixtures, five Stripe-shaped artifact
  validator fixtures, three synthetic idempotency keys, and one recognizable
  token redaction fixture. All are under unit-test paths and were reconciled
  against the owning test descriptions without exposing their values.
- The 11 reviewed test-only fingerprints were allowlisted in a temporary file
  outside the repository. The same full-history scan then exited zero with no
  remaining findings. The temporary report and allowlist are not release
  artifacts and were not committed.
- The focused public-repository hygiene test passed 1/1. No repository secret,
  credential file, machine configuration, or private database content was
  added by Tasks 15–16.

Legacy public commits retain one institutional author-email domain in Git
metadata. New release commits use the GitHub no-reply identity. Rewriting
already-public history is a separate destructive operation and is not part of
this candidate.

[GitHub Actions 33983849459](https://github.com/Uyen-Pha/localens/actions/runs/33983849459)
ran on exact candidate `d5b8ea8`: `quality-demo` passed in 3m15s, Google Chrome
`demo-e2e` passed in 2m53s, and the isolated `runtime-local` gate passed in
10m54s. All 31 migration artifacts were included. `staging-smoke` was skipped
at whole-job level because
`LOCALLENS_STAGING_URL` is not configured. Its state is **SKIPPED/PENDING**, not
cloud PASS. Task 19 is accepted through the protected fallback-only AI demo
smoke; Task 22 separately requires a smoke on the final production URL.

The run emitted a platform deprecation annotation for Node 20-based action
runtimes while GitHub forced those actions onto Node 24. The product jobs
completed successfully; the warning remains a maintenance item and is not
hidden with `continue-on-error`. No `.github/workflows/ci.yml` or `package.json`
change was necessary for this gate.

## Task 17 seed-package acceptance

Task 17 changed exactly 11 reviewed paths at `caeb182`. The manifest pins four
exact `key/email/role/audience` tuples across three roles, 12 bilingual
synthetic places, three fixed tours, five dated departures, two QA-owned
booking fixtures, one complete pending-payment checkout graph, and one guide
assignment. Payment remains simulated; there is no provider session or payment
row on the cancellation fixture.

The final verification sequence recorded:

- full local unit regression immediately before the allowlist-only hardening:
  136 files and 1,942 tests passed;
- focused G17 regression after that hardening: 3 files and 85 tests passed;
- TypeScript typecheck, ESLint with zero warnings, `git diff --check`, and
  static validation of all 31 migrations passed;
- a disposable random-port Supabase project passed 21 pgTAP files and 1,744
  assertions, then proved forced pre-marker rollback, Auth-trigger recovery,
  two identical applies, an exact 86-relation inventory with zero unclassified
  rows, real `public.cancel_booking` success followed by rollback to the exact
  seed graph, and stable-content conflict refusal with the marker unchanged;
- independent final review returned PASS with no actionable finding after a
  role-swap mutation test was added.

These were the local and CI-ready Task 17 facts. The separate Task 18 cloud
evidence is recorded below.

## Historical Task 18 Supabase Cloud acceptance

At `5bba656`, the CLI boundary accepts only explicit seed selectors `"1"`
(dry-run) and `"0"` (apply); missing, blank, whitespace-padded, or descriptive
values fail before metadata or clients are opened. The independent target guard
also requires the exact project name `localens-thesis-demo`, in addition to the
project ref, organization, runtime URL, connection metadata, TLS, inventory,
and marker checks already present.

The hosted migration candidate is `d5b8ea8`. Its static validator forbids both
`RESET ROLE` and session-level `SET ROLE postgres` in the 31 migration files,
while mutation tests require the bounded `SET LOCAL ROLE postgres` restore
inside both dynamic owner blocks. Evidence before cloud continuation:

- TDD reproduced seven failures covering the fail-open selector and wrong
  project name, then the single-file suite passed 62/62 after the guard fix;
- reviewer-requested coverage for the explicit `"0"` apply path was added;
  the final focused group passed 93/93 and independent re-review returned PASS;
- after hosted-role hardening, focused migration contracts passed 109/109 and
  the local full regression passed 136 files and 1,952 tests; typecheck, lint,
  `db:static`, and `git diff --check` passed;
- public CI 33983849459 passed all three local/fixture jobs on exact `d5b8ea8`;
  cloud smoke remained intentionally skipped pending a web origin;
- independent code review first blocked incomplete dynamic-role mutation
  coverage, then returned PASS after every required restore was removed once
  and proved to fail.

Historical Task 18 cloud execution and readback at `d5b8ea8`:

- exactly one dedicated `localens-thesis-demo` project was selected in the new
  `LocalLens Thesis` organization. It is Free, in Singapore, and
  `ACTIVE_HEALTHY`; project and organization identifiers remain outside Git;
- the first hosted push committed every object in migration 4 but could not
  write that migration's history row because `RESET ROLE` exposed the hosted
  CLI login role. Read-only probes proved the first table, final index, private
  function, and final view existed while the history row alone was absent;
- after `d5b8ea8` and its exact public CI passed, the operator repaired only
  migration version 4 to `applied`, following the official tracking-only repair
  procedure. The remaining 27 migrations were then pushed forward-only. Final
  inventory is 31/31 and `db push --linked --dry-run --skip-vault` is up to date;
- exactly two Functions are deployed: `recommend-itinerary` and
  `refine-itinerary`, both `ACTIVE`, version 1, with JWT verification enabled;
- dashboard Auth readback shows Email enabled and confirm-email enabled, while
  public signup, anonymous sign-in, and manual linking are disabled;
- four custom secret/config names are present. AI is disabled, the Gemini model
  is pinned, the temporary HTTPS origin is explicit, and no Gemini API key or
  local provider override exists;
- the cloud seeder passed dry-run, first apply, second idempotency apply, and a
  final read-only postcondition: four accounts, four role rows across three role
  categories, 12 places, three tours, five departures, two bookings, one guide
  assignment, one marker, 86 relations, zero unclassified rows, zero unexpected
  objects, and graph state `exact`;
- the direct PostgreSQL connection used `sslmode=verify-full` and the dashboard
  Supabase Root 2021 CA. Node reported the live stream as encrypted and
  authorized. Metadata and secret files remained outside the repository;
- no remote reset, truncate, down migration, real payment provider, or live
  Gemini request was used. The presentation Supabase instance on standard local
  ports was not touched.

This 31-migration/version-1/86-relation inventory is intentionally preserved as
the historical Task 18 snapshot. The current Task 19 prerequisite state is the
32-migration/version-3/87-relation inventory recorded above and below.

Official references were refreshed on 2026-09-06 before execution:
[database migrations](https://supabase.com/docs/guides/deployment/database-migrations),
[CLI migration repair](https://supabase.com/docs/reference/cli/su),
[Edge Function deployment](https://supabase.com/docs/guides/functions/deploy),
[Edge secrets](https://supabase.com/docs/guides/functions/secrets),
[Auth general configuration](https://supabase.com/docs/guides/auth/general-configuration),
[Gemini 3.6 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash),
and [Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations).

## Preserved dirty baseline

The following pre-existing local paths remain outside this release evidence and must not be
staged, discarded, or published as part of this candidate documentation:

```text
M docs/design/qa/home-desktop-implementation.png
M docs/design/qa/home-mobile.png
M docs/design/qa/home-tablet.png
M docs/security/policies-manifest.json
M scripts/run-db-gate.mjs
M scripts/run-runtime-auth-e2e.mjs
?? docs/superpowers/plans/2026-09-05-localens-integrated-luna-execution.md
?? docs/superpowers/plans/2026-09-05-localens-luna-handoff.md
?? docs/superpowers/plans/2026-09-05-localens-luna-release.md
```

This evidence update may commit only this acceptance record,
`docs/runbooks/cloud-thesis-demo.vi.md`, and
`docs/runbooks/thesis-demo-data.md` after independent review. Cloud identifiers,
credentials, connection strings, and downloaded CA files stay outside Git.

## Task 15 gate

Task 15 passes only when a reviewer reconciles this manifest against Git,
checksums, Task 14 evidence, and the accepted CI run; `git diff --check` must
also pass. Passing Task 15 opens repository/CI Task 16. It does not advance any
cloud layer from PENDING.

## Task 16 gate

Task 16 passes when the public target and exact candidate SHA are reconciled,
the full reachable history has no unreviewed secret finding, all required
local/CI jobs are green on that SHA, and the absent cloud target remains
explicitly SKIPPED/PENDING. This record meets those conditions at `b86dc3d` and
opens Task 17. It does not claim Supabase Cloud, live Gemini, Vercel preview, or
production acceptance.

## Task 17 gate

Task 17 passes only when the 11-path product commit, disposable integration
evidence, exact local verification, independent review, public push, and CI for
the resulting branch head are all green. Passing this gate opens Task 18; it
does not itself claim a Supabase Cloud mutation or advance Tasks 18–22.

## Task 18 gate

Task 18 passes when the exact candidate CI, selected project identity, 31/31
migration state, up-to-date dry-run, two active JWT-verified Functions, Auth
signup lock, bounded custom secret/config inventory, guarded seed apply-twice,
and exact read-only graph all reconcile without secret disclosure. This record
meets those conditions at `d5b8ea8` and opens Task 19. It does not claim live
Gemini, Vercel preview, product QA on cloud, or production deployment.

## Task 19 bounded v2 smoke — PASS (fallback-only AI demo scope)

Commit `ef48567` is the current versioned `thesis-demo.v2` Task 19 candidate.
Cloud preparation is complete: migration 32 is applied with a 32/32 readback
and up-to-date dry-run, the v2 seed passed dry-run/apply/apply with an exact
registry graph, and both bounded Function packages are `ACTIVE` at version 3
with JWT verification enabled. The protected fallback-only cloud smoke passed
in run `34012526072`; no billed/live Gemini provider call is claimed or needed,
and payment remains simulated.

The v2 dataset and registry reserve exactly four deterministic slots. `qa-01`
is the payment flow and carries the recommend operation; `qa-02` is the
cancellation flow and carries the refine operation; `qa-03` is the isolated
fallback-only slot; `qa-04` remains the fourth reserved spare. The payment and
cancellation paths therefore use separate bookings, and no real payment
provider is introduced.

For `live-success`, the runner first verifies the exact Management API target
and authenticates the four demo accounts. Before any provider-eligible request,
it then calls `/database/query/read-only` and requires an exact four-row registry
match, the v2 manifest marker, the selected project, the QA owner, and that
owner's customer role. The assignment is fixed: `qa-01` supplies the recommend
operation and `qa-02` supplies the refine operation. Around both operations,
service-role calls to `get_runtime_planner_operation` attest the operation,
planner reservation, Gemini reservation, recommendation-run, and
provider-attempt counts so same-operation replay is counted from persisted
evidence rather than inferred from endpoint responses. `fallback-only` uses
`qa-03`; before/after persisted attestation requires exactly zero Gemini
reservation and zero provider attempt. Its six Management API secret reads or
writes pass through the counted HTTP boundary, including kill-switch
restoration and readback in `finally` while the process remains alive; the
runbook retains the manual hard-cancellation recovery procedure. The live
response-loss seam deliberately discards a completed primary response before
permitting one byte-identical replay; only that replay envelope is validated.

Local verification is **47/47** focused smoke unit tests, **172/172** supporting
Supabase/remediation tests, and **259/259** Edge/AI-related tests after the
bounded deployment fix and explicit fallback-slot selection. Exact candidate CI `34012526072` also passed the three
required local/fixture jobs and the protected cloud smoke. The cloud smoke
readback recorded `pre_provider=13`, `evidence=15`, `management=6`,
`planner=1`, `provider=0`, and `product_mutations=0`; this proves the bounded
demo fallback path, not a live-provider integration.

G19 is **PASS** for the approved demo-only AI scope. The fallback-only run
verified permissions, cloud readback, replay/attestation boundaries, request
budgets, kill-switch restoration, device identity, and zero provider attempts.
The `live-success` workflow remains available as an optional future experiment,
but is not part of this thesis release and must not be run merely to inflate
the acceptance count or incur provider usage.

The prior v1 booking-ID and quota-observability blockers are superseded by the
deployed v2 registry and attestation implementation. Migration, Function, and
seed prerequisites are now proven in cloud. The GitHub environment
`thesis-demo-cloud-smoke` exists with one required reviewer, an exact candidate
branch policy, five non-secret variables, and six non-Gemini secrets. The
reviewer is owner `Uyen-Pha` and `prevent_self_review=false`, so this is an
owner-gated release check rather than independent approval. Supabase access
credentials remain protected; no Gemini key is needed for the accepted
fallback-only demo gate.
