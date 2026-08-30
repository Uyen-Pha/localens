# LocalLens editorial customer QA

## Scope and evidence

- Selected native source: `docs/design/references/localens-editorial-home-selected.png` (`1487 × 1058`, SHA-256 `BAE040B763524C6232632A12D96855A0B5590154F6CEB9C72D2D2EB743C98BF2`). The native source was not modified.
- Desktop implementation capture: `docs/design/qa/home-desktop-implementation.png` (`1488 × 1059`).
- Desktop full-view comparison: `docs/design/qa/home-desktop-comparison.png` (`2976 × 1059`, source and implementation side by side).
- Tablet capture: `docs/design/qa/home-tablet.png` (`768 × 1024`).
- Mobile capture: `docs/design/qa/home-mobile.png` (`390 × 844`).
- QA-only equal-size derivatives used by `node scripts/process-editorial-assets.mjs compare`: `.superpowers/sdd/2026-08-30-localens-editorial-design-restoration/task-8-qa/reference-1488x1059.png` and `implementation-1488x1059.png`. Each was made on a `1488 × 1059` canvas by cropping the implementation capture to the native source size where needed, then extending the right and bottom edges by one pixel with the page-paper color. These derivatives are not the native source.
- Browser/state: Playwright Chromium, DPR 1, fresh localStorage/sessionStorage per page, reduced-motion media emulation, CSS animation/transition suppression for captures, local fonts and images awaited, no external data.
- Route states: `/en/` and `/vi/` home, `/en/tours/` demo catalog, `/en/planner/` default demo proposal without a handoff, `/en/custom-request/` missing-handoff boundary, and `/en/booking/` with the allowlisted demo departure and `partySize=1`.
- Full-page route evidence is also written to ignored `test-results/customer-visual/` for every route and viewport. The comparison is a visual review of the whole required desktop viewport, with focused inspection of the header, hero, CTAs, inset, and discovery row; no additional crop was needed to establish the findings below.

## Surface verdicts

| Surface | Verdict | Evidence |
| --- | --- | --- |
| Fonts and typography | Partial match | Display/body pairing and general editorial hierarchy are present; the implementation’s hero title/CTA scale and discovery text position do not match the selected source at the required desktop viewport. |
| Spacing and layout | Blocked | Hero CTA buttons stack in the implementation while the selected source keeps them inline; discovery labels fall below the desktop viewport instead of appearing in the selected above-fold composition. |
| Colors and tokens | Partial match | Paper, ink, vermilion, indigo, and ochre editorial palette are coherent; responsive ochre category text fails the measured normal-text contrast threshold below. |
| Image quality | Blocked | Assets decode and load cleanly, but the hero and inset depict different scenes/crops from the selected source. |
| Copy and content | Partial match | Core LocalLens copy is localized and readable; the selected source’s `Journal` navigation item and stamp detail are absent. |
| Responsiveness | Pass with open visual findings | No horizontal overflow at 1488×1059, 768×1024, or 390×844; tablet/mobile stack cleanly, but the desktop/source fidelity findings remain open. |
| Interactions | Pass | Route-correct home/tours/planner/custom-request/booking links, keyboard skip-link focus, and deterministic demo states were exercised. |
| Accessibility | Blocked | Heading order, landmarks, form labels, image alt presence, visible focus, overflow, and browser diagnostics passed; tablet/mobile `Craft villages` text/link measured 3.70:1 against a 4.5:1 normal-text target. Text zoom and reduced-motion smoke checks are present in the suite, but this contrast finding remains actionable. |

## Findings and ownership

| ID / priority | Finding and evidence | Owner / required fix | Same-state post-fix comparison |
| --- | --- | --- | --- |
| VIS-01 / P1 | The key hero photograph and architecture inset in `home-desktop-comparison.png` show materially different subjects and crops from the selected source. | Product Design + editorial asset owner. If the selected source is normative, replace/re-crop only the approved editorial assets and rerun the same 1488×1059 comparison. | No fix was made in Task 8; finding remains open, so no post-fix comparison exists. |
| VIS-02 / P1 | At 1488×1059 the implementation stacks “Discover Saigon tours” and “Design a private journey” vertically, while the selected source presents both CTAs on one row. | Customer-home editorial layout owner (`app/styles/editorial-home.css`). Adjust the desktop hero content/CTA geometry, then rerun the same state and viewport. | No fix was made in Task 8; finding remains open, so no post-fix comparison exists. |
| VIS-03 / P1 | The selected source shows the discovery category labels and rules fully within the required desktop viewport; the implementation viewport ends while the category cards are still at their icon/title region. | Customer-home editorial layout owner (`app/styles/editorial-home.css`). Rebalance first-fold hero/discovery heights and card alignment, then rerun comparison. | No fix was made in Task 8; finding remains open, so no post-fix comparison exists. |
| A11Y-01 / P2 | Playwright measured `Craft villages` heading/link at 3.70:1 on tablet and mobile, below the 4.5:1 normal-text target. The focused suite consequently fails these accessibility assertions on those viewports. | Customer-home color/token owner (`app/styles/editorial-home.css` / editorial color token). Darken ochre or otherwise increase text contrast without changing meaning; rerun tablet/mobile smoke checks. | No fix was made in Task 8; finding remains open, so no post-fix comparison exists. |
| CONTENT-01 / P2 | The selected header contains `Journal`; the implementation header does not. The selected stamp also includes a small secondary line absent from the implementation. | Product Design + shell/content owner. Confirm whether these source details are in scope; if yes, add localized copy/navigation and rerun the source comparison. | No fix was made in Task 8; finding remains open, so no post-fix comparison exists. |

No P0 findings were observed. The P1/P2 findings are actionable and prevent approval; route/CSS/product code was intentionally not changed within this QA task.

## Verification record

- Focused QA run before the contrast assertion was added: `pnpm exec playwright test tests/e2e/customer-visual.spec.ts --workers=1` — `6 passed`.
- Current focused QA run with the contrast smoke assertion: `pnpm exec playwright test tests/e2e/customer-visual.spec.ts --workers=1` — `2 passed`, `4 failed` (tablet and mobile accessibility smoke checks fail on A11Y-01; desktop checks pass). This is an expected blocking result, not an approval claim.
- The original brief command with pnpm’s extra `--` forwarding also ran `static-shell.spec.ts` and exposed transient Next dev compilation JSON overlays under parallel workers; the config is now serial (`fullyParallel: false`, `workers: 1`) for deterministic local evidence.
- `pnpm check`: exit 1. `eslint . --max-warnings=0` and `tsc --noEmit` completed; Vitest reported `61 passed` files / `723 passed` tests and `2 failed` files / `2 failed` tests. Existing failures are `tests/unit/supabase/artifacts.test.ts` and `tests/unit/supabase/rls-matrix.test.ts`; the checker reports `data-access-matrix.md: generated Markdown drift; run node scripts/generate-data-access-matrix.mjs`. These are outside the Task 8 allowlist and were not changed.
- Independent `pnpm build`: exit 0; Next compiled, typechecked, and generated all 14 static pages.
- Full `pnpm test:e2e`: exit 1; `5 passed`, `4 failed` in `36.0s`. The three static-shell tests and desktop customer checks passed. Four tablet/mobile customer checks failed only on the measured `Craft villages` contrast assertion (A11Y-01), preserving the blocking result.
- Scope review against `TASK10_SHA=cd73aaca1e4b37b8f436c0a251e369ee9085050d`: `git diff cd73aaca1e4b37b8f436c0a251e369ee9085050d...HEAD --stat` lists the pre-existing editorial restoration history plus the current QA files; `git diff cd73aaca1e4b37b8f436c0a251e369ee9085050d...HEAD -- supabase lib/domain` produced no output. Task 8 does not modify business/domain/database files.

final result: blocked
