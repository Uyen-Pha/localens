# Original research baseline (local only)

This fixture reconstructs the research workflow at **20260924180000**, not the complete release schema or the hosted database. Source checkout is read-only: `C:/Users/Admin/Documents/Project/localens-guide-release`. No release migration is added. Every research function body is copied from that source; there are no substitute booking/payment RPCs.

## Source and hashes

SHA-256 source hashes cover original file bytes. Fixture hashes cover UTF-8 SQL with CRLF normalized to LF and exactly one terminal newline. Research files are whole copies apart from line endings/trailing blank lines. The first three files are exact, ordered source excerpts; their source line ranges are recorded below and in `manifest.json`. The harness checks every fixture hash before preparing or connecting.

| Fixture | Source migration and lines | Original SHA-256 | Fixture SHA-256 |
| --- | --- | --- | --- |
| 001-schema-role.sql | 20260823090000_extensions_enums.sql:7-15,17-21 | `7bd682238153efc422e14eefe4273a2411149a9b0f2c596bd918cccec27cb599` | `e5aebd6b95426057718862286f19e396f1fdccfd8590c6d958fc6e972ead495f` |
| 002-user-roles.sql | 20260823091000_identity_roles.sql:60-66,109-110 | `a9879e0a6bd4752b0bde6665a33d85dd2cd55e5866ec6bb29a9f4a0f5ac5ad34` | `463dee03235028850c76a07200708b87f4aa4b82464e33e151abd598cd0fd8b7` |
| 003-manifest.sql | 20260905140000_thesis_demo_manifest.sql:48-83 | `5641d4186cbb0f43c935b52a7f86f8e9a07dbc6f8deeea4d57eb6a035ff772fa` | `e8026a6e53d7dbb037e012044c58f84c7ea4b72e0b296240abf242f81a0dca18` |
| 20260916073000_research_demo_catalog.sql | 20260916073000_research_demo_catalog.sql:1-49 | `b2ad29cec8e9446aed7e08a2a96bb2e371df981b4d28c80297d11d053b739150` | `b2ad29cec8e9446aed7e08a2a96bb2e371df981b4d28c80297d11d053b739150` |
| 20260916100000_research_demo_workflow.sql | 20260916100000_research_demo_workflow.sql:1-132 | `6c008eaeb65138ffbead7dc6a99fbe2b0c779c3f3864ebce8eea6e8c935b4958` | `efa93dd898c00f3910e94efc7366cb2de47d31f3af60432850d2dfb5cb779edc` |
| 20260916101000_research_demo_revision_locks.sql | 20260916101000_research_demo_revision_locks.sql:1-13 | `ea4b8966e3bc20c34b2ab91a04e70027d6e26dcc77c268e514ee79965f3d1528` | `e89ee8af1e9781d48820032acb1be8aa39b53d23f513f36bf737b686611981f4` |
| 20260917030000_research_direct_edit.sql | 20260917030000_research_direct_edit.sql:1-52 | `b3b3b013c5588d05fd0e77a43d03d7667954c6e24e87034cc49ece6fe483b9ce` | `bd8132b9064e365f2ac1691deced08a49b08c7deb57a320f5968b6bdc2f022f8` |
| 20260919100000_research_guided_refinement.sql | 20260919100000_research_guided_refinement.sql:1-47 | `2919ec76dcc95316fe5c7ef6c1f3e8d254097c4bc30584055f526a05bf1fc178` | `9ef2818f198d7a35a8037cb68f43e20ddb4b413a15e32046f7355d6f1386bbdd` |
| 20260921090000_research_resubmit.sql | 20260921090000_research_resubmit.sql:1-40 | `4224df393108c419a0eb0c06a525c0d2a8637b12f09aa537360c337b866dd25f` | `4224df393108c419a0eb0c06a525c0d2a8637b12f09aa537360c337b866dd25f` |
| 20260924180000_research_quote_checkout.sql | 20260924180000_research_quote_checkout.sql:1-53 | `fdb3dad29f7f0b972c8ff17853effb8d7fc771eaea7872e181797657b467db89` | `0af32249b18f8738d62f0cacef519a50dd082c33ad69c9ccd970bbd039f1ed1b` |

## Dependencies and replacements

Apply in manifest order:

1. `001-schema-role.sql`: original private schema/default privilege revocations and public.app_role enum. PostgreSQL 17 already provides gen_random_uuid; research code does not require pgcrypto-specific calls.
2. `002-user-roles.sql`: original private.user_roles definition, FK to auth.users, ENABLE/FORCE RLS. Unrelated profile/audit tables, identity triggers and named identity-definer roles are not dependencies of research RPCs and are not copied. This is a research dependency subset, not full identity-system acceptance.
3. `003-manifest.sql`: exact thesis_demo_manifest table, constraints, RLS, postgres policy and revocations. The unrelated guide-assignment guard replacement preceding it is excluded. The harness inserts a synthetic local manifest row **before workflow installation**, retaining the original hard-coded project marker `twsdtfotrkljgbfsrmgz` and environment `thesis-demo`. This is data satisfying the original guard on a verified local DB, not a remote connection or guard rewrite.
4. Catalog: private.research_demo_catalog_versions, append-only guards and get_research_demo_catalog. The harness inserts an explicitly synthetic, one-place catalog **before workflow installation**, because workflow materializes research_demo_places from place_map once.
5. Workflow: research_demo_places/revisions/stops/requests/request_events/quotes and research_demo_actor/persist/submit/decide/create_quote/list. Requires auth.users(id,banned_until), auth.uid(), auth.role(), platform roles anon/authenticated/service_role, private.user_roles, manifest, catalog and its immutable-trigger function. All those dependencies are either original excerpts or supplied by the real local Supabase platform.
6. Revision locks: adds insert guard requiring request.lockedStopIds=[]; it is not replaced by the guided-refinement migration.
7. Direct edit: research_demo_revision_links; edit_context, persist_edit and resume; depends on revisions, requests, actor and persist.
8. Guided refinement: **replaces persist_edit(uuid,uuid,text,text,jsonb,jsonb)** with pace/locked-place normalization; adds resume_latest, which calls resume and traverses revision_links. The earlier direct-edit version must not be treated as the final definition.
9. Resubmit: adds request_events.revision_id and begin_revision/resubmit plus guard_research_resubmitted_snapshot. Retains the original submit/decide/list definitions at this cutoff.
10. Checkout: research_demo_bookings and real research_demo_booking(uuid,boolean)/research_demo_checkout(uuid,jsonb). Depends only on the research actor, quotes, requests, revisions, events and auth.users. Booking locks request then booking; checkout first calls booking(false), keeping request lock in the same transaction.

The intermediate migrations `20260923160000_official_guide_schedule.sql`, `20260923170000_external_refund_policy.sql`, `20260923171000_personalized_guide_assignments.sql`, `20260924150000_checkout_contact_fields.sql`, and `20260924160000_checkout_travelers.sql` concern operational/public or reviewed-demo bookings and are not research dependencies. In particular, the last two replace **reviewed_demo_checkout**, not **research_demo_checkout**. Do not include them merely by timestamp/name.

**Known later divergence:** `20260925090000_personalized_deadlines.sql` is outside the requested baseline cutoff. It changes the quote deadline constraint, adds request timing columns/triggers, and replaces research_demo_list. It is intentionally not applied. This baseline therefore has the original 48-hour quote deadline, not the later 72-hour submission/12-hour processing policy. Hosted equivalence remains unverified; Main/Task 2 must not confuse this upgrade baseline with all current hosted definitions.

**Owner capability dependency:** the original user_roles and research tables use FORCE RLS, but no applicable postgres policy or research-function owner transfer was found in the source migrations. The original functions are created by postgres and thus implicitly require that owner to bypass RLS. Non-superuser does not imply NOBYPASSRLS. Before installation the harness reads pg_roles and requires current_user=postgres with rolsuper or rolbypassrls. If both are false, it stops with MISSING_SOURCE_DEPENDENCY before DDL; Main must resolve the source/environment mismatch. Do not add a permissive policy, disable FORCE RLS, transfer function ownership or elevate the role to make a test pass. No source policy slice exists to copy for this dependency.

Real Supabase auth schema/functions/roles and PostgreSQL 17 must exist; the harness never fabricates them. Installation failure rolls back all baseline DDL and fixture business data. Source SQL is complete for the traced object graph; environment compatibility remains conditional on the owner capability above and Main's execution.

## Commands for Main (PowerShell)

Run from `C:/Users/Admin/Documents/Project/localens/.worktrees/recovery-review`. Main confirmed ports 55440/55441/55442 available; recheck if their availability changes. The parent `D:/LocalLensSqlAudit` must already exist. The target directory must **not** exist; prepare rejects even an empty existing directory.

```powershell
$researchWorkdir = 'D:/LocalLensSqlAudit/20260928-research-baseline'
node scripts/test-research-cancellation-local.mjs --workdir $researchWorkdir --prepare
node scripts/test-research-cancellation-local.mjs --workdir $researchWorkdir
# Main only: start only the database through the repository's local-only wrapper.
node scripts/supabase-local.mjs db start --workdir $researchWorkdir
if ($LASTEXITCODE -ne 0) { throw 'Dedicated local Supabase start failed; inspect privately. Do not reset any stack.' }
node scripts/test-research-cancellation-local.mjs --workdir $researchWorkdir --apply
if ($LASTEXITCODE -ne 0) { throw 'Baseline apply failed; preserve target and investigate.' }
node scripts/test-research-cancellation-local.mjs --workdir $researchWorkdir --verify
```

Prepare assigns dedicated project ID `localens-research-baseline-<UUID>`, binds the ownership marker to its canonical absolute directory and exact config hash, and writes API 55441 / database 55442 / shadow 55440. It creates no migrations or seed directory. Keep its config unchanged. Start is deliberately a separate Main operation; the harness never starts/stops/resets/deletes containers, volumes or databases.

Main prepared `D:/LocalLensSqlAudit/20260928-research-baseline` as `localens-research-baseline-7c927fcb-791d-4c86-8769-001f4bf6a507`. If using this existing target, skip prepare and continue with database-only start/apply. The CLI warned that `inbucket` config is deprecated. Leave this prepared config unchanged to preserve its ownership hash; the disabled mail service is not needed by this direct-PostgreSQL harness. No API/app services are required for these RPC calls over SQL.

The pinned CLI truncates project IDs to 40 characters for Docker identity. Main verified this target's container as `supabase_db_localens-research-baseline-7c927fcb-791d`, project label `localens-research-baseline-7c927fcb-791d`, and workdir label `D:\LocalLensSqlAudit\20260928-research-baseline`. The harness derives that canonical ID from the full owned config ID, verifies both labels (workdir resolved to the owned canonical directory), and still requires port 55442. It does not select containers by prefix search or weaken ownership checks. This supports the already prepared target without resetting or recreating it.

Inventory is offline. Apply/verify first reject remote Docker endpoints, inspect the exact running container's project label and DB port binding, then connect only to literal 127.0.0.1 and the verified config's database port with explicit local connection fields. There is no URL argument, ambient PG host selection, linked mode or CLI passthrough. Old projects lack the ownership marker; altered configs, copied markers, linked targets and populated databases are rejected. A second apply is rejected, never reset.

Apply atomically installs the original dependency subset and exercises:
service-role persist -> customer submit -> admin approve -> admin quote -> customer booking(true) -> booking(false) -> real checkout(declined/success). It retains three legacy records: pending/pending, pending/failed and confirmed/paid. Synthetic traveler data is used; there is no provider payment. No direct booking-status or receipt updates replace checkout.

`baseline-evidence.json` in the new workdir records IDs, original booking payloads and snapshots of bookings, requests, revisions, quotes, events and stops for Task 2's upgrade comparison. It is written exclusively before COMMIT; only an apply success confirms it committed. If COMMIT fails, preserve the attempted evidence and investigate; never silently overwrite it. `--verify` checks required RPC signatures only and never calls booking(false), which can expire records as time passes. It does not certify SQL upgrades, runtime behavior or unchanged snapshots.

## Verification boundary

Dev1 ran offline Node/Vitest checks only. Main owns Docker startup, SQL installation, create/read/checkout execution, upgrade comparison and review. Unit coverage and hashes are not evidence that the SQL has run successfully.

```powershell
corepack.cmd pnpm exec vitest run tests/unit/scripts/research-cancellation-local.test.ts
corepack.cmd pnpm exec eslint scripts/test-research-cancellation-local.mjs tests/unit/scripts/research-cancellation-local.test.ts --max-warnings=0
corepack.cmd pnpm exec tsc --noEmit --incremental false
node --check scripts/test-research-cancellation-local.mjs
```
