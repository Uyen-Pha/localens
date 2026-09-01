# LocalLens green customer design QA

## Scope and evidence level

- Review target: Task 5 working tree based on `bd65520` (`codex/localens-mvp`).
- Product scope: `docs/superpowers/specs/2026-08-31-localens-green-production-aligned-demo.md`.
- Evidence label: `demo-wired` and `contract-implemented` only. This report does not claim production authentication, live AI, live Stripe, Supabase runtime verification, sellable catalog data, deployment, or production readiness.
- Locked visual source: `docs/design/references/localens-green-home-selected.png`, decoded `1487 x 1058`, SHA-256 `4CE3DA5E08635D2B7F2F2BF3417B34878A029B0D8547964D5E7518082D75447D`.

## Accepted and superseded evidence

The prior in-app captures are retained only as pre-fix evidence:

- `docs/design/qa/green-home-desktop-viewport.jpg`: `1473 x 1049`, not the required `1488 x 1059`.
- `docs/design/qa/green-home-tablet-viewport.jpg`: `753 x 1004`, not the required `768 x 1024`.
- `docs/design/qa/green-home-mobile-viewport.jpg`: `375 x 811`, not the required `390 x 844`.
- `docs/design/qa/green-home-render-1488x1059.png` and `green-home-desktop-comparison.png`: invalid as final fidelity evidence because the pre-fix native implementation capture was expanded by multiple pixels before comparison.

No pre-fix capture is accepted as final same-viewport evidence. Fresh native captures and a new side-by-side comparison must be produced by the authorized Playwright run without resizing the implementation image.

## Review findings and implemented fixes

| Priority | Finding | Implemented resolution | Verification state |
| --- | --- | --- | --- |
| P1 | Brand, four-line heading, skyline position, map proportions and separate stop cards diverged from the locked source. | `editorial-shell.css` now uses the green sans-serif brand and green sign-in action. `editorial-home-green.css` uses a two-line-scale heading, upper skyline, 41/59 hero split, full map panel and one unified stop panel. `saigon-map-route.webp` adds the real bitmap route overlay. | Unit/style/build gates pass; fresh exact-viewport visual comparison pending. |
| P1 | Portal coral text measured only `3.12:1` on white and `2.81:1` on coral-soft. | Added `--portal-coral-text: #b23d2d`; small text and secondary controls use it while bright coral remains decorative. Danger actions also use the darker fill. | Contrast invariant test passes at `>= 4.5:1`; browser contrast smoke pending. |
| P1 | Prior comparison normalized a smaller implementation capture to the target canvas. | Marked every prior comparison artifact as superseded rather than presenting it as approval evidence. | Fresh exact-size capture pending authorization. |
| P2 | Keyboard coverage stopped after the skip link. | Customer E2E now traverses every visible focusable element on every customer route; portal E2E traverses each role state, verifies focus treatment, in-bounds focus and an accessible name. | Static lint/typecheck pass; runtime execution pending authorization. |
| P2 | Root overflow masking and three narrow mobile stop columns could hide clipped content. | Removed root overflow masking. Mobile stops reflow to one column with visible descriptions. E2E now checks semantic element bounds at normal size and 125% text zoom. | Style invariant and component tests pass; runtime screenshots pending. |
| P2 | Generic `ERR_FAILED` and 404 console messages were silently ignored. | Customer, portal and integrated-flow diagnostics now record every console error and every HTTP response `>= 400`. | Static lint/typecheck pass; clean runtime diagnostics pending. |
| P2 | Home promised an AI itinerary without disclosing the deterministic demo boundary. | EN/VI copy now says “simulated AI preview” / “bản xem trước AI mô phỏng” and describes approved demo places. | Dictionary/component regression test passes. |

## Interaction and accessibility coverage now present

- `tests/e2e/customer-visual.spec.ts`: EN/VI Home plus Tours, Planner, Custom Request and Booking at `1488 x 1059`, `768 x 1024`, and `390 x 844`; exact viewport capture, full-page capture, heading/landmark/label/alt checks, contrast, full keyboard order, reduced motion, text zoom, element bounds and overflow.
- `tests/e2e/portal-demo-flow.spec.ts`: customer cancellation -> admin decision -> assigned-guide notice; one completed-tour review; EN/VI direct entry; wrong-role denial; fixture reset; portal contrast and complete keyboard traversal.
- `tests/e2e/integrated-demo-flow.spec.ts`: fixed tour -> booking -> Stripe Test simulation -> admin assignment -> guide visibility; personalized preview/refine -> request -> admin approval/quote -> customer mock checkout; complete wrong-role matrix.
- `tests/e2e/food-itinerary.spec.ts`: approved, research-only, mixed, food-removal and museum-only itinerary paths while preserving LocalLens-payable versus pay-at-vendor boundaries.

The old `demo-final.stderr.log` hydration mismatch is pre-fix diagnostic evidence and contradicts any clean-runtime claim. It is not treated as superseded until a fresh strict Playwright run produces zero console errors, page errors and failed responses.

## Fresh non-Playwright gates

| Gate | Result | Evidence or exact blocker |
| --- | --- | --- |
| `git diff --check` | PASS | No whitespace error; Git emits only LF/CRLF notices. |
| `pnpm lint` | PASS | `eslint . --max-warnings=0`. |
| TypeScript | PASS | `node_modules/.bin/tsc.cmd --noEmit --incremental false`. |
| Focused style/customer/i18n/layout | PASS | `4` files, `26` tests. |
| Full Vitest | PASS | `74` files, `876` tests using `--no-file-parallelism --testTimeout=30000`. |
| `pnpm build` | PASS | Next.js compiled and statically generated `24/24` routes. Protected `next-env.d.ts` and `tsconfig.tsbuildinfo` were restored to their original SHA-256 values. |
| `pnpm db:static` | PASS | `18` migration files checked. |
| Playwright inventory | WRITTEN, NOT EXECUTED | `22` tests across `5` files. Running the browser suite still requires explicit Product Design authorization. |
| `pnpm db:types:check` | BLOCKED | `SUPABASE_CLI_NOT_FOUND`. |
| `pnpm db:static:seed` | BLOCKED | `APPROVAL_NOT_READY`, `CATALOG_NOT_SELLABLE`, `SUPPORT_NOT_RUNTIME_READY`, `TOURS_NOT_AVAILABLE`. |
| `pnpm db:verify` | BLOCKED | `SUPABASE_CLI_NOT_FOUND`; no PostgreSQL/RLS/pgTAP/locking/concurrency runtime claim. |

## Final review gate

- Spec/security review: prior verdict `BLOCK`, with the missing vertical slices, role-denial matrix, strict diagnostics and simulated-AI disclosure now implemented; re-review must wait for runtime evidence.
- Design/accessibility review: prior verdict `BLOCK`, with art direction, contrast, keyboard coverage and mobile clipping fixes now implemented; re-review must wait for exact-size captures and full-page inspection.
- Required next action: explicitly authorize Playwright, run all `22` E2E tests, inspect exact native viewport and full-page artifacts, regenerate the same-size comparison, fix any runtime findings, then dispatch both independent re-reviews.

final result: blocked
