# LocalLens Plan A Acceptance-Ready Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trong một cửa sổ triển khai mục tiêu 8 giờ, tạo một release candidate LocalLens có thể nghiệm thu trên Vercel + Supabase cho phạm vi luận văn B2.1-B2.4, kèm bằng chứng tái lập, rollback và nhãn trạng thái trung thực.

**Architecture:** Giữ Next.js App Router làm web tier, hai runtime `demo` và `supabase` tách biệt/fail-closed, Supabase Auth + PostgreSQL/RLS làm runtime dữ liệu, GitHub Actions làm cổng CI, Vercel làm public staging. Mọi thay đổi remote phải dùng cùng một release SHA; kiểm tra local hoàn tất trước khi audit/tái sử dụng Supabase cũ và deploy staging.

**Tech Stack:** Next.js 16.3.2, React 19.2.8, TypeScript 6.0.3, Supabase CLI 2.115.0, PostgreSQL/RLS/pgTAP, Vitest 4.1.11, Playwright 1.62.1, Node.js 24, pnpm 10.17.1, GitHub Actions, Vercel CLI 59.11.2.

**Spec:** `docs/superpowers/specs/2026-09-01-localens-b-runtime-product-design.md`

## Global Constraints

- Không reset, stash, discard, ghi đè hoặc xóa các thay đổi đang có. Trước khi triển khai phải bảo toàn ba file spec/plan đã sửa, sáu ảnh QA, plan sửa đường dẫn và bốn file log đang untracked.
- Repository GitHub là private. Không push, merge hoặc publish trước khi người dùng duyệt đúng owner/repository và release SHA.
- Staging cho phép truy cập trang công khai; tài khoản test chỉ cung cấp qua kênh riêng, không ghi mật khẩu/token vào Git, log, ảnh chụp hoặc báo cáo.
- Chỉ tái sử dụng Supabase cũ sau khi audit xác nhận đúng owner, không có người dùng thật/PII, không có tài nguyên không thuộc LocalLens và có backup phục hồi được. Nếu audit không đạt, tạo project staging riêng trong cùng tài khoản.
- Không chạy `supabase db reset --linked`, không reset production/remote và không dùng service-role key trong browser hoặc biến `NEXT_PUBLIC_*`.
- Thanh toán chỉ là mô phỏng; không thu tiền, không lưu số thẻ/CVV và không gọi payment gateway thật.
- Catalog giữ nhãn `research_only`; staging không được quảng bá là dữ liệu kinh doanh đã xác minh.
- Không dùng `pnpm build` trần. Mọi build phải là `pnpm build:demo` hoặc `pnpm build:supabase`.
- Một SHA duy nhất phải xuất hiện trong CI, migration evidence, Vercel deployment và báo cáo nghiệm thu.
- Mỗi bug/feature thực hiện theo red-green-refactor: thêm test thất bại, chạy để xác nhận RED, sửa tối thiểu, chạy lại GREEN, rồi chạy regression liên quan.
- Mỗi commit chỉ stage allowlist file của task; không dùng `git add .` hoặc `git add -A`.
- Không tuyên bố production-ready. `staging-deployed@SHA` chỉ hợp lệ khi schema, Edge Functions và web đều đã deploy qua HTTPS và external auth smoke pass. Vì repo hiện chưa có deployable Edge Function entrypoint, Plan A mặc định xuất bản nhãn `staging-verified-limited@SHA (B2.1-B2.4)`.

---

## Baseline đã xác minh ngày 2026-09-02

- Branch: `codex/localens-mvp`; HEAD: `667792d`.
- `pnpm lint`, `pnpm typecheck`, `pnpm db:static`, `pnpm build:demo`, `pnpm build:supabase` đã pass ở snapshot hiện tại.
- Full unit/component suite ổn định với `pnpm test:run --no-file-parallelism --testTimeout=30000`: 104 file, 1264 test pass.
- `pnpm build` thất bại đúng thiết kế vì thiếu `NEXT_PUBLIC_LOCALLENS_RUNTIME`; `.github/workflows/ci.yml` hiện gọi lệnh này nên CI chưa thể là cổng nghiệm thu.
- `pnpm db:verify` chưa được nghiệm thu vì máy chưa có Docker/Podman. `docker`, `gh` và `vercel` không có trong `PATH`; Docker Desktop và GitHub CLI cũng không có ở đường dẫn cài đặt chuẩn.
- Hai lỗi UX đã tái hiện bằng browser: mất booking intent sau sign-in và giá `VND 480,000` bị ngắt giữa chữ số.
- Chưa có deployable Supabase Edge Function entrypoint dưới `supabase/functions`; chỉ có `_shared` modules.

## Definition of Done và nhãn phát hành

| Nhãn | Điều kiện bắt buộc |
|---|---|
| `demo-verified@SHA` | quality gate, demo build và clean-server Playwright pass |
| `runtime-verified-local@SHA` | `db:verify`, ba runtime E2E suite và Supabase build cùng pass trên local Docker |
| `staging-verified-limited@SHA (B2.1-B2.4)` | private GitHub CI xanh, Supabase staging audit/backup/migration pass, Vercel HTTPS deploy đúng SHA, external end-to-end và Product Design/accessibility acceptance pass |
| `staging-deployed@SHA` | Chỉ dùng khi bổ sung và deploy Edge Function entrypoints theo spec, ngoài phạm vi mặc định của Plan A |
| `production-deployed@SHA` | Không thuộc plan này |

## Acceptance Matrix

| Gate | Bằng chứng phải lưu | GO | NO-GO |
|---|---|---|---|
| G0 — Source preservation | `git status --short`, branch, SHA, allowlist file cần bảo toàn | Snapshot và commit bảo toàn chỉ chứa file đã duyệt | Có file nguồn chưa rõ chủ sở hữu hoặc commit lẫn log/secret |
| G1 — Toolchain/CI | pnpm 10.17.1, CI run URL, từng job xanh | Không còn `pnpm build` trần; stable unit gate pass | Lockfile drift, flaky test, CI đỏ hoặc bị skip |
| G2 — UX/security | Test return-to, price wrap, header assertions; screenshots EN/VI | Booking intent được giữ an toàn; giá không vỡ; header pass | Open redirect, sai role, overflow hoặc header thiếu |
| G3 — Local runtime | Log `db:verify`, demo E2E, ba runtime E2E, hai build | Tất cả exit 0 trên clean state | Docker thiếu, DB/RLS/concurrency/E2E/build fail hoặc không chạy |
| G4 — GitHub | Private repo URL, branch protection/CI, release SHA | Repo private, CI xanh đúng SHA | Repo public, sai remote, sai SHA hoặc secret lộ |
| G5 — Supabase staging | Audit, backup + checksum, migration dry-run/apply, fixture manifest | Project an toàn để tái sử dụng và post-migration smoke pass | Có PII/tài nguyên lạ, backup không kiểm chứng hoặc migration drift |
| G6 — Vercel staging | Deployment URL, env inventory đã redact, headers/deep-link smoke | HTTPS đúng SHA, Supabase runtime fail-closed và auth hoạt động | Deploy từ SHA khác, demo mode, secret public, refresh/deep link lỗi |
| G7 — Product acceptance | Fresh screenshots, axe, keyboard, mobile/desktop, flow matrix | Không có critical/serious a11y; luồng B2.1-B2.4 pass | Chỉ HTTP 200, ảnh cũ, console lỗi hoặc luồng chưa chạy thật |
| G8 — Evidence/rollback | Acceptance report và rollback rehearsal | Reviewer khác có thể tái lập, rollback web/DB tách rõ | Thiếu log/URL/SHA/backup hoặc gọi nhầm production-ready |

Quy tắc nghiệm thu: bất kỳ NO-GO nào đều dừng phase kế tiếp. Không hạ gate, không đổi failure thành warning và không dùng bằng chứng của lần chạy cũ để ký release mới.

## Điều kiện để hoàn tất trong 8 giờ

Người dùng cần hỗ trợ bốn việc trong 15 phút đầu:

1. Mở Docker Desktop sau khi cài và chấp nhận điều khoản/WSL prompt nếu Windows yêu cầu restart.
2. Đăng nhập đúng tài khoản GitHub, Vercel và Supabase trong browser khi luồng OAuth xuất hiện; không gửi token/mật khẩu qua chat.
3. Xác nhận GitHub owner và tên private repository trước lệnh tạo repo/push đầu tiên.
4. Xác nhận Supabase project cũ được phép audit. Nếu audit phát hiện dữ liệu/tích hợp không thuộc LocalLens, chấp thuận fallback sang project staging mới.

Mốc 8 giờ chỉ khả thi khi bốn điều kiện trên có sẵn và local runtime không lộ lỗi migration/RLS/concurrency lớn. Thời gian chờ Windows restart, OAuth, DNS hoặc quota bên thứ ba không được tính là thời gian sửa code.

## Lịch triển khai mục tiêu 8 giờ

| Thời gian | Công việc | Kết quả |
|---|---|---|
| 00:00-00:45 | G0, cài preflight, tạo release worktree | Source được bảo toàn, tool có thể chạy |
| 00:45-02:00 | G1-G2: pnpm/CI, return-to, price, security headers | Unit/component tests và hai build pass |
| 02:00-03:30 | G3: Docker, DB/RLS/concurrency, demo/runtime E2E | `runtime-verified-local@SHA` |
| 03:30-04:45 | G4-G5: private GitHub, audit/backup/migrate Supabase | CI xanh, staging DB có rollback point |
| 04:45-05:45 | G6: Vercel deploy đúng SHA, Auth redirect | Public HTTPS staging hoạt động |
| 05:45-07:15 | G7: external flow, EN/VI, mobile, keyboard, axe | Acceptance matrix có bằng chứng mới |
| 07:15-08:00 | G8: regression, rollback rehearsal, report | `staging-verified-limited@SHA` hoặc báo NO-GO chính xác |

## Phân công worker an toàn

- Worker 1 sở hữu `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml` và toolchain contract tests.
- Worker 2 sở hữu return-to utility, sign-in route và portal surfaces.
- Worker 3 sở hữu booking CSS, responsive/accessibility tests và browser acceptance spec.
- Worker 4 sở hữu security header helper, `next.config.ts` và header tests.
- Coordinator duy nhất sở hữu worktree/rebase-free integration, DB/runtime gates, GitHub/Supabase/Vercel remote state và acceptance report.
- Worker 2 hoàn tất trước khi Worker 3 sửa E2E flow dùng sign-in. Không có hai worker cùng sửa một file tại cùng thời điểm.
- Chỉ dùng tối đa bốn worker code song song; các bước remote G4-G8 chạy tuần tự để cùng một release SHA và tránh mutation chồng chéo.

---

### Task 0: Bảo toàn source và dựng release worktree

**Files:**
- Create: `docs/acceptance/staging-plan-a/source-baseline.txt`
- Preserve unchanged: `docs/superpowers/plans/2026-08-31-localens-green-production-aligned-demo.md`
- Preserve unchanged: `docs/superpowers/specs/2026-08-22-localens-mvp-design.md`
- Preserve unchanged: `docs/superpowers/specs/2026-08-31-localens-green-production-aligned-demo.md`
- Preserve unchanged: `docs/superpowers/plans/2026-09-01-project-path-repair.md`
- Preserve unchanged: `docs/superpowers/plans/2026-09-02-localens-plan-a-acceptance-ready-staging.md`
- Preserve unchanged: `docs/design/qa/green-home-*.png`
- Preserve unchanged: `docs/design/qa/green-home-*.jpg`
- Leave untracked: `demo-final.stderr.log`, `demo-final.stdout.log`, `dev-status.stderr.log`, `dev-status.stdout.log`

- [ ] **Step 1: Record exact baseline without changing files**

Run:

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
git worktree list --porcelain
git remote -v
```

Expected: current worktree is `codex/localens-mvp`; every dirty path is classified before staging.

- [ ] **Step 2: Create a source-preservation commit using an explicit allowlist**

First inspect each diff/image manifest, then stage only approved source assets:

```powershell
git diff -- docs/superpowers/plans/2026-08-31-localens-green-production-aligned-demo.md
git diff -- docs/superpowers/specs/2026-08-22-localens-mvp-design.md
git diff -- docs/superpowers/specs/2026-08-31-localens-green-production-aligned-demo.md
git add -- docs/superpowers/plans/2026-08-31-localens-green-production-aligned-demo.md
git add -- docs/superpowers/specs/2026-08-22-localens-mvp-design.md
git add -- docs/superpowers/specs/2026-08-31-localens-green-production-aligned-demo.md
git add -- docs/superpowers/plans/2026-09-01-project-path-repair.md
git add -- docs/superpowers/plans/2026-09-02-localens-plan-a-acceptance-ready-staging.md
git add -- docs/design/qa/green-home-desktop-comparison.png docs/design/qa/green-home-desktop-viewport.jpg docs/design/qa/green-home-mobile-viewport.jpg docs/design/qa/green-home-render-1488x1059.png docs/design/qa/green-home-tablet-viewport.jpg docs/design/qa/green-reference-1488x1059.png
git diff --cached --check
git diff --cached --stat
git commit -m "docs: preserve LocalLens planning and QA evidence"
```

Expected: four `.log` files remain untracked; commit contains no credential or generated runtime log. If review rejects any path, remove only that path from the index with `git restore --staged -- <exact-path>`; do not alter its working-tree content.

- [ ] **Step 3: Create isolated release branch/worktree**

Invoke `superpowers:using-git-worktrees`. Resolve an unused sibling path, then:

```powershell
git worktree add ..\localens-staging-plan-a -b codex/staging-plan-a
git -C ..\localens-staging-plan-a status --short
```

Expected: clean release worktree on `codex/staging-plan-a`; original worktree and four log files remain untouched.

- [ ] **Step 4: Install required local tools**

Run only after approval for system installation:

```powershell
winget install -e --id Docker.DockerDesktop
winget install -e --id GitHub.cli
corepack enable
corepack prepare pnpm@10.17.1 --activate
```

Restart Windows only if Docker/WSL requires it. Then run:

```powershell
docker version
gh --version
pnpm --version
node --version
pnpm dlx vercel@59.11.2 --version
```

Expected: Docker client and server answer; gh is callable; pnpm prints `10.17.1`; Node major is 24; Vercel CLI prints `59.11.2`. Missing Docker server is G0 NO-GO.

- [ ] **Step 5: Commit baseline evidence**

Write `docs/acceptance/staging-plan-a/source-baseline.txt` with branch, full SHA, worktree path, approved dirty-path disposition and tool versions. Do not include access tokens.

```powershell
git add -- docs/acceptance/staging-plan-a/source-baseline.txt
git diff --cached --check
git commit -m "docs: record Plan A release baseline"
```

---

### Task 1: Khóa pnpm 10 và sửa CI thành acceptance gate thật

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/ci.yml`
- Create: `tests/unit/release/toolchain-contract.test.ts`

- [ ] **Step 1: Write the failing toolchain contract test**

Test must assert:

```ts
expect(pkg.packageManager).toBe("pnpm@10.17.1");
expect(pkg.engines).toEqual({ node: ">=24 <25", pnpm: ">=10 <11" });
expect(pkg.devDependencies["@axe-core/playwright"]).toBe("4.13.0");
expect(pkg.scripts.check).toContain("--no-file-parallelism");
expect(pkg.scripts.check).toContain("--testTimeout=30000");
expect(pkg.scripts.check).toContain("db:static");
expect(workflow).not.toMatch(/run:\s+pnpm build\s*$/m);
expect(workflow).toContain("pnpm build:demo");
expect(workflow).toContain("pnpm build:supabase");
```

Run:

```powershell
pnpm test:run -- tests/unit/release/toolchain-contract.test.ts
```

Expected: FAIL because package and workflow still use pnpm 11 and plain build.

- [ ] **Step 2: Pin the selected package manager and stabilize `check`**

Update these exact keys in `package.json`; retain every other existing script and dependency:

```json
{
  "packageManager": "pnpm@10.17.1",
  "engines": {
    "node": ">=24 <25",
    "pnpm": ">=10 <11"
  },
  "scripts": {
    "check": "pnpm lint && pnpm typecheck && pnpm test:run --no-file-parallelism --testTimeout=30000 && pnpm db:static && pnpm build:demo"
  },
  "devDependencies": {
    "@axe-core/playwright": "4.13.0"
  }
}
```

Regenerate only the lockfile with pnpm 10:

```powershell
pnpm install --lockfile-only
pnpm install --frozen-lockfile
```

- [ ] **Step 3: Split CI into explicit jobs**

Replace the single `quality` job with:

- `quality-demo`: install, `pnpm check`.
- `demo-e2e`: Chromium install, `pnpm test:e2e`.
- `runtime-local`: Docker-backed `pnpm db:verify`, three runtime E2E commands, `pnpm build:supabase`.
- `staging-smoke`: runs only after the protected staging deployment environment is approved and receives `LOCALLENS_STAGING_URL`; it must never expose credentials in command output.

Every job uses Node 24 and `pnpm/action-setup@v4` with `version: 10.17.1`. Runtime job must have a timeout of at least 40 minutes and upload Playwright reports/logs only on failure, with secret redaction.

- [ ] **Step 4: Run GREEN and regression gates**

```powershell
pnpm test:run -- tests/unit/release/toolchain-contract.test.ts
pnpm check
pnpm build:supabase
git diff --check
```

Expected: all exit 0.

- [ ] **Step 5: Commit toolchain/CI task**

```powershell
git add -- package.json pnpm-lock.yaml .github/workflows/ci.yml tests/unit/release/toolchain-contract.test.ts
git diff --cached --check
git commit -m "ci: add explicit LocalLens acceptance gates"
```

---

### Task 2: Giữ booking intent an toàn sau sign-in

**Files:**
- Create: `lib/navigation/safe-return-to.ts`
- Create: `tests/unit/navigation/safe-return-to.test.ts`
- Modify: `components/customer/demo-customer-boundary.tsx`
- Modify: `components/customer/demo-booking-entry.tsx`
- Modify: `components/customer/fixed-tour-route-surface.tsx`
- Modify: `components/customer/runtime-fixed-tour-booking.tsx`
- Modify: `app/[locale]/sign-in/page.tsx`
- Modify: `components/portals/portal-surface.tsx`
- Modify: `components/portals/demo-portal-surface.tsx`
- Modify: `components/portals/supabase-portal-surface.tsx`
- Modify: `tests/components/portals/portal-surface.test.tsx`
- Modify: `tests/components/portals/supabase-portal-surface.test.tsx`
- Modify: `tests/e2e/integrated-demo-flow.spec.ts`
- Modify: `tests/e2e/runtime-fixed-tour.spec.ts`

- [ ] **Step 1: Define and test the return-to contract**

Create these pure APIs:

```ts
export function parseSafeReturnTo(locale: Locale, candidate: string | null): string | null;
export function signInPath(locale: Locale, returnTo?: string | null): string;
export function destinationAfterSignIn(input: {
  locale: Locale;
  role: PortalRole;
  returnTo?: string | null;
}): string;
```

Tests must accept only a path beginning with `/${locale}/booking/`, preserve a valid query string, cap input at 2048 characters, and reject protocol URLs, protocol-relative paths, backslashes, control characters, fragments-only values, a different locale and non-booking portal paths. `destinationAfterSignIn` uses return-to only for `customer`; `guide` and `admin` always go to their role portal.

Run:

```powershell
pnpm test:run -- tests/unit/navigation/safe-return-to.test.ts
```

Expected: FAIL before implementation, then PASS after the smallest pure implementation.

- [ ] **Step 2: Thread `returnTo` through server and client boundaries**

Update the sign-in page to read `searchParams` and pass the raw candidate to `PortalSurface`; validation happens in the pure utility before navigation. Add `returnTo?: string | null` to `PortalSurfaceProps`, `DemoPortalSurfaceProps` and `SupabasePortalSurfaceProps` and forward it without reading `window` inside server components.

When an unauthenticated customer opens booking, generate:

```text
/{locale}/sign-in/?returnTo=%2F{locale}%2Fbooking%2F%3Fdeparture%3D...%26partySize%3D...
```

After successful demo identity selection or Supabase password sign-in, call `destinationAfterSignIn`; never concatenate untrusted input into an absolute URL.

- [ ] **Step 3: Add component tests for role and malformed-input cases**

Required assertions:

- customer + valid booking return-to navigates back to the exact relative booking URL;
- customer + invalid/oversized return-to navigates to customer portal;
- guide/admin ignore booking return-to;
- demo and Supabase surfaces have identical destination rules;
- runtime auth error clears password and does not navigate.

Run:

```powershell
pnpm test:run -- tests/components/portals/portal-surface.test.tsx tests/components/portals/supabase-portal-surface.test.tsx
```

- [ ] **Step 4: Add browser regression for the original defect**

Demo E2E must start unauthenticated at a fixed-tour URL, enter booking, choose Customer at sign-in and assert the same `departure` + `partySize` are restored. Runtime E2E must perform the same flow with the seeded customer. Add one malicious `returnTo=https://example.com` case and assert LocalLens stays same-origin.

```powershell
pnpm test:e2e
pnpm test:e2e:runtime-fixed-tour
```

Expected: both pass on clean servers; no pre-existing dev server may be reused.

- [ ] **Step 5: Commit return-to task**

```powershell
git add -- lib/navigation/safe-return-to.ts tests/unit/navigation/safe-return-to.test.ts components/customer/demo-customer-boundary.tsx components/customer/demo-booking-entry.tsx components/customer/fixed-tour-route-surface.tsx components/customer/runtime-fixed-tour-booking.tsx 'app/[locale]/sign-in/page.tsx' components/portals/portal-surface.tsx components/portals/demo-portal-surface.tsx components/portals/supabase-portal-surface.tsx tests/components/portals/portal-surface.test.tsx tests/components/portals/supabase-portal-surface.test.tsx tests/e2e/integrated-demo-flow.spec.ts tests/e2e/runtime-fixed-tour.spec.ts
git diff --cached --check
git commit -m "fix: preserve safe booking return after sign-in"
```

---

### Task 3: Chặn vỡ giá, overflow và hoàn thiện responsive acceptance

**Files:**
- Modify: `app/styles/editorial-booking.css`
- Modify: `tests/components/customer/booking-flow.test.tsx`
- Modify: `tests/e2e/customer-visual.spec.ts`

- [ ] **Step 1: Add a failing visual/layout assertion**

At desktop and 320 CSS px viewport, locate the total price and assert:

```ts
await expect(totalPrice).toHaveText(/VND\s480,000/);
const metrics = await totalPrice.evaluate((element) => ({
  scrollWidth: element.scrollWidth,
  clientWidth: element.clientWidth,
  whiteSpace: getComputedStyle(element).whiteSpace,
  overflowWrap: getComputedStyle(element).overflowWrap,
}));
expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
expect(metrics.whiteSpace).toBe("nowrap");
expect(metrics.overflowWrap).toBe("normal");
```

Run the focused spec and capture the RED screenshot showing the current split digits.

- [ ] **Step 2: Apply scoped CSS fix**

The price summary uses:

```css
grid-template-columns: minmax(0, 1fr) auto;
```

The amount element uses:

```css
white-space: nowrap;
overflow-wrap: normal;
font-variant-numeric: tabular-nums;
```

At the existing narrow breakpoint, stack label/value before horizontal overflow occurs. Do not globally remove wrapping from other descriptions or error messages.

- [ ] **Step 3: Verify responsive and localized states**

Run EN and VI screenshots at 1440x900, 768x1024, 390x844 and 320x568. Assert no horizontal page overflow, no clipped focus ring and no split currency amount.

```powershell
pnpm test:run -- tests/components/customer/booking-flow.test.tsx
pnpm exec playwright test tests/e2e/customer-visual.spec.ts --project=chromium
```

- [ ] **Step 4: Commit responsive fix**

```powershell
git add -- app/styles/editorial-booking.css tests/components/customer/booking-flow.test.tsx tests/e2e/customer-visual.spec.ts
git diff --cached --check
git commit -m "fix: keep booking totals readable on narrow screens"
```

---

### Task 4: Thêm security headers theo runtime, không làm hỏng Supabase

**Files:**
- Create: `lib/security/headers.ts`
- Create: `tests/unit/security/headers.test.ts`
- Modify: `next.config.ts`

- [ ] **Step 1: Write failing header tests**

Define:

```ts
export interface SecurityHeaderInput {
  runtime: "demo" | "supabase";
  supabaseUrl?: string;
  vercelEnvironment?: "development" | "preview" | "production";
}

export function buildSecurityHeaders(input: SecurityHeaderInput): ReadonlyArray<{
  key: string;
  value: string;
}>;
```

Tests require `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and frame denial through CSP `frame-ancestors 'none'`. Supabase mode must derive the exact HTTPS origin for `connect-src`; reject non-HTTPS public origins. `Strict-Transport-Security` appears only for Vercel production, never local development/preview.

```powershell
pnpm test:run -- tests/unit/security/headers.test.ts
```

Expected: FAIL before helper/config wiring.

- [ ] **Step 2: Wire headers in Next config**

Add `headers()` for `source: "/(.*)"` only when `mode === "supabase"`; omit the `headers` config key in demo static-export mode. Do not introduce a server-only dependency into browser bundles. CSP must include only directives required by current Next/Supabase behavior and must not contain `*` for `default-src`, `script-src` or `connect-src`.

- [ ] **Step 3: Verify both runtime builds and live headers**

```powershell
pnpm test:run -- tests/unit/security/headers.test.ts
pnpm build:demo
pnpm build:supabase
```

After starting Supabase mode, use `curl.exe -I http://127.0.0.1:3100/vi/` and confirm the expected non-HSTS headers. After Vercel deployment, repeat against HTTPS and require HSTS on production deployment only.

- [ ] **Step 4: Commit header task**

```powershell
git add -- lib/security/headers.ts tests/unit/security/headers.test.ts next.config.ts
git diff --cached --check
git commit -m "security: add runtime-aware response headers"
```

---

### Task 5: Chạy fresh local acceptance đầy đủ

**Files:**
- Create: `docs/acceptance/staging-plan-a/local-runtime-gate.md`

- [ ] **Step 1: Confirm clean release worktree and Docker**

```powershell
git status --short
docker version
pnpm install --frozen-lockfile
```

Expected: clean worktree, Docker server reachable, install exit 0.

- [ ] **Step 2: Run gates in this exact order**

```powershell
pnpm check
pnpm test:e2e
pnpm db:verify
pnpm test:e2e:runtime-auth
pnpm test:e2e:runtime-fixed-tour
pnpm test:e2e:runtime-guide-assignment
pnpm build:supabase
git diff --check
```

`db:verify` must execute start, reset, lint, pgTAP, concurrency, generated-type check and stop/cleanup. Telemetry warnings do not replace SQL evidence. Any nonzero exit is G3 NO-GO.

- [ ] **Step 3: Record evidence**

Write command, start/end timestamp, exit code, test counts, runtime versions and full release SHA to `docs/acceptance/staging-plan-a/local-runtime-gate.md`. Redact environment values. Label the SHA `runtime-verified-local@SHA` only after every command passes.

- [ ] **Step 4: Commit local gate evidence**

```powershell
git add -- docs/acceptance/staging-plan-a/local-runtime-gate.md
git diff --cached --check
git commit -m "docs: record LocalLens local runtime acceptance"
```

---

### Task 6: Tạo private GitHub repo và bắt CI xanh

**Files:**
- Remote state: private GitHub repository
- Evidence: `docs/acceptance/staging-plan-a/github-ci.md`

- [ ] **Step 1: Authenticate without storing credentials**

```powershell
gh auth login --web --git-protocol https
gh auth status
```

User completes browser OAuth. Stop if the authenticated account is not the approved owner.

- [ ] **Step 2: Create the approved private repository**

```powershell
$GitHubOwner = Read-Host 'Approved GitHub owner'
$GitHubRepository = Read-Host 'Private repository name'
gh repo create "$GitHubOwner/$GitHubRepository" --private --source . --remote origin
git remote -v
gh repo view "$GitHubOwner/$GitHubRepository" --json nameWithOwner,visibility,url
```

Expected: `visibility` is `PRIVATE`; origin points to the approved repository. If `origin` already exists, inspect it and stop instead of replacing it.

- [ ] **Step 3: Push release branch and wait for CI**

```powershell
$ReleaseSha = git rev-parse HEAD
git push -u origin codex/staging-plan-a
$RunId = gh run list --commit $ReleaseSha --limit 1 --json databaseId --jq '.[0].databaseId'
gh run view $RunId
gh run watch $RunId --exit-status
```

Expected: quality-demo, demo-e2e and runtime-local are green for `$ReleaseSha`. A skipped required job is failure.

- [ ] **Step 4: Protect the release path**

Use GitHub repository settings to require pull-request review and the three checks before merge to the chosen default branch. Do not merge during this task unless the user separately approves integration.

- [ ] **Step 5: Record and commit evidence**

Write private repo URL, CI run URL, job results and SHA to `docs/acceptance/staging-plan-a/github-ci.md`; omit credentials.

```powershell
git add -- docs/acceptance/staging-plan-a/github-ci.md
git commit -m "docs: record private GitHub CI acceptance"
git push
```

---

### Task 7: Audit Supabase cũ, backup và migrate không phá dữ liệu

**Files:**
- Create: `scripts/provision-staging-fixtures.mjs`
- Create: `tests/unit/scripts/provision-staging-fixtures.test.ts`
- Create: `docs/acceptance/staging-plan-a/supabase-audit.md`
- Create: `docs/runbooks/staging-supabase.md`
- Remote state: approved Supabase staging project

- [ ] **Step 1: Implement a fail-closed staging fixture provisioner**

CLI contract:

```text
node scripts/provision-staging-fixtures.mjs --project-ref-env LOCALLENS_STAGING_PROJECT_REF --confirm-env LOCALLENS_STAGING_CONFIRMATION --release-sha-env LOCALLENS_RELEASE_SHA
```

The script must:

- read values only from named environment variables;
- require confirmation equal to `LOCALLENS-STAGING-B2-1-TO-B2-4`;
- reject localhost and any project ref not equal to the explicitly supplied staging ref;
- require a clean 40-character Git SHA;
- create only synthetic `@example.invalid` identities and release-owned fixtures;
- be idempotent and mark every inserted row with a stable staging ownership marker available in existing schema metadata;
- never print password, service-role key, access token or database URL;
- fail before mutation when required variables are absent.

Tests use injected adapters only; they must cover missing confirmation, wrong project ref, non-synthetic email, idempotent rerun, partial failure and redacted logs.

```powershell
pnpm test:run -- tests/unit/scripts/provision-staging-fixtures.test.ts
```

- [ ] **Step 2: Authenticate and inventory the old project read-only**

```powershell
pnpm dlx supabase@2.115.0 login
$StagingProjectRef = Read-Host 'Approved Supabase project ref'
pnpm dlx supabase@2.115.0 projects list
pnpm dlx supabase@2.115.0 link --project-ref $StagingProjectRef
pnpm dlx supabase@2.115.0 migration list --linked
pnpm dlx supabase@2.115.0 functions list --project-ref $StagingProjectRef
```

In the dashboard, inspect Auth users, Storage buckets, Edge Functions, Database extensions, cron/jobs, webhooks, integrations and API logs. Record counts/names only; do not copy PII. G5 NO-GO if any real user, unknown owner, production integration or unrelated asset exists.

- [ ] **Step 3: Create and verify a logical backup**

```powershell
$ReleaseSha = git rev-parse HEAD
$BackupDirectory = Join-Path (Get-Location) "artifacts\staging-backup\$ReleaseSha"
New-Item -ItemType Directory -Force -Path $BackupDirectory
pnpm dlx supabase@2.115.0 db dump --linked --file (Join-Path $BackupDirectory 'schema.sql')
pnpm dlx supabase@2.115.0 db dump --linked --data-only --use-copy --file (Join-Path $BackupDirectory 'data.sql')
Get-FileHash -Algorithm SHA256 (Join-Path $BackupDirectory 'schema.sql')
Get-FileHash -Algorithm SHA256 (Join-Path $BackupDirectory 'data.sql')
```

Restore both dumps into a disposable local PostgreSQL/Supabase instance and run `pnpm db:test` before migration. Backup artifacts remain outside Git and access-restricted.

- [ ] **Step 4: Dry-run and apply migrations**

```powershell
pnpm dlx supabase@2.115.0 db push --linked --dry-run
pnpm dlx supabase@2.115.0 db push --linked
pnpm dlx supabase@2.115.0 migration list --linked
```

The dry-run list must exactly match reviewed files under `supabase/migrations`. Never run linked reset. After apply, run read/write/RLS smoke using customer, guide and admin identities; service-role is allowed only in the local provisioning process.

- [ ] **Step 5: Provision release-owned synthetic fixtures**

Set the three non-secret selectors plus secrets in the protected shell, then run the provisioner. The report records fixture IDs/roles and release SHA, not passwords.

- [ ] **Step 6: Record audit and rollback runbook**

`supabase-audit.md` must contain owner confirmation, project ref partially redacted, pre/post migration versions, object counts, backup checksums, restore rehearsal, RLS smoke and fallback decision. `staging-supabase.md` must state forward-fix and logical-restore procedures separately.

- [ ] **Step 7: Commit code/docs, never backup or secrets**

```powershell
git add -- scripts/provision-staging-fixtures.mjs tests/unit/scripts/provision-staging-fixtures.test.ts docs/acceptance/staging-plan-a/supabase-audit.md docs/runbooks/staging-supabase.md
git diff --cached --check
git commit -m "ops: add safe Supabase staging provisioning"
git push
```

---

### Task 8: Deploy candidate SHA lên Vercel

**Files:**
- Create: `docs/runbooks/staging-deploy.md`
- Create: `docs/acceptance/staging-plan-a/vercel-deploy.md`
- Remote state: Vercel project and protected environment variables

- [ ] **Step 1: Capture candidate SHA after CI**

```powershell
$ReleaseSha = git rev-parse HEAD
git status --short
gh run list --commit $ReleaseSha --limit 10
```

Expected: clean worktree and required CI green for exactly `$ReleaseSha`. This is the candidate SHA used to author the external acceptance suite; Task 10 freezes the final release SHA. Do not deploy a dirty tree.

- [ ] **Step 2: Configure runtime environment**

In Vercel project settings, set:

```text
NEXT_PUBLIC_LOCALLENS_RUNTIME=supabase
NEXT_PUBLIC_SUPABASE_URL=<protected project URL selected in Task 7>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable/anon key for Task 7 project>
NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES=0
```

The angle-bracket descriptions above are environment-value instructions, not literal values. Do not create `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. Set service-role only in protected GitHub/Supabase provisioning context when required.

- [ ] **Step 3: Link and deploy through Vercel CLI 59.11.2**

```powershell
pnpm dlx vercel@59.11.2 login
pnpm dlx vercel@59.11.2 link
pnpm dlx vercel@59.11.2 pull --yes --environment=production
pnpm build:supabase
pnpm dlx vercel@59.11.2 deploy --prod
```

Capture the deployment URL and inspect deployment metadata to prove its source commit equals `$ReleaseSha`. If Vercel cannot attach commit metadata from a dirty/manual deploy, reconnect the private GitHub repository and redeploy the exact SHA.

- [ ] **Step 4: Configure Supabase Auth URL allowlist**

Set Site URL to the chosen canonical staging HTTPS origin and add exact EN/VI callback/deep-link origins required by the app. Do not use wildcard domains. Test password sign-in, sign-out and hard refresh in a fresh browser context.

- [ ] **Step 5: Verify public deployment basics**

Check `/vi/`, `/en/`, sign-in, booking deep link, role portals, `robots.txt`, `sitemap.xml`, canonical/hreflang, 404 and hard refresh. Verify security headers with `curl.exe -I` and inspect browser network/console for failed requests or secret-bearing responses.

- [ ] **Step 6: Record deployment evidence**

`vercel-deploy.md` contains deployment URL, release SHA, timestamp, Vercel project/environment, redacted env-name inventory, Auth redirect inventory and header/deep-link results.

```powershell
git add -- docs/runbooks/staging-deploy.md docs/acceptance/staging-plan-a/vercel-deploy.md
git commit -m "docs: record Vercel staging deployment"
git push
```

---

### Task 9: Nghiệm thu external product flow, accessibility và Product Design

**Files:**
- Create: `tests/e2e/staging-acceptance.spec.ts`
- Create: `playwright.staging.config.ts`
- Create: `docs/acceptance/staging-plan-a/product-acceptance.md`
- Create: `docs/acceptance/staging-plan-a/screenshots/*.png`

- [ ] **Step 1: Add a staging-only Playwright config**

Require `LOCALLENS_STAGING_URL` to be HTTPS and refuse localhost. Do not start a local webServer. Read customer/admin/guide credentials only from protected environment variables and redact them from reporter output/traces.

- [ ] **Step 2: Encode the minimum acceptance journeys**

Run each in a fresh browser context where indicated:

1. EN and VI public home/navigation/deep link.
2. Unauthenticated tour -> booking -> sign-in -> customer -> exact booking return with `departure` and `partySize` preserved.
3. Customer creates hold, performs simulated payment, reloads/new context and sees persisted state.
4. Customer requests cancellation; admin approves/rejects as specified; customer sees persisted outcome.
5. Admin assigns a guide; guide sees assignment after reload; wrong guide/role receives denial.
6. Malicious external `returnTo` is rejected and remains same-origin.
7. No real-card field, gateway call or payment-success wording beyond simulated scope.

For every mutation, verify both UI outcome and a subsequent read from a fresh session. HTTP 200 alone is not acceptance.

- [ ] **Step 3: Run accessibility and responsive acceptance**

For EN and VI at 1440x900, 768x1024, 390x844 and 320x568:

- keyboard-only traversal reaches skip link, primary navigation, forms and modal/action controls in logical order;
- every interactive element has visible focus;
- labels, descriptions, errors, `role=alert`/status announcements and heading order are valid;
- 200% zoom/reflow produces no horizontal document overflow or clipped action;
- axe reports zero critical and zero serious violations;
- price/currency stays unbroken;
- console has zero errors and network has no unexpected 4xx/5xx.

Use `AxeBuilder` from the pinned `@axe-core/playwright@4.13.0` dependency and fail on `critical` or `serious` results. Capture fresh viewport screenshots after each key state. Do not reuse the earlier local screenshots as staging evidence.

- [ ] **Step 4: Run the external suite**

```powershell
$env:LOCALLENS_STAGING_URL = Read-Host 'Approved HTTPS staging URL'
pnpm exec playwright test --config=playwright.staging.config.ts
```

Expected: all journeys pass against the deployed URL. Save HTML report and screenshots under `docs/acceptance/staging-plan-a/`; traces remain access-restricted if they could contain session material.

- [ ] **Step 5: Perform screenshot-first Product Design review**

Invoke `product-design:audit` against the deployed experience. Report only findings supported by current staging screenshots. Fix all P0/P1 and acceptance-blocking P2 issues through new TDD commits, redeploy the new SHA, then rerun G1-G8; do not keep the old SHA label after any fix.

- [ ] **Step 6: Commit test and acceptance evidence**

```powershell
git add -- tests/e2e/staging-acceptance.spec.ts playwright.staging.config.ts docs/acceptance/staging-plan-a/product-acceptance.md docs/acceptance/staging-plan-a/screenshots
git diff --cached --check
git commit -m "test: add external staging product acceptance"
git push
```

---

### Task 10: Chốt release report và diễn tập rollback

**Files:**
- Create: `docs/acceptance/staging-plan-a/final-report.md`
- Modify: `README.md`
- Modify: `docs/runbooks/staging-deploy.md`
- Modify: `docs/runbooks/staging-supabase.md`

- [ ] **Step 1: Rerun final immutable-SHA regression**

After the Task 9 test/evidence-code commit and all Product Design fixes, capture one immutable product SHA as `$ReleaseSha`. This SHA contains all application code, migrations, CI, provisioning code and acceptance test code, but not the final evidence-only report commit.

```powershell
pnpm check
pnpm test:e2e
pnpm db:verify
pnpm test:e2e:runtime-auth
pnpm test:e2e:runtime-fixed-tour
pnpm test:e2e:runtime-guide-assignment
pnpm build:supabase
git diff --check
```

Push `$ReleaseSha`, resolve `$RunId` with `gh run list --commit $ReleaseSha --limit 1 --json databaseId --jq '.[0].databaseId'`, wait with `gh run watch $RunId --exit-status`, deploy that exact commit to Vercel, then rerun `playwright.staging.config.ts`. CI, Supabase migration state, Vercel metadata and external acceptance must all point to `$ReleaseSha`.

- [ ] **Step 2: Rehearse web rollback without changing DB**

Use Vercel deployment history to promote the immediately previous known-good deployment, run public smoke, then promote the release candidate again and rerun smoke. Record both deployment IDs/timestamps. Do not claim this rolls back database migrations.

- [ ] **Step 3: Rehearse database recovery on disposable local environment**

Restore the Task 7 logical backup into a disposable local instance, run schema/RLS/pgTAP checks, then destroy only that known disposable instance through existing local cleanup scripts. Remote rollback remains forward-fix or approved restore; never reset linked Supabase.

- [ ] **Step 4: Write the final acceptance report**

`final-report.md` must include `$ReleaseSha` as the product release identifier. The later documentation commit is recorded separately as `$EvidenceSha` and is not redeployed. The report must include:

- exact SHA, branch, private GitHub repo, CI run and Vercel HTTPS URL;
- separate status for demo, local runtime, limited staging and production;
- command table with timestamps, exit codes and test counts;
- migration list, backup checksums and rollback rehearsal;
- EN/VI desktop/mobile screenshot index;
- account roles and synthetic fixture IDs without passwords;
- security header, Auth redirect, keyboard, axe, overflow, console and network results;
- known limitations: simulated payment, `research_only` catalog, no deployable Edge Function entrypoint;
- final label `staging-verified-limited@SHA (B2.1-B2.4)` only if G0-G8 all pass.

Update README with the staging URL, exact scope/limitations and links to the runbooks/report. Do not add a production-ready badge.

- [ ] **Step 5: Run final review before commit**

Invoke `superpowers:requesting-code-review`, then `superpowers:verification-before-completion`. Resolve every acceptance-blocking finding and rerun affected gates.

```powershell
rg -n "TODO|TBD|example\.com|SUPABASE_SERVICE_ROLE|password|token" docs/acceptance/staging-plan-a docs/runbooks README.md
git diff --check
git status --short
```

Any test credential/token hit is NO-GO. `example.com` is allowed only in the documented malicious return-to test, never as a claimed staging URL.

- [ ] **Step 6: Commit and publish the final evidence SHA**

```powershell
git add -- docs/acceptance/staging-plan-a/final-report.md README.md docs/runbooks/staging-deploy.md docs/runbooks/staging-supabase.md
git diff --cached --check
git commit -m "docs: publish LocalLens Plan A acceptance report"
git push
```

Run `$EvidenceSha = git rev-parse HEAD` after push and record it in the handoff message. Do not redeploy this evidence-only commit. The release is accepted only when CI, Supabase, Vercel metadata and `final-report.md` all reference the same `$ReleaseSha`; the handoff separately records `$EvidenceSha` so reviewers can locate the immutable evidence snapshot without creating an impossible self-referencing commit.

## Mentor decision

Plan A should optimize for a defensible thesis staging release, not broad production scope. The correct finish line for this 8-hour window is `staging-verified-limited@SHA (B2.1-B2.4)`. Edge Functions, real payment, production observability/operations, domain launch and real-user data are separate post-acceptance workstreams; pulling them into this release would increase risk and make the evidence less credible.

## Execution handoff

1. **Subagent-Driven (recommended):** execute Tasks 0-10 in this session with four isolated code owners and a coordinator; stop at every GO/NO-GO and present evidence before remote mutation.
2. **Inline Execution:** execute Tasks 0-10 sequentially in one worker; slower but simplest when only one machine/browser session can authorize Docker, GitHub, Supabase and Vercel.
