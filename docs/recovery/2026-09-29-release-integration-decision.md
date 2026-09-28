# Release integration: historical decision, now superseded

The subsequent user continuation authorized LOCAL implementation of this proposal. See `2026-09-29-research-integration-handoff.md` for implementation and verification. Hosted SQL remains separately gated; the read-only statements below describe the earlier inspection, not current local work.

Read-only follow-up at HEAD `fba99fe`, branch `recovery/unified-preview`.

## Confirmed from current sources

- Research baseline fixture ends at `20260924180000`; it is not a complete release migration chain.
- Source `localens-guide-release/supabase/migrations/20260925090000_personalized_deadlines.sql` adds request timing columns, three UPDATE backfills and NOT NULL constraints. Its trigger enforces 72-hour submission lead time and 12-hour processing. Copying this migration wholesale would violate the no-backfill boundary if later applied to existing data.
- The fixture README explicitly requires the original postgres owner with BYPASSRLS for forced-RLS tables. `docs/security/data-access-matrix.json` describes postgres as DDL owner only, never used by browser/Edge requests. Adding object names without reconciling this execution-owner contract is not a verified permissions fix.
- Current uncommitted recovery changes were preserved. No SQL, database data, migration, runtime, UI or permission configuration was modified in this follow-up.

## Recommended next scope

Approve local-only release integration design: inventory the full source dependency graph including later deadline definitions, specify a no-business-row-backfill upgrade path with explicit legacy behavior, then reconcile execution owners and minimum grants without weakening RLS. Test fresh bootstrap and populated upgrade separately on isolated local databases. Do not copy historical migrations blindly or regenerate the security manifest as a blanket allowlist.

This scope changes migration packaging and may require a new local SQL integration artifact / execution-owner policy. Obtain approval before implementation. Hosted SQL remains separately gated. Alternative: pause SQL integration and leave hosted cancellation unavailable; this must not be represented as a completed cancellation feature.

No merge, push, deployment, hosted connection or hosted SQL execution occurred.
