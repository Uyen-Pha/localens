# Selected research cancellation release candidate

This is an independently tested **selected upgrade**, not a replacement migration
chain or a hosted deployment tool. No omitted migration version may be marked
applied. No business RPC body or historical migration is edited here.

## Exact scope and transaction

The release unit is, in this order, one transaction:

1. `preflight.sql` (fail closed on mismatched baseline/body/owner/ACL/ledger).
2. The exact statements **between** BEGIN and COMMIT in
   `supabase/migrations/20260928230000_research_booking_cancellation.sql`.
3. `permissions.sql`.
4. Verification, then an explicitly authorized operator decides whether to commit.

The supplied local runner always ROLLBACKs; it has no commit/apply/reset mode.
Do not execute the original 2300 COMMIT before the scoped permissions.
Do not independently run permissions.sql on an unknown baseline.

Only the new cancellation RPC moves to the existing
`localens_cancellation_customer_rpc_owner`. The actor, booking/checkout and three
invoker helpers retain postgres ownership. This selected profile deliberately
requires the verified postgres-owned checkout baseline; it does not silently adapt
to other owners. Original postgres RLS bypass and existing auth REFERENCES authority
are prerequisites. No auth schema/table grants or auth policies are added.

Actor manifest, role and banned-user checks remain byte-for-byte unchanged.
Cancellation retains its original request/booking ownership, locks, idempotency,
48-hour rule and immutable ledger. Payment remains simulated, with persistent DB
state. The selected release does not ship core cancel_booking changes, new deadline
rules, reviewed RPC hardening, guide changes or an assignment bridge.

The safe owner receives private/public USAGE, actor/helper EXECUTE, SELECT on the
four required research tables, booking UPDATE(status), request UPDATE(id) for row
locking, ledger INSERT, and matching RLS policies. It gets no payment-field UPDATE,
DELETE, TRUNCATE, role membership or direct auth access. Existing unrelated core
cancellation privileges are preserved. Temporary public CREATE is removed.

## Reapplication

After the first application, the cancellation function is custom-owned. Replaying
its CREATE OR REPLACE as a non-inheriting postgres operator is not assumed safe.
The runner executes that **one unchanged source statement** under its existing
bounded owner, with temporary public CREATE, then resets to postgres and removes
CREATE before permissions.sql. All other source statements execute as postgres.
This is transaction-local; function ownership is never reverted to postgres.
An operator assembling a selected-release artifact must preserve this dispatch
on reapply, not blindly concatenate the files. Unknown owners fail closed.

The current pending 020000/030000/040000 chain is NOT certified or made deployable
by this candidate. Before any future normal migration rollout, reconcile its
ownership assumptions with the selected state. Keep the actual executed artifact,
its hashes, transaction outcome and pre/post evidence separately; never forge
supabase_migrations entries for skipped files.

## Fingerprints and preimages

Hosted-provided raw md5(prosrc) pins (also reproduced from the raw local fixture):

- actor: `f741eef8e857b6c6b6ede4b731b9a560`
- booking: `dd9cdd374f4fb710b92a7a493f24560d`
- checkout: `f1bc48cd8d8facec42d4a0d0500cd139`

The baseline booking/checkout pins are **raw**, not whitespace-relaxed. For the
known 2300 bodies only, guards normalize CRLF to LF before comparing the pinned
body hash: the existing local upgrade used LF whereas the checked-out original
2300 file uses CRLF. No other whitespace or SQL token normalization is performed.
Actor is always checked against its exact raw fingerprint in permissions.sql.

Before any authorized hosted execution retain a recoverable row backup and capture
definitions, owners, ACLs, proconfig, booking status constraint, ledger schema and
triggers, affected policies and owner/schema/column privileges. Record absence of
new objects, plus migration history. The actor ACL intentionally gains only the
cancellation owner's EXECUTE entry. Booking/checkout response bodies and timeouts
change exactly as 2300 specifies; their owners remain unchanged.

Before commit, ROLLBACK restores all selected changes. After real cancellations,
do not drop history, reinstate the old status constraint or revert statuses blindly.
Disable the new RPC entry if necessary and use a separately reviewed forward repair
or tested restore. No destructive down migration is supplied.

## Local evidence command

```powershell
node scripts/test-research-cancellation-selected-local.mjs --workdir D:/LocalLensSqlAudit/20260928-research-baseline
node --test tests/scripts/research-cancellation-selected.test.mjs
```

The runner uses the existing readTarget/openLocalClient checks: owned project marker,
config fingerprint, no hosted link, local Docker endpoint, exact running container
labels/workdir/port and loopback connection. It neither starts nor resets anything.
It requires real postgres NOSUPERUSER/BYPASSRLS, no auth USAGE grant option, and
existing auth.users REFERENCES. It does not change platform privileges to simulate
these properties. The cancellation owner must lack auth USAGE before and after.

Test scenarios, all rollback-only:

- Reconstruct selected pre-upgrade objects in a savepoint using the raw historical
  fixture bodies; remove only new cancellation objects inside that savepoint;
  assert raw fingerprints match hosted evidence. This is baseline-shaped testing
  on the existing isolated DB, not a fresh full hosted clone.
- Apply exact 2300 body plus permissions; unchanged 123-case research pgTAP suite.
- Explicit banned customer's own cancellation denied with no row/history mutation.
- Auth-schema boundary, write-column limits, public RPC/private-helper ACL checks.
- Incompatible actor and excess payment-write grant rejected; savepoint restored.
- Apply twice and after successful cancellations; retain every business/history row.
- Inject a late exception; compare restoration. Final ROLLBACK compares all captured
  public/private/auth catalog objects, grants/roles/memberships and research rows.

RED evidence: unchanged 2300 plus empty integration failed the real DB assertion
`cancellation must run as bounded custom owner` (actual postgres). The permission
integration makes that assertion and the real RPC tests pass.

Limits: no hosted execution, browser acceptance or concurrent-session gate is claimed.
The existing concurrency runner commits fixtures, so it is deliberately not invoked
under this task's no-data-commit restriction. The full permission suites require the
different 020000 ownership design and are neither edited nor represented as passing.

Snapshot comparison excludes only these pg_class maintenance fields: relpages,
reltuples, relallvisible, relallfrozen (when present), relfrozenxid and relminmxid.
They are planner/visibility estimates and vacuum freeze horizons, which can advance
independently of rollback. All other catalog fields (including relfilenode), owners,
ACLs, RLS, column definitions and business rows remain compared. No autovacuum or DB
setting is changed. Mismatch diagnostics show bounded object/field identifiers only,
never full catalog definitions or business row values.
Field meanings follow the [PostgreSQL pg_class catalog documentation](https://www.postgresql.org/docs/current/catalog-pg-class.html).
In particular, relowner, relacl, relrowsecurity and relforcerowsecurity are not excluded.
