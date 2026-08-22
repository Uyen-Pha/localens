# LocalLens Full-stack MVP Design

## Product goal

LocalLens sells Ho Chi Minh City cultural experience tours to international
customers. The MVP supports fixed departures and AI-assisted personalized
itineraries, runs with free-tier infrastructure, is bilingual English and
Vietnamese, and never processes real payments.

## Scope

- 30 verified places and 8 fixed tours in central HCMC, Cho Lon, Thu Duc,
  and selected outskirts.
- Customer, admin, and guide roles.
- Personalized itinerary generation, immutable revisions, locked stops,
  company review, a 48-hour quote, and Stripe Test checkout.
- Fixed-tour departures, capacity holds, Stripe Test checkout, and guide
  assignment after confirmation.
- Responsive UI, WCAG 2.2 AA, and static SEO pages in English and Vietnamese.
- No live navigation, real charges or refunds, guide marketplace, chat,
  loyalty, reviews, multi-city support, or production SLA.

## Repository boundary

`localens-ui-prototype` is a Lovable Free UI prototype with mock data only.
It contains no backend logic or secrets. `localens` is the production source
of truth for Next.js, Supabase migrations, Edge Functions, seed data, and
tests. Prototype code is never merged automatically into production.

## Architecture

- Next.js 16 App Router, TypeScript strict, React, Tailwind CSS, and static
  export to Cloudflare Pages.
- No SSR, ISR, middleware, Server Actions, or runtime Next.js API routes.
- Supabase Free provides Auth, PostgreSQL, RLS, and Edge Functions.
- Local Supabase CLI is the migration and integration-test environment. The
  remote free project is the demo environment only.
- MapLibre displays low-traffic OSM-compatible tiles with visible attribution.
  Timeline and list views remain usable when the map fails.
- Gemini ranks already-filtered candidate IDs and writes rationales.
  Deterministic code owns scheduling, money, time, and validation.
- Stripe is Test Mode only. The signed webhook is the only authority that can
  confirm a payment.

Static public routes enumerate `[locale]` and public slugs with
`generateStaticParams`. Private runtime records use query parameters rather
than unknown dynamic segments, for example `/en/planner?plan=...` and
`/en/booking?booking=...`. `/auth/callback` is a static client page that
exchanges the Supabase PKCE code and redirects using stored locale/return URL.

## User journeys

### Fixed tour

Browse public tour and departure data, select a departure, authenticate,
create an atomic 30-minute capacity hold, enter Stripe Test Checkout, wait for
the webhook, and display the confirmed booking. Admin can assign a guide only
after confirmation.

### Personalized tour

Enter structured preferences, generate and refine without authentication,
authenticate to claim the guest plan, submit one immutable revision for
company review, respond to requested changes, receive an approved quote valid
for 48 hours, accept it, and enter Stripe Test Checkout. AI never submits,
approves, books, pays, or assigns a guide.

## Itinerary input and engine

`ItineraryRequest` contains start date/time, duration minutes, selected areas,
group budget and currency, party size, guide language, priority weights for
street food, historical sites, traditional crafts, and traditional markets,
pace, structured dietary requirements, structured mobility requirements, and
locked stop IDs.

The engine sequence is fixed:

1. Validate and normalize the request.
2. Filter candidates using catalog data and hard constraints.
3. Ask Gemini to rank public candidate IDs when quota and availability allow.
4. Build the timeline with the deterministic scheduler.
5. Run the authoritative validator.
6. Attempt one deterministic repair, then persist an immutable revision.

Hard constraints cover group budget, total duration including travel and
buffer, normal and special opening hours, overlap, locked stops, and mandatory
dietary/mobility support. Catalog support values are `supported`,
`unsupported`, or `unknown`; `unknown` never satisfies a mandatory need.
Travel-time rows are directed and include mode, minutes, estimated group cost,
and verification date. Missing travel data makes that candidate transition
unavailable rather than guessed.

Anonymous generation/refinement requires server-side Turnstile validation.
Gemini enrichment is limited to five calls per UTC day for both the HMAC IP
bucket and device bucket, plus a global cap of 100. Deterministic generation
continues after quota, timeout, HTTP 429, malformed JSON, or model failure.
Guest access tokens are random, stored only as hashes, expire after 24 hours,
and can be claimed once in a database transaction. Gemini never receives raw
PII, payment data, authentication IDs, or free-form special-request text.

## Data and state

Core data groups are identity, catalog and translations, opening hours and
exceptions, travel times, tours/stops/departures, trip plans/versions/items,
recommendation runs, guest access and rate-limit buckets, custom requests and
quotes, bookings and capacity holds, payments and webhook events, guide
assignments, FX rates, content versions, and audit logs.

Money is stored as integer VND. Times use `Asia/Ho_Chi_Minh`. USD uses integer
cents and a stored `vnd_per_usd` snapshot. Quotes and bookings snapshot names,
prices, currency, FX, and policy. A rate up to seven days old is acceptable;
otherwise USD checkout is disabled and the UI offers VND.

State transitions are explicit:

- Request: `draft -> pending_review -> changes_requested -> pending_review`,
  or `pending_review -> approved | rejected`.
- Quote: `active -> accepted | expired | revoked`.
- Booking: `pending_payment -> payment_processing -> confirmed -> completed`;
  failure exits are `payment_failed`, `expired`, and `cancelled`. A completed
  Stripe event after an inactive hold becomes `payment_review`, never an
  automatic confirmation.
- Guide assignment: `assigned -> accepted -> completed`. Reassignment closes
  the old record before creating a new one.

## Public service contracts

- `recommend-itinerary(input, turnstileToken, guestToken?)`
- `refine-itinerary(planId, baseRevision, delta, lockedItemIds, guestToken?)`
- `claim-trip-plan(planId, guestToken)`
- `submit-custom-request(planId, revision)`
- `review-custom-request(requestId, decision, note)`
- `create-custom-quote(requestId, quote)`
- `create-booking(departureId | quoteId, partySize)`
- `create-checkout-session(bookingId, locale)`
- `stripe-webhook(rawBody)`
- `publish-seo(contentVersion)`
- `get-fx-rate()`

Every function returns errors as
`{ code, messageKey, fieldErrors?, retryable, correlationId }`.
Stale itinerary refinement returns HTTP 409 with `STALE_REVISION`.

## Authorization and security

RLS is enabled on every public-schema table. Anonymous users only read
published catalog data. Customers only access their own plans, requests,
quotes, and bookings. Guides only access assigned booking summaries and
whitelisted assignment status transitions. Admin manages catalog, content,
departures, quotes, roles, assignments, and audit records. Signup cannot set a
role; admin and guide accounts are provisioned manually. Service-role keys are
restricted to Edge Functions. Logs redact tokens and PII. Public functions use
CORS allowlists, body limits, input schemas, HMAC IP hashing, and replay-safe
idempotency.

Capacity hold creation locks the departure and commits atomically. Stripe
Checkout expires at the same 30-minute deadline. The webhook reads the raw
body, verifies the Stripe signature, records unique event and session IDs,
checks booking ID, amount, currency, and active hold, and makes fulfillment
idempotent. Duplicate valid events return HTTP 200 without side effects.

## SEO and content publication

Indexable pages are localized home, place list/detail, fixed-tour list/detail,
personalized-tour landing, about, FAQ, privacy, and terms. Login, planner,
account, booking, checkout status, admin, and guide pages are `noindex`.
Public pages include localized metadata, canonical URL, hreflang, Open Graph,
breadcrumbs, sitemap, and appropriate JSON-LD without invented ratings.

Content versions transition `draft -> publishing -> published | failed`.
Only one candidate can publish. The build validates complete English and
Vietnamese copy, source, verification date, and image attribution before
export. A failed build leaves the previous Cloudflare deployment active.

## Quality gates

- No itinerary violates a known hard constraint.
- Refinement creates a new revision and preserves feasible locked stops.
- Customer and guide cannot read or mutate another user's rows through direct
  PostgREST calls.
- Concurrent booking attempts never exceed capacity.
- Forged, duplicate, stale, or mismatched Stripe events never confirm a booking.
- Gemini, map, FX, and runtime-service failures have usable fallback states.
- `next build` exports all English/Vietnamese public routes and no private URL
  appears in the sitemap.
- Axe reports no critical or serious findings on primary flows; keyboard-only
  use completes those flows.
- Every payment screen states `Demo/Test payment — no real charge`.

## Agent and delivery policy

The root controller is PM/Architecture Lead on GPT-5.6 Sol high. Task-scoped
Product/UX/SEO, Frontend, Backend/Data/Security, AI/Optimization, and QA/DevOps
agents use GPT-5.6 Luna xhigh. Implementation is task-sequential to avoid file
conflicts. Each task uses test-first development, an independent task review,
and a final whole-branch review. Publishing, pushing, or merging requires an
explicit user-authorized handoff.
