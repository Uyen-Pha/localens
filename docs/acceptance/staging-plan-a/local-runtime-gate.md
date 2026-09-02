# Plan A local runtime acceptance

## Release identity

- Verdict: **PASS**
- Label: `runtime-verified-local@4d6379e9562516d13eefa8effcc71542c25960d8`
- Release SHA: `4d6379e9562516d13eefa8effcc71542c25960d8`
- Branch: `codex/staging-plan-a`
- Time zone: `Asia/Saigon` (`+07:00`)
- Acceptance window: `2026-09-03T00:06:51+07:00` to `2026-09-03T00:25:27+07:00`

This record contains no environment values, passwords, tokens, publishable keys, service-role keys, JWT secrets, database URLs, or container credentials.

## Runtime versions

| Component | Version |
|---|---:|
| Node.js | `24.19.0` |
| pnpm | `10.17.1` |
| Next.js | `16.3.2` |
| Playwright | `1.62.1` |
| Supabase CLI | `2.115.0` |
| Docker CLI | `29.7.2` |
| Docker-compatible server | Podman `5.8.6`, Linux/amd64 |

## Fresh release gate

All commands below ran sequentially against the release SHA above. Every command in this release sequence exited `0`.

| Command | Start | End | Exit | Evidence |
|---|---|---|---:|---|
| `git status --short` | 00:06:51 | 00:06:51 | 0 | Tracked worktree clean; only four pre-existing user-owned untracked runtime logs were present. |
| `docker version` | 00:06:51 | 00:06:52 | 0 | Docker CLI reached the local Podman server. |
| `pnpm install --frozen-lockfile` | 00:06:52 | 00:06:53 | 0 | Lockfile current; dependencies already up to date. |
| `pnpm check` | 00:06:59 | 00:11:57 | 0 | ESLint and TypeScript passed; Vitest `108/108` files and `1331/1331` tests; `23` migrations static-checked; demo build generated `24/24` routes. |
| `pnpm test:e2e` | 00:12:06 | 00:14:46 | 0 | Chromium `34/34` passed across EN/VI, responsive, booking, food itinerary, portal, cancellation, review, role-denial, and static-shell paths. |
| `pnpm db:verify` | 00:14:52 | 00:17:11 | 0 | Local start/reset/lint passed; pgTAP `18` files and `1591` tests; all `9/9` two-session concurrency scenarios; generated database types matched; backup-preserving cleanup passed. |
| `pnpm test:e2e:runtime-auth` | 00:17:18 | 00:19:46 | 0 | Cold local start succeeded on the first attempt; `3/3` customer, guide, and administrator persistence/authorization browser flows passed. |
| `pnpm test:e2e:runtime-fixed-tour` | 00:19:54 | 00:22:31 | 0 | pgTAP `1591/1591`; deterministic fixture rerun; browser `7/7` passed for restored booking intent, holds, isolation, idempotency conflicts, simulated payment boundary, guide assignment, and bilingual cancellation. |
| `pnpm test:e2e:runtime-guide-assignment` | 00:22:38 | 00:24:30 | 0 | pgTAP `1591/1591`; isolated browser `1/1` passed for assign A, reassign B, return to A, and cross-guide schedule isolation. |
| `pnpm build:supabase` | 00:24:38 | 00:25:01 | 0 | Production compilation and TypeScript passed; generated `24/24` routes using an explicit loopback build configuration. |
| `git diff --check` | 00:25:08 | 00:25:08 | 0 | No whitespace errors; tracked generated files restored. |
| `pnpm db:stop` | 00:25:10 | 00:25:27 | 0 | Local Supabase stopped with backup preservation; no LocalLens containers remained. |

## Database concurrency scenarios

All required two-session scenarios passed:

1. CAS revision winner.
2. Guest claim winner.
3. Quota bucket creation and reservation idempotency.
4. Departure capacity without oversell.
5. Quote checkout compensation.
6. Stripe webhook event race.
7. Simulated payment single terminalization.
8. Cancellation approval versus simulated payment.
9. Guide assignment duplicate, same-booking, and schedule serialization.

## Pre-release findings closed before this gate

- The database gate originally depended on caller-supplied concurrency variables. Commits `8422062`, `4ac6ba1`, and `7b79d7a` made the gate self-contained, case-insensitively scrubbed inherited aliases, supplied only the fixed local endpoint and explicit concurrency flag to the concurrency subprocess, and changed cleanup to the backup-preserving path.
- A cold local Supabase start once failed before runtime Auth while a direct retry succeeded. Commit `4d6379e` added one bounded, redacted retry; a second failure remains fail-closed. The final release sequence above cold-started successfully on its first attempt.
- Independent reviews for the database environment boundary and cold-start retry ended `APPROVED` with no remaining Critical, Important, or Minor findings.

## Safety and scope

- No remote or linked Supabase command ran.
- No GitHub repository, Supabase project, or Vercel deployment was mutated by this local gate.
- `demo-final.stderr.log`, `demo-final.stdout.log`, `dev-status.stderr.log`, and `dev-status.stdout.log` remain untracked and untouched.
- The static demo on port `3100` remained outside the owned test servers and was not stopped.
