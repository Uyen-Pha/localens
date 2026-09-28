# Research cancellation local gate (Main only)

These tests are deliberately outside `supabase/tests/database`: release migrations
do not yet include the original research baseline. The cancellation migration at
`supabase/migrations/20260928230000_research_booking_cancellation.sql` has an explicit
`MISSING_RESEARCH_BASELINE` guard. A fresh release DB cannot apply it until that
dependency is reviewed and supplied. Do not silently skip it or import later
personalized deadline/quote/list/approval replacements to hide the gap.

Prerequisite: Task 1's owned local target is already installed, with three legacy
bookings and `baseline-evidence.json`. See `../fixtures/research-baseline/README.md`.
No command below starts, resets, deletes, or connects to a hosted database.

From the recovery-review checkout, Main runs in this order:

```powershell
node scripts/test-research-cancellation-local.mjs --workdir D:/LocalLensSqlAudit/20260928-research-baseline --upgrade
if ($LASTEXITCODE -ne 0) { throw 'Research upgrade failed; preserve DB and inspect' }
node scripts/test-research-cancellation-local.mjs --workdir D:/LocalLensSqlAudit/20260928-research-baseline --test
if ($LASTEXITCODE -ne 0) { throw 'Research pgTAP failed; return output to Dev' }
node scripts/test-research-cancellation-concurrency.mjs --workdir D:/LocalLensSqlAudit/20260928-research-baseline
if ($LASTEXITCODE -ne 0) { throw 'Research concurrency failed; retain fixtures for diagnosis' }
node scripts/test-research-cancellation-local.mjs --workdir D:/LocalLensSqlAudit/20260928-research-baseline --upgrade
if ($LASTEXITCODE -ne 0) { throw 'Post-cancellation migration rerun failed' }
node scripts/test-research-cancellation-local.mjs --workdir D:/LocalLensSqlAudit/20260928-research-baseline --test
```

`--upgrade` compares every original legacy row to recorded Task 1 evidence. It
then snapshots all rows in the six original business tables plus cancellation
history, applies the migration twice in one transaction, and compares after each
pass. It also compares actual definitions of persist/submit/decide/create_quote/list.
No read RPC is used in snapshots, so old pending bookings do not expire as a test
side effect. The second upgrade command additionally proves rerun preserves
committed cancellation history and payment data from concurrency tests.

`--test` installs session-local fixtures, runs real pgTAP, and always rolls back.
Fixtures go through persist -> submit -> approve -> quote -> booking -> checkout.
Explicit fixture-only writes model expired/corrupt historical timing, a moved
request revision and an injected transaction failure; they never simulate payment.
No production helper replaces checkout. Policy equality at 48h and at expires_at
uses an explicit authority instant; real RPCs run on either side and after waiting
for a request lock. The test does not claim to freeze the real server clock.

Concurrency uses two independently guarded connections, executes the winning RPC
before commit, starts the contender's real RPC, and observes `pg_blocking_pids`
before releasing the winner. Cases: cancel-first, payment-first 47h/49h,
same/different cancellation keys, same key across bookings, and expiry during lock
wait. Assertions cover full stored row, final booking/payment status, paid event
count and history count. Committed synthetic fixtures are intentionally retained;
reruns create new UUIDs and do not delete prior evidence.

Temporary ACLs used to isolate RLS behavior are immediately revoked and also
covered by test rollback. No permanent private-schema grant or temporary owner
elevation is introduced. The original postgres owner still requires its original
RLS-bypass capability, checked by the shared Task 1 guard.

Local results do not prove hosted-definition equivalence, fresh-release readiness,
UI integration or deployment approval. Main owns SQL execution and QC evidence.
