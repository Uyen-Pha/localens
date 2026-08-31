# LocalLens green customer design QA

## Scope

- Review target: approved Task 4 `HEAD` `4107b794c18df8a69a6ad85a3d4e9572b400b33e`.
- Scope source: `docs/superpowers/specs/2026-08-31-localens-green-production-aligned-demo.md` and `docs/superpowers/plans/2026-08-31-localens-green-production-aligned-demo.md`.
- This file records repository checks and traceable Task 3/Task 4 evidence only. It is not a final visual or accessibility sign-off.

## Locked green reference

| Field | Verified value |
| --- | --- |
| Repository reference | `docs/design/references/localens-green-home-selected.png` |
| SHA-256 | `4CE3DA5E08635D2B7F2F2BF3417B34878A029B0D8547964D5E7518082D75447D` |
| Decoded dimensions | `1487 x 1058` |
| File size | `1,497,688` bytes |

The reference exists at the locked repository path and is the green-white
customer art-direction source. It is a visual reference, not a production
background, crop, or screenshot.

## Traceable Task 3 evidence

The Task 4 integration record identifies the following reviewed Task 3
history:

- Customer visual system and flows: `fe5c7530aeaf7786831f0301530408b5cecde182`, `b0a8ebdb48b99c2579363e1670921705b2375cb8`, and `3e0659bc299b1561f909944e744ecacc9b9405e1`.
- Role portals: `e6fe240158c7a750ddb1e8283d78c2bcb4d6d90e` and `e1bf92274eb73a749d07e45f275b5073251b943c`.

The current customer implementation and component evidence reference these
approved green assets, all present under `public/images/green/`:

- `ben-thanh-market.webp`
- `independence-palace.webp`
- `saigon-map.webp`
- `saigon-skyline.webp`
- `street-food.webp`

Traceable implementation/test locations are `components/customer/customer-home.tsx`
and `tests/components/customer/customer-home.test.tsx`. These commit and asset
records do not substitute for current browser screenshots.

## Task 4 recorded gates

The following results are recorded in `.superpowers/task-4-report.md` for the
approved Task 4 `HEAD`; they were not rerun in this documentation update.

| Gate | Recorded result | Evidence or boundary |
| --- | --- | --- |
| `pnpm test:run` | PASS | 74 files / 873 tests, twice consecutively after review fixes |
| `pnpm lint` | PASS | `--max-warnings=0` |
| Repository-local TypeScript | PASS | `./node_modules/.bin/tsc.cmd --noEmit --incremental false`, zero diagnostics |
| `pnpm db:static` | PASS | 18 migration files checked; seed optional |
| `git diff --check` | PASS | Only Git LF-to-CRLF normalization warnings were recorded |
| `pnpm exec tsc --noEmit --incremental false` | Not available in the recorded shell | `tsc` was not resolved; the repository-local command above passed |
| Supabase runtime gates | Not verified | No runtime, migration mutation, or production-readiness claim |

Task 4 did not record build, dev-server, Playwright, browser, or Supabase
runtime evidence.

## Current blocker and pending evidence

The Task 5 browser restriction records that the Codex in-app browser URL policy
rejected `http://localhost:3000/vi/`. This update therefore has no current
browser captures. The following remain pending:

- Current EN/VI screenshots at the required viewports.
- A same-interaction-state, same-viewport comparison of the rendered Home with
  the locked green reference.
- Browser interaction and accessibility evidence, including keyboard/focus,
  contrast, reduced motion, console/page diagnostics, and horizontal-overflow
  checks.

No historical screenshot is used as current evidence. This update ran only
path, link, and hash checks; no browser, Playwright, or build command was run.

final result: pending browser evidence
