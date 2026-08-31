# LocalLens Green Production-Aligned Demo Implementation Plan

> **Execution rule:** implementation and fixes use `gpt-5.6-luna` at `max`; every spec, code, security, and design review uses `gpt-5.6-sol` at `high`. Every behavior change follows TDD. Do not merge, push, publish, reset, stash, delete worktrees, or discard user files.

**Goal:** Deliver a bilingual LocalLens thesis demo for customer, guide, and administrator roles using the user-selected green-white design while preserving replaceable boundaries for later Supabase/Edge/Stripe/Gemini production work.

**Architecture:** Keep the existing static-export Next.js frontend, domain contracts, state machines, migrations, adapters, deterministic itinerary engine, and Supabase boundary as authoritative. Add only missing use-case ports and demo adapters. Client route guards are UX only; RLS/RPC remains the future production authority. The 12-hour milestone is `production-aligned demo`, never `runtime-verified` or `production-deployed`.

## Global Constraints

- Thesis Chapter 3/4 and the current Use Case comparison are authoritative for actor goals and permissions.
- AI runs only after a customer requests personalization, receives allowlisted internal place IDs, and never owns time, price, booking, payment, or guide assignment.
- Business documents keep the Use Case name `Thanh toán`; UI/tests disclose simulation and never collect card number, CVV, or real tokens.
- Guide UI is read-only for assignments/tour details plus allowlisted profile edits. No guide itinerary editing, cancellation handling, catalog approval, or visibility outside assignments.
- Customer submits cancellation requests; admin decides them. Reviews are tour reviews only, one per completed booking.
- Unapproved food remains `research_only`; no fabricated vendor/menu/price/hours; `pay_at_vendor` is excluded from LocalLens payable.
- Preserve static export: no Server Actions, runtime Next route handlers, middleware security, or unbounded dynamic IDs.
- Preserve all existing untracked files and unrelated worktrees.
- The selected green-white source is the external PNG with SHA-256 `4CE3DA5E08635D2B7F2F2BF3417B34878A029B0D8547964D5E7518082D75447D`; it supersedes the old editorial source only after Task 1 commits the new reference/spec.
- `pnpm db:static:seed` may remain blocked by human approval. `pnpm db:types:check`/`db:verify` remain blocked by `SUPABASE_CLI_NOT_FOUND` until the pinned runtime exists; never convert those blockers into passing claims.

## Task 1: Lock scope delta and the green-white design source

**Files:**
- Create: `docs/superpowers/specs/2026-08-31-localens-green-production-aligned-demo.md`
- Create: `docs/design/references/localens-green-home-selected.png`
- Modify: `docs/superpowers/specs/2026-08-22-localens-mvp-design.md`
- Modify: `README.md` only to name the new visual source and status labels

**Requirements:**
- Copy the exact selected source without recompression and verify the stated SHA-256 and `1487 x 1058` dimensions.
- Record a scope-delta table for thesis vs engineering spec: tour review included; cancellation request/admin decision included; guide UI does not expose accept/complete; login is required before submit/book while anonymous browsing remains allowed; payment is simulated in the thesis demo.
- Record four evidence labels: `demo-wired`, `contract-implemented`, `runtime-verified`, `production-deployed`.
- Declare the old editorial design superseded for customer UI but retain its files/history until the new QA passes.
- Do not change production code in this task.

## Task 2: Add minimal production-aligned portal contracts and demo adapters

**Files:**
- Create: `lib/application/portal/contracts.ts`
- Create: `lib/infrastructure/demo/portal-repository.ts`
- Create: `lib/application/portal/composition.ts`
- Test: `tests/unit/portal/contracts.test.ts`, `tests/unit/portal/demo-repository.test.ts`, `tests/unit/portal/composition.test.ts`

**Requirements:**
- Reuse existing role, request, booking, payment, assignment, and content states from `lib/domain/data/contracts.ts`; do not redefine them.
- Define small async use-case boundaries, not a service locator: session/auth demo, customer account, cancellation request, tour review, guide profile/assigned tours, and admin operations.
- Demo repository is versioned, validates every read, exposes a reset fixture, and stores free-form special-needs data in session scope only.
- Missing production configuration fails closed; it never silently falls back to demo.
- Record unsupported production seams explicitly: cancellation/review/profile/admin CRUD need later migration/RPC/RLS work; personalized-tour guide assignment is not production-supported by the current RPC.
- TDD red-green evidence is required for validation, actor permissions, one-review-per-completed-booking, cancellation request/admin decision, and assignment visibility.

## Task 3A: Rebuild the customer visual system and existing flows

**Ownership:** customer components, customer styles, customer assets, customer/layout tests only. Do not touch portal, domain, Supabase, migrations, composition, package/config, or shared data contracts.

**Requirements:**
- Recreate the selected green-white visual system across Home, Tours, Planner, Custom Request, and Booking without using the screenshot as a background/crop source.
- Produce real map/skyline/stop imagery assets and use a maintained icon library for icons; no CSS art, emoji, or handcrafted UI SVG substitutes.
- Preserve all current catalog, itinerary, food, quote, and payment behavior/disclosures.
- Home primary CTA opens personalization; secondary opens fixed tours.
- Validate `1488 x 1059`, `768 x 1024`, and `390 x 844`, EN/VI, keyboard/focus, reduced motion, contrast, and no overflow.
- Follow TDD for every behavior/copy/interaction change and update visual tests for the new approved reference.

## Task 3B: Build customer, guide, and admin portal routes

**Ownership:** new portal routes, `components/portals/**`, portal-local copy, portal stylesheet, and portal tests only. Do not edit customer components/styles, shared dictionaries, domain/Supabase/migrations, or shell navigation.

**Static routes:**
- `/[locale]/sign-in/`
- `/[locale]/account/`
- `/[locale]/guide/`
- `/[locale]/admin/`

**Requirements:**
- Demo sign-in selects seeded identities and redirects by role; it is clearly labeled demo and never treated as production authority.
- Customer portal shows account, booking/request status, cancellation request, and one completed-booking review flow.
- Guide portal shows allowlisted profile fields, own schedule, and own assigned-tour details only.
- Admin portal shows overview, user/role state, locations, fixed tours/departures, personalized requests, bookings/cancellations, fixed-departure guide assignment, and simulated reporting. Link to existing `/admin/catalog/` rather than duplicate it.
- Operations without a live production seam are labeled demo-only in UI and contract status.
- Private shells are `noindex` and omitted from sitemap.
- Follow TDD for route static params, role isolation, state transitions, EN/VI, empty/error/success states, and accessibility.

## Task 4: Integrate customer flows, portals, and shared shell

**Files:** shared shell/navigation/dictionaries/composition wiring and focused integration tests only.

**Requirements:**
- Wire existing booking/custom-request results into the portal demo repository without changing authoritative calculation or payment logic.
- Fixed-tour vertical slice: browse -> detail -> booking -> simulated payment -> admin assignment -> guide visibility.
- Personalized vertical slice: create/refine -> customer confirms -> submit -> admin review -> quote -> simulated checkout. Guide assignment for personalized bookings stays explicitly demo-only until a later schema/RPC milestone.
- Customer cancellation creates a request; admin resolution changes the booking state. A guide sees cancellation notice only for an assigned booking.
- Keep booking status separate from payment status.
- Shared navigation exposes the correct role entry points while preserving locale/query/hash behavior.
- Run focused tests, typecheck, and a smoke build after each integrated branch.

## Task 5: Acceptance, visual QA, and final evidence

**Files:** E2E tests, `design-qa.md`, QA screenshots/evidence, and implementation notes only.

**Requirements:**
- E2E covers fixed-tour and personalized flows, role isolation, cancellation, completed-tour review, EN/VI, direct-entry errors, reset state, no console/page errors, and no horizontal overflow.
- Compare the green reference and rendered Home at the same interaction state/viewport; fix P0/P1/P2 and require `design-qa.md` to say `final result: passed`.
- Run fresh gates: `git diff --check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, `pnpm build`, `pnpm db:static`, and `pnpm test:e2e`.
- Run `pnpm db:types:check`, `pnpm db:static:seed`, and `pnpm db:verify`; record exact blockers instead of weakening them.
- A Sol High spec/security review and a separate Sol High design/accessibility review must both approve before completion.
- Keep the verified local demo running and open it in the Codex in-app browser for handoff. Do not push, publish, or create a Sites project.

## Parallelism and Review Gates

- Task 1 then Task 2 are sequential and each requires Sol High approval.
- After Task 2 commits, freeze `PARALLEL_BASE_SHA`.
- Tasks 3A and 3B may run concurrently in separate worktrees because their file ownership is disjoint. With four slots: coordinator + two Luna Max implementers + one rolling Sol High reviewer.
- Task 4 is sequential after both branches pass review.
- Task 5 uses one Luna Max fixer/integrator and up to two Sol High reviewers.
