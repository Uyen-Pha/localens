# LocalLens Account/Auth/Review Recovery Plan

> **Implementation mode:** inline execution in `recovery/account`; follow TDD for each code change and keep the existing cancellation, payment, Planner, Quote, Guide, and Admin contracts intact.

## Goal

Align the current runtime with the Word specification for `UC-CUS01`, `UC-CUS02`, `UC-CUS10`, `UC-AUTH01`, and `UC-AUTH02`, and restore only the approved CUS07 presentation improvements: accessible list heading and five-item pagination with page reset on filter/search/sort changes.

## Source authority and boundaries

- Business authority: `C:/Users/Admin/Downloads/DOAN_PHAMTHITUUYEN.docx`.
- Presentation reference: `C:/Users/Admin/Documents/Project/localens-guide-release`, read/diff only.
- Runtime baseline: this worktree, starting from `codex/ui-runtime-recovery`.
- Do not change cancellation eligibility, 48-hour rules, 15-minute holding, quote/payment deadlines, payment-state transitions, or cancellation RPCs.
- Do not import Planner `ResearchDemoRequests`, `canPayBooking`, payment adapter changes, Guide/Admin UI, migrations, or RPC changes.

## Task 1: Scope portal sign-out to the current session

Files:

- `lib/infrastructure/supabase/portal-session-adapter.ts`
- `tests/unit/portal/supabase-session.test.ts`

Steps:

1. Add failing assertions that explicit portal sign-out and failed identity cleanup call Supabase Auth with `{ scope: "local" }`.
2. Run the focused session test and observe the expected failure against the current default/global call.
3. Change only the two adapter sign-out calls to `{ scope: "local" }`; preserve role resolution, error mapping, and cleanup error behavior.
4. Run the focused session tests and inspect the diff for shared-contract scope.

Expected: AUTH02 ends the current runtime session without changing the server-derived role gate or any Planner/Quote/Guide business state.

Commit: `fix(auth): scope portal sign-out to current session`.

## Task 2: Restore approved CUS07 list presentation

Files:

- `components/customer/reviewed-bookings.tsx`
- `components/customer/reviewed-bookings.module.css`
- `tests/components/reviewed-bookings.test.tsx`

Steps:

1. Add a failing component test for five-item pagination, page navigation, and reset to page one after sort changes.
2. Run the focused component test and observe the expected failure because the current list renders all matching rows.
3. Add local pagination state and the approved accessible heading. Reset the page when filter, query, or sort changes, and render only the current page.
4. Add only the pagination and heading styles needed by the presentation. Keep current status/payment display, cancellation predicates, payment link condition, review predicates, data loading, and detail links unchanged.
5. Run the focused component tests and inspect the diff against `localens-guide-release`, explicitly confirming that Planner and payment-state changes were not ported.

Expected: CUS07 list presentation supports status filters, search, sort, details, status/payment display, and five-item pagination without changing cancellation/payment logic.

Commit: `fix(bookings): restore customer list pagination`.

## Task 3: Verification and Preview handoff

Run, in this worktree:

- focused Account/Auth/Review/CUS07 tests;
- related database static/tests when the environment allows;
- typecheck;
- lint for changed source/test files;
- production build;
- a separate Vercel Preview deployment only.

Then perform a final self-review of the diff and confirm the branch has no unrelated Planner, Quote, Guide, Admin, migration, RPC, or payment/cancellation changes. Push only `recovery/account` to `origin`, report the Preview URL and evidence, and stop for user inspection.

## Review focus

- Word rules remain enforced for registration, account ownership/email immutability/password changes, server-derived roles, locked-account handling, and review ownership/completion/one-time/rating/text constraints.
- Sign-out is local to the current session; password-change logout remains the existing security behavior.
- The CUS07 pagination port does not change cancellation, deadline, payment, seat, or RPC behavior.
- No historical worktree is modified.
