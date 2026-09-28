# Research cancellation integration — local handoff

## Scope and authority

Branch: `recovery/unified-preview`; starting commit `fba99fe7db71f8b02a3574e071113c057775b724`.
User authorized completion of SQL and local tests; hosted application requires a separate impact approval. No push, merge, deployment, hosted migration or hosted business-data update was performed in this wave. Approved UI was not edited by this integration wave. Existing dirty recovery/UI files remain outside this commit.

## Implemented

- Restored seven historical research prerequisites from the hash-verified baseline fixtures, preserving their bodies and adding transaction wrappers. These are fresh-install prerequisites, NOT instructions to replay old migrations on an installed hosted project.
- Added nullable timing compatibility without business-row backfill. New submissions retain the 72-hour lead time and 12-hour processing rule; quote expiry is capped at the earlier of creation plus 48 hours or departure minus 24 hours. Historical rows use read-only derivation; legacy null timing is not silently written back.
- Added bounded named-owner permissions for research booking, checkout, cancellation, actor lookup and their helpers. Unsafe existing roles or excessive effective privileges fail closed before mutation. No blanket privilege reset.
- Added upgrade and fresh-install test runners restricted to explicitly owned local Docker targets. Migration SQL, fixture prerequisites and checkpoints commit atomically. Resumed/revised runs are not represented as fresh-install evidence.
- Updated the scoped access contract and matrix. This does NOT approve all original research RPCs: broader owner/grant inventory still has unresolved findings. Revision links remain ENABLE-only, not FORCE RLS.

## Verification — 29 September 2026

| Check | Result | Boundary |
|---|---|---|
| Clean local cluster on port 55462 | 56/56 migration files applied; `freshInstallEvidence=true` | Actual native Supabase local auth schema; synthetic local catalog prerequisites |
| Fresh deadline / permission pgTAP | Plans 33 + 82, no failures | Deadline plan includes one explicit skip for historical upgrade branches on empty installation |
| Populated upgrade pgTAP | 204 + 82 passed | Historical RPC-created fixtures loaded before candidates |
| Upgrade reapplication | Two applications passed | Original selected business fields unchanged |
| Excessive prior grants | Four rejection cases passed | Catalog remains unchanged by rejected candidate |
| Upgrade rollback | Passed | Selected data/catalog/role/ACL snapshots restored, not an exhaustive catalog-equivalence proof |
| Existing cancellation pgTAP | 123/123 passed | Dedicated older local baseline |
| New runner/source unit tests | 5/5 passed | Three files |
| Cancellation UI/SQL-contract/runner tests | 95/95 passed | Five focused files; not whole-repository acceptance |
| Scoped lint | Passed | Three new scripts and three new unit-test files |
| Typecheck | Passed | `--incremental false`; protected build-info unchanged |
| Supabase-mode build | Passed, 43 generated pages | Local placeholder connection configuration; not authenticated browser coverage |
| Full Vitest run | 2,528 passed / 2,548 total; 20 failed | Stable final tree, serial files, 30-second test timeout; not a green release gate |
| Whole-repository SQL static gate | Failed | Historical timeout/owner/grant issues plus restored research inventory and static dynamic-RLS recognition gaps; not all findings are baseline-only |

## QC and decisions

Full-run failures by file: tours-page (2), read-only-api (1), import-boundary (1), personalization-area-adapter (1), demo-planner (2), personalization-areas (1), editorial-foundations (3), Supabase artifacts (3), rls-matrix (3), thesis-demo-cloud-seed (3). These match the previously observed failure groups, but restored SQL changes the artifact inventory, so do not label every SQL diagnostic pre-existing or ignore it. Raw local report: `.local-final-tests.json` (not committed).

Main coordinated two Dev and two independent read-only QC agents. Both QC reviewers closed their important local findings after fixes: effective privilege preflight, real delayed-quote/legacy-resubmission coverage, atomic checkpoints, and honest fresh/resumed classification. Runtime evidence above was executed by Main, not inferred from reviewer approval.

Ruling: preserve historical SQL bodies rather than harden all original research RPCs in this change. Cost: full static security acceptance remains blocked; this is not approval for hosted deployment.

Ruling: use an explicit LOCAL platform-owner auth-schema grant prerequisite, because local postgres lacked grant option. Do not elevate application roles or silently transfer this prerequisite to hosted Supabase. Cost: hosted platform permissions require separate verification and authority.

Ruling: retain local audit databases and all existing recovery worktrees. Three exploratory databases remain in the older local cluster; historical migrations introduced local cluster roles during those exploratory attempts. The final proof uses a separate new cluster, not those attempts. No claim is made that every local cluster privilege was unchanged throughout exploration.

## Remaining release gates

Do not run a blanket hosted `db push`: compare the actual hosted migration ledger and installed research objects first. Obtain explicit approval for any hosted SQL/platform permission change. Address or formally scope remaining static permission findings before a database release. Complete authenticated Customer/Guide/Admin browser verification against the agreed release build separately.

Local environments retained: `D:/LocalLensSqlAudit/20260928-research-baseline` (55442), `20260929-release-integration` (55452), and `20260929-release-verified` (55462). No old branch/worktree was deleted.
