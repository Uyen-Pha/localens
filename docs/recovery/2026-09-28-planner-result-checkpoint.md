# Planner result and existing-backend wiring checkpoint

User selected option 1: recover UI and connect existing Supabase contracts without database changes. Local checkpoint only, not release acceptance.

## Recovered

- Timeline, transfers, return leg and trip summary; guided adjustments and advanced editing.
- Server revision resume and explicit agreement before submission. New revisions require agreement again.
- Authenticated actor boundary and customer/handoff-scoped cache.
- Existing research_demo_submit(p_revision_id) and research_demo_list(p_admin:false). Read-only account request list, five items per page.
- Separate edit-options validation because that response has no status discriminator.
- No new 72-hour rule, pricing semantics or input pace option. Historical balanced saved snapshots accepted on the wire only; input contract unchanged.

## Independent review

Three findings received failing regression tests then fixes: late callbacks poisoning another handoff; lost-save responses leaving stale revisions submit-enabled; advanced duration limits incompatible with current form. Callbacks now verify origin/lifecycle, cancellation/conflicts resume the latest revision before reconfirmation, and duration stays 60–720 minutes. Successful adjustment also clears prior submission errors.

Two older result tests now supply explicit authenticated customer identity, preserving their original no-match and preference-notice assertions.

## Verification

- Final focused run: 6 files, 35 passed, 0 failed (planner-result-final-focused.json).
- Typecheck, full ESLint and demo webpack build passed; build generated 35 pages. Final whitespace gate rerun after removing trailing whitespace.
- Whole-suite run: 2,175 passed / 87 failed. Started before review fixes, so NOT final immutable-tree acceptance. Against prior checkpoint, 81 failure names already existed. Six additions: two actor-fixture tests, three review regression tests, one guide portal async-loading assertion. The first five pass in final focused rerun. Other failures are not declared resolved or all proven baseline.
- Browser used actual components with explicitly labelled in-memory fixtures, not Supabase. Verified results, guided adjustment, version change and agreement reset. Mobile document client/scroll width 375/375 at viewport390; viewport restored.
- Screenshot: Project/output/recovery-audit-20260928/planner-result-desktop.png.

## Boundaries

No schema/migration, seed, cloud RPC mutation, booking/payment business or guide-assignment changes. No old-worktree reset/deletion, whole-branch merge, push or deployment. See the separate read-only Supabase audit.

Cloud authenticated submission, deployment configuration and full lifecycle remain unverified. Quote actions, checkout and resubmission are not restored by this read-only list. Full-suite failures block release acceptance. This is not recovery of all LocalLens screens.
