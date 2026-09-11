# UC-AUTH01 sign-in review — 2026-09-11

Visual target: user attachment codex-clipboard-45f0143f-99d4-4bf4-b2ea-b92d3700f953.png.
Preview: http://127.0.0.1:3101/vi/sign-in/.

## Visual and interaction result

final result: passed (visual layout and implemented sign-in interactions only).

- Desktop inspected at 1447 × 1087: introduction and three city image cards on the left; white sign-in card on the right; green primary action and registration link.
- Adapted to existing LocalLens wordmark, Manrope font and existing city assets. Decorative skyline line art from the reference is not reproduced. This is an adaptation, not pixel-identical artwork.
- Initial mismatch: header repeated Sign in on the sign-in page. Corrected to Register and verified in the refreshed browser DOM.
- Mobile inspected at 390 × 844: one-column layout, photos hidden, readable labels/errors, full-width button. Measured document width and scroll width both 390px.
- Browser verified empty-field errors, focus placement, password visibility toggle and registration destination. Browser console reported no errors.
- Full-page screenshot stitching duplicated some content in the image; DOM verified exactly one form and one footer.
- 105 targeted tests passed, including all three server-owned roles, safe return paths, invalid credentials, network/server failure, banned account and rate-limited provider responses. Typecheck, production build and targeted lint passed.

## Explicit implementation boundary

Production password authentication remains Supabase Auth; no role selector and no client-supplied role assignment. Existing post-auth identity validation and cleanup remain intact.

The exact five-consecutive-failures/five-minute account lock is NOT implemented or advertised as active. The hosted Free project does not offer the Password Verification Attempt hook (Teams/Enterprise feature). No browser-only counter is substituted. A backend architecture decision is pending with the user.

https://supabase.com/docs/guides/auth/auth-hooks
