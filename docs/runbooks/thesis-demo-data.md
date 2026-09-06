# LocalLens thesis-demo data

This runbook describes the synthetic dataset and the guarded seeder. It is an
operator procedure for Task 18; Task 17 does not connect to or change any cloud
database. Its database proof runs only against a disposable local Supabase
project on reserved nonstandard ports.

## Current cloud inventory: v2 plus assignment-only companion

The accepted cloud marker remains `thesis-demo.v2`. On 2026-09-06, remaining
E19 acceptance required one new non-overlapping guide assignment. The four v2
checkout slots remain unchanged; qa-01 is paid and qa-02 cancelled. Their IDs
must never be reused for new checkout.

The companion manifest is `data/demo/thesis-demo.e19-assignment.v1.json`, version
`thesis-demo.v2.e19.assignment.v1`. Its scope is exactly one scheduled departure
`d1700000-0000-4000-8000-000001000451`, one confirmed QA-owned booking
`d1700000-0000-4000-8000-000001000502`, and its consumed hold
`d1700000-0000-4000-8000-000001000552`. It reuses published tour version 411,
capacity/party size 1, on 2026-10-03 02:00–05:00 UTC. The booking fully consumes
capacity, and is fixture data for assignment acceptance, not payment evidence.
No account, role, initial assignment, QA checkout slot or schema grant is added.

`scripts/seed-thesis-demo-e19-assignment.mjs` validates exact versioned IDs,
project marker, source graph, guide non-overlap and preservation of existing
teacher/QA bookings, holds, assignment and lifecycle facts. It performs three
inserts in one transaction, checks postconditions, and rolls back on failure.
`--dry-run` uses a read-only transaction without row locks. A second apply before
assignment returns already-present without inserts. After the native assignment,
the pre-assignment seeder deliberately refuses lifecycle drift; do not use it
as a general database health check or rerun it to reset the assignment.

Operator connection input stays outside Git in process-scoped variables. The
CLI requires `LOCALENS_THESIS_DEMO_E19_CONFIRM=localens-thesis-demo-e19-assignment`
and the exact verified project ref, database host/port/name/login and Supabase
URL. The DB URL must use `sslmode=verify-full`; the official Supabase CA can be
supplied through process-only `NODE_EXTRA_CA_CERTS`. Never disable certificate
or hostname verification. See [Supabase SSL documentation](https://supabase.com/docs/guides/platform/ssl-enforcement).
Never place credentials in a command argument, report or committed env file.

Cloud apply passed on 2026-09-06 after Astra review, 10 focused unit tests and a
fresh disposable SQL dry-run/apply/replay/forced-rollback run. Cloud readback
confirmed the three exact rows and zero initial assignments. The native admin
assignment result remains pending and will be recorded separately in the release acceptance report.

The existing full v1/v2 seed inventory intentionally rejects extra companion
rows and consumed QA lifecycle state. **Do not run the full cloud seed, reset or
cleanup against this active database.** Preserve the additive companion in
future inventory/migration planning; a new demo date requires a new reviewed
version. Data changes remain forward-only, including during frontend recovery.

The sections below describe the original v1 bootstrap and v2 upgrade history.

## Dataset boundary

- Manifest: `data/demo/thesis-demo.v1.json`
- Version: `thesis-demo.v1`
- Classification: `synthetic_demo`
- Timezone: `Asia/Ho_Chi_Minh`
- Fixed base date: `2026-09-05`
- Departures use only fixed offsets `+7`, `+14`, and `+21` days. A future demo
  must receive a new dataset version instead of rewriting v1 or old bookings.
- All 12 place names, descriptions, hours, prices, routes, and all three tours
  are fictional thesis-demo content. The manifest deliberately makes no claim
  about a real venue, vendor, image provider, or commercial license.
- `synthetic_demo` is a manifest and marker boundary, not an invented column in
  the production catalog schema.

The teacher and QA departure ID sets are disjoint. All three teacher
departures start scheduled and have no seeded booking owned by the teacher
customer. The only sold-out departure is QA-only.

The scheduled QA departure has capacity 20. Cloud smoke may use only
`customer.qa@localens.invalid` and the four stable slots `qa-01` through
`qa-04`; each slot commits at most two seats and reuses its manifest IDs and
idempotency keys. Stop after the four slots. Do not generate another slot,
reset a departure, or delete a booking. Teacher departure capacity must be read
before and after QA smoke and remain unchanged.

The pre-seeded `pending_payment` cancellation fixture is a complete synthetic
checkout graph: booking, active capacity hold, checkout attempt, and checkout
idempotency receipt all use stable manifest IDs. Its 35-minute hold ends at the
QA departure start (`2026-09-12T07:00:00Z`), so v1 is deliberately bounded to
the dated thesis-demo window. Do not rewrite its timestamps to prolong v1;
publish a reviewed new dataset version for a later defense date. Payment remains
simulated and no provider session or payment row is attached to this fixture.

## Identities

The apply postcondition is four accounts across three roles:

| Account | Role | Audience |
|---|---|---|
| `customer.demo@localens.invalid` | customer | teacher walkthrough |
| `guide.demo@localens.invalid` | guide | teacher walkthrough |
| `admin.demo@localens.invalid` | admin | operator only |
| `customer.qa@localens.invalid` | customer | automated/manual QA only |

Do not put account credentials in the manifest, metadata files, Git, logs, or
acceptance evidence. Do not give the QA account to the teacher. An existing
matching Auth account is reused without changing its credential. If Auth
creation succeeds and the PostgreSQL transaction later fails, the account is
retained; correct the database issue and rerun the same dataset.

## Required target evidence

The seeder never infers a project from a runtime URL or database hostname. The
controller must independently verify the selected Supabase project and provide
two temporary JSON files outside the repository.

Selected-project file, copied from the authenticated Supabase CLI project
listing:

```json
{
  "source": "supabase-cli-projects-list",
  "verified": true,
  "project": {
    "id": "<verified-project-ref>",
    "organizationId": "<verified-organization-id>",
    "name": "localens-thesis-demo"
  }
}
```

Dashboard-connection file, copied independently from the selected project's
connection panel or a supported Management API response:

```json
{
  "source": "supabase-dashboard-connection-panel",
  "verified": true,
  "connection": {
    "projectRef": "<same-verified-project-ref>",
    "hostname": "<verified-hostname>",
    "username": "<verified-username>",
    "database": "postgres",
    "port": 6543
  }
}
```

`source` may instead be `supabase-management-api` for the connection file.
Never create either file by parsing the database URL. A shared pooler hostname
alone is insufficient: project ref, organization, runtime endpoint, hostname,
username, database, port, and the live TLS verification must all agree.
Port `6543` above is a transaction-pooler example. A Management API-verified
direct host may instead use user `postgres`, database `postgres`, and port
`5432`; the metadata and the live client connection must still match exactly.

## Process-only environment

Set values only in the operator's current shell or secret store. The four
credential values must be non-empty even for dry-run, but dry-run never sends
them to Auth.

```text
LOCALLENS_THESIS_DEMO_SEED_CONFIRM=localens-thesis-demo
LOCALLENS_THESIS_DEMO_SEED_DRY_RUN=1
LOCALLENS_THESIS_DEMO_DB_URL=<verified PostgreSQL URL with sslmode=verify-full>
NODE_EXTRA_CA_CERTS=<path to the verified Supabase CA certificate when Node does not already trust it>
LOCALLENS_THESIS_DEMO_EXPECTED_PROJECT_REF=<verified project ref>
LOCALLENS_THESIS_DEMO_EXPECTED_ORGANIZATION_ID=<verified organization id>
LOCALLENS_THESIS_DEMO_SELECTED_PROJECT_FILE=<absolute temporary file path>
LOCALLENS_THESIS_DEMO_DASHBOARD_CONNECTION_FILE=<absolute temporary file path>
NEXT_PUBLIC_SUPABASE_URL=https://<verified project ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-side value>
LOCALLENS_DEMO_CUSTOMER_PASSWORD=<process-only value>
LOCALLENS_DEMO_GUIDE_PASSWORD=<process-only value>
LOCALLENS_DEMO_ADMIN_PASSWORD=<process-only value>
LOCALLENS_DEMO_QA_CUSTOMER_PASSWORD=<process-only value>
```

Do not print the shell environment. Do not save a plaintext env file in the
repository.

If Node reports `SELF_SIGNED_CERT_IN_CHAIN`, do not weaken TLS or change
`sslmode`. Download the certificate linked by the selected project's Database
Settings page, validate that it is the public `Supabase Root 2021 CA` without a
private key, and set `NODE_EXTRA_CA_CERTS` only in the operator process. The
Task 18 certificate observed on 2026-09-06 was downloaded from the authenticated
Supabase dashboard and had SHA-256 fingerprint
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`;
it expires in 2031. The seeder must still observe both an encrypted and an
authorized live TLS stream.

## Dry-run

Prerequisites: the candidate migrations, including
`private.thesis_demo_manifest`, already exist on the separately verified demo
project. First inspect migration history and drift read-only as required by the
cloud release runbook.

With `LOCALLENS_THESIS_DEMO_SEED_DRY_RUN=1`, run:

```powershell
corepack.cmd pnpm db:seed:thesis-demo-cloud
```

Dry-run performs only:

1. local manifest validation;
2. independent project/organization/dashboard/runtime/database/TLS matching;
3. read-only inventory, stable-content graph, and marker queries;
4. `BEGIN READ ONLY`, bounded `statement_timeout`, marker-schema check, and
   `ROLLBACK`.

It does not list through Auth Admin, create, or update Auth users and does not
insert, update, or delete database rows. The PostgreSQL inventory does count
`auth.users` by exact email equality; it never infers ownership from an email
substring. Auth-dependent postconditions are reported as
`DEFERRED_UNTIL_APPLY`.

Inventory accounting is per relation, not a selected-table aggregate. Every
`public`, `private`, and application-referenced `auth` base relation declared
by the migration set has one row with total, classified demo, exact migration
baseline, and unclassified counts. Relation drift, a missing/duplicate
relation, a negative or inconsistent count, or any unclassified row is a hard
refusal. The sole migration baseline allowance is the exact
`private.stripe_test_settings` test-mode row installed by its migration; it is
counted explicitly and is not relabelled as thesis-demo data.

A missing marker permits only these states:

- the exact migration baseline with no application rows and no Auth users; or
- the same empty application state with only a subset of the four exact demo
  Auth emails. This second mode covers interrupted Auth creation as well as
  the common recovery case where all four Auth identities exist after a later
  PostgreSQL rollback.

Any foreign Auth user still refuses recovery. An existing marker additionally
requires every non-baseline row to be attributable to stable dataset IDs or
the exact demo owners, plus an exact full-content graph comparison. A partial
or mismatched stable graph stops the run even when IDs and statuses happen to
match.

## Apply and safe rerun

Review the dry-run result before changing the mode. For apply, set
`LOCALLENS_THESIS_DEMO_SEED_DRY_RUN=0` exactly and rerun the same command. Never
remove the selector: the CLI accepts only explicit `"1"` for dry-run and
explicit `"0"` for apply.

Apply sequencing is fixed:

1. repeat all target guards;
2. list Auth identities after the target passes;
3. reuse matching identities without credential reset and create only missing
   identities;
4. begin one PostgreSQL transaction with a 15-second statement timeout and
   compare the complete stable graph before the first mutation;
5. if that graph is exact, skip all seed writes and commit the verified rerun;
   if it is partial or mismatched, roll back and refuse;
6. only for an empty graph or the exact Auth-trigger recovery graph, converge
   the four demo profiles/roles, upsert stable thesis-demo IDs, and create one
   catalog and travel snapshot graph; never truncate/reset/delete unrelated data;
7. under `localens_tour_rpc_owner`, insert all five departures as `scheduled`,
   then use the supported lifecycle update to transition only the dedicated QA
   departure to `sold_out`;
8. create the pending-payment fixture's stable checkout attempt and idempotency
   receipt, then enable `localens.guide_assignment_transition` only around the
   assignment insert under `localens_guide_assignment_rpc_owner` and turn it off
   immediately afterward;
9. insert the singleton marker in the same transaction as the dataset;
10. compare complete relevant content and relationships for identities, roles,
    bilingual catalog rows and snapshots, tours/translations/stops, departures,
    fixture booking owners/departures/amounts, checkout attempt/idempotency,
    holds, assignment, and marker;
11. commit only on an exact match, otherwise roll back every PostgreSQL seed
    change.

Run apply a second time against the same verified target. It must reuse all
four Auth identities and verify the existing stable snapshot/tour graph before
the immutable published child inserts. An exact graph skips those inserts
entirely. A mismatch, partial graph, foreign row, or postcondition failure is a
stop condition, not permission to clean, reset, truncate, or broaden an
allowlist.

Auth Admin operations are outside the PostgreSQL transaction. Therefore a
database rollback does not remove newly created Auth users. This is expected
and recoverable: preserve them and rerun. Marker-missing recovery accepts only
an exact subset of the demo-email allowlist together with the matching default
`profiles` and customer `user_roles` rows created by the Auth trigger. Every
other application relation must remain empty, and any foreign Auth identity or
changed trigger row is refused. Never compensate by deleting an existing or
partially created identity.

Task 17 supplies unit-tested orchestration plus disposable local-database proof:
all pgTAP tests, a forced pre-marker rollback, apply twice, full graph inventory,
one real `cancel_booking` call rolled back to the exact seed graph, and a stable
content-conflict refusal. None of this is evidence of Supabase Cloud mutation;
Task 18 records cloud evidence separately.

## Research-readiness rule

This seeder is a narrow synthetic thesis-demo publication path protected by
the marker and stable IDs. It does not approve the research catalog and does
not weaken or bypass `db:static:seed` readiness. A research-readiness refusal
remains a valid fail-closed result; do not alter approvals or general catalog
status to make this demo seed pass.
