# LocalLens Supabase Planner Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing LocalLens personalization experience to authenticated Supabase recommendation/refinement functions while preserving the offline demo and current design system.

**Architecture:** Keep `PlannerFlow` as the deterministic offline implementation and add a separate `SupabasePlannerFlow` selected by a small runtime surface. A typed browser adapter calls Edge Functions, reads only published display projections, maps responses into a UI-specific proposal model, and exposes stable errors. The homepage remains public; in Supabase mode it saves preferences and directs the user to sign in before consuming AI quota.

**Tech Stack:** Next.js 16.3.2 App Router, React 19.2.8, TypeScript 6, Supabase JS 2.112.3, Vitest/Testing Library, Playwright, existing LocalLens CSS tokens and bilingual dictionaries

**Spec:** `docs/superpowers/specs/2026-09-04-localens-public-thesis-demo-design.md`

## Global Constraints

- This plan starts only after `docs/superpowers/plans/2026-09-04-localens-gemini-edge-runtime.md` passes its local completion gate.
- Preserve the current editorial design system, typography, spacing, color tokens, components, navigation, and route structure.
- Do not initialize Sites, a template, another frontend, or a new route.
- Public browsing remains anonymous; generating, persisting, or refining an AI itinerary requires a signed-in customer.
- Never send `specialNeeds` to Supabase or Gemini; `toItineraryRequest` remains the privacy boundary.
- Supabase mode fails closed and never falls back to demo storage or demo repositories.
- Demo mode remains deterministic and works without Supabase, Gemini, or network access.
- The interface must explicitly label thesis-demo status, AI/fallback state, and simulated payment.
- All interactive controls retain visible focus, keyboard support, 44px target sizing, and bilingual copy.
- Do not run Playwright or browser automation until the user explicitly approves the browser step; then use only the browser they choose.
- Do not modify or stage unrelated dirty-worktree files.

---

## File structure

- `lib/application/planner/runtime-planner.ts`: UI-independent runtime port, proposal DTO, and stable error vocabulary.
- `lib/application/planner/itinerary-view-model.ts`: maps validated engine results plus published display rows into bilingual planner data.
- `lib/infrastructure/supabase/planner-runtime-adapter.ts`: invokes Edge Functions and loads display metadata.
- `components/customer/planner-surface.tsx`: selects demo or Supabase planner without importing demo code into Supabase composition.
- `components/customer/supabase-planner-flow.tsx`: authenticated async recommendation/refinement UI.
- `components/customer/thesis-demo-badge.tsx`: reusable visible demo label based on existing primitives.
- `components/customer/personalization-form.tsx`: keeps offline preview in demo mode and creates a secure handoff in Supabase mode.
- `components/layout/site-header.tsx`: hosts the compact demo badge without changing navigation.
- `lib/i18n/dictionaries.ts` and `components/portals/portal-copy.ts`: exact EN/VI states and disclosure copy.
- `app/globals.css`: styles new states using existing tokens only.

### Task 1: Define the runtime planner port and view model

**Files:**
- Create: `lib/application/planner/runtime-planner.ts`
- Create: `lib/application/planner/itinerary-view-model.ts`
- Create: `tests/unit/planner/runtime-planner.test.ts`
- Create: `tests/unit/planner/itinerary-view-model.test.ts`

**Interfaces:**
- Produces: `RuntimePlannerPort.recommend`, `RuntimePlannerPort.refine`, `RuntimePlannerPort.getSession`.
- Produces: `RuntimePlannerProposal` and `RuntimePlannerError`.
- Produces: `toRuntimePlannerProposal(response, displayRows, locale)`.

- [ ] **Step 1: Write failing contract tests**

```ts
it("does not permit specialNeeds in a runtime recommendation", () => {
  const request = toItineraryRequest(personalizationWithSpecialNeeds);
  expect(request).not.toHaveProperty("specialNeeds");
});

it("maps AI and deterministic proposals into explicit source labels", () => {
  expect(toRuntimePlannerProposal(aiResponse, displayRows, "vi")).toMatchObject({
    planId: aiResponse.planId,
    revision: 1,
    source: "ai",
    degraded: false,
  });
  expect(toRuntimePlannerProposal(fallbackResponse, displayRows, "vi")).toMatchObject({
    source: "deterministic",
    degraded: true,
  });
});
```

Add failure cases for missing place title, wrong snapshot ID, duplicate display row, unknown food vendor/item, bigint overflow, unknown `messageKey`, and a response with extra top-level fields.

- [ ] **Step 2: Run the new suites and verify RED**

Run: `pnpm test:run -- tests/unit/planner/runtime-planner.test.ts tests/unit/planner/itinerary-view-model.test.ts`

Expected: FAIL because the port and mapper do not exist.

- [ ] **Step 3: Add the exact runtime contracts**

```ts
export type RuntimePlannerErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_EXPIRED"
  | "INVALID_REQUEST"
  | "QUOTA_EXCEEDED"
  | "STALE_REVISION"
  | "SERVICE_UNAVAILABLE";

export interface RuntimePlannerError {
  readonly code: RuntimePlannerErrorCode;
  readonly messageKey: string;
  readonly retryable: boolean;
  readonly correlationId: string;
}

export interface RuntimePlannerPort {
  getSession(): Promise<{ userId: string; role: "customer" } | null>;
  recommend(request: ItineraryRequest, locale: Locale): Promise<Result<RuntimePlannerProposal, RuntimePlannerError>>;
  refine(input: RuntimeRefinementRequest, locale: Locale): Promise<Result<RuntimePlannerProposal, RuntimePlannerError>>;
}
```

`RuntimePlannerProposal` contains `planId`, `revision`, `source`, `degraded`, optional `messageKey`, `rationales`, `items`, `totals`, `budgetVnd`, and snapshot IDs. UI money uses safe numbers only after decimal-string validation.

- [ ] **Step 4: Implement strict display mapping**

Require one localized display row for every returned place ID. Map start/end times, visit/travel durations, admission/travel/food totals, food vendor/item title and rationale. Reject any display row from another catalog snapshot. Do not synthesize titles from IDs.

- [ ] **Step 5: Run planner contract tests and typecheck**

Run: `pnpm test:run -- tests/unit/planner/runtime-planner.test.ts tests/unit/planner/itinerary-view-model.test.ts tests/unit/planner/personalization-session.test.ts`

Run: `pnpm typecheck`

Expected: all commands exit 0.

- [ ] **Step 6: Commit the runtime contracts**

```powershell
git add -- lib/application/planner/runtime-planner.ts lib/application/planner/itinerary-view-model.ts tests/unit/planner/runtime-planner.test.ts tests/unit/planner/itinerary-view-model.test.ts
git commit -m "feat: define Supabase planner runtime contracts"
```

### Task 2: Implement the browser Supabase planner adapter

**Files:**
- Create: `lib/infrastructure/supabase/planner-runtime-adapter.ts`
- Create: `tests/unit/infrastructure/planner-runtime-adapter.test.ts`
- Modify: `lib/application/portal/supabase-shell.ts`
- Create: `tests/unit/portal/supabase-shell.test.ts`

**Interfaces:**
- Consumes: `RuntimePlannerPort`, Edge response contracts, published area/place display views.
- Produces: `createSupabasePlannerRuntimeAdapter(client): RuntimePlannerPort`.
- Changes: `SupabasePortalShell` gains `readonly planner: RuntimePlannerPort`.

- [ ] **Step 1: Write failing adapter tests**

Test the following observable calls:

```ts
expect(client.functions.invoke).toHaveBeenCalledWith("recommend-itinerary", {
  body: { input: canonicalRequest },
  headers: { "x-localens-device-id": expect.stringMatching(/^[0-9a-f-]{36}$/) },
});
```

Also cover area slug-to-UUID canonicalization through `catalog_snapshot_areas_v`, place display lookup by returned snapshot/place IDs, `refine-itinerary` body shape, session expiry, function network failure, 401, 409, 429, 503, malformed success body, duplicate rows, and unknown message keys.

- [ ] **Step 2: Run the adapter tests and verify RED**

Run: `pnpm test:run -- tests/unit/infrastructure/planner-runtime-adapter.test.ts tests/unit/portal/supabase-shell.test.ts`

Expected: FAIL because the adapter and `planner` composition member are absent.

- [ ] **Step 3: Implement a stable device identifier**

Generate one UUID with `crypto.randomUUID()`, store it in `sessionStorage` under `localens.ai-device.v1`, validate it on every read, and regenerate invalid values. It is an opaque quota key, not an account identifier; never put it in URLs or logs.

- [ ] **Step 4: Canonicalize areas and invoke functions**

Resolve current area slugs to UUIDs before invoking the function. Reject missing or duplicate mappings. Let Supabase JS attach the active access token. Pass no `turnstileToken`, `guestToken`, `specialNeeds`, email, phone, or user ID in the body.

- [ ] **Step 5: Map safe function errors and display metadata**

Accept only the gateway envelope fields `error.code`, `error.messageKey`, `error.retryable`, and `correlationId`; discard provider/database detail. On success, query place/display and food projection rows filtered by returned snapshot IDs and pass them to `toRuntimePlannerProposal`.

- [ ] **Step 6: Wire the adapter into Supabase composition**

```ts
return {
  mode: "supabase",
  session: createSupabasePortalSessionAdapter(client),
  planner: createSupabasePlannerRuntimeAdapter(client),
  // existing ports remain unchanged
};
```

- [ ] **Step 7: Run adapter, shell, client, and type tests**

Run: `pnpm test:run -- tests/unit/infrastructure/planner-runtime-adapter.test.ts tests/unit/portal/supabase-shell.test.ts tests/unit/supabase/client.test.ts`

Run: `pnpm typecheck`

Expected: all commands exit 0.

- [ ] **Step 8: Commit the browser adapter**

```powershell
git add -- lib/infrastructure/supabase/planner-runtime-adapter.ts tests/unit/infrastructure/planner-runtime-adapter.test.ts lib/application/portal/supabase-shell.ts tests/unit/portal/supabase-shell.test.ts
git commit -m "feat: connect planner to Supabase Edge runtime"
```

### Task 3: Add the runtime-selecting planner surface

**Files:**
- Create: `components/customer/planner-surface.tsx`
- Create: `tests/components/customer/planner-surface.test.tsx`
- Modify: `app/[locale]/planner/page.tsx`
- Modify: `tests/unit/portal/surface-import-boundary.test.tsx`

**Interfaces:**
- Consumes: `loadPortalSurfaceComposition`, existing `PlannerFlow`, new `SupabasePlannerFlow`.
- Produces: `PlannerSurface({ locale, copy })`.

- [ ] **Step 1: Write failing composition tests**

```tsx
it("renders the existing deterministic planner in demo mode", async () => {
  usePortalComposition(demoComposition);
  render(<PlannerSurface locale="vi" copy={copy} />);
  expect(await screen.findByText(copy.simulatedDisclosure)).toBeVisible();
});

it("renders the Supabase planner without importing demo repositories", async () => {
  usePortalComposition(supabaseComposition);
  render(<PlannerSurface locale="vi" copy={copy} />);
  expect(await screen.findByText(copy.runtimeDisclosure)).toBeVisible();
});
```

The import-boundary test must reject any static import of `demo-planner`, demo repositories, or localStorage composition from `supabase-planner-flow.tsx` and `planner-runtime-adapter.ts`.

- [ ] **Step 2: Run component/import tests and verify RED**

Run: `pnpm test:run -- tests/components/customer/planner-surface.test.tsx tests/unit/portal/surface-import-boundary.test.tsx`

Expected: FAIL because `PlannerSurface` does not exist.

- [ ] **Step 3: Implement loading, failure, and runtime selection**

Use the existing `ServiceStatus` component for loading/unavailable states. Load composition in `useEffect`, guard disposal, and provide the existing retry action. Render `PlannerFlow` only for `mode: "demo"`; render `SupabasePlannerFlow` only for `mode: "supabase"`.

- [ ] **Step 4: Replace the direct planner route component**

Change the route to render `<PlannerSurface locale={locale} copy={getDictionary(locale).planner} />`. Keep metadata, `dynamicParams`, locales, and route URLs unchanged.

- [ ] **Step 5: Run route, import-boundary, and build checks**

Run: `pnpm test:run -- tests/components/customer/planner-surface.test.tsx tests/unit/portal/surface-import-boundary.test.tsx`

Run: `pnpm build:demo`

Run: `pnpm build:supabase`

Expected: 24/24 routes build in each mode and no demo import appears in the Supabase planner chunk.

- [ ] **Step 6: Commit the runtime surface**

```powershell
git add -- components/customer/planner-surface.tsx tests/components/customer/planner-surface.test.tsx app/[locale]/planner/page.tsx tests/unit/portal/surface-import-boundary.test.tsx
git commit -m "feat: select planner experience by runtime"
```

### Task 4: Build the authenticated Supabase planner flow

**Files:**
- Create: `components/customer/supabase-planner-flow.tsx`
- Create: `tests/components/customer/supabase-planner-flow.test.tsx`
- Modify: `components/customer/planner-surface.tsx`

**Interfaces:**
- Consumes: `RuntimePlannerPort`, `readPersonalizationState`, `signInPath`, planner copy.
- Produces: authenticated generate, lock, refine, retry, and stale-refresh interactions.

- [ ] **Step 1: Write failing user-journey component tests**

Cover these states with accessible queries:

- signed out: sign-in CTA preserves `/${locale}/planner/` return path and no AI call occurs;
- missing/expired/invalid handoff: localized recovery CTA returns to `/${locale}/#personalize`;
- signed-in customer: explicit “Generate itinerary” button makes one call and disables while pending;
- AI success: `role="status"` announces AI source and rationales are visible;
- deterministic fallback: visible non-color-only degraded notice;
- quota 429: retry guidance without automatic retry;
- retryable network error: one user-triggered retry reuses the same request safely;
- lock toggles are keyboard operable and sent as `lockedItemIds`;
- stale refinement: refreshes latest revision before another submission;
- duplicate submit while pending never makes a second mutation.

- [ ] **Step 2: Run component tests and verify RED**

Run: `pnpm test:run -- tests/components/customer/supabase-planner-flow.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement session and handoff states**

Load `port.getSession()` and `readPersonalizationState()` after hydration. Keep server and first client render identical. Do not auto-call AI after sign-in; require the explicit button so refreshes do not consume quota.

- [ ] **Step 4: Implement async recommendation rendering**

Use a single discriminated state:

```ts
type RuntimePlannerUiState =
  | { status: "idle" }
  | { status: "loading"; operation: "recommend" | "refine" }
  | { status: "ready"; proposal: RuntimePlannerProposal }
  | { status: "error"; error: RuntimePlannerError; previous?: RuntimePlannerProposal };
```

Render the proposal timeline using semantic `<ol>`, `<article>`, and `<dl>` elements consistent with `PlannerFlow`. Show provider rationales only as plain text. Never use `dangerouslySetInnerHTML`.

- [ ] **Step 5: Implement structured refinement controls**

Keep the visible feedback textarea for the user's record, add a required scope selector (`partial` or `full`), preserve lock controls, and submit only the bounded request expected by the Edge handler. The server derives privacy-safe signals; client code must not send `specialNeeds`.

- [ ] **Step 6: Run component, accessibility, and regression suites**

Run: `pnpm test:run -- tests/components/customer/supabase-planner-flow.test.tsx tests/components/customer/planner-flow.test.tsx tests/components/ui/service-status.test.tsx`

Expected: all selected tests PASS, including axe assertions already used by the component suite.

- [ ] **Step 7: Commit the Supabase planner UI**

```powershell
git add -- components/customer/supabase-planner-flow.tsx tests/components/customer/supabase-planner-flow.test.tsx components/customer/planner-surface.tsx
git commit -m "feat: add authenticated AI planner experience"
```

### Task 5: Make the homepage handoff runtime-aware

**Files:**
- Modify: `components/customer/personalization-form.tsx`
- Modify: `tests/components/customer/personalization-form.test.tsx`
- Modify: `lib/i18n/dictionaries.ts`

**Interfaces:**
- Consumes: `loadPortalSurfaceComposition`, `savePersonalizationRequest`, `toItineraryRequest`.
- Produces: deterministic local preview in demo mode; secure sign-in/planner handoff in Supabase mode.

- [ ] **Step 1: Write failing dual-mode form tests**

```tsx
it("keeps deterministic preview in demo mode", async () => {
  renderDemoForm();
  await submitValidPreferences();
  expect(await screen.findByText(copy.preview.deterministicDisclosure)).toBeVisible();
});

it("does not run the demo repository in Supabase mode", async () => {
  renderSupabaseForm();
  await submitValidPreferences({ specialNeeds: "private note" });
  expect(createReadOnlyApiSpy).not.toHaveBeenCalled();
  expect(await screen.findByRole("link", { name: copy.runtimePlannerLinkLabel })).toBeVisible();
});
```

Add session-storage failure and invalid runtime configuration cases.

- [ ] **Step 2: Run the focused form tests and verify RED**

Run: `pnpm test:run -- tests/components/customer/personalization-form.test.tsx`

Expected: the Supabase-mode test FAILS because the component always executes the demo read-only API.

- [ ] **Step 3: Implement mode-specific submit behavior**

Resolve runtime composition once. Demo mode keeps the current synchronous preview. Supabase mode validates and stores the handoff, clears any stale preview, and renders a sign-in/planner CTA; it does not call an Edge Function from the public homepage.

- [ ] **Step 4: Replace demo-only hints with mode-specific EN/VI copy**

Use exact concepts:

- EN: “Your preferences are saved in this tab. Sign in with a demo customer account to generate and save an AI-assisted itinerary.”
- VI: “Nhu cầu được lưu trong tab này. Hãy đăng nhập tài khoản khách hàng demo để AI tạo và lưu lịch trình.”

Retain the existing deterministic disclosure in demo mode.

- [ ] **Step 5: Run form, session, and build tests**

Run: `pnpm test:run -- tests/components/customer/personalization-form.test.tsx tests/unit/planner/personalization-session.test.ts`

Run: `pnpm build:demo`

Run: `pnpm build:supabase`

Expected: both modes pass without hydration warnings.

- [ ] **Step 6: Commit the runtime-aware handoff**

```powershell
git add -- components/customer/personalization-form.tsx tests/components/customer/personalization-form.test.tsx lib/i18n/dictionaries.ts
git commit -m "feat: route Supabase personalization to AI planner"
```

### Task 6: Add thesis-demo, AI, fallback, and payment disclosures

**Files:**
- Create: `components/customer/thesis-demo-badge.tsx`
- Create: `tests/components/customer/thesis-demo-badge.test.tsx`
- Modify: `components/layout/site-header.tsx`
- Modify: `app/[locale]/layout.tsx`
- Modify: `components/customer/supabase-planner-flow.tsx`
- Modify: `components/customer/runtime-fixed-tour-account.tsx`
- Modify: `components/portals/portal-copy.ts`
- Modify: `lib/i18n/dictionaries.ts`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `ThesisDemoBadge({ locale })`.
- Produces: bilingual source/degraded/quota/AI/privacy labels in the existing dictionary types.

- [ ] **Step 1: Write failing disclosure and accessibility tests**

Assert the site header exposes “Bản demo đồ án” / “Thesis demo”, planner AI success and fallback are distinguishable without color, checkout says no real charge before the payment action, and no text claims commercial production or real payment.

- [ ] **Step 2: Run disclosure tests and verify RED**

Run: `pnpm test:run -- tests/components/customer/thesis-demo-badge.test.tsx tests/components/customer/supabase-planner-flow.test.tsx tests/components/customer/runtime-fixed-tour.test.tsx`

Expected: FAIL because the global badge and runtime AI copy are absent.

- [ ] **Step 3: Implement the badge using existing primitives**

Render text only with `role="note"`; use current border, surface, text, radius, and spacing tokens. Do not add a new palette, icon, logo, font, illustration, or animation.

- [ ] **Step 4: Add exact bilingual runtime states**

Include:

- AI success: “Gemini đã hỗ trợ xếp hạng; thời gian và chi phí do LocalLens kiểm tra.”
- fallback: “AI tạm không khả dụng; LocalLens đã dùng phương án xác định an toàn.”
- quota: “Đã đạt giới hạn AI của bản demo hôm nay. Bạn vẫn có thể xem phương án dự phòng.”
- payment: “Thanh toán mô phỏng — không nhập thông tin thẻ và không phát sinh giao dịch thật.”

Provide natural English equivalents in the same dictionary structure.

- [ ] **Step 5: Style responsive states with existing tokens**

At 390px, allow the header badge to wrap without covering navigation. Keep minimum 44px controls, visible `:focus-visible`, no horizontal scroll, and no fixed-width error/rationale blocks.

- [ ] **Step 6: Run component, i18n, and CSS regressions**

Run: `pnpm test:run -- tests/components/customer/thesis-demo-badge.test.tsx tests/components/customer/supabase-planner-flow.test.tsx tests/components/customer/runtime-fixed-tour.test.tsx tests/unit/i18n/dictionaries.test.ts`

Run: `pnpm lint`

Expected: all selected tests and lint PASS.

- [ ] **Step 7: Commit the disclosures**

```powershell
git add -- components/customer/thesis-demo-badge.tsx tests/components/customer/thesis-demo-badge.test.tsx components/layout/site-header.tsx app/[locale]/layout.tsx components/customer/supabase-planner-flow.tsx components/customer/runtime-fixed-tour-account.tsx components/portals/portal-copy.ts lib/i18n/dictionaries.ts app/globals.css
git commit -m "feat: label thesis demo AI and payment states"
```

### Task 7: Verify the complete product experience

**Files:**
- Modify: `tests/e2e/runtime-itinerary.spec.ts`
- Modify: `tests/e2e/portal-demo-flow.spec.ts`
- Create: `docs/design/qa/public-thesis-demo/README.md`
- Create: `docs/acceptance/planner-experience.md`
- Modify: `design-qa.md`

**Interfaces:**
- Produces: verified bilingual customer journey in demo and Supabase modes.

- [ ] **Step 1: Extend E2E coverage without using a real provider**

Cover home preference handoff, sign-in return path, explicit AI generation, AI-success source notice, deterministic fallback, refinement, reload persistence, simulated payment disclosure, and cancellation-before-payment. Keep provider responses deterministic in CI.

- [ ] **Step 2: Run all non-browser gates first**

Run: `pnpm lint`

Run: `pnpm typecheck`

Run: `pnpm test:run -- --no-file-parallelism --testTimeout=30000`

Run: `pnpm db:verify`

Run: `pnpm build:demo`

Run: `pnpm build:supabase`

Expected: every command exits 0 before visual acceptance begins.

- [ ] **Step 3: Request explicit browser approval**

Ask the user which available browser to use. Do not start Playwright or browser automation until they approve one browser. Record the chosen browser in `docs/acceptance/planner-experience.md`.

- [ ] **Step 4: Capture matched before/after visual evidence**

At `1440x1024`, `768x1024`, and `390x844`, capture the current reference and implemented state for homepage handoff, planner AI success, planner fallback, account payment, and one error state. Compare each pair at the same viewport and state; fix layout, spacing, focus, overflow, typography, border, or console differences before recording acceptance.

- [ ] **Step 5: Run approved-browser end-to-end acceptance**

Run: `pnpm test:e2e`

Run: `pnpm test:e2e:runtime-itinerary`

Run: `pnpm test:e2e:runtime-fixed-tour`

Expected: all flows PASS; screenshots show no horizontal overflow; console has no uncaught errors; keyboard navigation reaches every core action.

- [ ] **Step 6: Record evidence and commit QA**

Document exact SHA, commands, test counts, browser/version, viewport results, screenshot paths, console/network summary, remaining non-blocking limitations, and the label `demo-verified@<SHA>` plus `runtime-verified-local@<SHA>` only when their full gates passed.

```powershell
git add -- tests/e2e/runtime-itinerary.spec.ts tests/e2e/portal-demo-flow.spec.ts docs/design/qa/public-thesis-demo docs/acceptance/planner-experience.md design-qa.md
git commit -m "test: accept the AI thesis demo experience"
```

## Plan completion gate

This plan is complete only when the existing offline demo still passes, Supabase mode generates and refines a persisted itinerary through authenticated Edge Functions, all AI/payment/demo disclosures are visible in both languages, and approved-browser QA passes at all three required viewports. This plan does not create or promote cloud infrastructure.
