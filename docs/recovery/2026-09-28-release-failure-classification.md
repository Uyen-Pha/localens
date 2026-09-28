# Release fix ledger

Plan: docs/superpowers/plans/2026-09-28-thesis-release-fixes.md
Base: d44c101. User requested unfinished features be fixed before any further commit/push/deploy.

## Rulings

- Keep all work uncommitted until release fixes are completed, overriding per-task commit instructions.
- Existing recovery worktree is reused; unrelated design-qa.md and tsconfig.tsbuildinfo changes are preserved.
- Do not execute or alter hosted SQL. Cancellation audit separation remains pending; it does not block isolated UI runtime corrections.

## Findings and verification

- Full pre-fix suite: 2296 passing, 84 failing. Not all failures are classified; this is not release acceptance.
- Admin prototype test still required the removed persistence note. Update that expectation while retaining departure navigation and no-fetch assertions.
- Booking idempotency and duplicate-submit tests use the obsolete Hold button label. Update the selector to Book tour without weakening payload/call-count assertions.
- Confirmed defect: booking submission checked that a session existed but did not recheck its customer role after initial render. Regression reproduced an actual beginBooking call after role changed to guide. Added submission guard; regression passes.
- Confirmed defect: booking submission checked fresh capacity/status but not fresh departure time. Regression reproduced an actual beginBooking call exactly at departure start. Added fail-closed time check against fresh availability; regression passes.
- Regression tests initially matched the transient empty alert; changed them to await the final unavailable form state before asserting no mutation. No production behavior changed for this test synchronization correction.

## Remaining

- Booking error handling: known error codes were collapsed into one generic error. Existing localized safe messages now distinguish idempotency conflict, missing departure and service unavailability; sold-out retains the approved refreshed-capacity message. Four error-code checks pass.
- Catalog assertions now check compact cards and correct booking/detail destinations; meeting point and cancellation policy assertions moved to the booking detail test, where that content is displayed. Form validation uses the approved 1–15 range.
- Complete booking/admin files passed 17/17 before the additional detail assertions; subsequent combined verification must be recorded. Typecheck and edited-file lint passed. No commit, push or deployment performed.

- Complete old booking assertion reconciliation and business-error handling review.
- Classify remaining portal/auth/planner failures; preserve approved UI.
- Resolve SQL release separation, run final gates and authenticated smoke tests before publication.
