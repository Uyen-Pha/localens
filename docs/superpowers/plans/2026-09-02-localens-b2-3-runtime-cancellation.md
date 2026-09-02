# LocalLens B2.3 Runtime Cancellation Implementation Plan

## 1. Database authority

- Add one forward-only migration for cancellation request storage, dedicated non-login owners, customer/admin projections, guarded request and decision RPCs, grants, RLS, and payment/cancellation race guards.
- Add pgTAP coverage and extend the concurrency harness with payment-versus-cancellation approval.
- Regenerate the access matrix/manifests and database types.

## 2. Strict application boundary

- Extend fixed-tour runtime contracts with exact request/decision inputs and authoritative results/projections.
- Extend the Supabase adapter and composition method inventory without unsafe casts.
- Keep customer and administrator capabilities role-scoped.

## 3. Runtime UI

- Add customer request controls/status to the runtime fixed-tour account.
- Add an administrator runtime cancellation queue to the Supabase role shell.
- Add EN/VI copy, confirmation, bounded input, disabled states, live announcements, errors, and authoritative reloads.
- Restrict the existing shared cancellation eligibility helper to `pending_payment` only.

## 4. Acceptance and commit

- Add focused contract, adapter, component, surface, and E2E tests first.
- Run static DB checks, clean reset/lint/pgTAP/concurrency/types, full application tests with stable worker count, both builds, demo E2E, runtime-auth E2E, and runtime cancellation E2E.
- Request independent security and accessibility review.
- Stage only B2.3 files, preserve protected dirty files, and commit on `codex/localens-mvp` without merge/push/publish.
