# LocalLens

Production repository for the LocalLens full-stack MVP.

- Next.js static export for Cloudflare Pages
- Supabase Auth, PostgreSQL, RLS, and Edge Functions
- Deterministic itinerary engine with optional Gemini ranking
- Stripe Test Mode only; no real charges

The canonical product specification and implementation plans live under
`docs/superpowers/`.

## Editorial customer QA

The deterministic customer-route visual and accessibility smoke suite covers
`/en/`, `/vi/`, `/en/tours/`, `/en/planner/`, `/en/custom-request/`, and a
valid `/en/booking/` demo flow at 1488×1059, 768×1024, and 390×844. It clears
browser handoff state, emulates reduced motion, disables animation for
captures, waits for local fonts and images, and records full-page route evidence
under the ignored `test-results/customer-visual/` directory.

Run the focused suite with:

```bash
pnpm exec playwright test tests/e2e/customer-visual.spec.ts
```

Accepted home viewport evidence is stored under `docs/design/qa/`. The native
selected reference remains byte-identical at
`docs/design/references/localens-editorial-home-selected.png`; the desktop
comparison uses documented QA-only 1488×1059 derivatives with a deterministic
one-pixel right/bottom canvas extension. A screenshot or passing snapshot is
not, by itself, visual approval; see `design-qa.md` for the current verdict and
open findings. Database runtime verification remains a separate gate.

