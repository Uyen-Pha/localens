# Public thesis demo visual QA — Task 14 candidate

## Status

This folder contains the complete current-working-tree visual evidence required
for Task 14. The files have been inspected as matched reference/implemented
pairs. Final acceptance still depends on attaching them to the product commit
SHA and an accepted GitHub Actions run.

| Field | Current value |
| --- | --- |
| Capture browser | Google Chrome `152.0.7977.65` |
| Fixture capture origin | `http://127.0.0.1:3414` |
| Runtime capture origin | Runner-owned random loopback ports |
| Captured UI language | English (`en`) matched matrix plus Vietnamese (`vi`) responsive visual spot-check |
| Reference images present | **18/18 raw images** |
| Implemented images present | **18/18 raw images** |
| Required matched comparisons | **15/15** |
| Vietnamese responsive screenshots | **3/3** |
| Current visual verdict | **PASS — no P0, P1, or P2 visual discrepancy found** |
| Final tested SHA | `<FINAL_SHA_PENDING>` |
| Final CI run | `<FINAL_CI_RUN_URL_PENDING>` |

## Viewports

| Viewport | Size |
| --- | ---: |
| Desktop | `1440 x 1024` |
| Tablet | `768 x 1024` |
| Mobile | `390 x 844` |

The fixture capture reports record `clientWidth === scrollWidth` for all 12
reported captures in each raw phase. Runtime AI-success and deterministic-
fallback evidence adds six PNGs per phase, so each phase has 18 PNGs while the
required comparison matrix has 15 state/viewport pairs.

Vietnamese layout was additionally inspected from the final fixture Chrome
suite at [desktop 1488 x 1059](./locale-vi/desktop-1488x1059-home-vi.png),
[tablet 768 x 1024](./locale-vi/tablet-768x1024-home-vi.png), and
[mobile 390 x 844](./locale-vi/mobile-390x844-home-vi.png). These are current
implemented-state screenshots, not extra matched reference pairs.

## Matched comparison matrix

| Required state | Desktop | Tablet | Mobile | Result |
| --- | --- | --- | --- | --- |
| Homepage preference handoff | [Compare](./comparison/desktop-1440x1024-homepage-handoff.png) | [Compare](./comparison/tablet-768x1024-homepage-handoff.png) | [Compare](./comparison/mobile-390x844-homepage-handoff.png) | PASS |
| Planner AI success | [Compare](./comparison/planner-ai-success-desktop.png) | [Compare](./comparison/planner-ai-success-tablet.png) | [Compare](./comparison/planner-ai-success-mobile.png) | PASS |
| Runtime deterministic fallback | [Compare](./comparison/runtime-planner-fallback-desktop.png) | [Compare](./comparison/runtime-planner-fallback-tablet.png) | [Compare](./comparison/runtime-planner-fallback-mobile.png) | PASS |
| Account simulated payment | [Compare](./comparison/desktop-1440x1024-account-payment.png) | [Compare](./comparison/tablet-768x1024-account-payment.png) | [Compare](./comparison/mobile-390x844-account-payment.png) | PASS |
| Simulated-payment error | [Compare](./comparison/desktop-1440x1024-payment-error.png) | [Compare](./comparison/tablet-768x1024-payment-error.png) | [Compare](./comparison/mobile-390x844-payment-error.png) | PASS |

The corresponding individual screenshots are retained under
[`reference/`](./reference/) and [`implemented/`](./implemented/). Each raw
phase also includes three fixture-planner fallback screenshots; those are
useful supporting evidence but are not extra required comparison states.

## Inspection result

All 15 comparison sheets were inspected at equal state and viewport. The
implemented screens preserve the source hierarchy, typography, spacing,
borders, responsive stacking, content visibility, and primary actions. No
cropped content, horizontal overflow, missing disclosure, or broken desktop,
tablet, or mobile layout was observed.

The Vietnamese homepage and personalization flow was also inspected at all
three responsive sizes. Labels, navigation, disclosures, form controls, cards,
and responsive stacking remain readable without clipping or horizontal
overflow. Runtime Auth separately exercises a Vietnamese guide session, while
the fixture and runtime suites assert bilingual product copy and role bounds.

Expected dynamic values differ between some reference and implemented runs:

- runtime operation UUIDs in AI-success and fallback states;
- the simulated hold countdown in the payment-error state.

These are per-run data changes, not visual or behavioral regressions.

The raw fixture capture reports retain one historical desktop payment-error
console message containing HTTP 404 wording without a resource URL. The final
interactive Chrome fixture suite subsequently passed **34/34**, including its
browser-diagnostic assertions. The historical JSON is retained rather than
rewritten because it records what the original capture observed.

Screenshot comparison does not by itself establish keyboard, semantic, or
WCAG conformance. The Chrome browser gate separately covers keyboard order,
visible focus, overflow, control sizing, core journey behavior, and browser
diagnostics.

## Truthful release boundary

This evidence covers the fixture thesis demo and an isolated local Supabase
runtime using a loopback fake Gemini-compatible provider. Payment is simulated:
no card details are collected, no processor is contacted, and no real charge
occurs. It is not evidence of a remote Supabase project, live Gemini traffic,
staging, or production deployment.
