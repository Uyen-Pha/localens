# Thesis post-release fixes — 2026-09-29

## Scope

- Branch: `codex/thesis-post-release-fixes`; code commit: `9ec51bb`.
- Base: `0626561` (released website). Preserve approved layouts and demo/runtime split.
- No hosted database writes, migrations, seed, backfill, main merge or Production deployment.
- Existing unrelated `design-qa.md`, generated TypeScript cache and local test reports were not included.

## Fixed behavior

1. Local booking traveler selector now enforces integer 1–15 and remaining capacity; no application at zero seats or during submission. Invalid initial counts recover to 1, and stale counts can be corrected after capacity drops.
2. Local departure calendar compares actual timestamps, including UTC offsets, and rechecks departure time when clicked. This is the local-calendar path; existing runtime booking guards remain intact.
3. Planner checks the 72-hour lead time before fresh generation or retry. Existing revisions remain resumable. A matching in-flight request reconnects across StrictMode effect replay rather than losing its valid result at the cutoff.
4. Natural-language duration parsing and correction now match the existing detailed-form/domain range of 1–12 hours.
5. Guide schedule refreshes derived status at departure, on focus and on returning to the tab; handles the render/effect boundary race and cleans timers/listeners. It does not mutate assignment records or infer completion.
6. Admin prototype departure creation rejects impossible calendar dates and invalid clock values such as 24:00/13:60. No new database integration.

## Verification

- RED/GREEN regressions exercised before each fix; independent QC reviewed booking, guide/admin and Planner. QC findings were corrected and re-reviewed.
- Final focused suite: **38/38 passed in 6 files**, after the final Planner fix.
- Scoped ESLint: passed; final Planner files rechecked after the last edit.
- Typecheck: passed. Final Supabase-mode local build: passed, 43 pages generated.
- Full-suite run overlapped the final Planner correction: **2,572/2,582 passed, 10 failed**. One failure captured the now-fixed StrictMode cutoff regression; its final focused rerun passed. This run is not a clean frozen-final-snapshot certification.
- The other 9 failures match the recorded SQL baseline: three each in `artifacts.test.ts`, `rls-matrix.test.ts`, and `thesis-demo-cloud-seed.test.ts`. They remain unresolved; no SQL was changed to suppress them.

## Preview and review boundary

- Preview: https://localens-keqx45evy-local-lens2.vercel.app
- Deployment: `dpl_7BSERYeSJr9yyz66sXUPoWYh5c1P`, verified READY, target Preview.
- Authorized Vercel CLI requests returned HTTP 200 with LocalLens content for `/vi/`, `/vi/tours/`, `/vi/booking/`, `/vi/planner/`, `/vi/account/`, `/vi/guide/`, `/vi/admin/`.
- Public unauthenticated access redirects to Vercel login. HTTP checks are not authenticated role or end-to-end mutation tests.
- Asked permission to add exactly this new Planner origin; no origin configuration change made in this pass.
- User review and authenticated role checks on this Preview remain pending. Production remains unchanged.
