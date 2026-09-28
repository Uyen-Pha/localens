# Bookings recovery visual QA

final result: blocked

## Source visual truth

- C:/Users/Admin/AppData/Local/Temp/codex-clipboard-7e9557b6-2bb0-4584-aac2-da41cfbd699d.png (personalized requests)
- C:/Users/Admin/AppData/Local/Temp/codex-clipboard-cf2edbdd-bf2a-4c34-beab-ea541a51bd1b.png (fixed bookings)

## Implementation evidence

Preview: https://localens-j6yh75tri-local-lens2.vercel.app/vi/bookings/
Product commit: 71edcfb.
Current browser viewport: 1242 x 668 CSS pixels. Preview is signed out and redirects to sign-in with returnTo=/vi/bookings/. Authenticated screenshot comparison cannot yet be performed. No credentials or session tokens were copied from another origin.
Before-change screenshot: C:/Users/Admin/Documents/Project/output/recovery-audit-20260928/bookings-before.png.
Current Preview screenshot: C:/Users/Admin/Documents/Project/output/recovery-audit-20260928/bookings-preview-sign-in.png (sign-in only; NOT proof of bookings layout).

## Required surfaces

- Typography: existing product font retained; heading/card sizes reduced in code, rendered fidelity pending.
- Spacing/layout: compact columns and 180px thumbnails, mobile stacking; authenticated desktop/mobile overflow checks pending.
- Colors: green/white existing palette retained. Independent code review flagged request focus contrast; darkened to #287258. Visual verification pending.
- Image quality: existing tour imagery retained; crop comparison pending.
- Copy/content: actual request statuses kept distinct from confirmed bookings and payment. Quote payment controls are unavailable in the current request adapter and were not invented.

## Comparison history

No valid same-state source/implementation comparison yet. Reference screenshots show authenticated bookings; the new Preview shows sign-in. Source pixel size/density normalization and focused-region comparisons must be recorded after login, not inferred from the old deployment.

## Next verification

User signs in on new Preview. Capture desktop and 375px mobile, compare source and current screenshots in the same input, test request search/filter/sort/refresh and both paginations, follow a fixed-booking detail link, inspect disabled/absent payment/cancellation actions without creating or cancelling orders. Review console and overflow. Preserve old RuntimeFixedTourAccount service-error finding as a separate pre-existing runtime limitation.
