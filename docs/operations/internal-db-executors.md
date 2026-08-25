# Internal database executors

The guest and quota executor roles are internal database identities. The Task 7
migration creates `localens_guest_executor` and `localens_quota_executor` as
`LOGIN NOINHERIT NOBYPASSRLS` roles without a `PASSWORD` clause. This is
intentional: migrations must not contain reusable credentials, and these roles
must not inherit authority from another role.

## Provisioning

An administrator provisions a secret out of band after the migration has run:

```sql
-- Run in an administrator session. Replace the placeholders locally only.
ALTER ROLE localens_guest_executor PASSWORD '<generated-secret>';
ALTER ROLE localens_quota_executor PASSWORD '<generated-secret>';
```

Generate separate high-entropy secrets with the organisation's approved secret
manager. Do not use a developer password, a shared service password, or a
secret copied from another environment. The application does not connect as
these roles from a browser or from a developer workstation.

For Supabase, use the project pooler connection form appropriate to the runtime
(session pooler for a transaction that needs session state, or transaction
pooler for short stateless calls):

```text
postgresql://<role>:<secret>@<pooler-host>:<pooler-port>/<database>?sslmode=require
```

The complete DSN, including the generated secret, is stored only as an Edge
Function secret (for example, `LOCALENS_GUEST_EXECUTOR_DSN` or
`LOCALENS_QUOTA_EXECUTOR_DSN`). Keep it out of source control, local `.env`
files shared with the team, deployment manifests, SQL comments, tickets, and
logs. Runtime code authenticates directly as the intended executor, uses a
short-lived connection, and releases the connection after the RPC completes.
Never use `SET ROLE` to become a definer owner; executor roles are deliberately
not members of owner roles. Never print connection URLs or connection errors
containing their URLs.

## Runtime boundaries

The guest executor may call the internal create and guest-refinement RPCs. The
quota executor may call only the named quota reservation RPC:

```text
private.reserve_quota(reservation_id, kind, ip_hash, device_hash)
```

The public API roles do not receive private schema usage, base-table capability
access, or the private CAS implementation. Keep the executor grants narrow and
do not grant table `UPDATE`, `DELETE`, or `TRUNCATE` access to reservation
receipts. Reservation rows are append-only and protected by database triggers.

## Reservation outcomes

`reserve_quota` inserts its immutable reservation receipt before changing
counters. A new receipt returns `state = 'created'`; only this result authorises
the provider call. A retry with the same reservation ID and the exact same kind
and semantic hashes returns the stored decision with `state = 'replayed'` and
does not increment any bucket. Replays must skip the provider and return the
previous deterministic outcome to the caller. A reused ID with a different
kind or hash is rejected as a reservation conflict.

## Rotation, revocation, and verification

Rotate each executor independently on a planned schedule and immediately when
exposure is suspected:

1. Generate a new secret in the approved secret manager.
2. Apply `ALTER ROLE ... PASSWORD '<new-secret>'` in an administrator session.
3. Update the corresponding Edge secret, deploy, and verify one least-privilege
   RPC from the production runtime.
4. Revoke the old credential by replacing it; if the role must be disabled,
   use `ALTER ROLE ... NOLOGIN` and remove the Edge secret.
5. Verify role flags, function privileges, no protected-role memberships, and
   the absence of direct table mutation grants in the database audit query.

Do not put generated secrets in migration files, commit messages, test
fixtures, shell history, CI output, structured logs, screenshots, or support
messages. Redact DSNs before sharing diagnostics.
