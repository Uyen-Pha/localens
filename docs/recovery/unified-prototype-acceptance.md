# Unified prototype Preview

## Approved scope

Branch: recovery/unified-preview, continuing recovery-review at 5a67488 and preserving its uncommitted recovery work.

Authority: 030239230281_PhamThiTuUyen.docx for business rules; localens-guide-release for approved presentation; existing working Supabase adapters for connected behavior.

This supersedes the production-readiness gate in the earlier integration plan. No main merge, Production deployment, SQL execution, backfill, new RPC or migration. The cancellation migration remains audited source only; website build/deployment must not run it. Existing demo screens remain local state. Quote remains connected. Do not substitute local success for a failed real mutation.

## Execution checklist

- [x] Create recovery/unified-preview without resetting existing work.
- [ ] Inspect recovered route composition and compare approved source components.
- [ ] Verify cancellation presentation does not require applying the audited migration for prototype screens.
- [ ] Run targeted recovery tests, typecheck, lint recovery files and build; record baseline failures separately.
- [ ] Deploy one Vercel Preview, never Production; check all seven requested routes.
- [ ] Record source, changed files, verification boundaries and URL, then stop for user acceptance.

## Verification before Preview

- Typecheck passed (tsc --noEmit --incremental false).
- Targeted tests: 102 passed, 0 failed; report: output/recovery-audit-20260928/unified-prototype-targeted.json in the parent Project output directory.
- ESLint passed for changed/untracked recovery TypeScript files.
- Supabase-mode Next build passed, 43 static pages generated. First local attempt used unavailable sensitive placeholders from Vercel pull and failed configuration validation; rerun explicitly used supabase mode and the existing public Supabase project URL. No remote configuration was changed.
- Database baseline remains separate: previous static gate failures and unavailable Docker/pgTAP are not claimed fixed. No migration or backfill was run.
- Preserve newer user-approved UI changes over the older source snapshot. Do not restore the old homepage or replace newer admin/guide screens.

## Decisions

- Continue the existing integration plan inline; user has explicitly approved the scope and requested execution, not another design round.
- Preserve the source worktree even though its Git metadata references an unavailable temporary checkout; compare its physical files read-only.
- No changes to Supabase allowed origins without separately identifying the exact Preview domain and approval.
- Review all authenticated flows as unverified until tested with the appropriate signed-in role; route HTTP success alone is insufficient.
