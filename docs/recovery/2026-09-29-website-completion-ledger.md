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

## Integrated verification and acceptance boundary

- Deployed frontend source: `00ac495`; Preview: https://localens-50u5uhhon-local-lens2.vercel.app. No main merge or Production promotion.
- Completed full-suite report `.local-website-tests.json`: 2,547 / 2,556 passed, nine failed, zero pending. Read back on final acceptance pass; this is not a fully green repository.
- Remaining failures: three each in `artifacts.test.ts`, `rls-matrix.test.ts`, and `thesis-demo-cloud-seed.test.ts`. SQL inventory/grant/identity and seed gate findings remain separate; no suppressions, hosted reseed, permission expansion or migration application to clear these gates.
- Earlier implementation verification: focused recovery 244/244; Tour/booking 35/35; Planner 34/34; CSS 9/9; cancellation pgTAP on isolated local database 208/208. Typecheck, scoped lint and Preview build passed in the implementation run. These are recorded results, not a fresh rerun on this acceptance pass.
- Signed-out route smoke reached home, six tours, booking details, Planner, account sign-in, guide sign-in and admin sign-in. Authenticated role acceptance remains open; loading a sign-in screen does not prove those flows.

## Planner origin recovery

- Recovered the exact original 13-origin comma-separated value from historical configuration operations, supported by earlier `docs/recovery` origin reports.
- Verified original live digest: `670f427d37b796fd27929a6faf0e9813e22972452541ec4d87d076eb02825d86`.
- With explicit user authorization appended only `https://localens-50u5uhhon-local-lens2.vercel.app`.
- Saved digest: `4f28be749fc7cec5b63d7b5f2c9853f4593ba41c7a5c9cfd1b3ef351d50b9bb4`; matches the computed new value.
- All 14 origins returned OPTIONS 204 with their exact allow-origin header; an unapproved origin returned 403 without allow-origin. This proves CORS only, not authenticated generation.
- No hosted SQL, migration, backfill, database row change or Edge code deployment.

## Remaining completion sequence

### Portal acceptance fixes

- Final suite completed: 2,551 / 2,560 passed, nine failed; failures remain confined to artifacts, RLS matrix and cloud-seed audit suites. No test suppression. User explicitly approved website-only release with these database audit exceptions recorded separately; no hosted migration, seed, backfill or permission change is authorized.
- Approved website source is `c8f4dcb`; this documentation update does not change that application tree. Production rollback target captured before release: `dpl_25gE3NcfK4XCynHevS6U4aP7dK3R`, https://localens-eh0q0kw9t-local-lens2.vercel.app. GitHub main before release: `3ad187ff61e1898cc20049a31ae1ece98761fb32`; stale local main is a clean ancestor and will only fast-forward. Existing recovery branches/worktrees and unrelated local edits are retained.

- Fix source commit `c8f4dcb` deployed successfully to https://localens-n40cl6ld4-local-lens2.vercel.app (deployment `dpl_8LgahB9uXyQszGtksQ5C9HgKhwwL`). Remote build/TypeScript passed, 43 pages generated. Authenticated visual recheck on this new domain still requires login.
- User approved appending this exact domain to the previous 14 origins. Old digest `4f28be749fc7cec5b63d7b5f2c9853f4593ba41c7a5c9cfd1b3ef351d50b9bb4`; new digest `6f2e783d08b19621a854a05393952a0600540791f429862466bcc60af561dfa5`, verified against computed expected value. New domain, preceding Preview and production preflights return 204 with exact origin; unapproved.example remains 403. No SQL/database/production frontend change.

- RED: three new regressions failed for the observed guide status, departure cancellation boundary, and obsolete payment label. GREEN: five focused files, 22 tests passed (including workspace cancellation and past-date UI visibility).
- Guide presentation now separates started assignments from upcoming, retaining cancelled/completed authority; no automatic database completion. Added a Started filter so past assignments remain accessible.
- Prototype cancellation denies start-time equality, past and invalid dates at mutation time and hides cancel actions for ineligible departures. History and booked seats remain unchanged.
- Prototype review payment code remains unresolved, but display/history uses “Chưa xác nhận thanh toán”; no payment status is promoted to paid and no Supabase payment logic changed.
- Scoped lint and diff check passed. Supabase-mode build passed including TypeScript after supplying the public project URL; first local build failed due to absent URL. Full suite rerun is still in progress; do not infer all tests green.

### Authenticated Admin acceptance update

- Confirmed Thesis Demo Administrator on the same Preview. Overview displays eight management entry cards, with sidebar order matching the requested sequence.
- Orders prototype: ten records; opened LL-OD-001 details, showing traveler, total, departure, payment and processing history. No mutations performed.
- Assignment prototype: eighteen eligible entries, six unassigned and twelve assigned; visible first-page departures are future dates. Opened one assignment panel with guide options/history, without confirming. This is not proof of every time-bound mutation guard.
- Departures renders create/view/cancel controls and four expected statuses; no edit control seen in the list. Past dates still show enabled-looking cancel buttons (e.g. 2026-08-10). Handler-level blocking has not been tested; investigate before calling this a confirmed cancellation-policy defect.
- Confirmed outstanding presentation mismatch: Orders still exposes “Đang rà soát thanh toán” in filter, row and attention data, despite the earlier request to remove that label.
- Personalized requests loads records matching customer-side IDs. Approval/quote actions were not executed; preserve its existing runtime.
- Pending acceptance: accounts/places/fixed-tour management/reports, Admin request details and mutation guards. No hosted database writes during this Admin check.

### Authenticated guide acceptance update

- Confirmed signed-in Thesis Demo Guide on the same Preview. Profile renders correct guide role and read-only name/email; no profile updates performed.
- Calendar to list toggle works using keyboard activation. Selecting the craft tour opens the detail panel with departure, 09:00–18:00 duration, eight travelers, language, meeting point and fourteen itinerary stages.
- Open defect: the Upcoming group shows departures on September 12, 15, 20 and 24, 2026, although acceptance is on September 29. The September 24 detail also says Upcoming. Source/status mapping must be investigated; do not silently mark records completed or backfill database dates.
- No assignment changes, logout, profile writes or hosted data changes were performed. Guide acceptance is partial, not passed in full. Admin acceptance remains pending.

### Authenticated customer acceptance update

- User signed in as the thesis customer on the same Preview. Account loaded; personalized requests precede fixed bookings with five displayed per group and independent pagination.
- Opened a pending personalized request and confirmed itinerary/status/no-quote detail. Opened an existing confirmed fixed booking and verified matching tour, party size and total. No existing booking was changed.
- Planner manual form displayed the 72-hour notice and a budget suggestion while area remained unselected. Notice visibility alone is not proof of boundary enforcement.
- User explicitly authorized creation and adjustment of one test itinerary, including draft persistence, but excluded request submission, booking, payment and cancellation.
- Created itinerary for 2026-10-02 09:00, two travelers, three-hour preference, VND 1,000,000 group budget, no chosen area. Result v1: Huynh Hoa Banh Mi → Saigon Central Post Office, 147 minutes, VND 986,000.
- Opened adjustment, replaced first stop with Nguyen Hue Walking Street, selected preview and applied. Result visibly became v2: Nguyen Hue Walking Street → Saigon Central Post Office, 150 minutes, VND 810,000. Confirmation checkbox remained unchecked; no request was sent.
- Mouse automation did not activate some controls reliably; keyboard Enter/Space successfully exercised navigation and selection. Do not infer mouse usability coverage from the keyboard checks.
- Pending: 72-hour rejection boundary, natural-language parsing on this deployment, other adjustment actions, and authenticated Guide/Admin acceptance. Do not describe this as complete end-to-end acceptance.

1. Customer acceptance on this one Preview: natural language and manual Planner, 72-hour boundary, optional-area budget, generation/refinement, request/quote, booking and simulated payment. Do not create bookings or submit requests merely for a read-only check without agreeing on test records.
2. Guide and Admin acceptance with user-provided login sessions: navigation, profile/schedule, overview links, local assignment controls and departure-time guards. Preserve existing demo versus Supabase boundaries.
3. Cancellation: distinguish local SQL verification from hosted availability. Do not advertise the un-applied migration as deployed. Separate impact approval is still required before any hosted migration.
4. Record defects, fix only demonstrated thesis-scope issues with targeted regression tests, then rerun affected checks and rebuild Preview if source changes.
5. Once the user accepts Preview, verify final diff, protect main/Preview with backup refs, update GitHub and promote the approved source under a separate release gate. Preserve recovery worktrees and unrelated `design-qa.md` / `tsconfig.tsbuildinfo` changes.
