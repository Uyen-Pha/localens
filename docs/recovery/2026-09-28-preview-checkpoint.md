# Preview checkpoint — 2026-09-28

## Scope

Continued user option 1: resolve related verification failures and prepare a separate Vercel Preview. No main merge, production promotion, schema/migration, data mutation, Supabase secret update or old-worktree cleanup.

## Changes

- Updated five failing portal test cases: await lazy-loaded sign-out control; test actual sign-out rather than removed disclosure prose; freeze fixture calendar date; use current calendar heading; distinguish read-only Completed filter from assignment completion actions. Product guide code unchanged.
- Added .vercelignore after dry-run revealed local .superpowers harness/reports would otherwise be uploaded. Repeat dry-run excluded those paths, environment files other than .env.example, build outputs and dependency folders; 719 upload files.

## Gates

- Prior 35 Planner/research tests passed again in the combined run. Portal suite after correction: 54 passed, 0 failed.
- Full suite after correction: 2,185 passed / 77 failed / 2,262 total. All 77 names appeared in planner-A-suite.json; not all causes proven harmless or baseline-equivalent. Named failures: 2026-09-28-preview-remaining-failures.md. No skipped tests or rewritten database artifacts.
- Lint, typecheck, diff whitespace check and local demo webpack build passed.
- Vercel remote Next/Turbopack build passed. This Preview is for inspection, not release acceptance; remaining failures block merge/production readiness.

## Deployment

- Project: local-lens2/localens, prj_ylyIAmAJi902Gytbc20QDpruhoh7.
- Explicit --target preview; no production promotion.
- Deployment: dpl_2UJ5zcoEnaXMeGQZS2EyGN6DDn8P, READY.
- URL: https://localens-jnkdacj1j-local-lens2.vercel.app/vi/planner/
- Source: af60eb2 plus portal-test correction and .vercelignore; checkpoint documentation added after deployment. No product-source changes since af60eb2.
- Existing Preview environment variable names verified; values not printed or changed.
- Browser confirmed natural-description default, manual compact form and return to description (keyboard activation). Initial pointer automation attempts did not change the surface; no runtime error logged. Pointer behavior is not fully accepted by this check.
- Screenshot: Project/output/recovery-audit-20260928/preview-natural-input.png.

## Concrete live blocker

Read-only OPTIONS preflights against https://twsdtfotrkljgbfsrmgz.supabase.co/functions/v1/research-planner:

| Origin | HTTP | Allow-origin |
| --- | --- | --- |
| https://localens-ashen.vercel.app | 204 | matches origin |
| https://localens-p1krh66ck-local-lens2.vercel.app | 204 | matches origin |
| https://localens-jnkdacj1j-local-lens2.vercel.app | 403 | absent |

The new Preview origin is not allowed by the existing Planner service. Do not claim authenticated generation/editing/submission works. Next decision: authorize adding only this exact Preview origin while preserving existing origins (no wildcard, no database change), or leave Preview for visual review. Real create/submit operations would write records; use a specifically approved test account/workflow before performing them. Authentication and full customer/admin/guide end-to-end flows remain unverified on this deployment.
