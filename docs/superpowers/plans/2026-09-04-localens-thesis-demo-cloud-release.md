# LocalLens Thesis Demo Cloud Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the verified LocalLens full-stack thesis demo through a private GitHub repository, Supabase Cloud, and Vercel, with real Gemini ranking and simulated payment only.

**Architecture:** GitHub is the reviewed source of truth, Supabase Cloud owns Auth/PostgreSQL/RLS/RPC/Edge Functions/secrets, and Vercel hosts the Next.js Supabase runtime. A guarded seed command creates only test accounts and approved demo data. Preview is verified first, then the exact verified SHA is promoted and recorded with independent frontend, Edge Function, and forward-only database rollback procedures.

**Tech Stack:** GitHub CLI, GitHub Actions, pnpm 10.17.1, Node 24, Supabase CLI 2.115.0, PostgreSQL 17, Vercel CLI 59.10.0, Next.js 16.3.2, Playwright, Gemini API

**Spec:** `docs/superpowers/specs/2026-09-04-localens-public-thesis-demo-design.md`

## Global Constraints

- Start only after both local plans pass: `2026-09-04-localens-gemini-edge-runtime.md` and `2026-09-04-localens-supabase-planner-experience.md`.
- Repository target is `Uyen-Pha/localens` and must remain private; ask the user once more before creating it because creation changes external state.
- Supabase project name is `localens-thesis-demo`; it contains test-only accounts/data and no real customer PII.
- Vercel project name is `localens`; the public release may use its assigned `*.vercel.app` URL without a custom domain.
- Production build uses `NEXT_PUBLIC_LOCALLENS_RUNTIME=supabase`; a demo-mode cloud build is not acceptable.
- Gemini and service-role secrets are entered directly into platform secret stores and never pasted into chat, logs, screenshots, shell history, or Git.
- Payment remains simulated; no Stripe secret, webhook, card field, or real charge is introduced.
- Database changes are forward-only; never run `db reset`, destructive seed cleanup, or history rewrite against cloud.
- Preview must pass before promotion. HTTP 200 alone is not release acceptance.
- Keep the current dirty worktree safe: do not reset, stash, discard, or stage unrelated files.
- Do not run browser automation until the user approves the chosen browser.

---

## File structure

- `scripts/lib/thesis-demo-seed.mjs`: idempotent seed primitives shared by guarded local/cloud entrypoints.
- `scripts/seed-thesis-demo-cloud.mjs`: cloud-only preflight and seed runner.
- `tests/unit/supabase/thesis-demo-cloud-seed.test.ts`: proves refusal, redaction, idempotency, and test-only identities.
- `scripts/smoke-thesis-demo.mjs`: HTTPS/Auth/AI/persistence/payment smoke without logging credentials.
- `tests/unit/supabase/thesis-demo-smoke.test.ts`: validates smoke sequencing and fail-closed behavior with fake HTTP.
- `.github/workflows/ci.yml`: keeps ordinary CI deterministic and adds a manual protected live-cloud smoke.
- `docs/runbooks/cloud-thesis-demo.vi.md`: exact owner-facing deployment, secret, rollback, and incident procedure.
- `docs/acceptance/thesis-demo-release.md`: immutable release evidence for the final SHA and URLs.

### Task 1: Create a clean, reproducible release candidate

**Files:**
- Modify only files intentionally produced by the two implementation plans.
- Create: `docs/acceptance/thesis-demo-release.md`

**Interfaces:**
- Consumes: local acceptance records from the AI runtime and planner experience plans.
- Produces: one release commit SHA whose tree contains every intended feature and no transient logs/secrets.

- [ ] **Step 1: Inventory the exact worktree without changing it**

Run:

```powershell
git rev-parse --show-toplevel
git branch --show-current
git status --short
git diff --name-status
git ls-files --others --exclude-standard
```

Classify every path as product change, acceptance artifact, generated cache, runtime log, or unrelated user work. Do not infer ownership from timestamps alone.

- [ ] **Step 2: Verify ignore rules for transient and secret material**

Add narrow ignore entries only when needed for `.vercel/`, `supabase/.temp/`, `supabase/.env.local`, Playwright outputs, and runtime `*.stdout.log`/`*.stderr.log`. Do not ignore source, migrations, tests, or acceptance evidence.

Run: `git check-ignore -v supabase/.env.local .vercel/project.json`

Expected: both secret/link-state files are ignored by an explicit rule.

- [ ] **Step 3: Run the full local release gate on the current tree**

Run: `pnpm install --frozen-lockfile`

Run: `pnpm lint`

Run: `pnpm typecheck`

Run: `pnpm test:run -- --no-file-parallelism --testTimeout=30000`

Run: `pnpm db:verify`

Run: `pnpm test:e2e`

Run: `pnpm test:e2e:runtime-auth`

Run: `pnpm test:e2e:runtime-itinerary`

Run: `pnpm test:e2e:runtime-fixed-tour`

Run: `pnpm test:e2e:runtime-guide-assignment`

Run: `pnpm build:demo`

Run: `pnpm build:supabase`

Expected: every command exits 0 on the same tree. A failed command stops release preparation and is fixed with a regression test before rerunning the affected and global gates.

- [ ] **Step 4: Record candidate evidence before committing**

Write exact timestamps, Node/pnpm/Supabase versions, test counts, build route counts, browser/version, and current tree diff in `docs/acceptance/thesis-demo-release.md`. Mark cloud URL, cloud project ref, deployment IDs, and final label as “not executed” in prose, not as empty fields.

- [ ] **Step 5: Stage only reviewed product and evidence files**

Use explicit `git add -- <path>` commands from the inventory. Then run:

```powershell
git diff --cached --name-status
git diff --cached --check
git diff --cached --stat
```

Expected: no logs, local environment files, platform state, credentials, unrelated user files, or generated build directories are staged.

- [ ] **Step 6: Commit and verify the release candidate**

```powershell
git commit -m "feat: complete LocalLens thesis demo"
git show --stat --oneline -1
git status --short
```

Capture `git rev-parse HEAD` as the candidate SHA. Preserve remaining unrelated working-tree changes.

### Task 2: Create the private GitHub source and prove CI

**Files:**
- Modify: `.github/workflows/ci.yml` only if the release gate exposed missing deterministic CI coverage.
- Modify: `docs/acceptance/thesis-demo-release.md`

**Interfaces:**
- Produces: private repository `https://github.com/Uyen-Pha/localens` with `origin` configured.
- Produces: green GitHub Actions checks for the release SHA.

- [ ] **Step 1: Reconfirm identity, target, privacy, and remote state**

Run:

```powershell
gh auth status
git remote -v
gh repo view Uyen-Pha/localens --json nameWithOwner,visibility,url 2>$null
```

Expected: GitHub account is `Uyen-Pha`. If the repository exists, stop and inspect its owner/default branch/history before changing any remote. Ask the user to confirm `Uyen-Pha/localens` private before creation or reuse.

- [ ] **Step 2: Create the private repository only after confirmation**

When absent:

```powershell
gh repo create Uyen-Pha/localens --private --source . --remote origin --description "LocalLens full-stack tourism thesis demo"
```

When present and confirmed as the intended empty repository:

```powershell
git remote add origin https://github.com/Uyen-Pha/localens.git
```

- [ ] **Step 3: Push the release branch without force**

```powershell
git push --set-upstream origin codex/staging-plan-a
```

Expected: push succeeds without `--force`; remote commit resolves to the local candidate SHA.

- [ ] **Step 4: Inspect CI by exact SHA**

```powershell
gh run list --repo Uyen-Pha/localens --commit (git rev-parse HEAD) --limit 10
gh run watch --repo Uyen-Pha/localens --exit-status
```

Expected: `quality-demo`, `demo-e2e`, and `runtime-local` are green. Protected `staging-smoke` may wait for cloud configuration and is not counted as local CI success.

- [ ] **Step 5: Record repository and CI evidence**

Add repository URL, visibility, branch, exact SHA, workflow run URL/ID, and job conclusions to the acceptance file. Do not copy tokens or raw failure logs.

- [ ] **Step 6: Commit evidence and push normally**

```powershell
git add -- docs/acceptance/thesis-demo-release.md
git commit -m "docs: record thesis demo CI evidence"
git push
```

### Task 3: Build a guarded, idempotent cloud demo seed

**Files:**
- Create: `scripts/lib/thesis-demo-seed.mjs`
- Create: `scripts/seed-thesis-demo-cloud.mjs`
- Create: `tests/unit/supabase/thesis-demo-cloud-seed.test.ts`
- Modify: `package.json`
- Modify: `scripts/seed-runtime-auth.mjs`
- Modify: `scripts/seed-runtime-fixed-tour.mjs`

**Interfaces:**
- Produces: `pnpm db:seed:thesis-demo-cloud`.
- Consumes secrets only from process environment: `LOCALLENS_THESIS_DEMO_DB_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOCALLENS_DEMO_CUSTOMER_PASSWORD`, `LOCALLENS_DEMO_GUIDE_PASSWORD`, `LOCALLENS_DEMO_ADMIN_PASSWORD`.

- [ ] **Step 1: Write refusal and idempotency tests**

Prove the runner refuses unless all conditions are true:

- `LOCALLENS_THESIS_DEMO_SEED_CONFIRM` equals exactly `localens-thesis-demo`;
- Supabase URL uses HTTPS and is not a local/loopback host;
- database URL uses TLS and points to the same project ref;
- three passwords are present but never printed;
- target contains no non-demo auth users or non-demo catalog release;
- a dry-run query can begin and roll back.

Run the seed twice against fakes and expect the same three user IDs, roles, published catalog snapshot, travel snapshot, tours, departures, and no duplicates.

- [ ] **Step 2: Run seed tests and verify RED**

Run: `pnpm test:run -- tests/unit/supabase/thesis-demo-cloud-seed.test.ts`

Expected: FAIL because the guarded cloud seeder does not exist.

- [ ] **Step 3: Extract reusable seed primitives without weakening local guards**

Move deterministic SQL/data builders from the two local seed scripts into `scripts/lib/thesis-demo-seed.mjs`. Keep existing local-only entrypoints refusing non-loopback databases. Export explicit functions for account roles, approved demo catalog/travel data, fixed tours/departures, and verification queries.

- [ ] **Step 4: Implement cloud preflight and transaction boundaries**

Use the service-role Auth Admin API to upsert these exact test identities without logging passwords:

- `customer.demo@localens.invalid`
- `guide.demo@localens.invalid`
- `admin.demo@localens.invalid`

Use one PostgreSQL transaction for role/catalog/tour data, set `statement_timeout`, verify the expected project and empty/test-only target, apply idempotent upserts, execute postconditions, then commit. A failed postcondition rolls back all database seed changes.

- [ ] **Step 5: Add a dry-run mode**

`LOCALLENS_THESIS_DEMO_SEED_DRY_RUN=1` runs every preflight and database postcondition but rolls back the transaction and does not create Auth users. Output only counts, project host suffix, and a redacted correlation ID.

- [ ] **Step 6: Run unit and local-seed regressions**

Run: `pnpm test:run -- tests/unit/supabase/thesis-demo-cloud-seed.test.ts tests/unit/supabase/runtime-auth-seed.test.ts tests/unit/supabase/runtime-fixed-tour-seed.test.ts`

Run: `pnpm db:seed:runtime-auth`

Run: `pnpm db:seed:runtime-fixed-tour`

Expected: new tests PASS and existing local seed behavior is unchanged.

- [ ] **Step 7: Commit the seeder**

```powershell
git add -- scripts/lib/thesis-demo-seed.mjs scripts/seed-thesis-demo-cloud.mjs tests/unit/supabase/thesis-demo-cloud-seed.test.ts package.json scripts/seed-runtime-auth.mjs scripts/seed-runtime-fixed-tour.mjs
git commit -m "feat: add guarded thesis demo cloud seed"
```

### Task 4: Link and deploy the Supabase Cloud project

**Files:**
- Modify: `docs/runbooks/cloud-thesis-demo.vi.md`
- Modify: `docs/acceptance/thesis-demo-release.md`
- Do not commit: `supabase/.temp/project-ref`, `supabase/.env.local`, database passwords, access tokens, service-role keys.

**Interfaces:**
- Produces: linked `localens-thesis-demo` project with migrations, secrets, functions, and test data.

- [ ] **Step 1: Have the user create/select the isolated cloud project**

The user signs in to Supabase and creates `localens-thesis-demo` in an organization they control. No existing project containing personal or unrelated data is reused. They provide access through CLI login or the platform UI, not by sending tokens in chat.

- [ ] **Step 2: Resolve and link the exact project**

```powershell
pnpm exec supabase login
$LocalLensProjects = pnpm exec supabase projects list --output json | ConvertFrom-Json
$LocalLensProject = @($LocalLensProjects | Where-Object { $_.name -eq 'localens-thesis-demo' })
if ($LocalLensProject.Count -ne 1) { throw 'Expected exactly one localens-thesis-demo project.' }
pnpm exec supabase link --project-ref $LocalLensProject[0].id
```

Verify `supabase/.temp/project-ref` matches the selected project but do not print the unredacted ref into public logs.

- [ ] **Step 3: Review remote migration state before changing it**

Run: `pnpm exec supabase migration list --linked`

Run: `pnpm exec supabase db diff --linked --schema public,private`

Expected for a new project: no unexpected remote objects or data. Stop if drift indicates unrelated schema.

- [ ] **Step 4: Push migrations without remote reset**

Run: `pnpm exec supabase db push --linked --dry-run`

Review the exact ordered migration list.

Run: `pnpm exec supabase db push --linked`

Run: `pnpm exec supabase migration list --linked`

Expected: local and remote migration histories match; no reset command is used.

- [ ] **Step 5: Lock Auth to prepared demo accounts**

In Supabase Auth settings, keep email/password sign-in enabled and disable public new-user signup. Set the Site URL and redirect allowlist only to the approved Vercel preview/production origins once those origins exist. Verify an unknown email cannot self-register while each seeded customer/guide/admin account can sign in with its assigned role.

- [ ] **Step 6: Enter Edge secrets directly into Supabase**

The user sets `GEMINI_API_KEY`, `LOCALLENS_QUOTA_HMAC_KEY`, `ALLOWED_ORIGINS`, `LOCALLENS_GEMINI_ENABLED=1`, and `GEMINI_MODEL=gemini-3.6-flash` via the Supabase dashboard or an interactive local command. Before Vercel returns an exact deployment origin, set `ALLOWED_ORIGINS=https://localens.invalid` so no public origin is accidentally trusted; Task 6 replaces it with the exact preview and production origins before smoke testing. Do not place secret values in the plan, chat, committed files, or command output.

Run: `pnpm exec supabase secrets list`

Expected: required names exist; values are not displayed.

- [ ] **Step 7: Deploy both Edge Functions by name**

```powershell
pnpm exec supabase functions deploy recommend-itinerary --project-ref $LocalLensProject[0].id
pnpm exec supabase functions deploy refine-itinerary --project-ref $LocalLensProject[0].id
pnpm exec supabase functions list --project-ref $LocalLensProject[0].id
```

Expected: both functions are active with JWT verification enabled.

- [ ] **Step 8: Dry-run, seed, and verify test-only data**

Set the required values in the local process environment without echoing them. Then run:

```powershell
$env:LOCALLENS_THESIS_DEMO_SEED_CONFIRM = 'localens-thesis-demo'
$env:LOCALLENS_THESIS_DEMO_SEED_DRY_RUN = '1'
pnpm db:seed:thesis-demo-cloud
$env:LOCALLENS_THESIS_DEMO_SEED_DRY_RUN = '0'
pnpm db:seed:thesis-demo-cloud
```

Expected: dry run rolls back; real run reports exactly three test identities and one coherent published demo bundle. Remove the process environment variables after the command completes.

- [ ] **Step 9: Record redacted Supabase evidence**

Record project name, partially redacted ref, region, migration head, function versions/status, seed counts, and timestamp. Do not record passwords, tokens, database URLs, JWTs, service keys, or Gemini key material.

### Task 5: Add a bounded cloud smoke runner

**Files:**
- Create: `scripts/smoke-thesis-demo.mjs`
- Create: `tests/unit/supabase/thesis-demo-smoke.test.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/runbooks/cloud-thesis-demo.vi.md`

**Interfaces:**
- Produces: `pnpm smoke:thesis-demo`.
- Consumes: `LOCALLENS_STAGING_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `LOCALLENS_DEMO_CUSTOMER_EMAIL`, and `LOCALLENS_DEMO_CUSTOMER_PASSWORD`.

- [ ] **Step 1: Write failing smoke-runner tests with fake fetch**

Assert exact sequencing: HTTPS target validation, `/vi/sign-in/` and `/en/sign-in/` GET, password login, area/snapshot lookup, one recommendation call, revision readback as the same owner, one fixed-tour booking plus simulated-payment completion, and logout. Verify cross-owner data is never requested and credentials/tokens never appear in output or thrown errors.

- [ ] **Step 2: Run smoke tests and verify RED**

Run: `pnpm test:run -- tests/unit/supabase/thesis-demo-smoke.test.ts`

Expected: FAIL because the smoke runner does not exist.

- [ ] **Step 3: Implement bounded live checks**

Use `AbortSignal.timeout(30_000)` per HTTP call, a maximum of one Gemini recommendation per run, and a unique idempotency key for booking/payment. Require `proposal.rankingSource === "ai"` for the live-provider staging check and verify the persisted revision has the same plan ID/fingerprint. Never print response bodies on failure; print only safe status, code, correlation ID, and step name.

- [ ] **Step 4: Keep ordinary CI deterministic**

Add the script to `package.json`. In GitHub Actions, keep local jobs on the fake provider. Add the live command only to the protected `staging` environment and only when `github.event_name == 'workflow_dispatch'`, so pushes do not consume Gemini quota.

```yaml
- name: Run protected full-stack thesis demo smoke
  if: github.event_name == 'workflow_dispatch'
  env:
    LOCALLENS_STAGING_URL: ${{ vars.LOCALLENS_STAGING_URL }}
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }}
    LOCALLENS_DEMO_CUSTOMER_EMAIL: ${{ secrets.LOCALLENS_DEMO_CUSTOMER_EMAIL }}
    LOCALLENS_DEMO_CUSTOMER_PASSWORD: ${{ secrets.LOCALLENS_DEMO_CUSTOMER_PASSWORD }}
  run: pnpm smoke:thesis-demo
```

- [ ] **Step 5: Run unit tests and lint**

Run: `pnpm test:run -- tests/unit/supabase/thesis-demo-smoke.test.ts`

Run: `pnpm lint`

Expected: both commands exit 0.

- [ ] **Step 6: Commit the smoke runner and protected workflow**

```powershell
git add -- scripts/smoke-thesis-demo.mjs tests/unit/supabase/thesis-demo-smoke.test.ts package.json .github/workflows/ci.yml docs/runbooks/cloud-thesis-demo.vi.md
git commit -m "test: add protected thesis demo cloud smoke"
git push
```

### Task 6: Link Vercel and deploy the preview

**Files:**
- Modify: `docs/runbooks/cloud-thesis-demo.vi.md`
- Modify: `docs/acceptance/thesis-demo-release.md`
- Do not commit: `.vercel/`.

**Interfaces:**
- Produces: one Vercel preview deployment of the exact candidate SHA in Supabase mode.

- [ ] **Step 1: Authenticate and link the exact Vercel project**

```powershell
pnpm dlx vercel@59.10.0 login
pnpm dlx vercel@59.10.0 link --project localens
```

The user completes browser authorization if prompted. Verify `.vercel/project.json` names `localens` and remains ignored.

- [ ] **Step 2: Configure preview and production public variables**

Set these in Vercel project settings for both Preview and Production:

- `NEXT_PUBLIC_LOCALLENS_RUNTIME=supabase`
- `NEXT_PUBLIC_SUPABASE_URL` for `localens-thesis-demo`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for that project
- `NEXT_PUBLIC_APP_URL` for the corresponding Vercel URL

Do not add Gemini/service-role/database secrets to Vercel because Gemini runs in Supabase Edge Functions. Do not add Turnstile variables unless that feature is separately enabled.

- [ ] **Step 3: Confirm the build command and framework detection**

Vercel must detect Next.js and run `pnpm build:supabase`, not `pnpm build:demo`. Node is 24 and pnpm is 10.17.1. Verify install uses `pnpm install --frozen-lockfile`.

- [ ] **Step 4: Deploy a preview from the release branch**

```powershell
pnpm dlx vercel@59.10.0 --yes
```

Capture the preview URL and deployment ID. Confirm the source commit shown by Vercel is the intended SHA.

- [ ] **Step 5: Update Supabase CORS allowlist with the exact preview origin**

Add the preview origin alongside the final production origin in `ALLOWED_ORIGINS`, redeploy both Edge Functions, and verify an unknown origin receives no permissive CORS header.

- [ ] **Step 6: Run HTTPS and full-stack smoke against preview**

Set `LOCALLENS_STAGING_URL` to the preview URL and run `pnpm smoke:thesis-demo` from a local shell with credentials supplied through process environment.

Expected: public pages, auth, real Gemini ranking, persistence, fixed-tour booking, and simulated payment all pass.

### Task 7: Perform approved-browser preview acceptance

**Files:**
- Create: `docs/design/qa/cloud-thesis-demo/README.md`
- Modify: `docs/acceptance/thesis-demo-release.md`
- Modify: `design-qa.md`

**Interfaces:**
- Produces: visual/browser evidence for the deployed preview at desktop, tablet, and mobile sizes.

- [ ] **Step 1: Request browser approval and prepare clean demo data**

Ask the user to approve one available browser. Use only that browser. Re-run the idempotent seed verifier so the three role accounts and expected booking capacity are known before testing.

- [ ] **Step 2: Test the customer defense journey**

At `1440x1024`, `768x1024`, and `390x844`: browse publicly, submit preferences, sign in as customer, generate an AI itinerary, inspect rationales, refine it, reload and confirm persistence, create a fixed-tour booking, complete simulated payment, and inspect the receipt.

- [ ] **Step 3: Test cancellation and role journeys**

Create another unpaid booking and cancel it. Sign in as admin to inspect booking/catalog queues. Sign in as guide to inspect assigned work. Verify cross-role URLs fail closed.

- [ ] **Step 4: Audit visual and accessibility evidence**

For each viewport record screenshots, keyboard order, focus visibility, contrast, horizontal overflow, loading/error/fallback states, console errors, failed network requests, and exact bilingual demo/AI/payment disclosures. Compare each cloud screenshot with the accepted local reference at the same viewport/state before declaring it passed.

- [ ] **Step 5: Fix and repeat until preview passes**

Any issue produces a regression test and a normal commit. Push, wait for CI, redeploy preview, then rerun the affected flow and viewport plus one adjacent viewport. Do not promote a known broken preview.

- [ ] **Step 6: Commit redacted QA evidence**

```powershell
git add -- docs/design/qa/cloud-thesis-demo docs/acceptance/thesis-demo-release.md design-qa.md
git commit -m "docs: accept deployed thesis demo preview"
git push
```

### Task 8: Promote the verified SHA and prove rollback

**Files:**
- Modify: `docs/runbooks/cloud-thesis-demo.vi.md`
- Modify: `docs/acceptance/thesis-demo-release.md`

**Interfaces:**
- Produces: final public `*.vercel.app` URL and label `thesis-demo-deployed@<SHA>`.

- [ ] **Step 1: Freeze the final release identity**

Record `git rev-parse HEAD`, verify GitHub CI is green for exactly that SHA, and verify the passing preview deployment also reports that SHA. No code, migration, function, environment, or seed change may occur between freeze and promotion without restarting preview acceptance.

- [ ] **Step 2: Promote the existing verified deployment**

Use Vercel's promotion command/UI for the already-tested deployment rather than rebuilding different source. Confirm `NEXT_PUBLIC_APP_URL` and Supabase `ALLOWED_ORIGINS` contain the assigned production origin.

- [ ] **Step 3: Run non-destructive production smoke**

Run public GET/auth/one AI recommendation/revision readback. For payment, use the dedicated demo customer and a fresh seeded departure/idempotency key; clearly retain test-only records. Run the approved-browser mobile critical path once more.

- [ ] **Step 4: Rehearse independent rollback paths**

- Frontend: identify and verify the previous good Vercel deployment can be promoted.
- Edge: record the previous good function version/source SHA and verify redeploy commands.
- AI: set `LOCALLENS_GEMINI_ENABLED=0`, redeploy, verify deterministic fallback, then restore `1` and verify AI smoke.
- Database: document a forward-fix migration procedure; never reset or down-migrate the cloud database.

- [ ] **Step 5: Finalize release evidence**

Record final URL, GitHub repository, release SHA, Vercel deployment ID, redacted Supabase project ref, migration head, Edge Function versions, smoke timestamps, browser/version, viewport results, simulated-payment statement, known limitations, and rollback rehearsal. Apply `thesis-demo-deployed@<SHA>` only when every item is present and verified.

- [ ] **Step 6: Commit and push the final evidence**

```powershell
git add -- docs/runbooks/cloud-thesis-demo.vi.md docs/acceptance/thesis-demo-release.md
git commit -m "docs: record deployed thesis demo release"
git push
```

## Plan completion gate

This plan is complete only when `Uyen-Pha/localens` is private and green, Supabase Cloud has matching migrations/functions/test-only data, the real Gemini staging smoke passes, the exact accepted SHA is promoted to Vercel, customer/admin/guide browser journeys pass at all required viewports, simulated payment is unmistakably labeled, and rollback evidence exists. The release is labeled `thesis-demo-deployed@<SHA>`, never `production-deployed`.
