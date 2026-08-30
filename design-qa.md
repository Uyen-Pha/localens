# LocalLens editorial customer QA

## Scope and evidence

- Selected native source: `docs/design/references/localens-editorial-home-selected.png` (`1487 × 1058`, SHA-256 `BAE040B763524C6232632A12D96855A0B5590154F6CEB9C72D2D2EB743C98BF2`). The native source was preserved byte-identically.
- Desktop implementation capture: `docs/design/qa/home-desktop-implementation.png` (`1488 × 1059`).
- Desktop full-view comparison: `docs/design/qa/home-desktop-comparison.png` (`2976 × 1059`, source and implementation side by side).
- Tablet capture: `docs/design/qa/home-tablet.png` (`768 × 1024`).
- Mobile capture: `docs/design/qa/home-mobile.png` (`390 × 844`).
- QA-only equal-size derivatives used by `node scripts/process-editorial-assets.mjs compare`: `.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/task-8-qa/reference-1488x1059.png` and `implementation-1488x1059.png`. Each derives a `1488 × 1059` canvas by retaining the top-left `1487 × 1058` pixels and extending the right and bottom edges by one pixel with the page-paper color (`#FAF4EB`). These derivatives are not the native source.
- Browser/state: Playwright Chromium, DPR 1, fresh localStorage/sessionStorage per page, reduced-motion media emulation, CSS animation/transition suppression for captures, local fonts and images awaited, no external data.
- Route states: `/en/` and `/vi/` home, `/en/tours/` demo catalog, `/en/planner/` default demo proposal without a handoff, `/en/custom-request/` missing-handoff boundary, and `/en/booking/` with the allowlisted demo departure and `partySize=1`.
- Full-page route evidence is written to ignored `test-results/customer-visual/` for every route and viewport. The combined desktop comparison is the primary whole-viewport evidence; focused inspection covered the header/navigation, hero title and mark, CTA group, hero/inset imagery, coordinates, and discovery row. Tablet and mobile captures were inspected separately for reflow, focus, contrast, and clipping.

## Surface verdicts

| Surface | Verdict | Evidence |
| --- | --- | --- |
| Fonts and typography | Pass | Cormorant display and Manrope body pairing, hierarchy, wrapping, and EN/VI text remain coherent at desktop, tablet, and mobile sizes. The revised hero scale and discovery placement now preserve the source hierarchy without clipping. |
| Spacing and layout | Pass | The desktop CTAs are inline at `1488 × 1059`, discovery headings/rules are visible within the first viewport, and tablet/mobile reflow keeps the content ordered and usable. |
| Colors and visual tokens | Pass | Paper, ink, vermilion, indigo, and accessible ochre tokens remain coherent; the previous `Craft villages` contrast failure is cleared by the revised token and fresh browser assertions. |
| Image quality and asset fidelity | Pass | The hero and inset now use the approved artisan and Saigon architecture imagery with clean decoding, matching subject/art direction, correct crop treatment, and verified local alt text. |
| Copy and content | Pass with approved omissions | Core customer copy is localized and readable. The selected `Journal` navigation item is intentionally omitted because no real Journal route exists, and the tiny secondary stamp line is intentionally omitted because the approved product contract retains only the `SAI/GON` mark and coordinates. These are ledger-approved, non-actionable deviations. |
| Responsiveness | Pass | No horizontal overflow at `1488 × 1059`, `768 × 1024`, or `390 × 844`; desktop first-fold composition is restored and tablet/mobile stacks remain legible and unclipped in the inspected captures. |
| Interactions | Pass | Route-correct home/tours/planner/custom-request/booking links, keyboard skip-link focus, deterministic demo states, and localized navigation were exercised. |
| Accessibility | Pass (smoke scope) | Heading order, landmarks, form labels, meaningful/empty alt text, visible focus, overflow, text zoom, reduced motion, contrast, and browser diagnostics pass in the fresh focused suite. This is an accessibility smoke result, not a full WCAG conformance claim. |

## Comparison history and resolution

| ID / priority | Original finding | Fix and same-state post-fix evidence | Status |
| --- | --- | --- | --- |
| VIS-01 / P1 | The original hero photograph and architecture inset showed materially different subjects and crops from the selected source. | Asset remediation `5f5d739` replaced the approved hero/inset assets and `4f19637` aligned EN/VI alt text. The regenerated equal-size comparison shows the artisan and architecture subjects in the intended editorial treatment; processor check and focused asset/i18n tests pass. | Resolved; no actionable P0/P1/P2 remains. |
| VIS-02 / P1 | At `1488 × 1059`, the original implementation stacked the two hero CTAs while the source kept them inline. | Home layout fix `6bdcb03` constrains the desktop action row. The fresh `home-desktop-implementation.png` and regenerated comparison show both CTAs aligned on one row in the same viewport/state. | Resolved; no actionable P0/P1/P2 remains. |
| VIS-03 / P1 | The original desktop viewport ended before the discovery category labels and rules were visible. | Home layout fix `6bdcb03` rebalanced first-fold geometry. The fresh desktop capture and comparison show all four category headings and rules within the required viewport. | Resolved; no actionable P0/P1/P2 remains. |
| A11Y-01 / P2 | The original tablet/mobile `Craft villages` text measured `3.70:1`, below the `4.5:1` normal-text target. | Home color fix `6bdcb03` uses the accessible ochre token. Fresh focused Playwright checks at all three viewports report no contrast violations. | Resolved; no actionable P0/P1/P2 remains. |
| CONTENT-01 / P2 | The source contains `Journal` and a tiny secondary stamp line absent from the implementation. | The ledger explicitly approves both omissions: no fake/unimplemented Journal route and no unreadable decorative stamp copy. The retained `SAI/GON` mark, coordinates, and real route navigation are the product truth. | Accepted intentional omissions; not actionable. |

## Deterministic visual review

- Full-view comparison evidence is the regenerated `2976 × 1059` side-by-side PNG, with the native source represented only by its documented one-pixel right/bottom QA derivative. The derivative is not presented as the source of truth.
- Focused review found no remaining P0/P1/P2 mismatch in the header, hero title/mark, CTA geometry, imagery, inset, coordinates, discovery row, or responsive reflow. Minor responsive composition differences are expected adaptations, not actionable fidelity regressions.

## Verification record

- `node scripts/process-editorial-assets.mjs check`: PASS; all 6 editorial assets decode at their exact dimensions and satisfy size/alpha bounds.
- `node scripts/process-editorial-assets.mjs compare .superpowers/sdd/2026-08-30-localens-editorial-design-restoration/task-8-qa/reference-1488x1059.png .superpowers/sdd/2026-08-30-localens-editorial-design-restoration/task-8-qa/implementation-1488x1059.png docs/design/qa/home-desktop-comparison.png`: PASS; output is `2976 × 1059`.
- Focused QA: `pnpm exec playwright test tests/e2e/customer-visual.spec.ts --workers=1`: PASS; `6 passed (40.0s)`. The run covered all six customer routes at each of the required desktop/tablet/mobile viewports, route assertions, no overflow, focus, labels, alt text, reduced motion, text zoom, contrast, console/page diagnostics, and fresh home captures.
- `pnpm check`: PASS. ESLint and `tsc --noEmit` completed successfully; Vitest reported `63 passed` files / `726 passed` tests; the production build generated all 14 static/SSG pages.
- Full `pnpm test:e2e`: PASS; `9 passed (1.1m)`, including all six visual/customer checks and all three localized static-shell checks.
- Independent Home review and asset re-review both returned PASS with zero remaining Critical/Important/Minor findings before integration.
- Database runtime verification remains a separate gate; no runtime Supabase claim is made by this presentation QA.

final result: passed
