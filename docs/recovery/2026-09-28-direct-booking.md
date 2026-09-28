# User-selected combined tour detail / booking page

The user clarified that the existing `/[locale]/booking/?departure=...&partySize=1` interface is the desired tour detail page. This supersedes the intermediate-detail navigation described in the previous recovery report.

Catalog image, title and departure CTA now link directly to the existing booking UI for the earliest matching future scheduled departure with remaining seats. The intermediate route remains a read-only fallback when no departure is available and for old bookmarked URLs. No database, payment, booking creation or guide logic changed.

Changed product files:
- components/customer/runtime-tour-catalog.tsx
- tests/components/customer/recovered-tour-cards.test.tsx

Checkpoint: f7923f607c72e4118f07886fca6d8f20bb2a1cd3. Verified complete-history backup: C:/Users/Admin/Documents/Project/output/recovery-audit-20260928/recovery-direct-booking.bundle.

Preview: https://localens-3iaolrr7s-local-lens2.vercel.app/vi/tours/
Deployment dpl_GXP4ptjYcpWU4ANEgDZmQRM5vZFK is READY. Main and production are unchanged.

Verification: two expected RED failures before code change; 18/18 focused tests pass after change. Typecheck, lint, local webpack build and remote Vercel Turbopack build pass.

Full suite: 2202 passed / 78 failed. The 77 baseline failures persist (names in 2026-09-28-preview-remaining-failures.md). One additional timeout: `Supabase PortalSurface (en) renders only the runtime email/password sign-in controls when signed out`, stuck showing Loading your portal. Targeted rerun of the sign-in test passed for both locales (2 passed / 52 skipped), without source changes. Do not claim the full suite green. Fresh report: C:/Users/Admin/Documents/Project/output/recovery-audit-20260928/direct-booking-suite.json.

Live DOM confirms all six catalog title links point to booking with their matching existing departure IDs. Opening Cholon from the catalog using keyboard activation renders the requested full booking interface and exact departure 422010. Browser connector pointer-click attempts were inconsistent, so no claim of exhaustive pointer-based coverage. No order or payment was submitted. Screenshot: C:/Users/Admin/Documents/Project/output/recovery-audit-20260928/direct-booking-preview.png.

User approved adding only the new Preview origin to Planner configuration. Prior digest checked before update; all previous origins and other secret hashes retained. All eight permitted origins return OPTIONS 204 with matching ACAO, unapproved.example returns 403. No database writes.
