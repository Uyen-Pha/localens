# Task 15 seed readiness

Task 15 remains **in progress**. It currently provides a fail-closed
readiness gate only. It does not render, create, or overwrite `supabase/seed.sql`.

Run:

```powershell
pnpm db:static:seed
```

The command is intentionally expected to exit with code `1` while the
checked-in catalog approval is still `draft`. Its JSON result reports the
first blocking code as `APPROVAL_NOT_READY`; it may also report independent
catalog, support, tour, and FX blockers. The gate never changes the approval
record, fetches a source URL, or writes a seed file.

The readiness codes are:

- `APPROVAL_NOT_READY`: the reviewer, UTC timestamps, checklist, namespace,
  counts, or source hashes are not approved and exact.
- `SOURCE_BUNDLE_NOT_READY`: the checked-in manifests fail the source and
  provenance checker.
- `CATALOG_NOT_SELLABLE`: a place is not sellable or has unknown opening
  hours.
- `SUPPORT_NOT_RUNTIME_READY`: dietary and mobility requirements do not have
  explicit runtime status maps.
- `TOURS_NOT_AVAILABLE`: a fixed tour or one of its stops is not available.
- `FX_NOT_SAFE`: stale demo FX is not keeping USD disabled.

A future SQL renderer may run only after a human reviews the official source
pages, confirms current access/hours/pricing and bilingual copy, records the
exact source hashes, and changes the approval record to `approved`. That
approval cannot be automated by this gate. The current Task14 draft remains a
research artifact; no place or tour is presented as published inventory.

The final renderer, `seed-shape` tests, and the exact 16-departure SQL seed are
still pending human approval. Passing a test-only approved fixture proves only
that the readiness contract can advance; it does not approve or publish the
checked-in catalog.

This gate does not prove PostgreSQL syntax, RLS, transaction locks, or
concurrency. Those claims remain deferred to the container-backed Task16
integration gate.
