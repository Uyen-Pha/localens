# LocalLens B1 Database Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chứng minh 18 migration LocalLens chạy trên Supabase/PostgreSQL local thật với pgTAP, RLS, two-session concurrency và generated types không drift.

**Architecture:** Supabase CLI được pin trong repository và chỉ điều khiển container loopback thông qua wrapper chặn remote mode. Migrations là nguồn schema duy nhất; pgTAP kiểm tra policy/state guard, harness Node mở hai PostgreSQL session thật để kiểm tra race, và type generation đọc schema local vừa reset.

**Tech Stack:** Windows 11, WSL 2, Docker Desktop Linux containers, Node.js 24, pnpm 11, Supabase CLI 2.115.0, PostgreSQL 17, pgTAP, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-localens-b-runtime-product-design.md`

## Global Constraints

- Không chạy `supabase link`, `db push`, `db pull`, remote reset, `--project-ref` hoặc `--db-url`.
- Chỉ dùng loopback ports của Supabase local; không expose stack ra LAN/Internet.
- Không đổi catalog `research_only`, không ký approval thay người chịu trách nhiệm dữ liệu.
- Không đưa service-role key hoặc database password vào source, log hay browser bundle.
- Mỗi lỗi migration/runtime phải được tái hiện trước, có regression test phù hợp rồi mới sửa.
- Không reset/stash/discard thay đổi người dùng; chỉ stage file thuộc task hiện tại.

---

### Task 0: Container prerequisite gate

**Files:**
- Verify: `docs/runbooks/local-supabase.md`
- Modify after successful verification: `docs/runbooks/local-supabase.md`

**Interfaces:**
- Consumes: Windows host and user-approved system installation.
- Produces: working `docker.exe`, Linux container engine and a recorded prerequisite command set.

- [ ] **Step 1: Record the current failing preflight**

Run:

```powershell
wsl.exe --status
docker version
pnpm db:types:check
```

Expected baseline: WSL/container command unavailable and `SUPABASE_CLI_NOT_FOUND`.

- [ ] **Step 2: Install WSL 2 and Docker Desktop with explicit host approval**

Use Microsoft's supported `wsl.exe --install --no-distribution` path and Docker Desktop per-user WSL 2 installation. Never reboot automatically; if Windows reports restart required, stop and preserve this checkpoint.

- [ ] **Step 3: Verify the engine, not only the executable**

Run:

```powershell
wsl.exe --status
docker version
docker info
docker run --rm hello-world
```

Expected: client and server sections exist, OSType is `linux`, and the test container exits `0`.

- [ ] **Step 4: Update the runbook with exact verified host evidence**

Add the verified installation mode, restart requirement if any, Docker version and the four commands above. Do not include machine IDs, usernames, tokens or full environment dumps.

- [ ] **Step 5: Verify documentation diff**

Run: `git diff --check -- docs/runbooks/local-supabase.md`

Expected: exit `0`.

---

### Task 1: Pin and guard the project-local Supabase CLI

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tests/unit/supabase/task16-gate.test.ts`
- Verify: `scripts/supabase-local.mjs`

**Interfaces:**
- Consumes: working Docker engine from Task 0.
- Produces: `node_modules/.bin/supabase.cmd` at exact version `2.115.0`; existing `requireLocalSupabaseCli()` remains the only CLI resolver.

- [ ] **Step 1: Add a failing dependency contract test**

In `tests/unit/supabase/task16-gate.test.ts`, read `package.json` and assert:

```ts
expect(packageJson.devDependencies?.supabase).toBe("2.115.0");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec vitest run tests/unit/supabase/task16-gate.test.ts`

Expected: FAIL because `devDependencies.supabase` is absent.

- [ ] **Step 3: Install the exact reviewed dependency**

Run: `pnpm add --save-dev --save-exact supabase@2.115.0`

Review `package.json` and `pnpm-lock.yaml`; reject unrelated upgrades.

- [ ] **Step 4: Verify CLI location and remote-mode guards**

Run:

```powershell
pnpm exec supabase --version
pnpm exec vitest run tests/unit/supabase/task16-gate.test.ts
pnpm db:types:check
```

Expected: version `2.115.0`, focused tests pass, and type check advances past `SUPABASE_CLI_NOT_FOUND` (schema availability may be the next truthful failure).

- [ ] **Step 5: Commit**

```powershell
git add -- package.json pnpm-lock.yaml tests/unit/supabase/task16-gate.test.ts
git commit -m "build: pin local Supabase CLI"
```

---

### Task 2: Replay migrations on PostgreSQL 17

**Files:**
- Modify only when an observed runtime error requires it: `supabase/migrations/*.sql`
- Test: matching `supabase/tests/database/*_test.sql`
- Test: `tests/unit/supabase/artifacts.test.ts`

**Interfaces:**
- Consumes: project-local CLI and Docker engine.
- Produces: a clean local reset that applies all 18 migrations in timestamp order.

- [ ] **Step 1: Start and reset the local stack**

Run:

```powershell
pnpm db:start
pnpm db:reset
```

Expected target: both commands exit `0`. If reset fails, preserve the first complete SQL error and stop at that migration.

- [ ] **Step 2: Reproduce the first migration failure in the smallest database test**

Add one assertion to the pgTAP file for the failing subsystem. The assertion must name the missing object, grant, policy or transition and fail against the current migration.

- [ ] **Step 3: Implement one migration fix**

Edit only the migration that owns the broken invariant. Do not append broad grants, disable RLS, change definer ownership to `postgres`, or bypass the existing state guard.

- [ ] **Step 4: Verify the fix from a fresh reset**

Run:

```powershell
pnpm db:reset
pnpm db:lint
pnpm db:test
pnpm db:static
```

Expected: the observed failure is gone and all four commands exit `0`. Repeat Steps 2–4 for each independently observed runtime failure.

- [ ] **Step 5: Commit each independently fixed subsystem**

```powershell
git add -- supabase/migrations supabase/tests/database tests/unit/supabase/artifacts.test.ts
git commit -m "fix: make LocalLens migrations runtime-safe"
```

---

### Task 3: Implement the real two-session concurrency harness

**Files:**
- Modify: `scripts/test-db-concurrency.mjs`
- Modify: `package.json` only if a project-local PostgreSQL driver is required
- Modify: `pnpm-lock.yaml` only with that exact driver addition
- Test: `tests/unit/supabase/task16-gate.test.ts`

**Interfaces:**
- Consumes: loopback `postgresql://postgres:postgres@127.0.0.1:54322/postgres` via `LOCALENS_DB_URL`.
- Produces: `runConcurrencyGate(): Promise<{ok:true; scenarios:string[]}>` that executes two independent sessions for six named races and exits nonzero on any invariant violation.

- [ ] **Step 1: Replace status-only expectations with a failing harness contract**

Add tests asserting that configured execution requires exactly these scenarios:

```ts
[
  "cas_revision_winner",
  "guest_claim_winner",
  "quota_reservation_idempotency",
  "departure_capacity_no_oversell",
  "quote_checkout_compensation",
  "stripe_webhook_event_race",
]
```

The test runner dependency-injects two session factories and verifies both sessions participate; a single mocked transaction must fail the contract.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm exec vitest run tests/unit/supabase/task16-gate.test.ts`

Expected: FAIL because the current script reports `NOT_CONFIGURED`/`NOT_AVAILABLE` and does not execute the six races.

- [ ] **Step 3: Implement session orchestration**

Use two independent PostgreSQL connections, explicit `BEGIN`, condition barriers instead of sleep, per-scenario rollback/cleanup and loopback URL validation. Return scenario names only after both session outcomes and final authoritative rows satisfy the invariant.

- [ ] **Step 4: Verify focused and real runtime paths**

Run:

```powershell
pnpm exec vitest run tests/unit/supabase/task16-gate.test.ts
$env:LOCALENS_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'; pnpm db:concurrency
```

Expected: focused tests pass and runtime output reports all six scenarios with exit `0`.

- [ ] **Step 5: Commit**

```powershell
git add -- scripts/test-db-concurrency.mjs package.json pnpm-lock.yaml tests/unit/supabase/task16-gate.test.ts
git commit -m "test: verify LocalLens database concurrency"
```

---

### Task 4: Generate and lock database types

**Files:**
- Create or update: `lib/infrastructure/supabase/database.types.ts`
- Test: `tests/unit/supabase/task16-gate.test.ts`
- Verify: `scripts/write-generated-db-types.mjs`
- Verify: `scripts/check-generated-db-types.mjs`

**Interfaces:**
- Consumes: freshly reset local schema.
- Produces: committed Supabase-generated `Database` type whose bytes match a fresh local generation.

- [ ] **Step 1: Run drift check and record RED**

Run: `pnpm db:types:check`

Expected before generation: FAIL with missing target or byte drift, not CLI-not-found.

- [ ] **Step 2: Generate atomically from local schema**

Run: `pnpm db:types`

Expected: writes only `lib/infrastructure/supabase/database.types.ts` through the existing temporary-sibling/rename path.

- [ ] **Step 3: Verify stable regeneration**

Run twice:

```powershell
pnpm db:types:check
pnpm db:types:check
```

Expected: both runs exit `0` and `git diff` is unchanged after the first generation.

- [ ] **Step 4: Run TypeScript and adapter tests**

Run:

```powershell
pnpm typecheck
pnpm exec vitest run tests/unit/infrastructure tests/unit/supabase
```

Expected: zero type error and all focused tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- lib/infrastructure/supabase/database.types.ts tests/unit/supabase/task16-gate.test.ts
git commit -m "build: lock generated Supabase database types"
```

---

### Task 5: Close the B1 runtime gate

**Files:**
- Modify: `docs/runbooks/local-supabase.md`
- Create: `docs/acceptance/runtime-db-qa.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 0–4 and their fresh command output.
- Produces: repeatable B1 runbook and evidence that names exact commands, counts, commit and known non-production boundary.

- [ ] **Step 1: Run the complete database gate**

Run: `pnpm db:verify`

Expected: start, reset, lint, pgTAP, all six concurrency scenarios, types check and stop cleanup exit `0`.

- [ ] **Step 2: Run application regression gates**

Run:

```powershell
pnpm check
pnpm test:e2e
pnpm db:static
git diff --check
```

Expected: zero failure; Playwright reports every case passed; static scan still covers all migration files.

- [ ] **Step 3: Write evidence without production overclaim**

`docs/acceptance/runtime-db-qa.md` records date/time zone, tested commit, Docker/Supabase/PostgreSQL versions, migration and pgTAP counts, six concurrency scenarios, generated-type result and cleanup result. It labels the outcome `runtime-verified-local`, explicitly not `staging-deployed`.

- [ ] **Step 4: Independent review**

Reviewer checks the spec line by line, then inspects migrations, grants, RLS, concurrency harness, generated types and evidence. Any P0/P1 returns to the owning task with a failing regression test.

- [ ] **Step 5: Commit**

```powershell
git add -- README.md docs/runbooks/local-supabase.md docs/acceptance/runtime-db-qa.md
git commit -m "docs: record LocalLens B1 runtime acceptance"
```

- [ ] **Step 6: Transition to B2**

Only after the fresh B1 gate exits `0`, create `docs/superpowers/plans/2026-09-01-localens-b2-application-runtime.md` for auth, repository composition and runtime E2E. Do not call the application production-ready at this checkpoint.
