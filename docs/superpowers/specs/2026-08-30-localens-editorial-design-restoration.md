# LocalLens Editorial Design Restoration Specification

**Date:** 2026-08-30
**Status:** Approved direction; implementation starts only after the Task 10 handoff gate
**Selected reference:** `C:\Users\Admin\.codex\generated_images\01a024a9-db76-7981-82da-d2abc4e6f409\exec-8e7be86b-a264-4054-8b0a-9992eb684e24.png`

## Goal

Restore the customer-facing LocalLens experience to the previously selected bright editorial concept while preserving the current routes, data contracts, food-selection work, planner behavior, quote rules, and booking/payment semantics.

The visual change applies to the complete customer flow:

- Home and discovery
- Fixed-tour catalog
- Personalized-tour planner
- Custom-request flow
- Itinerary review and totals
- Booking flow

## Non-goals

- No database, Supabase migration, RLS, RPC, or seed changes.
- No changes to itinerary generation, price calculation, quote snapshots, payment boundaries, or food-selection rules.
- No new Journal route or editorial CMS.
- No admin catalog implementation; food-plan Tasks 11 and 12 resume only after this visual branch is integrated.
- No renaming of route paths, form field names, DTO fields, storage keys, or existing event-handler contracts.

## Visual Source of Truth

The selected reference image is the source of truth for desktop art direction. Before implementation, copy it unchanged to:

`docs/design/references/localens-editorial-home-selected.png`

The implementation must compare the rendered home page and the reference at the same `1488 x 1059` viewport. The source image is a design reference, not a crop source for production UI.

### Required visual character

- Warm ivory editorial surface, deep ink text, and vermilion accent.
- Large high-contrast serif display type paired with a clean sans-serif UI face.
- Airy asymmetric hero composition with an artisan-led Saigon image, architectural inset, vertical coordinate detail, and restrained rules/borders.
- Compact, editorial navigation and clearly separated primary/secondary calls to action.
- “Four ways into the city” category section for Street food, History, Craft villages, and Traditional markets.
- Photography and illustrations must feel documentary, local, calm, and culturally specific—not generic travel stock art.

## Content and Route Mapping

| Reference element | LocalLens behavior |
| --- | --- |
| Experiences | Link to `/{locale}/tours` |
| Private journeys | Link to `/{locale}/planner` |
| Our city | Link to the four-experience section on `/{locale}` |
| Journal | Omit; no empty or fake route |
| EN / VI | Preserve the existing locale switcher and locale-prefixed routes |
| Sign in | Preserve the current disabled/unavailable authentication state until auth exists |
| Explore experiences | Link to `/{locale}/tours` |
| Design a private journey | Link to `/{locale}/planner` |
| Four ways into the city | Use the four supported preference groups; keep local-life content available in the catalog without creating a fifth preference value |

English and Vietnamese copy must express the same meaning. The selected headline idea—“The city is more than its landmarks”—is retained and translated naturally rather than literally where needed.

## Design System Contract

### Typography

- Self-host licensed WOFF2 files; do not depend on a runtime font CDN.
- Display: Cormorant Garamond Semibold.
- UI/body: Manrope Regular and Semibold.
- Include the corresponding OFL license text and configure fonts with `next/font/local`, preload, and system fallbacks.
- Font loading failure must leave readable fallback typography without layout-breaking invisible text.

### CSS organization

- Keep existing class names where practical to reduce regression risk.
- Move reusable color, type, spacing, radius, and shadow tokens to `app/styles/tokens.css`.
- Put customer editorial presentation rules in `app/styles/customer-editorial.css`.
- Keep global reset, focus, and shared behavior in `app/globals.css`, with deterministic import order.
- Avoid `!important` unless a documented third-party conflict makes it unavoidable.

### Production assets

Generate clean original assets inspired by the composition; do not crop the mockup:

| Asset | File | Minimum source size | Requirement |
| --- | --- | --- | --- |
| Hero artisan scene | `public/images/editorial/saigon-artisan-hero.webp` | 1600 x 1200 | Documentary horizontal crop with safe text-free edges |
| Architecture inset | `public/images/editorial/saigon-post-office-inset.webp` | 720 x 960 | Vertical architectural detail |
| Street-food mark | `public/images/editorial/category-street-food.webp` | 256 x 256 | Transparent background, one-color editorial illustration |
| History mark | `public/images/editorial/category-history.webp` | 256 x 256 | Transparent background, one-color editorial illustration |
| Craft-village mark | `public/images/editorial/category-craft.webp` | 256 x 256 | Transparent background, one-color editorial illustration |
| Traditional-market mark | `public/images/editorial/category-market.webp` | 256 x 256 | Transparent background, one-color editorial illustration |

Record generation prompts, intended crops, alt-text decisions, and asset provenance in `docs/design/editorial-assets.md`. Decorative category marks use empty alt text; meaningful hero images use localized concise alt text. Avoid emoji and newly hand-drawn SVG icons.

## Compatibility Contract

The restoration may change presentation markup only when tests show the behavior remains equivalent. It must preserve:

- All locale-prefixed routes and navigation semantics.
- Existing component props unless an additive presentation prop is necessary.
- Personalization form names, validation, focus/error behavior, and session persistence.
- Planner refine/lock behavior and proposal-only disclosure.
- Task 10’s exact vendor/menu/quantity/payment-mode details and separated totals.
- Booking details, Stripe Mock disclosure, LocalLens-payable calculation, and pay-at-vendor exclusion.
- Semantic headings, labels, lists, buttons, keyboard order, focus visibility, and reduced-motion behavior.

The design branch must not modify `supabase/**`, domain pricing/itinerary modules, or the Task 10 DTO/data wiring unless a failing presentation test proves an unavoidable compatibility issue. Any such exception requires a separate review before editing.

## Responsive Contract

- Desktop reference viewport: `1488 x 1059`.
- Tablet validation viewport: `768 x 1024`.
- Mobile validation viewport: `390 x 844`.
- At narrow widths, the hero becomes a logical single-column reading order; images do not cover copy or CTAs.
- Navigation, filters, cards, timelines, totals, forms, and booking controls must remain usable without horizontal page scrolling.
- Interactive targets remain at least 44 CSS pixels where the existing accessibility contract requires it.

## Safe Handoff and Integration

1. The food-vendor/pricing worker finishes and commits Task 10 only.
2. It stops before Task 11, reports the Task 10 commit SHA, and confirms no tracked changes remain from Task 10.
3. A separate docs-only handoff commit records this spec, its implementation plan, and the sequencing gate; it must contain no Task 10 code.
4. The visual restoration starts from that docs-handoff commit in a separate worktree/branch named `codex/localens-design-restore`, while the reported Task 10 SHA remains the behavior baseline.
5. Tasks 11 and 12 remain paused while the shared customer presentation layer is being restored.
6. After visual restoration passes the quality gate and is integrated, food-plan Tasks 11 and 12 resume from the new integrated HEAD.

Untracked local helper files are not included in commits unless a task explicitly owns them.

## Acceptance Criteria

- The home page visibly matches the selected editorial direction at the reference viewport, including hierarchy, palette, typography, composition, navigation, calls to action, and four-category section.
- All customer routes use one coherent design system and preserve their current behavior.
- EN and VI routes render equivalent content with no missing dictionary keys.
- Task 10 food details and separated totals remain visible and semantically correct.
- Component, unit, E2E, accessibility smoke, typecheck, lint, build, and deterministic screenshot checks pass.
- The final review contains same-viewport reference/render comparisons, mobile and tablet evidence, changed-file scope, and the verified command outputs.
