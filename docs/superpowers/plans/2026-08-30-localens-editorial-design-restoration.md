# LocalLens Editorial Design Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the selected LocalLens editorial interface across the customer journey without changing routes, business logic, data contracts, or the completed food-selection behavior.

**Architecture:** Treat the work as a replaceable presentation layer. Introduce a small token/font/asset foundation, restyle shared layout and customer components in route order, and protect current behavior with component and E2E tests. Begin from the docs-only handoff commit immediately after the committed Task 10 baseline in an isolated worktree; pause food-plan Tasks 11–12 until integration.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Tailwind CSS 4 plus repository CSS, Vitest/Testing Library, Playwright, `next/font/local`.

**Spec:** `docs/superpowers/specs/2026-08-30-localens-editorial-design-restoration.md`

## Global Constraints

- The Task 10 completion commit and following docs-only handoff commit are hard prerequisites. Never implement from the dirty Task 10 working tree.
- Do not edit `supabase/**`, payment logic, itinerary/pricing domain code, API contracts, form field names, storage keys, or route paths.
- Preserve current component behavior and Task 10 food/totals rendering; presentation-only changes are the default.
- Keep each task reviewable and commit only its listed files.
- Use test-driven development: add or tighten a failing assertion, observe the expected failure, implement the smallest change, and rerun the focused suite.
- Use the selected reference at exactly `1488 x 1059`; validate tablet at `768 x 1024` and mobile at `390 x 844`.
- Do not start food-plan Task 11 or Task 12 until this plan is integrated.

---

### Task 0: Establish the clean handoff and isolated branch

**Files:**
- Read: `docs/superpowers/plans/2026-08-28-food-vendor-pricing-implementation-plan.md`
- Read: `docs/superpowers/specs/2026-08-30-localens-editorial-design-restoration.md`
- Create in the new worktree: `.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/progress.md`

- [ ] **Step 1: Receive both handoff SHAs.** Verify the reported Task 10 commit, verify the later docs-handoff commit contains only the three approved plan/spec files, and confirm `git status --short` has no tracked Task 10 changes.
- [ ] **Step 2: Stop if the gate is not clean.** Do not stash, reset, discard, or absorb another task’s changes. Ask the Task 10 owner to finish the handoff.
- [ ] **Step 3: Invoke `superpowers:using-git-worktrees`.** From the LocalLens repository, create isolated worktree/branch `codex/localens-design-restore` at the verified docs-handoff SHA. Record the earlier Task 10 SHA as `TASK10_SHA` for behavior/scope comparison.
- [ ] **Step 4: Establish the baseline.** Run `pnpm install --frozen-lockfile`, then `pnpm test:run tests/components/customer tests/components/layout tests/unit/i18n/dictionaries.test.ts tests/unit/seo/metadata.test.ts`, `pnpm typecheck`, and `pnpm build`. Record exact results and any pre-existing failure in the progress ledger.
- [ ] **Step 5: Commit only the progress ledger** with `git add .superpowers/sdd/2026-08-30-localens-editorial-design-restoration/progress.md && git commit -m "chore: record editorial restoration baseline"`.

### Task 1: Freeze the visual reference and asset contract

**Files:**
- Create: `docs/design/references/localens-editorial-home-selected.png`
- Create: `docs/design/editorial-assets.md`
- Create: `public/images/editorial/saigon-artisan-hero.webp`
- Create: `public/images/editorial/saigon-post-office-inset.webp`
- Create: `public/images/editorial/category-street-food.webp`
- Create: `public/images/editorial/category-history.webp`
- Create: `public/images/editorial/category-craft.webp`
- Create: `public/images/editorial/category-market.webp`

- [ ] **Step 1: Copy the reference unchanged** from `C:\Users\Admin\.codex\generated_images\01a024a9-db76-7981-82da-d2abc4e6f409\exec-8e7be86b-a264-4054-8b0a-9992eb684e24.png` and verify its dimensions are `1488 x 1059`.
- [ ] **Step 2: Generate production image assets** to the dimensions and art direction in the spec. Do not crop UI from the reference and do not use unrelated web images.
- [ ] **Step 3: Document each asset** with source/generation prompt, crop intent, localized alt-text decision, and license/provenance in `docs/design/editorial-assets.md`.
- [ ] **Step 4: Verify asset behavior** by checking dimensions, transparency for category marks, WebP decoding, and total payload. Keep the two above-the-fold images reasonably compressed without visible artifacts.
- [ ] **Step 5: Commit** with `git add docs/design public/images/editorial && git commit -m "chore: add LocalLens editorial visual references"`.

### Task 2: Add font and design-token foundations

**Files:**
- Create: `public/fonts/cormorant-garamond-600.woff2`
- Create: `public/fonts/manrope-400.woff2`
- Create: `public/fonts/manrope-600.woff2`
- Create: `public/fonts/OFL-Cormorant-Garamond.txt`
- Create: `public/fonts/OFL-Manrope.txt`
- Create: `app/styles/tokens.css`
- Create: `app/styles/customer-editorial.css`
- Modify: `app/[locale]/layout.tsx`
- Modify: `app/globals.css`
- Test: `tests/components/layout/site-header.test.tsx`
- Test: `tests/unit/seo/metadata.test.ts`

- [ ] **Step 1: Add failing tests** that expect the locale layout to expose stable display/body font variables and preserve the localized document language, skip link, header, main content, and footer.
- [ ] **Step 2: Run** `pnpm test:run tests/components/layout/site-header.test.tsx tests/unit/seo/metadata.test.ts` and confirm the new font-variable assertion fails for the expected reason.
- [ ] **Step 3: Add licensed self-hosted fonts** with `next/font/local`, preload, `font-display: swap`, and system fallbacks. Put palette, typography, spacing, border, shadow, content-width, and interaction tokens in `tokens.css`.
- [ ] **Step 4: Split presentation CSS safely.** Keep resets/focus/shared behavior in `globals.css`; import Tailwind, tokens, then customer editorial styles in deterministic order. Preserve existing class names and avoid broad global element overrides.
- [ ] **Step 5: Run** the focused tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build`; inspect build output for missing font or asset paths.
- [ ] **Step 6: Commit** with `git add app/[locale]/layout.tsx app/globals.css app/styles public/fonts tests/components/layout/site-header.test.tsx tests/unit/seo/metadata.test.ts && git commit -m "feat: add LocalLens editorial design foundations"`.

### Task 3: Restore the shared customer shell

**Files:**
- Modify: `components/layout/site-header.tsx`
- Modify: `components/layout/site-footer.tsx`
- Modify: `components/i18n/locale-switcher.tsx`
- Modify: `lib/i18n/dictionaries.ts`
- Modify: `app/styles/customer-editorial.css`
- Test: `tests/components/layout/site-header.test.tsx`
- Test: `tests/unit/i18n/dictionaries.test.ts`

- [ ] **Step 1: Add failing semantic tests** for the mapped navigation: Experiences → tours, Private journeys → planner, Our city → home category anchor, no Journal link, working EN/VI switch, and preserved unavailable sign-in state.
- [ ] **Step 2: Run** `pnpm test:run tests/components/layout/site-header.test.tsx tests/unit/i18n/dictionaries.test.ts` and confirm failures describe only the missing editorial shell contract.
- [ ] **Step 3: Implement the shared shell** with the reference’s typographic logo, compact navigation, language controls, borders, and responsive menu behavior. Preserve locale-prefixed destinations and accessible names.
- [ ] **Step 4: Verify keyboard behavior** for skip link, navigation, locale switcher, and any mobile disclosure. Ensure focus is never hidden by the header.
- [ ] **Step 5: Run** focused tests, `pnpm lint`, and `pnpm typecheck`.
- [ ] **Step 6: Commit** with `git add components/layout components/i18n/locale-switcher.tsx lib/i18n/dictionaries.ts app/styles/customer-editorial.css tests/components/layout/site-header.test.tsx tests/unit/i18n/dictionaries.test.ts && git commit -m "feat: restore editorial customer shell"`.

### Task 4: Restore the selected home-page composition

**Files:**
- Modify: `components/customer/customer-home.tsx`
- Modify: `app/[locale]/page.tsx`
- Modify: `lib/i18n/dictionaries.ts`
- Modify: `app/styles/customer-editorial.css`
- Test: `tests/components/customer/customer-home.test.tsx`
- Test: `tests/unit/i18n/dictionaries.test.ts`
- Test: `tests/e2e/static-shell.spec.ts`

- [ ] **Step 1: Add failing tests** for the retained headline idea in EN/VI, both CTA destinations, the four supported experience categories, semantic section headings, and meaningful hero alt text.
- [ ] **Step 2: Run** `pnpm test:run tests/components/customer/customer-home.test.tsx tests/unit/i18n/dictionaries.test.ts` and observe the expected content/structure failures.
- [ ] **Step 3: Implement the editorial hero** with asymmetric copy/image composition, architectural inset, coordinate detail, and two real route CTAs. Implement “Four ways into the city” with the four supported preference groups; keep local-life catalog content without inventing a fifth preference value.
- [ ] **Step 4: Match the desktop reference** at `1488 x 1059`, then implement explicit tablet/mobile reflow. Do not use screenshot fragments, absolute positioning that overlaps localized copy, or decorative images as interactive controls.
- [ ] **Step 5: Run** focused unit/component tests and `pnpm test:e2e -- tests/e2e/static-shell.spec.ts`, then `pnpm lint` and `pnpm typecheck`.
- [ ] **Step 6: Commit** with `git add components/customer/customer-home.tsx app/[locale]/page.tsx lib/i18n/dictionaries.ts app/styles/customer-editorial.css tests/components/customer/customer-home.test.tsx tests/unit/i18n/dictionaries.test.ts tests/e2e/static-shell.spec.ts && git commit -m "feat: restore LocalLens editorial home"`.

### Task 5: Carry the design system through fixed-tour discovery

**Files:**
- Modify: `components/customer/fixed-tours-grid.tsx`
- Modify: `components/customer/tour-catalog-explorer.tsx`
- Modify: `app/[locale]/tours/page.tsx`
- Modify: `app/styles/customer-editorial.css`
- Test: `tests/components/customer/tours-page.test.tsx`
- Test: `tests/components/customer/tour-catalog-explorer.test.tsx`

- [ ] **Step 1: Add failing behavior-preservation tests** for filters, tour links/actions, empty/error states, localized labels, and keyboard-operable controls; add structural expectations for the editorial page heading and cards.
- [ ] **Step 2: Run** `pnpm test:run tests/components/customer/tours-page.test.tsx tests/components/customer/tour-catalog-explorer.test.tsx` and confirm failures are presentation-contract failures rather than data changes.
- [ ] **Step 3: Restyle the catalog** using editorial spacing, restrained rules, strong hierarchy, and responsive cards while retaining all current data and actions.
- [ ] **Step 4: Verify** long EN/VI names, zero-result state, service-unavailable state, keyboard focus, and no horizontal page overflow at all three target viewports.
- [ ] **Step 5: Run** focused tests, `pnpm lint`, and `pnpm typecheck`.
- [ ] **Step 6: Commit** with `git add components/customer/fixed-tours-grid.tsx components/customer/tour-catalog-explorer.tsx app/[locale]/tours/page.tsx app/styles/customer-editorial.css tests/components/customer/tours-page.test.tsx tests/components/customer/tour-catalog-explorer.test.tsx && git commit -m "feat: apply editorial design to tour discovery"`.

### Task 6: Carry the design system through personalization and itinerary review

**Files:**
- Modify: `components/customer/personalization-form.tsx`
- Modify: `components/customer/planner-flow.tsx`
- Modify: `components/customer/custom-request-flow.tsx`
- Modify: `components/customer/itinerary-preview.tsx`
- Modify: `app/[locale]/planner/page.tsx`
- Modify: `app/[locale]/custom-request/page.tsx`
- Modify: `app/styles/customer-editorial.css`
- Test: `tests/components/customer/personalization-form.test.tsx`
- Test: `tests/components/customer/planner-flow.test.tsx`
- Test: `tests/components/customer/custom-request-flow.test.tsx`
- Test: `tests/components/customer/itinerary-preview.test.tsx`

- [ ] **Step 1: Strengthen tests before markup changes** for every existing field name, validation message/focus target, persisted session behavior, generate/refine/lock actions, proposal-only state, exact Task 10 vendor/menu/quantity/payment labels, and separated totals.
- [ ] **Step 2: Run** `pnpm test:run tests/components/customer/personalization-form.test.tsx tests/components/customer/planner-flow.test.tsx tests/components/customer/custom-request-flow.test.tsx tests/components/customer/itinerary-preview.test.tsx` and retain the passing behavior baseline; then add the smallest editorial-structure assertion and observe its expected failure.
- [ ] **Step 3: Restyle forms and timeline cards** without changing DTO wiring, calculation, event handlers, storage keys, or request lifecycle. Keep food-not-selected, pay-at-vendor, budget warning, and accessibility caveats explicit.
- [ ] **Step 4: Verify responsive behavior** for dense forms, long validation copy, itinerary rows, cost breakdowns, and action groups at all three target viewports.
- [ ] **Step 5: Run** the focused suite, `pnpm lint`, and `pnpm typecheck`.
- [ ] **Step 6: Commit** with `git add components/customer/personalization-form.tsx components/customer/planner-flow.tsx components/customer/custom-request-flow.tsx components/customer/itinerary-preview.tsx app/[locale]/planner/page.tsx app/[locale]/custom-request/page.tsx app/styles/customer-editorial.css tests/components/customer/personalization-form.test.tsx tests/components/customer/planner-flow.test.tsx tests/components/customer/custom-request-flow.test.tsx tests/components/customer/itinerary-preview.test.tsx && git commit -m "feat: apply editorial design to journey planning"`.

### Task 7: Carry the design system through booking

**Files:**
- Modify: `components/customer/booking-flow.tsx`
- Modify: `app/[locale]/booking/page.tsx`
- Modify: `app/styles/customer-editorial.css`
- Test: `tests/components/customer/booking-flow.test.tsx`

- [ ] **Step 1: Add failing structural assertions** while preserving tests for booking inputs, summary, validation, Stripe Mock disclosure, LocalLens-payable amount, and exclusion of pay-at-vendor estimates.
- [ ] **Step 2: Run** `pnpm test:run tests/components/customer/booking-flow.test.tsx` and confirm only the new editorial structure is missing.
- [ ] **Step 3: Restyle booking** as a clear editorial checkout/review flow without changing submission, amounts, currency, validation, or disclosure text.
- [ ] **Step 4: Verify** keyboard order, error announcement, long localized values, and narrow-screen summary/action behavior.
- [ ] **Step 5: Run** the focused test, `pnpm lint`, and `pnpm typecheck`.
- [ ] **Step 6: Commit** with `git add components/customer/booking-flow.tsx app/[locale]/booking/page.tsx app/styles/customer-editorial.css tests/components/customer/booking-flow.test.tsx && git commit -m "feat: apply editorial design to booking"`.

### Task 8: Add deterministic visual and accessibility acceptance coverage

**Files:**
- Create: `tests/e2e/customer-visual.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `README.md`
- Modify: `.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/progress.md`

- [ ] **Step 1: Add Playwright coverage** for `/en`, `/vi`, `/en/tours`, `/en/planner`, `/en/custom-request`, and `/en/booking`. Use stable local data, disable animation for captures, wait for fonts/images, and mask only genuinely nondeterministic content.
- [ ] **Step 2: Add viewport-specific assertions** for `1488 x 1059`, `768 x 1024`, and `390 x 844`, including no horizontal overflow, visible focus, route-correct CTAs, and full-page screenshots.
- [ ] **Step 3: Run** `pnpm test:e2e -- tests/e2e/customer-visual.spec.ts` and inspect each screenshot. Create a side-by-side or overlay comparison of the desktop home render with `docs/design/references/localens-editorial-home-selected.png`; a passing snapshot alone is not visual approval.
- [ ] **Step 4: Perform accessibility smoke checks** for heading order, landmarks, labels, keyboard-only flow, focus visibility, meaningful/empty alt text, reduced motion, and text/background contrast.
- [ ] **Step 5: Run the complete gate:** `pnpm check`, followed by `pnpm test:e2e`. Record exact outputs. Keep database runtime verification status separate; this presentation plan does not convert static database checks into runtime proof.
- [ ] **Step 6: Review scope** with `git diff <TASK10_SHA>...HEAD --stat` and `git diff <TASK10_SHA>...HEAD -- supabase lib/domain`. The second command must show no business/domain/database edits; investigate any output before completion.
- [ ] **Step 7: Commit** with `git add tests/e2e/customer-visual.spec.ts playwright.config.ts README.md .superpowers/sdd/2026-08-30-localens-editorial-design-restoration/progress.md && git commit -m "test: verify LocalLens editorial customer experience"`.

### Task 9: Review, integrate, and release the paused food tasks

**Files:**
- Modify only if needed for verified documentation: `.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/progress.md`

- [ ] **Step 1: Invoke `superpowers:requesting-code-review`.** Review the full diff against this spec, with special attention to route/data/price/food compatibility and responsive visual evidence.
- [ ] **Step 2: Resolve findings using `superpowers:receiving-code-review`** and rerun every affected focused test plus the full gate.
- [ ] **Step 3: Invoke `superpowers:verification-before-completion`.** Do not claim success from earlier or partial output; capture fresh `pnpm check` and `pnpm test:e2e` results.
- [ ] **Step 4: Invoke `superpowers:finishing-a-development-branch`** and present the reviewed integration options. Do not merge, rebase, delete a worktree, or resume another task without the user’s chosen option.
- [ ] **Step 5: After integration only, notify the food-vendor/pricing task** to resume Tasks 11 and 12 from the integrated HEAD. Do not continue from the stale pre-design checkout.

## Rollback Boundary

Each task is independently committed. If a presentation change regresses behavior, revert only the corresponding design commit; never reset or discard the Task 10 baseline. Assets/tokens, shell, home, tours, planner, and booking remain separable review units.
