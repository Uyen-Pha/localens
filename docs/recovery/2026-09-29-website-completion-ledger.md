# Website completion after local SQL checkpoint

Base: `5a2fcee`. User requests completion, preserving approved thesis UI and stable runtime. No hosted SQL, backfill, production deploy or merge without the outstanding release gates. Existing changes belong to the recovery effort unless proven otherwise; never discard them.

## Work allocation

- Main / PM: integration, mobile CSS defect, verification, commit boundaries.
- Dev1 / Ptolemy: Tour page/API/import-boundary failures.
- Dev2 / Sagan: Planner/area adapter failures.
- QC1 / Avicenna: read-only SQL gate classification and safe release boundary.
- QC2 / Schrodinger: read-only dirty recovery integration review.

## Findings and progress

- Baseline: 2,528/2,548 tests passed, 20 failed. No blanket skips or suppression of SQL findings.
- CSS RED: 3/9 failed. Actual mobile home stops hid their descriptions and root overflow clipped content. Restored one-column mobile flow and visible descriptions, leaving desktop design unchanged. Two other failures were missing runtime stylesheet imports in test inventory and stale/missing checksum comments. GREEN: 9/9.
- Ruling: update stale assertions only when source and approved user intent support the change. Keep direct behavior assertions; do not revert approved runtime pages to obsolete demo designs to satisfy tests.
- Ruling: SQL static gate must remain fail-closed on unresolved privilege issues. A frontend prototype completion must not silently expand database permissions solely to make that gate green.

## Verification pending

Tour / Planner targeted tests; QC review; build/typecheck/scoped lint; local browser smoke; final integrated tests and explicit remaining blockers.
