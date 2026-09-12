# Guide profile and assignment refresh — 2026-09-12

final result: blocked

## Scope
UC-GUI01 and the two supplied profile/assignment screenshots. Runtime guide portal has separate sections, per-field editing, profile summary, assignment date filters and selected-trip details. Existing LocalLens assets and icons are reused. No fabricated assignments, itinerary stops or company profile facts are added.

## Verified
- 65 targeted Vitest cases pass, including profile validation, save/cancel, duplicate-phone feedback, retained drafts, unsaved navigation, Vietnam-date filtering, role routing and schedule failure states.
- Targeted ESLint passes.
- Production Supabase-mode build passes with an isolated output directory and placeholder public build configuration (not a live authentication test).
- Follow-up: 10/10 pgTAP checks passed in a transaction against the linked cloud database; all test data and trial DDL were rolled back. No duplicate phone groups were present.
- Migration 20260912110000 was then applied and its migration ledger repaired to applied. Guide authentication and get_own_guide_profile RPC passed a separate cloud smoke test; no profile values were changed by the smoke test.

## Blocking verification
- Browser controller fails before connecting: `failed to write kernel assets: The system cannot find the path specified. (os error 3)`. Reset and reconnect produce the same failure. No screenshot comparison or live deployment verification is claimed.
- Docker Linux engine remains unavailable, but database verification was completed using TLS-verified direct PostgreSQL access with the saved credential (not logged).

## Remaining acceptance
1. Database tests and duplicate checks completed; migration applied.
2. Await user approval to use a separate Playwright browser because the in-app controller cannot initialize.
3. Inspect signed-in guide profile and assigned schedule on desktop/mobile.
4. Verify browser Back, link navigation, reload, cancel, successful save and failed save. Browser-native reload prompts cannot use custom wording. Same-document Back protection depends on cancelable Navigation API events; verify the supported browser explicitly.
5. Check pending background save/leave interactions, then deploy and verify production.

Navigation platform reference: https://html.spec.whatwg.org/dev/nav-history-apis.html

The pre-existing modified root design-qa.md was preserved.
