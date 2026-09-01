# LocalLens A Eight-Hour Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện và nghiệm thu bản LocalLens demo luận văn chạy local trong một cửa sổ tối đa 8 giờ, với fixture giả lập nhất quán, năm payment outcome, đúng quyền actor và toàn bộ cổng test xanh.

**Architecture:** Giữ nguyên Next.js và các boundary hiện có. Sửa theo vertical slice: khóa contract demo trước, khắc phục ba blocker E2E đã biết, mở rộng payment-attempt ở lớp demo mà không đổi production enums, nối state xuyên customer/admin/portal, rồi chạy acceptance gate. Công việc triển khai trong một worktree cô lập từ commit chứa kế hoạch này, với commit spec `15a0674` là ancestor; không reset/stash/discard thay đổi hiện hữu trong `localens-mvp`.

**Tech Stack:** Next.js 16.3.2, React 19.2.8, TypeScript 6, Zod 4.4.3, Vitest, Testing Library, Playwright 1.62.1, pnpm 11.19.0.

**Spec:** `docs/superpowers/specs/2026-09-01-localens-a-demo-acceptance-design.md`

## Global Constraints

- A là demo luận văn chạy local, không phải production deployment.
- Fixture phải có nhãn Demo; `research_only` không được trở thành sellable/bookable/payable inventory.
- AI chỉ xếp hạng/lập lịch từ fixture do LocalLens quản lý; không tự tạo business facts.
- Giữ nhãn Use Case `Thanh toán`; UI và test nói rõ thanh toán được mô phỏng.
- Không thay production `BookingStatus` hoặc `PaymentStatus` để biểu diễn lỗi của simulator; dùng demo payment-attempt outcome riêng.
- Customer tự xác nhận revision trước submission, tự chấp nhận quote và tự thanh toán; admin/guide không được thực hiện thay.
- Production composition fail closed và không fallback sang demo.
- Không merge, push, publish, reset, stash, xóa worktree hoặc discard file của người dùng.
- Mọi behavior change theo TDD; mỗi task chỉ stage file được liệt kê.
- Đọc `AGENTS.md` và Next.js guide liên quan trước khi sửa component/App Router code.

## Eight-Hour Control Table

| Elapsed | Gate | Required outcome |
| --- | --- | --- |
| 00:00–00:20 | Preflight | Isolated worktree, dependencies, RED evidence and progress ledger |
| 00:20–01:20 | Known blockers | Contrast, food handoff and identity locator focused cases green |
| 01:20–03:20 | Payment slice | Five outcomes, idempotent replay and booking/portal consistency green |
| 03:20–04:30 | Personalized slice | Confirmed revision → request → admin decision → quote → checkout green |
| 04:30–05:30 | Authority/reset | Customer/guide/admin negatives, reset and recovery green |
| 05:30–06:30 | Integrated E2E | All current and new Playwright cases green in focused groups |
| 06:30–07:30 | Full gate | lint, typecheck, Vitest, build, db:static and full Playwright pass |
| 07:30–08:00 | Buffer/handoff | Fix only gate blockers; write runbook/evidence and start verified demo |

**Hour-6 scope rule:** after 06:00 elapsed, do not add routes, redesign UI, refactor unrelated modules or begin B. Cut optional screenshots and copy polish first; never cut state correctness, actor authority, EN/VI, accessibility blockers or truthful demo labels.

## File Responsibility Map

- `lib/application/booking/mock-booking.ts`: authoritative demo booking, hold and payment-attempt state machine.
- `components/customer/booking-flow.tsx`: payment simulator UI and portal synchronization; no authoritative price/state calculation.
- `messages/en.json`, `messages/vi.json`: exact bilingual payment and recovery copy.
- `lib/application/planner/custom-request-demo.ts`: immutable planner-to-request snapshot and storage validation.
- `components/customer/planner-flow.tsx`: confirms and persists the exact current revision before navigation.
- `components/customer/custom-request-flow.tsx`: request/admin/quote/payment presentation over the persisted revision.
- `lib/infrastructure/demo/portal-repository.ts`: fixture authority, actor capabilities and cross-entity invariants.
- `lib/application/portal/composition.ts`: exposes demo reset only on `DemoPortalComposition`.
- `lib/application/demo/reset-demo.ts`: removes only LocalLens-owned browser keys and coordinates repository reset.
- `components/portals/portal-surface.tsx`: semantically unique demo identities and explicit reset control.
- `tests/unit/**`, `tests/components/**`, `tests/e2e/**`: contract, component and acceptance evidence.
- `.superpowers/sdd/2026-09-01-localens-a-demo-acceptance/progress.md`: elapsed-time ledger, test evidence, commit/review status and blockers.
- `README.md`, `design-qa.md`: exact run/acceptance handoff; no production claims.

---

### Task 0: Isolated preflight and RED ledger

**Time box:** 20 minutes

**Files:**
- Create: `.superpowers/sdd/2026-09-01-localens-a-demo-acceptance/progress.md`
- Read: `AGENTS.md`
- Read: `docs/superpowers/specs/2026-09-01-localens-a-demo-acceptance-design.md`
- Read: `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`

**Interfaces:**
- Consumes: Git commit `15a0674`, Node `>=24 <25`, pnpm `>=11 <12`.
- Produces: isolated branch `codex/localens-a-acceptance`, clean baseline, exact failing-test inventory.

- [ ] **Step 1: Create an isolated worktree through Superpowers**

Use `superpowers:using-git-worktrees`. Start from the commit containing this plan and verify `15a0674` is its ancestor; do not include the dirty working-copy files from `localens-mvp`.

Expected checkout checks:

```powershell
git rev-parse --show-toplevel
git branch --show-current
git status --short
git merge-base --is-ancestor 15a0674 HEAD
```

Expected: Project path, branch `codex/localens-a-acceptance`, empty status.

- [ ] **Step 2: Install from the locked dependency graph**

Run:

```powershell
pnpm install --offline --frozen-lockfile
```

Expected: exit 0 and `.modules.yaml` paths under `C:\Users\Admin\Documents\Project`.

- [ ] **Step 3: Record the three existing RED groups**

Run each group separately:

```powershell
pnpm test:e2e tests/e2e/customer-visual.spec.ts
pnpm test:e2e tests/e2e/food-itinerary.spec.ts
pnpm test:e2e tests/e2e/integrated-demo-flow.spec.ts tests/e2e/portal-demo-flow.spec.ts
```

Expected RED evidence: separator contrast, food snapshot handoff and ambiguous customer link. If a group unexpectedly passes, record the output and do not invent a fix for it.

- [ ] **Step 4: Write the execution ledger**

Create the progress file with this exact structure:

```markdown
# LocalLens A acceptance ledger

- Spec commit: `15a0674`
- Execution branch: `codex/localens-a-acceptance`
- Time budget: 8 hours measured from the first command in Task 0.

| Task | RED | GREEN | Review | Commit | Status |
| --- | --- | --- | --- | --- | --- |
| 1 contrast semantics | pending | pending | pending | pending | pending |
| 2 identity locators | pending | pending | pending | pending | pending |
| 3 food handoff | pending | pending | pending | pending | pending |
| 4 payment outcomes | pending | pending | pending | pending | pending |
| 5 authority/reset | pending | pending | pending | pending | pending |
| 6 acceptance/handoff | pending | pending | pending | pending | pending |
```

- [ ] **Step 5: Commit only the ledger**

```powershell
git add -- .superpowers/sdd/2026-09-01-localens-a-demo-acceptance/progress.md
git commit -m "docs: start LocalLens A acceptance ledger"
```

---

### Task 1: Correct decorative contrast semantics

**Time box:** 20 minutes

**Files:**
- Modify: `tests/e2e/customer-visual.spec.ts`
- Verify: `components/i18n/locale-switcher.tsx`
- Verify: `app/styles/editorial-shell.css`

**Interfaces:**
- Consumes: separator nodes already carry `aria-hidden="true"`.
- Produces: visual diagnostic ignores hidden decoration but continues checking user-visible text.

- [ ] **Step 1: Preserve the existing failing visual test as RED**

Run:

```powershell
pnpm test:e2e tests/e2e/customer-visual.spec.ts --grep "captures the desktop home viewport"
```

Expected: FAIL containing `span: / (1.29 < 4.5)`.

- [ ] **Step 2: Add a regression assertion for hidden versus visible text**

In the in-page contrast collector, insert fixtures/assertions proving hidden decoration is excluded and visible low-contrast text is still returned. The filter must follow this contract:

```ts
function isUserVisibleText(element: HTMLElement): boolean {
  return element.closest('[aria-hidden="true"]') === null;
}
```

Do not broadly disable contrast checks or add `/` as a string exception.

- [ ] **Step 3: Apply the minimal collector fix**

Before computing text contrast, skip nodes for which `isUserVisibleText(element)` is false. Leave `locale-switcher__separator` as `aria-hidden="true"`; do not raise its color solely to satisfy a test that should not inspect hidden decoration.

- [ ] **Step 4: Run the customer visual group**

```powershell
pnpm test:e2e tests/e2e/customer-visual.spec.ts
```

Expected: all desktop/tablet/mobile customer visual cases pass; visible text contrast checks remain active.

- [ ] **Step 5: Commit**

```powershell
git add -- tests/e2e/customer-visual.spec.ts
git commit -m "test: ignore hidden decoration in contrast smoke"
```

---

### Task 2: Make demo identity selection semantically unique

**Time box:** 20 minutes

**Files:**
- Modify: `tests/e2e/integrated-demo-flow.spec.ts`
- Modify: `tests/e2e/portal-demo-flow.spec.ts`
- Test: `tests/components/portals/portal-surface.test.tsx`
- Verify: `components/portals/portal-surface.tsx`

**Interfaces:**
- Consumes: each identity is an `<article>` with a unique heading/email; two customer identities intentionally share the same action label.
- Produces: `selectDemoIdentity(page, displayName, actionLabel)` scopes a link to one identity card.

- [ ] **Step 1: Add the ambiguous-identity RED assertion**

In the portal component test, assert there are two customer action links and that each belongs to a card with a distinct heading:

```ts
expect(screen.getAllByRole("link", { name: "Continue as Customer" })).toHaveLength(2);
expect(screen.getByRole("heading", { name: "Demo Traveler" })).toBeInTheDocument();
expect(screen.getByRole("heading", { name: "Second Demo Traveler" })).toBeInTheDocument();
```

Run:

```powershell
pnpm test:run tests/components/portals/portal-surface.test.tsx
```

- [ ] **Step 2: Introduce the E2E scoping helper**

Use the same exact helper in both E2E files:

```ts
function identityCard(page: Page, displayName: string) {
  return page.getByRole("article").filter({
    has: page.getByRole("heading", { name: displayName, exact: true }),
  });
}

async function selectDemoIdentity(
  page: Page,
  displayName: string,
  actionLabel: string,
): Promise<void> {
  const card = identityCard(page, displayName);
  await expect(card).toHaveCount(1);
  await card.getByRole("link", { name: actionLabel, exact: true }).click();
}
```

Never use `.first()` to resolve identity ambiguity.

- [ ] **Step 3: Replace all unscoped identity clicks**

Map customer to `Demo Traveler`, guide to `Demo Guide`, admin to `Demo Administrator`; use `Second Demo Traveler` only in cross-owner tests.

- [ ] **Step 4: Run portal groups**

```powershell
pnpm test:e2e tests/e2e/integrated-demo-flow.spec.ts tests/e2e/portal-demo-flow.spec.ts
```

Expected: no strict-locator ambiguity; role isolation assertions still pass.

- [ ] **Step 5: Commit**

```powershell
git add -- tests/components/portals/portal-surface.test.tsx tests/e2e/integrated-demo-flow.spec.ts tests/e2e/portal-demo-flow.spec.ts
git commit -m "test: scope demo identities by accessible card"
```

---

### Task 3: Preserve the exact planner revision through food handoff

**Time box:** 40 minutes

**Files:**
- Modify: `lib/application/planner/custom-request-demo.ts`
- Modify: `components/customer/planner-flow.tsx`
- Test: `tests/unit/planner/custom-request-demo.test.ts`
- Test: `tests/components/customer/planner-flow.test.tsx`
- Test: `tests/e2e/food-itinerary.spec.ts`

**Interfaces:**
- Consumes: `DemoPlannerState`, `CustomRequestDraftInput`, `saveCustomRequestDraft()`.
- Produces: `customRequestDraftFromPlanner(state: DemoPlannerState): CustomRequestDraftInput`.

- [ ] **Step 1: Write a failing round-trip test with food facts**

Add a planner state whose selected item contains the exact synthetic food selection and assert save/read preserves it:

```ts
const draft = customRequestDraftFromPlanner(foodPlannerState);
expect(draft.revisionSnapshot.items[0]?.foodSelection).toMatchObject({
  vendorTitle: "Aunt Ba's Banh Mi Stall",
  menuTitle: "Grilled pork banh mi",
  quantity: 3,
  priceVndMin: 45_000,
  priceVndMax: 60_000,
  paymentMode: "pay_at_vendor",
});
expect(saveCustomRequestDraft(draft)).toBe(true);
expect(readCustomRequestDraftState()).toMatchObject({
  status: "ok",
  draft: { revisionSnapshot: draft.revisionSnapshot },
});
```

Run:

```powershell
pnpm test:run tests/unit/planner/custom-request-demo.test.ts
```

Expected: FAIL because the mapper is not defined.

- [ ] **Step 2: Implement one exact mapper**

In `custom-request-demo.ts` add:

```ts
export function customRequestDraftFromPlanner(
  state: DemoPlannerState,
): CustomRequestDraftInput {
  if (state.preferences === null || state.current.items.length === 0) {
    throw new Error("A confirmed planner revision is required");
  }
  return {
    planId: state.planId,
    revision: state.current.revision,
    preferences: state.preferences,
    revisionSnapshot: state.current,
  };
}
```

Import `DemoPlannerState` as a type. Do not recalculate totals or strip `foodSelection`.

- [ ] **Step 3: Make PlannerFlow use the mapper**

Replace the inline object passed to `saveCustomRequestDraft()` with:

```ts
const saved = saveCustomRequestDraft(customRequestDraftFromPlanner(state));
```

Add a component test that clicks the request-quote link and reads `localens.custom-request.v1`, asserting the current revision and food selection are present before navigation.

- [ ] **Step 4: Run unit, component and food E2E groups**

```powershell
pnpm test:run tests/unit/planner/custom-request-demo.test.ts tests/components/customer/planner-flow.test.tsx
pnpm test:e2e tests/e2e/food-itinerary.spec.ts
```

Expected: EN, VI, mixed, research-only, refinement/removal and museum food cases all pass.

- [ ] **Step 5: Commit**

```powershell
git add -- lib/application/planner/custom-request-demo.ts components/customer/planner-flow.tsx tests/unit/planner/custom-request-demo.test.ts tests/components/customer/planner-flow.test.tsx tests/e2e/food-itinerary.spec.ts
git commit -m "fix: preserve planner food snapshot in request handoff"
```

---

### Task 4: Add the five-outcome idempotent payment simulator

**Time box:** 2 hours

**Files:**
- Modify: `lib/application/booking/mock-booking.ts`
- Modify: `lib/application/portal/demo-integration.ts`
- Modify: `components/customer/booking-flow.tsx`
- Modify: `messages/en.json`
- Modify: `messages/vi.json`
- Test: `tests/unit/booking/mock-booking.test.ts`
- Test: `tests/components/customer/booking-flow.test.tsx`
- Test: `tests/unit/portal/demo-integration.test.ts`
- Test: `tests/e2e/integrated-demo-flow.spec.ts`

**Interfaces:**
- Consumes: `LocalDemoBooking`, `BookingStorage`, `DemoPortalIntegration.syncFixedBooking()`.
- Produces:

```ts
export type DemoPaymentOutcome =
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired";

export type DemoPaymentAttempt = Readonly<{
  attemptId: string;
  bookingId: string;
  idempotencyKey: string;
  outcome: DemoPaymentOutcome;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
}>;

export interface StartTestPaymentInput {
  bookingId: unknown;
  idempotencyKey: unknown;
  storage?: BookingStorage;
  now?: Date;
}

export interface FinalizeTestPaymentInput extends StartTestPaymentInput {
  outcome: "succeeded" | "failed" | "cancelled";
}

export function startTestPayment(input: StartTestPaymentInput): DemoPaymentAttempt;
export function finalizeTestPayment(input: FinalizeTestPaymentInput): LocalDemoBooking;
```

`LocalDemoBooking` gains `paymentAttempts: readonly DemoPaymentAttempt[]`; production/domain enums remain unchanged. Keeping attempts inside the booking envelope gives one validated storage write per transition.

- [ ] **Step 1: Write RED state-machine tests**

Cover exact cases:

```ts
const first = startTestPayment({ bookingId, idempotencyKey: "pay-1", storage, now });
const replay = startTestPayment({ bookingId, idempotencyKey: "pay-1", storage, now });
expect(replay).toEqual(first);

const failed = finalizeTestPayment({
  bookingId,
  idempotencyKey: "pay-1",
  outcome: "failed",
  storage,
  now,
});
expect(failed).toMatchObject({ status: "held", paymentStatus: "unpaid" });
expect(failed.paymentAttempts.at(-1)?.outcome).toBe("failed");

const paid = finalizeTestPayment({
  bookingId,
  idempotencyKey: "pay-2",
  outcome: "succeeded",
  storage,
  now,
});
expect(paid).toMatchObject({ status: "paid", paymentStatus: "succeeded" });
```

Also assert cancelled remains held/unpaid, payment-session expiry records `expired`, hold expiry refuses payment, same terminal key replays unchanged, malformed/tampered attempts fail closed, and no second booking key is created.

Run:

```powershell
pnpm test:run tests/unit/booking/mock-booking.test.ts
```

Expected: FAIL because the new API/types are absent.

- [ ] **Step 2: Implement strict payment-attempt persistence**

Store attempts inside the existing validated booking envelope. Derive `attemptId` from `bookingId` plus a validated idempotency key; never accept amount, currency or booking status from UI. Reuse the existing exact booking validator. A terminal attempt cannot transition to another outcome.

When `outcome === "succeeded"`, update booking and attempt in one synchronous function call and save one booking envelope. For failed/cancelled, booking remains `held/unpaid`. At `testSessionExpiresAt`, return/record `expired`; at `holdExpiresAt`, reject the attempt and require booking recovery.

- [ ] **Step 3: Add explicit demo controls and bilingual copy**

Extend `BookingCopy` with exact keys:

```ts
simulateSuccessLabel: string;
simulateFailureLabel: string;
failureHeading: string;
failureMessage: string;
cancelledHeading: string;
expiredHeading: string;
retryPaymentLabel: string;
```

UI behavior:

- `simulateSuccessLabel` finalizes `succeeded`;
- `simulateFailureLabel` finalizes `failed`;
- existing cancel action finalizes `cancelled` before changing UI;
- expired attempts show recovery; if hold remains active, retry starts a new idempotency key on the same booking;
- disable all outcome buttons while a mutation is pending;
- focus the status/alert/heading after each terminal result.

The production copy must continue saying Test/Demo and no real charge.

- [ ] **Step 4: Keep portal synchronization truthful**

Call `syncFixedBooking()` after every booking mutation. Map held/unpaid for pending, failed and cancelled outcomes; map paid/succeeded only for success. Add a repository test proving admin/customer projections contain exactly one booking across retries.

- [ ] **Step 5: Run focused suites**

```powershell
pnpm test:run tests/unit/booking/mock-booking.test.ts tests/components/customer/booking-flow.test.tsx tests/unit/portal/demo-integration.test.ts
pnpm test:e2e tests/e2e/integrated-demo-flow.spec.ts --grep "booking|payment|retry"
```

Expected: five outcomes pass, same-key replay is stable, new attempts reuse the booking, portal has no duplicate.

- [ ] **Step 6: Commit**

```powershell
git add -- lib/application/booking/mock-booking.ts lib/application/portal/demo-integration.ts components/customer/booking-flow.tsx messages/en.json messages/vi.json tests/unit/booking/mock-booking.test.ts tests/components/customer/booking-flow.test.tsx tests/unit/portal/demo-integration.test.ts tests/e2e/integrated-demo-flow.spec.ts
git commit -m "feat: cover idempotent demo payment outcomes"
```

---

### Task 5: Complete authority, reset and recovery boundaries

**Time box:** 1 hour

**Files:**
- Create: `lib/application/demo/reset-demo.ts`
- Modify: `lib/application/portal/composition.ts`
- Modify: `components/portals/portal-surface.tsx`
- Modify: `components/portals/portal-copy.ts`
- Test: `tests/unit/demo/reset-demo.test.ts`
- Test: `tests/unit/portal/composition.test.ts`
- Test: `tests/unit/portal/demo-repository.test.ts`
- Test: `tests/components/portals/portal-surface.test.tsx`
- Test: `tests/e2e/portal-demo-flow.spec.ts`

**Interfaces:**
- Consumes: LocalLens-owned session keys, booking/payment key prefixes and repository `reset()`.
- Produces:

```ts
export interface DemoStorageArea {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

export function clearLocalLensDemoStorage(input: {
  session: DemoStorageArea;
  local: DemoStorageArea;
}): void;
```

`DemoPortalComposition` gains `resetDemo(): Promise<void>`; production composition does not expose it.

- [ ] **Step 1: Write RED reset ownership tests**

```ts
session.setItem("localens.personalization.v1", "demo");
session.setItem("other-app", "keep");
local.setItem("locallens.demo.booking.v1:booking-1", "demo");
local.setItem("other-app", "keep");

clearLocalLensDemoStorage({ session, local });

expect(session.getItem("localens.personalization.v1")).toBeNull();
expect(local.getItem("locallens.demo.booking.v1:booking-1")).toBeNull();
expect(session.getItem("other-app")).toBe("keep");
expect(local.getItem("other-app")).toBe("keep");
```

Also assert missing/blocked storage fails safely and never calls `clear()`.

- [ ] **Step 2: Implement exact-key/prefix reset**

Exact session keys:

```ts
const DEMO_SESSION_KEYS = [
  "localens.personalization.v1",
  "localens.custom-request.v1",
  "localens.demo.planner.e2e.v1",
  "localens.portal.demo.v1",
] as const;

const DEMO_LOCAL_PREFIXES = [
  "locallens.demo.booking.v1:",
] as const;
```

Copy matching keys to an array before removing them; do not mutate storage while iterating by index.

- [ ] **Step 3: Expose reset only in demo composition**

Wire `resetDemo()` to repository reset and sign-out semantics. The reset UI lives on sign-in/demo notice, asks no destructive OS/file action, and returns focus to the sign-in heading after completion.

- [ ] **Step 4: Add negative authority cases**

Repository/component/E2E tests must prove:

- customer cannot review requests, issue quotes, decide cancellations or read another customer;
- guide cannot read payment/quote/admin data or another guide assignment;
- admin cannot confirm planner revision, accept quote or pay as customer;
- `research_only` facts remain absent from bookable/planner/quote/payment projections;
- direct URL with wrong role shows access denied and a route back to the actor's own portal.

- [ ] **Step 5: Run focused suites**

```powershell
pnpm test:run tests/unit/demo/reset-demo.test.ts tests/unit/portal/composition.test.ts tests/unit/portal/demo-repository.test.ts tests/components/portals/portal-surface.test.tsx
pnpm test:e2e tests/e2e/portal-demo-flow.spec.ts
```

- [ ] **Step 6: Commit**

```powershell
git add -- lib/application/demo/reset-demo.ts lib/application/portal/composition.ts components/portals/portal-surface.tsx components/portals/portal-copy.ts tests/unit/demo/reset-demo.test.ts tests/unit/portal/composition.test.ts tests/unit/portal/demo-repository.test.ts tests/components/portals/portal-surface.test.tsx tests/e2e/portal-demo-flow.spec.ts
git commit -m "feat: reset demo state and enforce actor boundaries"
```

---

### Task 6: Integrated acceptance, truthful runbook and handoff

**Time box:** 2 hours including final buffer

**Files:**
- Modify: `tests/e2e/integrated-demo-flow.spec.ts`
- Modify: `tests/e2e/static-shell.spec.ts`
- Modify: `README.md`
- Modify: `design-qa.md`
- Modify: `.superpowers/sdd/2026-09-01-localens-a-demo-acceptance/progress.md`

**Interfaces:**
- Consumes: all task commits and exact commands in `package.json`.
- Produces: final `N/N` E2E evidence, verified local URL and a handoff that distinguishes A from B.

- [ ] **Step 1: Add one complete acceptance path per locale**

EN fixed-tour path:

```text
sign in customer → select fixed tour → create hold → failed attempt → retry → succeeded → one paid booking in account/admin
```

VI personalized path:

```text
personalize → generate/refine/lock → confirm revision → submit request → admin review/approve → issue quote → customer accept → simulated checkout → account
```

Both paths must assert Demo disclosure, actor ownership and no console/page errors. Add separate cancellation and expired-session cases; do not make one enormous test depend on all terminal outcomes.

- [ ] **Step 2: Run all focused E2E files**

```powershell
pnpm test:e2e tests/e2e/customer-visual.spec.ts tests/e2e/food-itinerary.spec.ts tests/e2e/integrated-demo-flow.spec.ts tests/e2e/portal-demo-flow.spec.ts tests/e2e/static-shell.spec.ts
```

Expected: `N/N`, zero failure. Record actual N; never continue reporting `23/23` if tests were added.

- [ ] **Step 3: Run the complete non-E2E gate**

```powershell
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
pnpm db:static
git diff --check
```

Expected: every command exits 0. `pnpm db:types:check` remains outside A and must still be reported as blocked unless tooling changed independently.

- [ ] **Step 4: Run the full Playwright gate from a clean server state**

Verify ports 3100 and 3200 are free, then run:

```powershell
pnpm test:e2e
```

Expected: all discovered tests pass. After completion, verify no test-owned listener remains. Terminate only processes proven to belong to this test run.

- [ ] **Step 5: Update README and QA evidence**

README must include exact commands:

```powershell
pnpm install --offline --frozen-lockfile
pnpm dev
```

and clearly state:

```text
This is a local thesis demo. Tour data, AI ranking and payment outcomes are simulated. Supabase/RLS/concurrency are not runtime-verified in milestone A.
```

`design-qa.md` records the actual tested commit, viewport list, `N/N` Playwright result, contrast/keyboard/overflow outcome and exact remaining B blocker.

- [ ] **Step 6: Commit documentation/evidence**

```powershell
git add -- tests/e2e/integrated-demo-flow.spec.ts tests/e2e/static-shell.spec.ts README.md design-qa.md .superpowers/sdd/2026-09-01-localens-a-demo-acceptance/progress.md
git commit -m "test: close LocalLens A acceptance gate"
```

- [ ] **Step 7: Final verification after commit**

Run:

```powershell
git status --short
pnpm check
pnpm db:static
pnpm test:e2e
```

Expected: clean tracked status, all checks pass, actual E2E count reported. Use `superpowers:verification-before-completion` before claiming A complete.

- [ ] **Step 8: Start and verify the handoff demo**

```powershell
pnpm dev --hostname 127.0.0.1 --port 3000
```

Verify HTTP 200 for `/en/` and `/vi/`, then open the local browser. Report process/URL evidence and stop short of merge/push/publish.

## Parallel Dispatch Boundary

Recommended four-slot schedule:

- Sol High coordinator/reviewer owns integration, ledger and gates.
- Luna Max worker A executes Task 1 then Task 2.
- Luna Max worker B executes Task 3.
- Luna Max worker C executes Task 4.

Tasks 1, 2, 3 and the RED half of Task 4 are file-disjoint and may run concurrently from the same accepted base only when the execution skill provides isolated child worktrees. Task 5 starts after Task 4 fixes the payment/storage interface. Task 6 starts only after Tasks 1–5 pass focused review. No maker approves their own task.

## Mentor Stop/Go Rules

- **Go at hour 2:** the three known blocker groups are green and payment contract tests are RED for the intended reason.
- **Go at hour 4:** all five payment outcomes pass unit/component tests; otherwise stop personalized expansion and fix payment correctness.
- **Go at hour 6:** focused customer/food/portal E2E groups pass; otherwise freeze docs/visual extras and resolve only gate blockers.
- **No-go at hour 7:** if full Vitest/build or full Playwright still fails, report A as incomplete with exact failures; do not downgrade tests or relabel failures as accepted.
- **A complete:** only after fresh final commands prove all gates pass and the demo returns HTTP 200.
