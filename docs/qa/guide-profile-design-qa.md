# Guide profile and assignment refresh — 2026-09-12

final result: passed

## Scope
UC-GUI01 and the two supplied profile/assignment screenshots. Runtime guide portal has separate sections, per-field editing, profile summary, assignment date filters and selected-trip details. Existing LocalLens assets and icons are reused. No fabricated assignments, itinerary stops or company profile facts are added.

## Verified
- 65 targeted Vitest cases pass, including profile validation, save/cancel, duplicate-phone feedback, retained drafts, unsaved navigation, Vietnam-date filtering, role routing and schedule failure states.
- Targeted ESLint passes.
- Production Supabase-mode build passes with an isolated output directory and placeholder public build configuration (not a live authentication test).
- Follow-up: 10/10 pgTAP checks passed in a transaction against the linked cloud database; all test data and trial DDL were rolled back. No duplicate phone groups were present.
- Migration 20260912110000 was then applied and its migration ledger repaired to applied. Guide authentication and get_own_guide_profile RPC passed a separate cloud smoke test; no profile values were changed by the smoke test.

## Browser verification follow-up
- User explicitly approved a separate Playwright browser. Desktop 1448×1086 and mobile 390×844 were captured with a real guide session and cloud RPC data.
- Login, profile loading, invalid biography, unsaved-change modal, retaining the draft, cancel, and no horizontal mobile overflow passed; no page errors.
- Two authoritative assignment records loaded. No company-managed profile facts were invented for currently empty values.
- First comparison found weak heading weight and an oversized logout action. Both were fixed and the revised desktop/mobile captures inspected again.
- Compared against supplied reference structure: two navigation sections, green hero, main profile rows and sidebar summary, schedule list and selected-tour detail. Adaptation uses existing HCMC imagery instead of the reference Halong image; no unverified itinerary stops added.
- Evidence: guide-captures/profile-desktop.png, schedule-desktop.png, profile-mobile.png (local QA artifacts).

## Historical blockers resolved
- Browser controller fails before connecting: `failed to write kernel assets: The system cannot find the path specified. (os error 3)`. Reset and reconnect produce the same failure. No screenshot comparison or live deployment verification is claimed.
- Docker Linux engine remains unavailable, but database verification was completed using TLS-verified direct PostgreSQL access with the saved credential (not logged).

## Remaining production acceptance
Deploy via the verified production branch main and rerun the browser smoke against the primary domain. Browser-native reload prompts cannot use custom wording. Same-document Back protection depends on cancelable Navigation API events and is not certified across all browsers.

Navigation platform reference: https://html.spec.whatwg.org/dev/nav-history-apis.html

The pre-existing modified root design-qa.md was preserved.
