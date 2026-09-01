# LocalLens B2.1 Runtime Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chạy LocalLens ở hai mode tách biệt `demo` và `supabase`, với Supabase Auth thật cho customer/guide/admin, role lấy từ PostgreSQL, session bền qua refresh/tab mới và route sai role bị chặn.

**Architecture:** Browser entrypoint chỉ nạp composition tương ứng với `NEXT_PUBLIC_LOCALLENS_RUNTIME`; mode Supabase không import demo repository và lỗi cấu hình phải fail closed. Một RPC owner-scoped trả identity của JWT hiện tại, Supabase session adapter ánh xạ Auth + RPC sang application contract, còn UI Supabase có form đăng nhập và runtime role shell riêng; các portal nghiệp vụ đầy đủ được nối ở B2.2-B2.4.

**Tech Stack:** Next.js 16.3.2, React 19.2.8, TypeScript 6.0.3, Supabase JS 2.112.3, Supabase CLI 2.115.0, PostgreSQL 17, Vitest 4.1.11, Playwright 1.62.1, pnpm 11.19.0.

**Spec:** `docs/superpowers/specs/2026-09-01-localens-b-runtime-product-design.md`

## Global Constraints

- Runtime mode is exactly `demo` or `supabase`; production builds never infer demo from `NODE_ENV`.
- Mode `supabase` must not statically import `lib/infrastructure/demo/portal-repository.ts` and must never fall back to demo after config, auth, RPC or network failure.
- Browser bundles may receive only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; service-role key and database password remain local script/server inputs.
- Role and owner identity come from the authenticated JWT plus database projection; query strings, form fields and user metadata are not role authority.
- Runtime test accounts are local-only, require loopback Supabase/PostgreSQL endpoints and must not seed catalog inventory.
- Keep payment explicitly simulated and keep catalog rows `research_only`; B2.1 changes neither booking nor catalog behavior.
- Do not reset, stash, discard or stage unrelated user changes. Preserve mode A behavior and its deterministic E2E fixture flag.
- Every production-code change follows RED → GREEN → REFACTOR and every task ends with a focused commit.

---

### Task 1: Make runtime mode explicit at build and browser boundaries

**Files:**
- Create: `lib/env/runtime.ts`
- Create: `scripts/run-next-mode.mjs`
- Modify: `next.config.ts`
- Modify: `package.json`
- Modify: `playwright.config.ts`
- Modify: `.env.example`
- Test: `tests/unit/env/runtime.test.ts`
- Test: `tests/unit/supabase/task16-gate.test.ts`

**Interfaces:**
- Consumes: `process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME`, public Supabase URL and publishable key.
- Produces: `parseRuntimeMode(value): "demo" | "supabase"`, `parseBrowserRuntimeConfig(source): BrowserRuntimeConfig`, and explicit scripts `dev:demo`, `dev:supabase`, `build:demo`, `build:supabase`.

- [ ] **Step 1: Write failing runtime configuration tests**

Add tests with these assertions:

```ts
expect(parseRuntimeMode("demo")).toBe("demo");
expect(parseRuntimeMode("supabase")).toBe("supabase");
expect(() => parseRuntimeMode(undefined)).toThrow(/NEXT_PUBLIC_LOCALLENS_RUNTIME/);
expect(() => parseRuntimeMode("production")).toThrow(/demo.*supabase/);
expect(parseBrowserRuntimeConfig({ NEXT_PUBLIC_LOCALLENS_RUNTIME: "demo" }))
  .toEqual({ mode: "demo" });
expect(() => parseBrowserRuntimeConfig({
  NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
})).toThrow();
```

In `task16-gate.test.ts`, assert `package.json` contains all four explicit mode scripts and that `check` runs `build:demo` rather than an implicit `build`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
pnpm exec vitest run tests/unit/env/runtime.test.ts tests/unit/supabase/task16-gate.test.ts
```

Expected: FAIL because `lib/env/runtime.ts` and explicit scripts do not exist.

- [ ] **Step 3: Implement the discriminated runtime config**

Implement these public types and signatures:

```ts
export type RuntimeMode = "demo" | "supabase";
export type BrowserRuntimeConfig =
  | { readonly mode: "demo" }
  | {
      readonly mode: "supabase";
      readonly supabaseUrl: string;
      readonly supabasePublishableKey: string;
    };

export function parseRuntimeMode(value: unknown): RuntimeMode;
export function parseBrowserRuntimeConfig(source: Record<string, unknown>): BrowserRuntimeConfig;
```

`parseBrowserRuntimeConfig` must ignore Supabase placeholders in demo mode and require an HTTP(S) URL plus non-empty publishable key in Supabase mode. Error messages name public variable names but never print values.

- [ ] **Step 4: Make Next commands explicit and cross-platform**

Implement `scripts/run-next-mode.mjs` to accept exactly `<dev|build> <demo|supabase>`, reject extra arguments, set `NEXT_PUBLIC_LOCALLENS_RUNTIME` to the requested mode, then spawn the project-local Next binary with inherited remaining CLI arguments. Update scripts to:

```json
{
  "dev:demo": "node scripts/run-next-mode.mjs dev demo",
  "dev:supabase": "node scripts/run-next-mode.mjs dev supabase",
  "build:demo": "node scripts/run-next-mode.mjs build demo",
  "build:supabase": "node scripts/run-next-mode.mjs build supabase",
  "check": "pnpm lint && pnpm typecheck && pnpm test:run && pnpm build:demo"
}
```

Keep `dev` and `build` as direct Next commands that require an explicitly supplied `NEXT_PUBLIC_LOCALLENS_RUNTIME`. In `next.config.ts`, use static export only when mode is `demo` and command is a non-development build; mode `supabase` never sets `output: "export"`. Update Playwright's demo web server to call `pnpm dev:demo`. Add `NEXT_PUBLIC_LOCALLENS_RUNTIME=demo` to `.env.example` with a comment that deployments must choose explicitly.

- [ ] **Step 5: Verify both config paths**

Run:

```powershell
pnpm exec vitest run tests/unit/env/runtime.test.ts tests/unit/supabase/task16-gate.test.ts
pnpm build:demo
$env:NEXT_PUBLIC_LOCALLENS_RUNTIME='supabase'; $env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321'; $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='local-test-key'; pnpm build
```

Expected: tests pass; demo build emits static output; Supabase build succeeds without static-export mode. Remove the three temporary environment variables after the command.

- [ ] **Step 6: Commit**

```powershell
git add -- .env.example next.config.ts package.json playwright.config.ts lib/env/runtime.ts scripts/run-next-mode.mjs tests/unit/env/runtime.test.ts tests/unit/supabase/task16-gate.test.ts
git commit -m "build: make LocalLens runtime mode explicit"
```

---

### Task 2: Add the authenticated owner identity RPC

**Files:**
- Create: `supabase/migrations/20260901140000_runtime_portal_identity.sql`
- Create: `supabase/tests/database/runtime_portal_identity_test.sql`
- Modify: `lib/infrastructure/supabase/database.types.ts`
- Test: `tests/unit/supabase/artifacts.test.ts`

**Interfaces:**
- Consumes: JWT `sub`, `public.profiles`, `private.user_roles`, profile `language`, and existing `localens_identity_rpc_owner`.
- Produces: `public.get_portal_identity()` returning one row `(user_id uuid, display_name text, role public.app_role, language public.locale)` only for the current authenticated user.

- [ ] **Step 1: Write the failing pgTAP contract**

Create four test auth users: one customer, one guide, one admin and one deliberately ambiguous user with two roles. Assert:

```sql
SELECT has_function('public', 'get_portal_identity', ARRAY[]::text[]);
SELECT throws_ok(
  $$SELECT * FROM public.get_portal_identity()$$,
  '42501',
  'authentication required'
);
```

For each single-role JWT, assert exactly one row and exact own `user_id`, `role`, `display_name`, and `language`. For the ambiguous user assert SQLSTATE `21000` with message `portal identity must have exactly one role`. Assert `authenticated` still has no direct privileges on `private.user_roles`.

- [ ] **Step 2: Run database tests and verify RED**

Run:

```powershell
pnpm db:start
pnpm db:reset
pnpm db:test
```

Expected: FAIL because `public.get_portal_identity()` is absent.

- [ ] **Step 3: Implement the smallest fail-closed RPC migration**

The migration must:

- add a FORCE-RLS policy allowing only `localens_identity_rpc_owner` to select `public.profiles`;
- grant that owner only the needed `SELECT` columns;
- define a zero-argument `SECURITY DEFINER`, `SET search_path = ''` function;
- read actor UUID only from `request.jwt.claim.sub`;
- count roles for that actor and raise `21000` unless the count is exactly one;
- return only the actor's own profile and role;
- revoke from `PUBLIC` and `anon`, then grant execute only to `authenticated`.

Use the exact signature:

```sql
CREATE OR REPLACE FUNCTION public.get_portal_identity()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  role public.app_role,
  language public.locale
)
```

Do not read `raw_user_meta_data`, accept a target UUID, or grant direct role-table access.

- [ ] **Step 4: Verify migration, security matrix and generated types**

Run:

```powershell
pnpm db:reset
pnpm db:lint
pnpm db:test
pnpm db:static
pnpm db:types
pnpm db:types:check
pnpm exec vitest run tests/unit/supabase/artifacts.test.ts
```

Expected: all commands pass and generated `Database` exposes `get_portal_identity` with no arguments and the exact four result fields.

- [ ] **Step 5: Commit**

```powershell
git add -- supabase/migrations/20260901140000_runtime_portal_identity.sql supabase/tests/database/runtime_portal_identity_test.sql lib/infrastructure/supabase/database.types.ts tests/unit/supabase/artifacts.test.ts
git commit -m "feat: expose authenticated portal identity"
```

---

### Task 3: Seed deterministic local Auth users without catalog data

**Files:**
- Create: `scripts/seed-runtime-auth.mjs`
- Modify: `package.json`
- Test: `tests/unit/supabase/runtime-auth-seed.test.ts`
- Modify: `docs/runbooks/local-supabase.md`

**Interfaces:**
- Consumes: loopback Supabase URL/service-role key from local CLI status and `LOCALENS_DB_URL` on `127.0.0.1:54322`.
- Produces: idempotent local users `customer.runtime@localens.test`, `guide.runtime@localens.test`, `admin.runtime@localens.test` with exactly one authoritative database role each.

- [ ] **Step 1: Write failing local-only and idempotency tests**

Dependency-inject the Auth admin client and PostgreSQL query function. Tests must prove:

- non-loopback Supabase or database URLs throw `RUNTIME_AUTH_SEED_LOCAL_ONLY` before any write;
- rerunning the seed reuses the same three auth users;
- the customer has only `customer`, guide only `guide`, admin only `admin`;
- the guide receives a guide profile;
- no catalog, tour, departure, booking or payment table is written;
- logs contain emails and role labels but never service key, database URL or passwords.

- [ ] **Step 2: Run focused test and verify RED**

Run:

```powershell
pnpm exec vitest run tests/unit/supabase/runtime-auth-seed.test.ts
```

Expected: FAIL because the seed module is absent.

- [ ] **Step 3: Implement loopback-only Auth seeding**

Export:

```js
export const RUNTIME_AUTH_IDENTITIES = Object.freeze([
  { email: "customer.runtime@localens.test", role: "customer", displayName: "Runtime Traveler", language: "en" },
  { email: "guide.runtime@localens.test", role: "guide", displayName: "Runtime Guide", language: "vi" },
  { email: "admin.runtime@localens.test", role: "admin", displayName: "Runtime Administrator", language: "en" },
]);

export async function seedRuntimeAuth(options);
```

Use Supabase Admin Auth to create confirmed local users and PostgreSQL only to normalize `private.user_roles`, `public.profiles` and `public.guide_profiles`. Passwords are accepted from `LOCALENS_RUNTIME_CUSTOMER_PASSWORD`, `LOCALENS_RUNTIME_GUIDE_PASSWORD`, and `LOCALENS_RUNTIME_ADMIN_PASSWORD`; tests and E2E runner provide them, and the script rejects missing values. Never commit password values.

Add `db:seed:runtime-auth` invoking this module. The CLI path must call `runLocalSupabase(["status", "-o", "env"], { capture: true })`, parse only local API URL/service key, validate loopback again, and never print captured status text.

- [ ] **Step 4: Verify against the real local stack**

Set three temporary test-only passwords in the shell, then run:

```powershell
pnpm db:reset
pnpm db:seed:runtime-auth
pnpm db:seed:runtime-auth
pnpm db:test
```

Expected: both seed runs exit `0`, report three identities without secrets, and database tests pass. Clear all three password environment variables immediately afterward.

- [ ] **Step 5: Document exact local usage and safety boundary**

Add the commands to `docs/runbooks/local-supabase.md`, label accounts local test-only, state that the script refuses non-loopback endpoints, and state that it seeds no inventory.

- [ ] **Step 6: Commit**

```powershell
git add -- package.json scripts/seed-runtime-auth.mjs tests/unit/supabase/runtime-auth-seed.test.ts docs/runbooks/local-supabase.md
git commit -m "test: seed local runtime auth identities"
```

---

### Task 4: Implement the Supabase session adapter and mode-isolated loader

**Files:**
- Modify: `lib/application/portal/contracts.ts`
- Create: `lib/infrastructure/supabase/portal-session-adapter.ts`
- Create: `lib/application/portal/supabase-shell.ts`
- Modify: `components/portals/portal-session.ts`
- Test: `tests/unit/portal/supabase-session.test.ts`
- Test: `tests/unit/portal/runtime-loader.test.ts`

**Interfaces:**
- Consumes: `BrowserRuntimeConfig`, `createBrowserSupabaseClient`, Supabase `auth.getSession`, `auth.signInWithPassword`, `auth.signOut`, and RPC `get_portal_identity`.
- Produces: `RuntimeSessionPort` and `SupabasePortalShell`:

```ts
export interface RuntimeSessionPort extends PortalSessionPort {
  signInWithPassword(input: { email: string; password: string }): Promise<PortalIdentity>;
}

export interface SupabasePortalShell {
  readonly mode: "supabase";
  readonly session: RuntimeSessionPort;
  readonly initialized: Promise<void>;
}

export async function loadPortalSurfaceComposition(): Promise<DemoPortalComposition | SupabasePortalShell>;
```

- [ ] **Step 1: Write failing adapter behavior tests**

Tests must assert:

- no Auth session returns `null` without calling identity RPC;
- a successful password sign-in immediately resolves the database identity;
- returned RPC `user_id` must equal Auth `user.id`;
- role must be one of `customer`, `guide`, `admin` and never comes from Auth metadata;
- missing/duplicate/invalid identity fails closed with `PortalError` and never creates demo state;
- sign-out delegates to Supabase Auth;
- error messages never include password, token or publishable key.

Loader tests inspect module boundaries and assert Supabase mode imports only the Supabase shell path, while demo mode dynamically imports the demo composition path. A rejected Supabase import/config promise must remain rejected; it must not call the demo loader.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
pnpm exec vitest run tests/unit/portal/supabase-session.test.ts tests/unit/portal/runtime-loader.test.ts
```

Expected: FAIL because runtime session and loader interfaces do not exist.

- [ ] **Step 3: Implement strict Auth-to-identity mapping**

Use the authenticated Supabase user only for `userId` and `email`; use RPC only for `displayName`, `role`, and `locale`. Reject a mismatched UUID, empty email/display name, unknown role, unknown locale or any RPC cardinality other than one. Map invalid credentials to `UNAUTHENTICATED`, authorization/RPC identity failures to `FORBIDDEN`, and configuration/client creation failures to `PRODUCTION_CONFIGURATION`.

- [ ] **Step 4: Implement lazy mode-isolated composition loading**

`components/portals/portal-session.ts` may use erased type-only demo imports, but runtime imports must be dynamic and mode-specific. Cache one resolved composition per browser page. Supabase mode creates the browser client from `parseBrowserRuntimeConfig`; it must not import or call `createPortalComposition`, because that module statically owns the demo repository.

- [ ] **Step 5: Verify focused tests, source boundary and typecheck**

Run:

```powershell
pnpm exec vitest run tests/unit/portal/supabase-session.test.ts tests/unit/portal/runtime-loader.test.ts tests/unit/portal/composition.test.ts
rg -n "infrastructure/demo|createPortalComposition|getDemoPortalComposition" lib/application/portal/supabase-shell.ts lib/infrastructure/supabase/portal-session-adapter.ts
pnpm typecheck
```

Expected: tests and typecheck pass; `rg` returns no matches in the two Supabase files.

- [ ] **Step 6: Commit**

```powershell
git add -- lib/application/portal/contracts.ts lib/application/portal/supabase-shell.ts lib/infrastructure/supabase/portal-session-adapter.ts components/portals/portal-session.ts tests/unit/portal/supabase-session.test.ts tests/unit/portal/runtime-loader.test.ts
git commit -m "feat: add Supabase portal session runtime"
```

---

### Task 5: Add bilingual runtime sign-in and role routing without demo leakage

**Files:**
- Create: `components/portals/demo-portal-surface.tsx`
- Create: `components/portals/supabase-portal-surface.tsx`
- Modify: `components/portals/portal-surface.tsx`
- Modify: `components/portals/portal-copy.ts`
- Modify: `components/portals/portal.module.css`
- Modify: `app/[locale]/sign-in/page.tsx`
- Test: `tests/components/portals/portal-surface.test.tsx`
- Test: `tests/components/portals/supabase-portal-surface.test.tsx`
- Test: `tests/unit/portal/routes/pages.test.ts`

**Interfaces:**
- Consumes: `loadPortalSurfaceComposition`, `DemoPortalComposition`, `SupabasePortalShell`, `RuntimeSessionPort`.
- Produces: one `PortalSurface` entry that renders the existing demo experience unchanged or the Supabase password form/runtime role shell.

- [ ] **Step 1: Write failing Supabase surface tests**

For both `en` and `vi`, test these behaviors with a real in-memory adapter fake:

- signed-out Supabase mode renders labeled email/password fields and one submit button, with no demo identity cards or reset-demo control;
- invalid credentials show localized generic auth error and do not echo credentials;
- successful customer/guide/admin sign-in navigates to `/{locale}/account/`, `/{locale}/guide/`, or `/{locale}/admin/` respectively;
- refresh-style remount calls `getSession()` and renders the same signed-in identity;
- opening a route for a different role renders access denied and a link to the actor's own route;
- sign-out returns to the runtime sign-in form;
- composition/config failure renders localized service-unavailable UI with a retry action and no demo fallback.

Keep all existing demo surface tests unchanged except import path adjustments caused by extracting `demo-portal-surface.tsx`.

- [ ] **Step 2: Run focused component tests and verify RED**

Run:

```powershell
pnpm exec vitest run tests/components/portals/portal-surface.test.tsx tests/components/portals/supabase-portal-surface.test.tsx tests/unit/portal/routes/pages.test.ts
```

Expected: new Supabase tests fail because only the demo identity picker exists.

- [ ] **Step 3: Extract the demo surface without changing behavior**

Move existing demo-specific state, identity picker, reset operation and customer/guide/admin rendering into `demo-portal-surface.tsx`. Keep the public prop behavior and deterministic storage initialization unchanged. Verify the existing demo component suite is green before adding Supabase UI.

- [ ] **Step 4: Implement the Supabase sign-in and authenticated runtime shell**

`supabase-portal-surface.tsx` owns email/password state, disables duplicate submit, clears password state after every attempt, calls only `RuntimeSessionPort`, and routes by returned database role. For a correctly matched protected route, render a localized runtime-connected shell containing identity email, display name, authoritative role, sign-out, and this bounded disclosure:

- EN: `Secure runtime connected. Operational portal data is enabled in the next verified slice.`
- VI: `Runtime bảo mật đã kết nối. Dữ liệu nghiệp vụ của cổng sẽ được bật ở lát cắt đã kiểm chứng tiếp theo.`

This shell is the B2.1 acceptance surface, not a claim that booking/portal data is complete.

- [ ] **Step 5: Make the public surface route by loaded mode**

`portal-surface.tsx` loads once, renders a neutral localized loading state, then delegates to exactly one mode surface. On load failure it renders service unavailable with a correlation ID generated client-side for support; retry reloads only the selected mode. Update sign-in metadata from `Demo sign in`/`Đăng nhập demo` to `Sign in`/`Đăng nhập`; demo disclosure inside the demo surface remains explicit.

- [ ] **Step 6: Verify component, accessibility and demo regression tests**

Run:

```powershell
pnpm exec vitest run tests/components/portals/portal-surface.test.tsx tests/components/portals/supabase-portal-surface.test.tsx tests/unit/portal/routes/pages.test.ts
pnpm exec vitest run tests/components/portals tests/unit/portal
pnpm lint
pnpm typecheck
```

Expected: all commands pass with no React act warnings, duplicate labels or leaked password text.

- [ ] **Step 7: Commit**

```powershell
git add -- components/portals/demo-portal-surface.tsx components/portals/supabase-portal-surface.tsx components/portals/portal-surface.tsx components/portals/portal-copy.ts components/portals/portal.module.css app/[locale]/sign-in/page.tsx tests/components/portals/portal-surface.test.tsx tests/components/portals/supabase-portal-surface.test.tsx tests/unit/portal/routes/pages.test.ts
git commit -m "feat: add bilingual Supabase sign in"
```

---

### Task 6: Add clean local runtime E2E and complete the B2.1 gate

**Files:**
- Create: `playwright.runtime.config.ts`
- Create: `scripts/run-runtime-auth-e2e.mjs`
- Create: `tests/e2e/runtime-auth.spec.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/runbooks/local-supabase.md`

**Interfaces:**
- Consumes: local Supabase stack, runtime auth seed, explicit Supabase browser config, and three local-only password environment variables.
- Produces: `pnpm test:e2e:runtime-auth` with a clean Next server on port `3200`, plus evidence for EN/VI auth, persistence, role denial and demo isolation.

- [ ] **Step 1: Write the runtime E2E first**

Add serial tests that:

1. sign in as customer in English, reload, open a second browser page in the same context, and verify the customer runtime shell persists;
2. navigate that customer to `/en/admin/` and verify access denied without admin content;
3. sign out, sign in as guide in Vietnamese, reload, and verify `/vi/guide/` plus Vietnamese runtime disclosure;
4. sign out, sign in as admin, verify `/en/admin/`, then navigate to `/en/account/` and verify denial;
5. inspect session storage/local storage and confirm no `localens.portal.demo` fixture key was created in Supabase mode.

Credentials come only from the three runtime password environment variables; tests must not contain password literals.

- [ ] **Step 2: Run the new E2E and verify RED**

Run:

```powershell
pnpm test:e2e:runtime-auth
```

Expected: FAIL because the runtime runner/config do not exist or because the Supabase UI is not yet wired.

- [ ] **Step 3: Implement the local-only E2E orchestrator**

`scripts/run-runtime-auth-e2e.mjs` must:

- reject non-loopback API and database endpoints;
- require Docker/local Supabase via existing guarded scripts;
- run `db:start`, `db:reset`, and `db:seed:runtime-auth`;
- obtain local API URL and anon/publishable key from captured `supabase status -o env` without logging the full output;
- spawn Playwright with `NEXT_PUBLIC_LOCALLENS_RUNTIME=supabase`, port `3200`, and the three password variables;
- stop only the Next child it created; leave Supabase running for inspection unless `LOCALENS_RUNTIME_STOP_DB=1` was explicitly supplied.

`playwright.runtime.config.ts` uses one Chromium worker, `reuseExistingServer: false`, and `pnpm dev:supabase --hostname 127.0.0.1 --port 3200`. It never sets `NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES=1`.

- [ ] **Step 4: Verify runtime and demo E2E separately**

Run:

```powershell
pnpm test:e2e:runtime-auth
pnpm test:e2e tests/e2e/portal-demo-flow.spec.ts
```

Expected: runtime auth suite passes against PostgreSQL/Auth state; demo portal suite passes against the clean configured demo server. Neither command may reuse the existing manual server on port `3100`.

- [ ] **Step 5: Run the complete B2.1 verification gate**

Run:

```powershell
pnpm db:verify
pnpm check
pnpm test:e2e
pnpm test:e2e:runtime-auth
git diff --check
```

Expected: database runtime, 930+ unit/component tests, production demo build, complete demo E2E and runtime-auth E2E all exit `0`. Record exact counts in the runbook/README; do not label B2.2-B2.4 or staging complete.

- [ ] **Step 6: Commit**

```powershell
git add -- package.json playwright.runtime.config.ts scripts/run-runtime-auth-e2e.mjs tests/e2e/runtime-auth.spec.ts README.md docs/runbooks/local-supabase.md
git commit -m "test: verify LocalLens runtime authentication"
```

- [ ] **Step 7: Request final branch review**

Generate a review package from the B2.1 branch point through `HEAD`. The reviewer must verify spec compliance, demo/Supabase module isolation, secret redaction, role authority, local-only seeding, EN/VI UX, and test evidence. Resolve every Critical/Important finding before integration.

---

## B2.1 Completion Boundary

B2.1 is complete only when a real local Supabase user can sign in as each role, survive refresh/new page, be denied the other roles' routes, sign out, and leave no demo repository state, while all database/demo gates remain green. The authenticated role pages intentionally show the bounded runtime-connected shell until B2.2-B2.4 supply operational data; therefore B2.1 completion must never be reported as whole-product completion, staging deployment or production deployment.
