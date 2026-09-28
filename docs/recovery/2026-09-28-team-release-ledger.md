# Coordinated release fixes

Base checkpoint: 95c39c4 (booking fixes committed at user request; not pushed).

## Ownership

- PM / Anscombe: read-only business acceptance and cancellation release audit.
- Dev 1 / Fermat: planner components and their tests; no shared adapters/dictionaries.
- Dev 2 / Parfit: portal/auth components and their tests; no planner files.
- QC 1 / Chandrasekhar: independent booking and assignment review, read-only.
- QC 2 / Pascal: deployment/database execution boundary review, read-only.
- Main: remaining account booking/catalog test reconciliation, integration, final verification and release decisions.

No agent may commit, push, deploy, run hosted mutations, migrations, or seeds. Preserve unrelated design-qa.md and tsconfig.tsbuildinfo changes.

## Main verification

- Reproduced four failures across runtime-fixed-tour-account, runtime-booking-management and fixed-tour-route-surface.
- Payment result test pinned an obsolete sentence suffix; retained meaningful simulated-payment result plus confirmed/paid state assertions.
- Admin booking tests assumed details were always open and no filter buttons existed; now click View details and assert cancellation history remains read-only inside the selected article.
- Booking route fixture omitted its published tour while expecting a valid booking form; supplied a complete matching synthetic tour rather than weakening missing-tour validation.
- These three files now pass: 51/51 tests. No production source change was required for these failures.

## Pending decisions

- User approved retaining and completing cancellation SQL with local tests only; hosted application requires separate impact approval. Remove existing-row backfill from the implementation.
- Docker verified ready (29.7.2); container and volume inventories were empty before QC 2 was assigned fresh local stack startup and database tests. Do not reset an unrelated stack.
- Integrated suite: 2,370 passed / 25 failed out of 2,395. Remaining failures require classification, not blanket skips. This is not a green release gate.
- Dev 1 now owns cancellation SQL/test corrections; Dev 2 owns legacy booking projection compatibility and strengthened read-only tests; QC 1 owns retry/remount/history regression coverage; QC 2 owns local database execution; PM classifies remaining failures against approved scope.
- Authenticated browser smoke participation requested. Never request passwords.

## Release guard

No blanket test skips. Distinguish obsolete expectations from observed product failures. Do not claim full-suite success from targeted results. Main/Production unchanged pending integration and acceptance.
