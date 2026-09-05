# LocalLens thesis demo release candidate

## Decision

Task 15 records a reproducible release-candidate baseline. It does not claim a
cloud deployment.

| Field | Recorded value |
| --- | --- |
| Repository | [Uyen-Pha/localens](https://github.com/Uyen-Pha/localens) — **PUBLIC** |
| Candidate branch | `codex/task7-clean-typecheck` |
| Candidate SHA | `11ced60a1e7127b1e7507722de346ce00339182d` |
| Default branch at capture | `main` at `b9f08d589bb972d290c4c367e8a02c636224d512` |
| Candidate relation to `main` | 4 commits ahead, 0 commits behind |
| Product SHA | `0a4c8ecd87dc1413471c464730d4632f63278e41` |
| Evidence SHA | `392160d4948dd0e4d75988e6879f65f999cffe44` |
| CI portability SHA | `66d1b2c957cf16e9d10ac6ac2c8884007cffb099` |
| Acceptance SHA | `11ced60a1e7127b1e7507722de346ce00339182d` |
| Accepted HEAD CI | [GitHub Actions 33967081834](https://github.com/Uyen-Pha/localens/actions/runs/33967081834) — **PASS** |
| Captured on | 2026-09-05, Asia/Ho_Chi_Minh |
| Candidate label | `thesis-demo-candidate@11ced60a1e7127b1e7507722de346ce00339182d` |

The candidate is intentionally still on its public candidate branch. It has
not been merged into `main`, linked to a cloud backend, or promoted to a public
web deployment.

## Layer status

| Layer | Status | Evidence and limit |
| --- | --- | --- |
| Fixture demo | **PASS** | Google Chrome fixture acceptance passed 34/34. This is deterministic demo behavior, not cloud runtime. |
| Isolated local runtime | **PASS** | Local Supabase Auth/PostgreSQL/RLS/RPC/Edge integration passed on runner-owned random ports. The presentation database on standard ports was not mutated. |
| Public repository | **PASS** | Repository visibility is public; candidate and evidence commits are pushed to the branch above. |
| Public CI | **PASS** | `quality-demo` passed in 3m18s, Chrome `demo-e2e` in 3m04s, and `runtime-local` in 10m54s at the accepted HEAD. |
| Supabase Cloud backend | **PENDING — Task 18** | No selected project ref, migration deployment, function version, secret-store verification, or cloud seed is recorded. |
| Live Gemini smoke | **PENDING — Task 19** | Local evidence uses a loopback Gemini-compatible provider. No billed/live provider request is claimed. |
| Vercel preview | **PENDING — Task 20** | No project link, deployment ID, preview URL, or browser-origin acceptance is recorded. |
| Product acceptance on cloud | **PENDING — Task 21** | The 20 cloud scenarios and cloud screenshots have not run. |
| Final production URL | **PENDING — Task 22** | No production deployment, rollback rehearsal, or owner sign-off is recorded. |

Payment remains strictly simulated in every layer. No card details are
collected and no real payment processor is contacted.

## Candidate changeset

The accepted candidate is the baseline `b9f08d5` plus four commits:

| Commit | Scope |
| --- | --- |
| `0a4c8ec` | Product implementation; reviewed allowlist of 82 paths. |
| `392160d` | Acceptance and visual evidence; 60 paths. |
| `66d1b2c` | One cross-platform runtime-auth test fixture; strict runtime output guards unchanged. |
| `11ced60` | One Task 14 acceptance ledger update. |

The full committed path inventory is available from `git diff --name-only
b9f08d589bb972d290c4c367e8a02c636224d512..11ced60a1e7127b1e7507722de346ce00339182d`.
Any later implementation, seed, smoke-runner, environment, or deployment change
invalidates this candidate identity and requires a new candidate SHA and the
gates listed in the release plan.

## Ordered migration manifest

Hashes are lowercase SHA-256 of the committed file bytes, in filename order.
The current migration head is
`20260905020356_planner_operation_idempotency.sql`.

| Order | Migration | SHA-256 |
| ---: | --- | --- |
| 1 | `20260823090000_extensions_enums.sql` | `7bd682238153efc422e14eefe4273a2411149a9b0f2c596bd918cccec27cb599` |
| 2 | `20260823091000_identity_roles.sql` | `a9879e0a6bd4752b0bde6665a33d85dd2cd55e5866ec6bb29a9f4a0f5ac5ad34` |
| 3 | `20260823092000_catalog_snapshots.sql` | `8de61eeaf282ea006c335e8f049e063e0df8e9220b0e4056b8af22c6bbb23cc9` |
| 4 | `20260823093000_travel_fx_snapshots.sql` | `131691a511342d2071929191e7665a5400e8d6819c5fc7fb6236f9dca052b413` |
| 5 | `20260823094000_tours_departures.sql` | `5d7b8aa185d71c0b84f214505740692c6336fe97edc8eecc37c5c2c527b04521` |
| 6 | `20260823095000_trip_plans_revisions.sql` | `22f9316a02b9d834b7d0ae5e58c145d663dbe6cc1d7ac642e474d0d8dd6922da` |
| 7 | `20260823100000_guest_quota.sql` | `b590b37a9952f1d50bb19dae22b8bc2c96d7850b4b90aaab749ed2d5d0661d7f` |
| 8 | `20260823101000_requests_quotes.sql` | `94ea51bad76bac3ff2ba6823191e6c9d4eeb674256a4421ca3acd44a825a4742` |
| 9 | `20260823102000_bookings_holds_idempotency.sql` | `baa1e83f848611a8c526a4d859695b0e1f2dc4695e7a7dd53426558df54b89e5` |
| 10 | `20260823103000_payments_webhooks.sql` | `6713a49199c4cf98958c7a110825647851d47eaacfde29f1aca0c0b385d3cb84` |
| 11 | `20260823104000_guide_assignments.sql` | `c1bfc5a9867ea8d5967e529359f5be2140893488e440cc4b537b02726d77b29b` |
| 12 | `20260823105000_content_audit.sql` | `b57fcabb42fd04fe5419ead86e5732c27df45f36443196cbb31038251d8b3010` |
| 13 | `20260823110000_rls_rpc_security.sql` | `b1f343d1de1009b2a7b10e868a217fe9132bd3c5344bd5bcdf4557733aa91fa0` |
| 14 | `20260824090000_travel_fx_projection_fixes.sql` | `cb231afb95c2e71b80183ceddd3734c85ede00ed4fcc0075bcffc109697fdce6` |
| 15 | `20260824100000_guard_lock_privileges.sql` | `f65be233189d42ac6cdb4926d988fcfe6a056f870b132a05f28429cda568fe8d` |
| 16 | `20260828120000_food_catalog_snapshots.sql` | `c69ab80c6de4e85c2e3071a2339a9e5e454cc5d9abc68fe965fc4b4a45e3e4bf` |
| 17 | `20260828123000_food_plan_quote_snapshots.sql` | `7a6840ccde2ab08b600a978eb424b33b3ad12e6a8ae7e37e4ea72d6d26f5132b` |
| 18 | `20260831100000_food_catalog_review.sql` | `10cc85790783172666e7b6e644c6f803f61278aed47fae5f768bc4b03820e924` |
| 19 | `20260901140000_runtime_portal_identity.sql` | `d2ac2a2a3549c5af63dba434ed56081512eac1f0768ab2e49520da2c45d9df04` |
| 20 | `20260902100000_runtime_fixed_tour_booking.sql` | `e318bcaf402318f73fb1501ed7d31376610d053de769a702e3df324351b83585` |
| 21 | `20260902110000_runtime_simulated_payment.sql` | `a437709e76923c8e1bce8467cc0c95f8b952a1506eabc8a4d630f11d9b80d365` |
| 22 | `20260902120000_runtime_cancellation.sql` | `d2411151de3442522dd2a37763161c093a0006369ede06dbf27da01aaee15ae3` |
| 23 | `20260902130000_runtime_guide_assignment.sql` | `8825ebb3db08a739367103e2e11e9665537e61bb1c95929945e5eebdd5bae013` |
| 24 | `20260904100000_automatic_booking_cancellation.sql` | `902a1d75908756fd9f4a77662e822fbb511863732932149ffdb20a5564a71d2d` |
| 25 | `20260904110000_admin_booking_management_projection.sql` | `bf86f768288bcfe81c06a703055c2bc4784984129152d88dbfc7eb689c37bb30` |
| 26 | `20260904120000_authenticated_ai_runtime.sql` | `26adac2361befc23180574e5cfd6c7e99400eea127e752bf5774da3aeb09a730` |
| 27 | `20260904130000_owner_rls_jwt_claims.sql` | `8f931c5fa1c92e66839bc82ab8b351993711c6a01e903cc0c4b0b08ce242764d` |
| 28 | `20260904140000_itinerary_snapshot_history.sql` | `6b348d15b2925b823094c303161725bdb5a115c8caf0251efb53751be9bc95e3` |
| 29 | `20260904150000_authenticated_revision_wrapper.sql` | `6532c7b5ee676dbf87ab6d7b8f7bd12c29dac0f81c2b82dbd0b02240076b082c` |
| 30 | `20260905020356_planner_operation_idempotency.sql` | `de34e11cf2db3c72bcc9cb61d31add9d4e9c8b73ad2876478542d13b1b4583d0` |

## Edge Function source manifest

Both configured functions require JWT verification in `supabase/config.toml`.
Hashes below are SHA-256 of committed file bytes. Shared-module hashes are
listed because the entrypoints import their behavior from this shared source.

| Source | SHA-256 |
| --- | --- |
| `supabase/functions/recommend-itinerary/index.ts` | `1029ef99945b1f1378a767b082c3b277f0d18009f260fa06c0446ce1e42e311f` |
| `supabase/functions/refine-itinerary/index.ts` | `ca46ac96f72720b8603dc4a89fd1ba9127aa614e9538596bfc9646f45bc9a503` |
| `supabase/functions/recommend-itinerary/deno.json` | `0e1dcaefa7b3f7f47322d6cb8e596587ff0d7c3eecfd6d949b777bac5c919876` |
| `supabase/functions/refine-itinerary/deno.json` | `0e1dcaefa7b3f7f47322d6cb8e596587ff0d7c3eecfd6d949b777bac5c919876` |
| `_shared/edge-env.ts` | `0802e217fab42d103c8df7f6b81b6d948d19a2699a3e068e505990d4a732bf60` |
| `_shared/gateway.ts` | `1096848569afd92c5f20f7dda1168e27fcfd46278eaad078b44202174d5b9bb3` |
| `_shared/gemini-ranker.ts` | `46508b5ddda1ad3c16a7bb1a7b7102e4dd43302ffc57e6b96de662dcf3529baa` |
| `_shared/itinerary-wire-response.ts` | `e404149497f835a26cf65a34c266d4812352ea7308fec5c06489676538757143` |
| `_shared/planner-operation.ts` | `9b9569f5ce5ca310bf8826faf9de14ec0c25b39b956092773a1c0536f12ce1f4` |
| `_shared/recommend-itinerary.ts` | `5a6dd5fd218160481ec2d800a941f407803e5348da78d1f6713514569e6443a5` |
| `_shared/refine-itinerary.ts` | `7c1ba2e28b394e38785ac4dcd5f2e490ecda2eec57829b61a895eba7afd78d6b` |
| `_shared/refinement-signals.ts` | `04e364ebb1a8c446cdab10b53d1c2596c61e9f799f62c62318bc4034d7560175` |
| `_shared/supabase-itinerary-adapter.ts` | `474e49ece442121e507b69dcb452a1597be9e9c4a294863f540ea5b3a439faed` |

No cloud Function version or deployment ID has been observed. `ACTIVE` status
alone will not be accepted later; Task 18 must record project-bound versions
after migration and secret verification.

## Seed and dataset version

| Field | Status |
| --- | --- |
| `supabase/seed.sql` | **ABSENT by design at this candidate** |
| Thesis demo dataset version | **PENDING — Task 17** |
| Cloud seed manifest row | **PENDING — Task 17/18** |
| Cloud demo identities | **PENDING — no passwords or users are recorded here** |

The current research approval/readiness generator remains fail-closed and must
not be bypassed. Task 17 will introduce the separately labelled synthetic or
source-approved thesis dataset, version marker, guarded seeder, and tests. That
work will create a new candidate SHA.

## Browser-safe build variables

Only names and authoritative sources are recorded. Values must be entered in
the deployment platform and must not be committed.

| Variable | Required release value/source | Current cloud status |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Exact accepted Vercel origin; validated as HTTP(S) by `lib/env/public.ts` and normalized by `lib/seo/metadata.ts`. | **PENDING** |
| `NEXT_PUBLIC_LOCALLENS_RUNTIME` | Literal `supabase`; parsed fail-closed by `lib/env/runtime.ts` and `next.config.ts`. | **PENDING** |
| `NEXT_PUBLIC_SUPABASE_URL` | HTTPS API URL from the independently verified Supabase project. | **PENDING** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable key from that same project. | **PENDING** |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | A non-empty real site key valid for the accepted domain. The current candidate has no verified disabled mode. | **PENDING** |
| `NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES` | **Must be absent** from preview and production. This browser-visible switch is reserved for the owned E2E fixture runner. | **ABSENT REQUIRED** |

The strings `sb_publishable_ci_build_only` and `ci-build-only` used by CI prove
only that the application compiles. They are not runtime credentials and must
never be copied to preview or production. A value of `1` for
`NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES` enables fixture-only browser behavior, so
the variable must be removed rather than set to `0` on cloud targets.

Server-only names remain in the platform secret/config store:
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`LOCALLENS_QUOTA_HMAC_KEY`, `ALLOWED_ORIGINS`,
`LOCALLENS_GEMINI_ENABLED`, and `GEMINI_API_KEY`. `GEMINI_MODEL`, if supplied,
must equal the pinned `gemini-3.6-flash`. The local-only
`LOCALLENS_GEMINI_TEST_ENDPOINT_BASE` must not be configured in cloud.

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
| `package.json` SHA-256 | `d497643e337d6e44e344eb30d67592e36cedca553397597cbb393bc3699b4438` |
| `pnpm-lock.yaml` SHA-256 | `dbcfe8a83081b01ced32c7f4875222144e2d21eba121c4527a7aa0338c7bee4a` |
| `.github/workflows/ci.yml` SHA-256 | `0069b0365bae433fa11b7635bebccf16458d955edd289b9d1fed343fbc5422bd` |
| `supabase/config.toml` SHA-256 | `a2f050e5aec1d0ee88495a086e40ecb031d2f75121223370c38eb16fed6e3172` |

## Rollback and stop path

This is the first recorded cloud candidate. There is no prior Vercel deployment
ID, Supabase Function version, cloud seed, or production URL to restore.

GitHub contains eight older `staging` deployment records, all with latest state
`failure` and no environment URL. They are failed workflow records, not a
Vercel deployment or a rollback target.

- AI kill switch: set the Edge secret/config
  `LOCALLENS_GEMINI_ENABLED=0`. The adapter then omits the Gemini ranker and the
  validated deterministic path remains available. The state must be read back
  and smoke-tested after any change.
- Frontend stop path: temporarily suspend public access or publish a maintenance
  response through the hosting platform. Do not invent a rollback URL.
- Function stop path: disable access or deploy a later verified compatible
  Function. There is no previous compatible cloud Function version yet.
- Database rollback: migrations are forward-only. Never run a remote reset or
  destructive down migration. If a release is unsafe, stop traffic and
  forward-fix.
- The planner-operation migration revokes legacy write RPCs. Any future
  rollback target must be compatible with that schema; do not restore old RPC
  grants to make an obsolete Function work.

## Preserved dirty baseline

The following pre-existing local paths remain outside Task 15 and must not be
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

Task 15 may commit only this acceptance record and
`docs/runbooks/cloud-thesis-demo.vi.md` after independent review. No
implementation or cloud state changes belong to this gate.

## Task 15 gate

Task 15 passes only when a reviewer reconciles this manifest against Git,
checksums, Task 14 evidence, and the accepted CI run; `git diff --check` must
also pass. Passing Task 15 opens repository/CI Task 16. It does not advance any
cloud layer from PENDING.
