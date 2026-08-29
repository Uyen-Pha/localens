# Task 3 implementation report — current status

## Current status

Task 3A, 3B, and 3C implementation slices are complete in the forward-only
food catalog migration, including their security-artifact and regression-test
updates. Static/unit verification evidence and the separate runtime database
blocker are recorded in the sections below. PostgreSQL runtime verification is
not claimed while the local CLI remains unavailable.

## Task 3A — canonical food base schema and RLS

Status: complete for the independently reviewable base-schema slice. The
forward-only migration now creates the nine mutable `food_*` relations with
restrictive venue/vendor/item parent FKs, `public.place_status`, closed service
and serving vocabularies, safe bigint VND bounds, ordered price checks, bounded
non-empty labels, nullable draft evidence, and the existing local opening-hour
model. Vendor opening windows and exception windows use named guard-owned
trigger helpers with fixed empty `search_path`, a 5-second timeout, advisory
locks, overnight overlap detection, and deferred closed-exception checks.

All nine tables have ENABLE + FORCE RLS. API roles have no direct base-table
privileges. `localens_catalog_rpc_owner` has the existing SELECT/INSERT/UPDATE
maintenance grants and `catalog_owner_all` policies. Guard-owned SELECT
policies/grants are limited to the trigger helpers and no helper function has
an API EXECUTE grant. No snapshot table or published view was added in this
slice.

The base pgTAP artifact was trimmed to 46 executable assertions covering
relations, constraints, parent FKs, forced RLS, trigger presence, direct API
denial, catalog-owner writes, and owner policy coverage. It remains
synthetic/rollback-only.

### Task 3A verification evidence

Passed:

- `pnpm db:static` — checked 16 migration files; seed optional.
- `pnpm test:run tests/unit/supabase/artifacts.test.ts tests/unit/supabase/rls-matrix.test.ts` — 2 files, 23 tests passed.
- `pnpm lint` — exit 0.
- `pnpm typecheck` — exit 0.

Blocked by the local environment (no runtime result claimed):

- `pnpm db:reset`
- `pnpm db:test`
- `pnpm db:lint`
- `pnpm db:types:check`

Each returned exactly:

```text
SUPABASE_CLI_NOT_FOUND: project-local Supabase CLI is required; install the pinned dev dependency only after a local container runtime is available
```

The generated data-access matrix, grant manifest, policy manifest, and
Markdown were refreshed for the nine new base tables and four guard helpers so
the static drift gate remains bidirectional. The untracked `AGENTS.md`,
`CLAUDE.md`, and `next-env.d.ts` files were pre-existing and were not touched
or staged.

Commit: `d969906 feat: add canonical food catalog base schema`

Post-commit verification repeated `pnpm db:static` successfully and the
focused artifact/RLS suite passed 23/23 tests. Runtime database gates remain
blocked by the same `SUPABASE_CLI_NOT_FOUND` error above.

## Task 3A fix round 1 — minimize catalog guard-owner reads

Status: complete. The guard-owner SELECT policies and table grants were
removed from the six content relations:
`food_vendors`, `food_vendor_translations`, `food_vendor_supports`,
`food_items`, `food_item_translations`, and `food_item_supports`. They remain
only on `food_vendor_opening_hours`, `food_vendor_opening_exceptions`, and
`food_vendor_opening_exception_windows`, which are the relations read by the
current opening/exception guard helpers. Catalog-owner policies and grants,
forced RLS, and API denials were unchanged. Generated security artifacts were
refreshed; the final explicit grant count is 502 and the dynamic policy count
is 36. The pgTAP Minor coverage remains deferred.

Fix-round verification:

- `pnpm db:static` — checked 16 migration files; seed optional.
- `pnpm test:run tests/unit/supabase/artifacts.test.ts tests/unit/supabase/rls-matrix.test.ts` — 2 files, 23 tests passed.
- `pnpm lint` — exit 0.
- `pnpm typecheck` — exit 0.

No runtime database verification was claimed; the prior
`SUPABASE_CLI_NOT_FOUND` blocker remains. `AGENTS.md`, `CLAUDE.md`, and
`next-env.d.ts` were not touched or staged.

Fix-round commit: `1d6ece1 fix: minimize food catalog guard grants`.

## Task 3B — immutable food snapshots and catalog snapshot RPC

Status: implementation complete for the independently reviewable immutable
snapshot slice. The existing forward-only food migration now adds nine
`catalog_snapshot_food_*` relations, composite snapshot membership FKs,
forced RLS, catalog-owner-only creation policies, append-only UPDATE/DELETE
guards, and statement-level TRUNCATE guards. The migration also adds
guard-owned publication completeness helpers for vendors/items and replaces
`private.create_catalog_snapshot()` while preserving the original venue lock
prefix/copy behavior and admin grant surface.

The food snapshot creator takes the existing ten venue locks first, then the
nine food base locks in parent/child order. It validates published venues,
vendors, and items before creating one building snapshot, copies venue rows as
before, copies only complete published vendors and complete published+available
items with all child evidence, then performs the same atomic building-to-
published transition. No food projection views or anon/authenticated food
snapshot grants were added in this slice.

### Task 3B TDD and static evidence

1. RED — `pnpm db:test`
   - Exit code: 2.
   - The extended rollback-only `food_catalog_test.sql` could not run because
     the environment returned the exact `SUPABASE_CLI_NOT_FOUND` blocker.
2. GREEN/static — after implementing the snapshot schema, helpers, RPC, test
   fixture, and generated security artifacts:
   - `pnpm db:static` — exit 0; 16 migration files checked.
   - `pnpm test:run tests/unit/supabase/artifacts.test.ts tests/unit/supabase/rls-matrix.test.ts` — exit 0; 2 files and 23 tests passed.
   - `pnpm test:run` — exit 0; 57 files and 589 tests passed.
   - `pnpm lint` — exit 0; no ESLint errors or warnings.
   - `pnpm typecheck` — exit 0.
   - `git diff --check` — clean.

Runtime database gates remain unavailable and no PostgreSQL runtime result is
claimed:

- `pnpm db:reset` — `SUPABASE_CLI_NOT_FOUND: project-local Supabase CLI is required; install the pinned dev dependency only after a local container runtime is available`.
- `pnpm db:test` — same exact blocker.
- `pnpm db:lint` — same exact blocker.
- `pnpm db:types:check` — same exact blocker.

### Changed files

- `supabase/migrations/20260828120000_food_catalog_snapshots.sql` — nine
  immutable food snapshot tables, RLS/grants/guards, publication completeness,
  and forward snapshot RPC replacement.
- `supabase/tests/database/food_catalog_test.sql` — exact 108-assertion,
  rollback-only metadata and synthetic publication/copy/old-price fixture.
- `docs/security/data-access-matrix.json` — nine tables, seven food
  completeness/row helper functions, and guard policy inventory.
- `docs/security/data-access-matrix.md` — regenerated matrix.
- `docs/security/grants-manifest.json` and `docs/security/policies-manifest.json` — regenerated final inventories.
- `tests/unit/supabase/rls-matrix.test.ts` — final table inventory updated from
  70 to 79.

### Task 3B self-review

- Snapshot primary keys use `(snapshot_id, vendor_id)` and
  `(snapshot_id, item_id)`; item rows retain `snapshot_id`, `place_id`, and
  `vendor_id` for later cross-snapshot validation.
- Snapshot provenance, bilingual copy, supports, hours/exceptions,
  availability, serving/portion facts, and integer price bounds are copied
  from the canonical rows and required snapshot evidence is non-null.
- Vendor publication requires a published place, provenance, complete EN/VI
  translations, opening hours, dietary/mobility support facts, and a complete
  published+available menu item. Item publication requires provenance,
  complete EN/VI translations, serving/portion/price facts, and explicit
  dietary/allergen evidence; `unknown` remains an explicit allowed status.
- API roles have no direct snapshot table privilege or policy, and no new
  projection/view surface exists. Catalog RPC owner has only SELECT/INSERT on
  new snapshot rows; completeness guard reads are explicitly scoped.
- The untracked `AGENTS.md`, `CLAUDE.md`, and `next-env.d.ts` files were not
  touched or staged.

Implementation verified; commit follows in this delivery.

## Task 3B fix round 1 — 2026-08-28

Status: complete; static verification passed; runtime database gates remain blocked.

The migration review found three explicit trigger identifiers over PostgreSQL's
63-byte identifier limit. The two `opening_exception_windows` names truncated
to the same identifier on one table, so the second `CREATE TRIGGER` would fail
with `already exists`; the `opening_exceptions` truncate name also exceeded the
limit. The first RED run of the new static regression test reproduced all three
over-limit names.

The forward migration now uses the unique, bounded names
`catalog_snapshot_food_vendor_ex_windows_append_only` (51 bytes),
`catalog_snapshot_food_vendor_ex_windows_truncate` (48 bytes), and
`catalog_snapshot_food_vendor_opening_exceptions_truncate` (56 bytes). The
pgTAP trigger inventory was updated to those names. The completeness assertions
now recognize the actual `locale IN ('en'::public.locale, 'vi'::public.locale)`
helper expression, and the snapshot-copy assertion checks the actual `v`
vendor alias.

A static artifacts test now inventories Task 3B declarations, rejects any
identifier over 63 UTF-8 bytes, and detects trigger collisions after
PostgreSQL-style truncation. The RED run failed only on the three known names;
the GREEN run passed all 19 artifacts tests. Runtime PostgreSQL remains
unavailable under the existing `SUPABASE_CLI_NOT_FOUND` environment blocker;
no runtime result is claimed.

### Fix-round verification evidence

- `pnpm db:static` — exit 0; 16 migration files checked.
- `pnpm test:run tests/unit/supabase/artifacts.test.ts tests/unit/supabase/rls-matrix.test.ts` — exit 0; 2 files, 25 tests passed.
- `pnpm test:run` — exit 0; 57 files, 591 tests passed.
- `pnpm lint` — exit 0; no ESLint errors.
- `pnpm typecheck` — exit 0.
- The food pgTAP file has `SELECT plan(108)` and exactly 108 executable
  `ok`/`is`/`throws_ok`/`lives_ok` assertions.
- Identifier inventory found 143 declarations, zero identifiers over 63 UTF-8
  bytes, and zero trigger truncation collisions.
- `git diff --check` — clean.
- `pnpm db:test` remains blocked by the exact
  `SUPABASE_CLI_NOT_FOUND` environment error; no PostgreSQL runtime result is
  claimed.

Implementation verified; fix-round commit follows in this delivery.

## Task 3C — published food snapshot projection views

Status: implementation complete for the independently reviewable published
projection slice. The existing forward-only food migration now adds exactly
`public.catalog_snapshot_food_vendors_v` and
`public.catalog_snapshot_food_items_v`. Both use the existing safe-definer
view pattern (`security_invoker = false`, `security_barrier = true`, named
`localens_catalog_rpc_owner`, revoke-all-first, and SELECT only for `anon` and
`authenticated`). Each view joins `catalog_snapshots` and filters to the
published status, reads only immutable snapshot relations, retains exact
snapshot/place/vendor/item parent IDs, builds deterministic dense JSON arrays
and objects, and exposes item bigint prices as canonical decimal text. Source
URLs/attributions and mutable `food_*` relations are not exposed.

### Task 3C TDD and verification evidence

RED:

- Extended `tests/unit/supabase/artifacts.test.ts` and
  `tests/unit/supabase/rls-matrix.test.ts` first; the focused suite failed
  because both views were absent and the matrix still had 12 views.
- Extended `supabase/tests/database/food_catalog_test.sql` to 125 exact
  executable assertions; `pnpm db:test` was attempted and returned the exact
  environment blocker below. No PostgreSQL runtime result is claimed.

GREEN/static:

- `pnpm db:static` — exit 0; 16 migration files checked, seed optional.
- `pnpm test:run tests/unit/supabase/artifacts.test.ts tests/unit/supabase/rls-matrix.test.ts` — exit 0; 2 files, 26 tests passed.
- `pnpm test:run` — exit 0; 57 files, 592 tests passed.
- `pnpm lint` — exit 0; no ESLint errors or warnings.
- `pnpm typecheck` — exit 0.
- `git diff --check` — clean.
- Food pgTAP plan is `SELECT plan(125)` with exactly 125 executable
  `ok`/`is`/`throws_ok`/`lives_ok` assertions.
- Generated access artifacts now enumerate 14 views and 531 explicit grants;
  the policy manifest remains unchanged because this slice adds no policies.
- `tsconfig.tsbuildinfo` was removed after typecheck. Pre-existing untracked
  `AGENTS.md`, `CLAUDE.md`, and `next-env.d.ts` were not touched or staged.

Runtime/type gates remain blocked by the local environment and no runtime
database/type result is claimed:

- `pnpm db:reset` —
  `SUPABASE_CLI_NOT_FOUND: project-local Supabase CLI is required; install the pinned dev dependency only after a local container runtime is available`.
- `pnpm db:test` — same exact `SUPABASE_CLI_NOT_FOUND` blocker.
- `pnpm db:lint` — same exact `SUPABASE_CLI_NOT_FOUND` blocker.
- `pnpm db:types:check` — same exact `SUPABASE_CLI_NOT_FOUND` blocker.

## Task 3B composed fix round 2 — 2026-08-29

Status: implementation complete; static/unit verification passed; runtime
database verification remains blocked.

I1 fixed the mutable price-evidence ambiguity. `public.food_items` now keeps
`price_vnd_min` and `price_vnd_max` nullable with no implicit zero defaults and
enforces a pairwise both-NULL or both-known constraint. Explicit `0/0` remains
valid. `private.assert_published_food_item_complete` rejects NULL prices before
numeric bounds/order checks, while immutable snapshot price columns remain
non-null. The rollback fixture covers omitted draft prices persisting as NULL,
publication rejection for unknown prices, and explicit zero-price publication
with complete evidence.

I2 records the actual delete path without weakening the schema: deleting the
fixture item is blocked by its restrictive child foreign keys before the
AFTER-row vendor guard, so the pgTAP assertion expects SQLSTATE `23503` and
describes that FK path. The available=false, status=draft, and reparent checks
continue to assert the vendor lifecycle guard itself.

The static artifact regression also checks the nullable/no-default price shape,
explicit NULL rejection in the publish helper, zero-price fixture coverage,
and the deterministic `23503` delete assertion. The food pgTAP plan is now
`SELECT plan(131)` for exactly 131 executable assertions.

### Fix-round verification evidence

- `pnpm db:static` — exit 0; 16 migration files checked.
- `pnpm test:run tests/unit/supabase/artifacts.test.ts tests/unit/supabase/rls-matrix.test.ts` — exit 0; 2 files, 27 tests passed.
- `pnpm test:run` — exit 0; 57 files, 593 tests passed.
- `pnpm lint` — exit 0; no ESLint errors.
- `pnpm typecheck` — exit 0.
- `git diff --check` — clean.
- Runtime `pnpm db:test` remains blocked by the exact
  `SUPABASE_CLI_NOT_FOUND` error; no PostgreSQL runtime result is claimed.

Implementation verified; fix-round 2 commit follows in this delivery.
