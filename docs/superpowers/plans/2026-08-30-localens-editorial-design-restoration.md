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
- Read the nearest `AGENTS.md`/`CLAUDE.md` and the task-relevant repository-installed Next.js 16 guide before changing code; never rely on remembered Next.js APIs.
- Keep each task reviewable and commit only its listed files. A task may contain its implementation commit plus separately reviewed fix-round commits; do not squash away review boundaries during execution.
- Use test-driven development: add or tighten a failing assertion, observe the expected failure, implement the smallest change, and rerun the focused suite.
- Use the selected reference at its verified decoded size `1487 x 1058`; validate tablet at `768 x 1024` and mobile at `390 x 844`.
- Do not start food-plan Task 11 or Task 12 until this plan is integrated.
- Do not start live AI, runtime installation, GitHub, or deployment work from this plan; those require separate approved release-readiness specs/plans.

---

### Task 0: Establish the clean handoff and isolated branch

**Files:**
- Read: `AGENTS.md` and `CLAUDE.md` when present
- Read: `docs/superpowers/plans/2026-08-28-food-vendor-pricing-implementation-plan.md`
- Read: `docs/superpowers/specs/2026-08-30-localens-editorial-design-restoration.md`
- Create in the new worktree: `.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/progress.md`

- [ ] **Step 1: Receive both handoff SHAs.** Verify the reported Task 10 commit, verify the later docs-handoff commit contains only the three approved plan/spec files, and confirm `git status --short` has no tracked Task 10 changes.
- [ ] **Step 2: Stop if the gate is not clean.** Do not stash, reset, discard, or absorb another task’s changes. Ask the Task 10 owner to finish the handoff.
- [ ] **Step 3: Invoke `superpowers:using-git-worktrees`.** From the LocalLens repository, create isolated worktree/branch `codex/localens-design-restore` at the verified docs-handoff SHA. Record the earlier Task 10 SHA as `TASK10_SHA` for behavior/scope comparison.
- [ ] **Step 4: Establish the baseline and framework authority.** Run `pnpm install --frozen-lockfile`; then read `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`, `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md`, and `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`. Run `pnpm test:run tests/components/customer tests/components/layout tests/unit/i18n/dictionaries.test.ts tests/unit/seo/metadata.test.ts`, `pnpm typecheck`, and `pnpm build`. Record the instruction files read, exact results, and any pre-existing failure in the progress ledger.
- [ ] **Step 5: Commit only the progress ledger** with `git add .superpowers/sdd/2026-08-30-localens-editorial-design-restoration/progress.md && git commit -m "chore: record editorial restoration baseline"`.

### Task 1: Freeze the visual reference and asset contract

**Files:**
- Create: `docs/design/references/localens-editorial-home-selected.png`
- Create: `docs/design/editorial-assets.md`
- Create: `scripts/process-editorial-assets.mjs`
- Create: `public/images/editorial/saigon-artisan-hero.webp`
- Create: `public/images/editorial/saigon-post-office-inset.webp`
- Create: `public/images/editorial/category-street-food.webp`
- Create: `public/images/editorial/category-history.webp`
- Create: `public/images/editorial/category-craft.webp`
- Create: `public/images/editorial/category-market.webp`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Test: `tests/unit/scripts/process-editorial-assets.test.ts`

- [ ] **Step 1: Copy the reference unchanged** from `C:\Users\Admin\.codex\generated_images\01a024a9-db76-7981-82da-d2abc4e6f409\exec-8e7be86b-a264-4054-8b0a-9992eb684e24.png`; verify decoded dimensions `1487 x 1058` and SHA-256 `BAE040B763524C6232632A12D96855A0B5590154F6CEB9C72D2D2EB743C98BF2`; fail rather than silently resizing or recompressing the source of truth.
- [ ] **Step 2: Add the reproducible processor dependency and failing tests.** Run `pnpm add --save-dev --save-exact sharp@0.35.4`. Test photo crop/dimensions/metadata stripping, luminance-to-alpha antialiasing, transparent/opaque alpha bounds, size-limit rejection, malformed-input rejection, and same-size comparison output. Run `pnpm test:run tests/unit/scripts/process-editorial-assets.test.ts` and confirm failure because the processor is absent.
- [ ] **Step 3: Implement `scripts/process-editorial-assets.mjs`.** Provide `photo`, `mark`, `check`, and `compare` commands with the exact algorithms, dimensions, quality, limits, and exit-on-error behavior from the spec. Re-run the focused test and require PASS.
- [ ] **Step 4: Generate and process production assets.** Generate original scratch PNG sources into `.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/source-assets/`; do not crop the UI reference or use unrelated web images. For the hero, retain the decoded `1448 x 1086` generator-native output and pass it directly to photo mode—do not create an intermediate upscale. Process sources only through the committed script to the six final WebP paths.
- [ ] **Step 5: Document and verify.** Record every prompt, scratch source name, focal crop, exact processing command, tool version, localized alt-text decision, and provenance in `docs/design/editorial-assets.md`. Run the script's `check` command over all six outputs and require exact dimensions, valid decoding, category alpha bounds, and per-file size limits.
- [ ] **Step 6: Commit** with `git add package.json pnpm-lock.yaml scripts/process-editorial-assets.mjs tests/unit/scripts/process-editorial-assets.test.ts docs/design public/images/editorial && git commit -m "chore: add LocalLens editorial visual references"`.

### Task 2: Add font and design-token foundations

**Files:**
- Create: `public/fonts/cormorant-garamond-600.woff2`
- Create: `public/fonts/manrope-400.woff2`
- Create: `public/fonts/manrope-600.woff2`
- Create: `public/fonts/OFL-Cormorant-Garamond.txt`
- Create: `public/fonts/OFL-Manrope.txt`
- Create: `scripts/copy-editorial-fonts.mjs`
- Create: `app/styles/tokens.css`
- Create: `app/styles/customer-editorial.css`
- Modify: `app/[locale]/layout.tsx`
- Modify: `app/globals.css`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Test: `tests/components/layout/site-header.test.tsx`
- Test: `tests/unit/seo/metadata.test.ts`
- Test: `tests/unit/scripts/copy-editorial-fonts.test.ts`

- [ ] **Step 1: Add failing tests** that expect the locale layout to expose stable display/body font variables and preserve the localized document language, skip link, header, main content, and footer.
- [ ] **Step 2: Run** `pnpm test:run tests/components/layout/site-header.test.tsx tests/unit/seo/metadata.test.ts` and confirm the new font-variable assertion fails for the expected reason.
- [ ] **Step 3: Add pinned font provenance and a failing copy test.** Run `pnpm add --save-dev --save-exact @fontsource/manrope@5.3.0 @fontsource/cormorant-garamond@5.3.0`. Add `tests/unit/scripts/copy-editorial-fonts.test.ts` to require the exact package versions, source filenames, three WOFF2 destinations, two renamed `LICENSE` destinations, and refusal to copy an unexpected version. Run the focused script test and confirm failure because the copy script is absent.
- [ ] **Step 4: Implement and run the font copy.** `scripts/copy-editorial-fonts.mjs` must copy `cormorant-garamond-latin-600-normal.woff2`, `manrope-latin-400-normal.woff2`, `manrope-latin-600-normal.woff2`, and each package's `LICENSE` from the pinned packages; fail if package versions differ from `5.3.0`. Run the script, then run its focused test and require PASS.
- [ ] **Step 5: Add licensed self-hosted fonts** with `next/font/local`, preload, `font-display: swap`, and system fallbacks. Put palette, typography, spacing, border, shadow, content-width, and interaction tokens in `tokens.css`.
- [ ] **Step 6: Split presentation CSS safely.** Keep resets/focus/shared behavior in `globals.css`; import Tailwind, tokens, then customer editorial styles in deterministic order. Preserve existing class names and avoid broad global element overrides.
- [ ] **Step 7: Run** `pnpm test:run tests/unit/scripts/copy-editorial-fonts.test.ts tests/components/layout/site-header.test.tsx tests/unit/seo/metadata.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`; inspect build output for missing font or asset paths.
- [ ] **Step 8: Commit** with `git add package.json pnpm-lock.yaml scripts/copy-editorial-fonts.mjs app/[locale]/layout.tsx app/globals.css app/styles public/fonts tests/unit/scripts/copy-editorial-fonts.test.ts tests/components/layout/site-header.test.tsx tests/unit/seo/metadata.test.ts && git commit -m "feat: add LocalLens editorial design foundations"`.

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

### Task 3.5: Partition customer editorial CSS for isolated route ownership

**Files:**
- Modify: `app/styles/customer-editorial.css`
- Create: `app/styles/editorial-base.css`
- Create: `app/styles/editorial-shell.css`
- Create: `app/styles/editorial-home.css`
- Create: `app/styles/editorial-tours.css`
- Create: `app/styles/editorial-journey.css`
- Create: `app/styles/editorial-booking.css`
- Modify only if needed for static ownership assertions: `tests/unit/styles/editorial-foundations.test.ts`

- [ ] **Step 1: Add a failing static ownership test** that requires `customer-editorial.css` to be an import-only aggregator in the exact order base → shell → home → tours → journey → booking, and requires all six route files to exist.
- [ ] **Step 2: Move existing CSS without semantic changes.** Preserve every rule byte-for-byte apart from relocation and import statements. Put resets/shared primitives in base, header/footer/locale shell rules in shell, and existing route-specific rules in the matching route file. Empty route files are allowed where a route has no existing rules yet.
- [ ] **Step 3: Freeze shared ownership after the gate.** After this commit, `customer-editorial.css`, `editorial-base.css`, and `editorial-shell.css` are immutable for Tasks 4–7. Route branches may modify only their assigned route stylesheet.
- [ ] **Step 4: Verify no presentation drift** with the focused layout/component/style tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build`; inspect the compiled pages for missing CSS imports.
- [ ] **Step 5: Request independent review.** The reviewer must compare the pre-partition and post-partition rule inventory, verify exact import order and scope, and reject any visual or behavioral change.
- [ ] **Step 6: Commit separately** with `git add app/styles/customer-editorial.css app/styles/editorial-base.css app/styles/editorial-shell.css app/styles/editorial-home.css app/styles/editorial-tours.css app/styles/editorial-journey.css app/styles/editorial-booking.css tests/unit/styles/editorial-foundations.test.ts && git commit -m "refactor: partition customer editorial styles"`. Record the reviewed clean HEAD as `PARALLEL_BASE_SHA`.

### Parallel execution gate for Tasks 4–7

- Create four isolated branches/worktrees from the exact reviewed `PARALLEL_BASE_SHA`: `codex/localens-design-home`, `codex/localens-design-tours`, `codex/localens-design-journey`, and `codex/localens-design-booking`.
- Each implementer follows TDD, self-reviews, runs its focused suite plus lint and typecheck, and commits only its allowlist. Implementers must not edit the aggregator, base/shell CSS, another route stylesheet, database/Supabase files, API/DTO contracts, itinerary/pricing domain logic, route definitions, storage keys, or payment behavior.
- Dispatch a fresh independent reviewer for each completed branch against `PARALLEL_BASE_SHA..branch HEAD`. Findings are fixed and re-reviewed only in the owning branch. Reject branches with out-of-allowlist edits or unresolved findings.
- Integrate reviewed commits into `codex/localens-design-restore` in order Home → Tours → Journey → Booking. Never overwrite a conflict; return it to the owning branch. After each integration group, run typecheck and that route's focused tests.
- The available runtime permits three worker agents alongside the controller. Start three isolated route workers immediately, then start the fourth as soon as the first slot opens; this preserves four independent owners without oversubscribing or sharing a worktree.

### Task 4: Restore the selected home-page composition

**Files:**
- Modify: `components/customer/customer-home.tsx`
- Modify: `app/[locale]/page.tsx`
- Modify: `lib/i18n/dictionaries.ts`
- Modify: `app/styles/editorial-home.css`
- Test: `tests/components/customer/customer-home.test.tsx`
- Test: `tests/unit/i18n/dictionaries.test.ts`
- Test: `tests/e2e/static-shell.spec.ts`

- [ ] **Step 1: Add failing tests** for the retained headline idea in EN/VI, both CTA destinations, the four supported experience categories, semantic section headings, and meaningful hero alt text.
- [ ] **Step 2: Run** `pnpm test:run tests/components/customer/customer-home.test.tsx tests/unit/i18n/dictionaries.test.ts` and observe the expected content/structure failures.
- [ ] **Step 3: Implement the editorial hero** with asymmetric copy/image composition, architectural inset, coordinate detail, and two real route CTAs. Implement “Four ways into the city” with the four supported preference groups; keep local-life catalog content without inventing a fifth preference value.
- [ ] **Step 4: Match the desktop reference** at `1487 x 1058`, then implement explicit tablet/mobile reflow. Do not use screenshot fragments, absolute positioning that overlaps localized copy, or decorative images as interactive controls.
- [ ] **Step 5: Run** focused unit/component tests and `pnpm test:e2e -- tests/e2e/static-shell.spec.ts`, then `pnpm lint` and `pnpm typecheck`.
- [ ] **Step 6: Commit** with `git add components/customer/customer-home.tsx app/[locale]/page.tsx lib/i18n/dictionaries.ts app/styles/editorial-home.css tests/components/customer/customer-home.test.tsx tests/unit/i18n/dictionaries.test.ts tests/e2e/static-shell.spec.ts && git commit -m "feat: restore LocalLens editorial home"`.

### Task 5: Carry the design system through fixed-tour discovery

**Files:**
- Modify: `components/customer/fixed-tours-grid.tsx`
- Modify: `components/customer/tour-catalog-explorer.tsx`
- Modify: `app/[locale]/tours/page.tsx`
- Modify: `app/styles/editorial-tours.css`
- Test: `tests/components/customer/tours-page.test.tsx`
- Test: `tests/components/customer/tour-catalog-explorer.test.tsx`

- [ ] **Step 1: Add failing behavior-preservation tests** for filters, tour links/actions, empty/error states, localized labels, and keyboard-operable controls; add structural expectations for the editorial page heading and cards.
- [ ] **Step 2: Run** `pnpm test:run tests/components/customer/tours-page.test.tsx tests/components/customer/tour-catalog-explorer.test.tsx` and confirm failures are presentation-contract failures rather than data changes.
- [ ] **Step 3: Restyle the catalog** using editorial spacing, restrained rules, strong hierarchy, and responsive cards while retaining all current data and actions.
- [ ] **Step 4: Verify** long EN/VI names, zero-result state, service-unavailable state, keyboard focus, and no horizontal page overflow at all three target viewports.
- [ ] **Step 5: Run** focused tests, `pnpm lint`, and `pnpm typecheck`.
- [ ] **Step 6: Commit** with `git add components/customer/fixed-tours-grid.tsx components/customer/tour-catalog-explorer.tsx app/[locale]/tours/page.tsx app/styles/editorial-tours.css tests/components/customer/tours-page.test.tsx tests/components/customer/tour-catalog-explorer.test.tsx && git commit -m "feat: apply editorial design to tour discovery"`.

### Task 6: Carry the design system through personalization and itinerary review

**Files:**
- Modify: `components/customer/personalization-form.tsx`
- Modify: `components/customer/planner-flow.tsx`
- Modify: `components/customer/custom-request-flow.tsx`
- Modify: `components/customer/itinerary-preview.tsx`
- Modify: `app/[locale]/planner/page.tsx`
- Modify: `app/[locale]/custom-request/page.tsx`
- Modify: `app/styles/editorial-journey.css`
- Test: `tests/components/customer/personalization-form.test.tsx`
- Test: `tests/components/customer/planner-flow.test.tsx`
- Test: `tests/components/customer/custom-request-flow.test.tsx`
- Test: `tests/components/customer/itinerary-preview.test.tsx`

- [ ] **Step 1: Strengthen tests before markup changes** for every existing field name, validation message/focus target, persisted session behavior, generate/refine/lock actions, proposal-only state, exact Task 10 vendor/menu/quantity/payment labels, and separated totals.
- [ ] **Step 2: Run** `pnpm test:run tests/components/customer/personalization-form.test.tsx tests/components/customer/planner-flow.test.tsx tests/components/customer/custom-request-flow.test.tsx tests/components/customer/itinerary-preview.test.tsx` and retain the passing behavior baseline; then add the smallest editorial-structure assertion and observe its expected failure.
- [ ] **Step 3: Restyle forms and timeline cards** without changing DTO wiring, calculation, event handlers, storage keys, or request lifecycle. Keep food-not-selected, pay-at-vendor, budget warning, and accessibility caveats explicit.
- [ ] **Step 4: Verify responsive behavior** for dense forms, long validation copy, itinerary rows, cost breakdowns, and action groups at all three target viewports.
- [ ] **Step 5: Run** the focused suite, `pnpm lint`, and `pnpm typecheck`.
- [ ] **Step 6: Commit** with `git add components/customer/personalization-form.tsx components/customer/planner-flow.tsx components/customer/custom-request-flow.tsx components/customer/itinerary-preview.tsx app/[locale]/planner/page.tsx app/[locale]/custom-request/page.tsx app/styles/editorial-journey.css tests/components/customer/personalization-form.test.tsx tests/components/customer/planner-flow.test.tsx tests/components/customer/custom-request-flow.test.tsx tests/components/customer/itinerary-preview.test.tsx && git commit -m "feat: apply editorial design to journey planning"`.

### Task 7: Carry the design system through booking

**Files:**
- Modify: `components/customer/booking-flow.tsx`
- Modify: `app/[locale]/booking/page.tsx`
- Modify: `app/styles/editorial-booking.css`
- Test: `tests/components/customer/booking-flow.test.tsx`

- [ ] **Step 1: Add failing structural assertions** while preserving tests for booking inputs, summary, validation, Stripe Mock disclosure, LocalLens-payable amount, and exclusion of pay-at-vendor estimates.
- [ ] **Step 2: Run** `pnpm test:run tests/components/customer/booking-flow.test.tsx` and confirm only the new editorial structure is missing.
- [ ] **Step 3: Restyle booking** as a clear editorial checkout/review flow without changing submission, amounts, currency, validation, or disclosure text.
- [ ] **Step 4: Verify** keyboard order, error announcement, long localized values, and narrow-screen summary/action behavior.
- [ ] **Step 5: Run** the focused test, `pnpm lint`, and `pnpm typecheck`.
- [ ] **Step 6: Commit** with `git add components/customer/booking-flow.tsx app/[locale]/booking/page.tsx app/styles/editorial-booking.css tests/components/customer/booking-flow.test.tsx && git commit -m "feat: apply editorial design to booking"`.

### Task 8: Add deterministic visual and accessibility acceptance coverage

**Files:**
- Create: `tests/e2e/customer-visual.spec.ts`
- Create: `design-qa.md`
- Create: `docs/design/qa/home-desktop-implementation.png`
- Create: `docs/design/qa/home-desktop-comparison.png`
- Create: `docs/design/qa/home-tablet.png`
- Create: `docs/design/qa/home-mobile.png`
- Modify: `playwright.config.ts`
- Modify: `README.md`
- Modify: `.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/progress.md`

- [ ] **Step 1: Add Playwright coverage** for `/en`, `/vi`, `/en/tours`, `/en/planner`, `/en/custom-request`, and `/en/booking`. Use stable local data, disable animation for captures, wait for fonts/images, and mask only genuinely nondeterministic content.
- [ ] **Step 2: Add viewport-specific assertions** for `1488 x 1059`, `768 x 1024`, and `390 x 844`, including no horizontal overflow, visible focus, route-correct CTAs, and full-page screenshots.
- [ ] **Step 3: Capture deterministic evidence.** Run `pnpm test:e2e -- tests/e2e/customer-visual.spec.ts`; save the accepted desktop, tablet, and mobile home captures to the listed `docs/design/qa/` paths. Reject loading, cropped, wrong-state, or wrong-viewport images. Preserve the byte-identical `1487 x 1058` selected reference; for the mandated `1488 x 1059` comparison, create documented QA-only derivatives of both reference and implementation on the same `1488 x 1059` canvas using a deterministic one-pixel right/bottom extension, then run `node scripts/process-editorial-assets.mjs compare` on those equal-size derivatives. Never present the normalized derivative as the native source. A passing snapshot alone is not visual approval.
- [ ] **Step 4: Perform accessibility smoke checks** for heading order, landmarks, labels, keyboard-only flow, focus visibility, meaningful/empty alt text, reduced motion, text/background contrast, text zoom, and practical mobile targets. Do not claim full WCAG compliance from screenshots alone.
- [ ] **Step 5: Write the blocking Product Design report.** `design-qa.md` must name the source and implementation paths, viewport/state/density, full-view comparison, focused regions or why none are needed, and explicit verdicts for fonts/typography, spacing/layout, colors/tokens, image quality, copy/content, responsiveness, interactions, and accessibility. Record each P0/P1/P2 finding, fix, and same-state post-fix comparison; finish with exactly `final result: passed` only when no actionable P0/P1/P2 remains, otherwise `final result: blocked`.
- [ ] **Step 6: Run the complete gate:** `pnpm check`, followed by `pnpm test:e2e`. Record exact outputs. Keep database runtime verification status separate; this presentation plan does not convert static database checks into runtime proof.
- [ ] **Step 7: Review scope** with `git diff <TASK10_SHA>...HEAD --stat` and `git diff <TASK10_SHA>...HEAD -- supabase lib/domain`. The second command must show no business/domain/database edits; investigate any output before completion.
- [ ] **Step 8: Commit** with `git add tests/e2e/customer-visual.spec.ts playwright.config.ts README.md design-qa.md docs/design/qa .superpowers/sdd/2026-08-30-localens-editorial-design-restoration/progress.md && git commit -m "test: verify LocalLens editorial customer experience"`.

### Task 9: Review, integrate, and release the paused food tasks

**Files:**
- Modify only if needed for verified documentation: `.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/progress.md`

- [ ] **Step 1: Invoke `superpowers:requesting-code-review`.** Dispatch an independent reviewer rather than letting the controller self-approve. Review the full diff against this spec, with special attention to route/data/price/food compatibility, `design-qa.md`, and responsive visual evidence.
- [ ] **Step 2: Resolve findings using `superpowers:receiving-code-review`** and rerun every affected focused test plus the full gate.
- [ ] **Step 3: Invoke `superpowers:verification-before-completion`.** Do not claim success from earlier or partial output; capture fresh `pnpm check` and `pnpm test:e2e` results.
- [ ] **Step 4: Invoke `superpowers:finishing-a-development-branch`** and present the reviewed integration options. Do not merge, rebase, delete a worktree, or resume another task without the user’s chosen option.
- [ ] **Step 5: After integration only, notify the food-vendor/pricing task** to resume Tasks 11 and 12 from the integrated HEAD. Do not continue from the stale pre-design checkout.

## Rollback Boundary

Each task is independently committed. If a presentation change regresses behavior, revert only the corresponding design commit; never reset or discard the Task 10 baseline. Assets/tokens, shell, home, tours, planner, and booking remain separable review units.
