# Guide UI visual QA — 2026-09-28

Scope: presentation only in the existing RuntimeGuidePortal and GuideSchedule. Restored the original missing guide-bay-banner.webp. No runtime ports, RPCs, schema, assignments or profile persistence changed.

Reference: user-supplied guide profile and calendar screenshots. Desktop checked at 1440x1000; mobile at 390x844. Profile and schedule retain the green banner, tabs, left content and right detail/profile cards. Mobile document width 375px within the 390px viewport; no page-level horizontal overflow observed. Calendar/list switch and selection of a tour displayed its detail. Dynamic test data deliberately differs from the reference; this is not a pixel-exact claim.

Evidence: output/recovery-audit-20260928/guide-profile-after.png and guide-calendar-after.png outside the checkout. Full-page calendar capture has a stitching artifact; live viewport and DOM were also checked. A temporary local fixture harness was removed before build; it is not shipped. Supabase-authenticated visual verification remains pending user sign-in on Preview.

Checks: guide banner regression observed failing before restoring the asset, then passing. Guide-targeted suite 104/104 passed; typecheck and new-test lint passed. Broader suite and deployment results are reported separately.

# Admin prototype visual QA — 2026-09-28

final result: passed

Source: C:/Users/Admin/AppData/Local/Temp/codex-clipboard-e53cc185-2cb1-4439-a29a-dca9d167a32a.png (945×446).
Implementation: C:/Users/Admin/Documents/Project/output/recovery-audit-20260928/admin-departures-desktop.png, viewport 1890×900 CSS pixels.
Mobile evidence: C:/Users/Admin/Documents/Project/output/recovery-audit-20260928/admin-departures-mobile.png (390×844 viewport).
State: departures, first published sample tour, first table page, no dialog, light theme.

## Comparison

Source and implementation were opened together in one image-comparison call. Source appears downscaled approximately 50%; comparison is composition-level, not a pixel-exact claim. Additional live DOM and desktop places capture checked labels/wrapping. Small reference lettering is not sharp enough to establish exact font metrics.

- Typography: original product font retained; headings, labels and data hierarchy preserved. No clipped headline or metric value observed.
- Spacing/layout: white left navigation, green main, five metrics, table and right attention panel retained. Persistent simulation notice intentionally adds height. Assignment/request menu entries excluded by scope.
- Colors: green active controls and pale surfaces retained; separate semantic status colors.
- Imagery: existing tour photo reused with compact crop; no generated replacement artwork.
- Copy: explicit prototype notice; departure actions limited to create/view/track/cancel. Synthetic identity replaces actual account identity.
- Mobile: all six views checked at 390px, document width 375px, no page-wide horizontal overflow; tables scroll locally.

No actionable visual P0/P1/P2 found in this comparison. Exact font pixel matching is not claimed due to source density/blur. Functional review separately found and fixed navigation escape, modal draft contamination and disconnected departure data; regression tests added. Browser breadcrumb was retested and remained on prototype. Console checks showed no errors before the final archive-history-only fix.

## Checklist

- [x] Desktop source/render comparison
- [x] Mobile navigation/overflow
- [x] Create dialog and immutable departure details
- [x] Mock/no-persistence notice
- [x] Independent source review and targeted regression coverage
- [ ] User acceptance of Preview

---

## Previous QA record (retained)

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
