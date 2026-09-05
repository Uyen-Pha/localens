# LocalLens planner operation contract — historical Task 14.1 snapshot

Status: **historical Task 14.1 checkpoint**. This file preserves the contract
freeze and shared-pure extraction evidence as it existed before Tasks 14.2–14.5
implemented the SQL/RPC, Edge operation wiring, browser persistence, adapter,
and coordinated callsite changes. Statements below about work that “remains”
describe that earlier checkpoint, not the current candidate. Current status is
tracked in [`planner-experience.md`](./planner-experience.md).

## Scope and compatibility boundary

`RuntimePlannerOperation` is the only new mutation-scope type exported to the
current application layer:

```ts
interface RuntimePlannerOperation {
  readonly operationId: string;
}
```

The value is a UUID created once by the browser for one deliberate recommend
or refine action. The same value is reused for a same-body retry. It is not a
plan ID, owner ID, request-correlation ID, input digest, quota receipt, lease
token, or a container for identity or user text.

The current `RuntimePlannerPort` method signatures and all existing callsites
remain unchanged in this checkpoint. The coordinated third operation argument
is introduced only after the server operation gate passes, in 14.3. The
current `RuntimePlannerError` keeps its legacy-compatible fields; `status` and
`operationState` are additive optional fields. The strict server-decision
vocabulary is exported separately as `RuntimePlannerErrorContract` and
`RUNTIME_PLANNER_ERROR_DEFINITIONS` so this freeze does not create a mixed
frontend/backend contract.

## Transport and request scope

- Recommend and refine runtime entrypoints accept a strict body containing the
  operation UUID alongside the already validated request fields. They do not
  accept owner identity, a client digest, quota IDs, lease tokens, raw PII, or
  raw special-needs/feedback text.
- Both runtime entrypoints are authenticated-only customer operations. A
  verified JWT is required before operation claim, quota reservation, provider
  work, or persistence. A guest token is not an alternative runtime authority;
  guest-only handler fixtures remain test-only until their contract is removed.
- The server derives `ownerUserId` from the verified JWT. The operation scope is
  the unique pair `(ownerUserId, operationId)`. An owner cannot read, claim, or
  replay another owner's operation.
- Same-body mutation retry is the idempotency/status transport: the server
  atomically looks up, claims, reconciles an expired lease, or returns the
  already-known terminal result for the same operation body. A read-only
  operation-status RPC may support an explicit “check again”, but it never
  claims, reserves quota, expires a row, calls a provider, or creates a plan.
- A pending operation has precedence over a fresh Generate action. An
  unresolved `in_progress` or unknown response is checked with the same UUID;
  it is never silently converted into a new operation. A confirmed rejected
  or interrupted result can be retried only after a new, explicit user action
  creates a new UUID.

## Server canonical digest

The server computes digest version `v1` only after strict schema validation. A
client-provided digest is ignored. The digest input is the canonical JSON
object `{ v: 1, kind, payload }`:

- object keys are sorted lexicographically at every depth;
- timeline/order-sensitive arrays preserve order;
- `areas`, `lockedStopIds`, `lockedItemIds`, `dietaryRequirements`, and
  `mobilityRequirements` are treated as sets: deduplicate, then sort;
- timestamps require an explicit `Z` or `±HH:MM` offset, must represent a real
  instant, and may carry at most millisecond precision. Inputs with non-zero
  submillisecond digits are rejected. Accepted instants serialize as UTC
  `YYYY-MM-DDTHH:mm:ss.SSSZ`; numbers must be finite and use canonical JSON
  representation, and UUIDs are lowercase;
- digest v1 has no clock-derived or implicit schema defaults. Every recommend
  member in the strict `ItineraryRequest` and every refine member
  (`planId`, `baseRevision`, `scope`, normalized signals, and `lockedItemIds`)
  is materialized. Empty set-like arrays remain `[]`; absent fields without a
  fixed default are omitted; explicit `null` is not a digest value. Adding or
  changing a default requires a digest-version change;
- refine includes only the bound target plan, base revision, scope, locked IDs,
  and supported refinement signals;
- locale, owner ID, correlation ID, raw feedback, raw special-needs text, and
  other PII are not digest inputs.

For the same owner, UUID, kind, and digest, the server returns the existing
operation decision and does not reserve quota, call a provider, or mutate a
plan again. A different digest or kind under the same owner/UUID is
`OPERATION_CONFLICT` before side effects. The conflicting request does not
mutate or reveal the existing operation's terminal state, so its wire response
omits `operationState`; the browser stops the mismatched retry but preserves
any original same-body pending record for reconciliation. A different owner
has no operation visibility.

## Operation state, lease, and replay

The only state machine is:

```text
claimed -> completed
        -> rejected
        -> interrupted
```

`completed`, `rejected`, and `interrupted` are immutable terminal states.
There is no lease stealing, terminal-state reset, or second provider attempt
under the same operation UUID.

- A claim creates and persists its lease/version token using authoritative
  database time. The RPC samples `clock_timestamp()` after it acquires the row
  lock, persists expiry exactly 60 seconds later, and treats server time
  `>= lease_expires_at` as expired. Lease decisions compare database timestamps
  directly and never use browser time or a lossy JavaScript conversion.
- Claim, lookup, and expiry reconciliation are serialized by the same row lock
  and compare-and-set/version guard. If a committed completion exists, replay
  wins; if the lease expired without a committed completion, the row becomes
  `interrupted`. An expired worker token cannot complete afterward.
- A completed retry reconstructs the exact stored `(planId, revision)` of that
  operation, even if the plan has since received a newer revision. It never
  reapplies a refine delta to the latest revision.
- `getPlan(planId, locale)` remains a separate owner-scoped latest-read
  operation. It returns the current latest revision for refresh/restore and is
  not the replay path for a completed mutation.

## Quota and provider decisions

The claim creates two distinct server-owned UUIDs exactly once:

```text
plannerReservationId != geminiReservationId
```

They are stable for the operation, have separate kind/uniqueness checks, are
never accepted from the browser, and are returned again on replay only through
safe server decisions. A duplicate request does not increase either quota
counter. Provider work starts only after the claim and the appropriate
reservations succeed.

The provider is an external side effect, so the contract does not claim
exactly-once HTTP delivery. If a process dies after sending a provider request
but before persistence, the server must reconcile the operation before any
future action; it must not blindly call the provider again under the same UUID.
An unresolved network response is not silently changed into a confirmed
rejection.

## Plan pointer and pending data

The later browser helper stores only this owner-bound pointer in localStorage,
with a 24-hour TTL:

```text
{ version: 1, ownerUserId, planId, savedAt }
```

After a successful persisted proposal, the pointer is saved. On restore,
session resolution and owner equality precede `getPlan`; the database latest
revision is authoritative and the browser does not treat a cached proposal as
the source of truth.

- A transient read failure (network, timeout, or identified 5xx) retains the
  valid 24-hour pointer and offers a reload action.
- A confirmed missing/forbidden result (known 0-row, 403, or 404) clears the
  pointer and shows sanitized plan-unavailable copy without revealing whether
  another owner exists.
- A pending operation is written to sessionStorage before the first invoke and
  contains only the allowlisted request or normalized refinement signals. Raw
  feedback is not stored.
- Pending, unknown, or `in_progress` operations never erase or replace the last
  valid plan pointer. Owner-scoped `getPlan` stays available as a read-only
  latest-plan view while an operation is pending, but it does not claim,
  reconcile, or resolve that operation. The pointer is replaced only after
  verified successful persistence, subject to the ownership, expiry, and
  confirmed-unavailability cleanup rules above.
- Within planner persistence, the verified `ownerUserId` UUID is permitted
  solely for server ownership and owner-scoped plan/pending pointers.
  Browser-stored owner IDs are not authorization evidence. Never persist
  credentials, JWTs, access/refresh tokens, email, phone, raw feedback, raw
  special-needs text, or other non-allowlisted personal data. Exclude owner
  identity from mutation bodies, digests, provider payloads, and planner logs.
- `preferTypes` remains zero-or-one. The current normalizer's precedence is
  preserved; it does not become a multi-select parser in this checkpoint.

## Strict error vocabulary

The following are the frozen operation-aware code/status/messageKey/retryable/
operationState pairs. `—` means the field is omitted because there is no
verified operation state (for example, pre-claim validation or an unresolved
transport failure). A `rejected` state means the server has confirmed that the
operation cannot continue under its current body; it does not authorize a
client to reuse the same UUID for a changed request.

| Code | HTTP | messageKey | retryable | operationState |
| --- | ---: | --- | :---: | --- |
| `AUTH_REQUIRED` | 401 | `planner.auth_required` | false | — |
| `AUTH_EXPIRED` | 401 | `planner.auth_expired` | false | — |
| `INVALID_REQUEST` | 400 | `planner.invalid_request` | false | — |
| `QUOTA_EXCEEDED` | 429 | `recommendation.quota_exceeded` or `refinement.quota_exceeded` by kind | true | rejected |
| `STALE_REVISION` | 409 | `refinement.stale_revision` | true | rejected |
| `SERVICE_UNAVAILABLE` | 503 | `planner.service_unavailable` | true | — |
| `INVALID_ITINERARY_INPUT` | 400 | `itinerary.input.invalid` | false | — before claim, or rejected after a persisted rejection |
| `USD_DISABLED` | 422 | `itinerary.usd_disabled` | false | — before claim, or rejected after a persisted rejection |
| `NO_FEASIBLE_ITINERARY` | 422 | `itinerary.no_feasible` | false | rejected |
| `CATALOG_UNAVAILABLE` | 503 | `recommendation.catalog_unavailable` | true | rejected |
| `TRAVEL_DATA_UNAVAILABLE` | 503 | `recommendation.travel_data_unavailable` | true | rejected |
| `FX_UNAVAILABLE` | 503 | `recommendation.fx_unavailable` | true | rejected |
| `ITINERARY_SEARCH_LIMIT` | 503 | `itinerary.search_limit` | true | rejected |
| `INVALID_ITINERARY_RESULT` | 500 | `itinerary.result.invalid` | false | rejected |
| `PLAN_NOT_FOUND` | 404 | `refinement.plan_not_found` | false | — for read-only lookup, or rejected after a persisted rejection |
| `PLAN_UNAVAILABLE` | 503 | `refinement.plan_unavailable` | true | — before claim/transient read, or rejected after a persisted rejection |
| `SNAPSHOT_MISMATCH` | 409 | `refinement.snapshot_mismatch` | false | rejected |
| `LOCKED_ITEM_INVALID` | 422 | `refinement.locked_item_invalid` | false | rejected |
| `OPERATION_IN_PROGRESS` | 409 | `planner.operation_in_progress` | true | in_progress |
| `OPERATION_CONFLICT` | 409 | `planner.operation_conflict` | false | — |
| `OPERATION_INTERRUPTED` | 409 | `planner.operation_interrupted` | false | interrupted |

`retryable` controls whether a safe user action is available; it never means
“automatically send the same mutation again”. `operationState` controls whether
the current UUID may be checked, must be abandoned, or is still unresolved.
Only a confirmed persisted rejection may emit `operationState: "rejected"`;
the same code without verified operation state must use its explicit `—`
variant and omit the field. The UI must render trusted copy from this allowlist and never render a raw
server message. A response with an unknown code, mismatched tuple, malformed
body, or unverified state is sanitized to a generic failure.

## Old-client and legacy-write decision

The 14.2 deployment must reject a missing/invalid operation UUID before claim,
quota, provider, or persistence. Backend rejection and frontend signature
adoption are coordinated; no mixed-version client is allowed to reach a
side-effecting path.

Operation-only writes later revoke external EXECUTE access to all three legacy
public mutation routes:

```text
public.create_authenticated_trip_plan(uuid,jsonb)
public.advance_authenticated_trip_plan_revision(uuid,integer,jsonb)
public.advance_trip_plan_revision(uuid,integer,jsonb)
```

Historical migration assertions and validation coverage remain unchanged. The
revocation is not performed in this contract checkpoint.

## RED/GREEN matrix for Task 14.1

| Focused case | RED before this checkpoint | GREEN evidence now | Next gate |
| --- | --- | --- | --- |
| Browser operation scope | `RuntimePlannerOperation` was absent | Type export and UUID-only shape test pass | 14.3 adds the third coordinated port argument |
| Strict error vocabulary | New codes, statuses, message keys, and operation states had no shared contract | 26 context-specific table entries, including both quota-key variants, match exactly | 14.2/14.4 validate server/UI parsers and HTTP responses |
| Pure signal module | Application import failed because only the Edge helper existed | Application helper tests pass with NFKC/bilingual behavior | 14.3 uses the same pure output for pending/retry payloads |
| Edge import boundary | Edge re-export target was absent | Edge export is the identical application function; both Deno maps resolve it | 14.2/14.5 validate Edge artifact boot and runtime |
| `preferTypes` cardinality | No explicit regression guarded the zero-or-one rule | Multiple preferences resolve to the existing single-preferred result | Any multi-signal expansion requires a separate contract decision |

Focused command results:

```text
corepack.cmd pnpm test:run tests/unit/planner/runtime-planner.test.ts tests/unit/supabase/refinement-signals.test.ts --no-file-parallelism --testTimeout=30000
Initial RED: exit 1 (missing application helper and contract exports)
Review-correction RED: exit 1, runtime suite 3 failed / 3 passed
Accepted GREEN: exit 0, 4 files / 44 tests passed (including Edge artifacts)
Typecheck: exit 0; focused ESLint: exit 0; scoped diff check: exit 0
Independent read-only re-review: PASS, 197 generated tuple checks
```

## Deliberate non-goals and blockers at the Task 14.1 checkpoint

At that historical checkpoint, this snapshot did not implement operation SQL, claim/reconcile/complete/
reject RPCs, authenticated Edge wiring, digest computation, quota integration,
pointer/session helpers, UI retry behavior, adapter mapping, old-route revoke,
or any recommend/refine signature change. It therefore cannot claim server
idempotency, crash recovery, cloud authentication, browser persistence, or
Task 14 completion.
