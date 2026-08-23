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
create an atomic 35-minute database capacity hold, enter a 30-minute Stripe
Test Checkout Session, wait for the webhook, and display the confirmed booking.
The five-minute database cushion handles delayed webhooks; admin can assign a
guide only after confirmation.

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

Input datetimes are ISO 8601 values with an explicit offset and are normalized
to `Asia/Ho_Chi_Minh`. Place duration comes from the versioned catalog.
Travel rows provide directed minutes and cost; the scheduler adds a fixed
10-minute transition contingency. Service must start at or after opening and
finish at or before closing. Overnight hours are split into two dated
intervals. Locked stops retain their relative order. The scheduler evaluates
at most eight stops, keeps at most 50 partial candidates, and breaks equal
scores by lower group cost, earlier finish, then lexicographic stop ID. An
infeasible request returns `NO_FEASIBLE_ITINERARY`. Repair may drop or reorder
only unlocked stops and the validator always runs again after repair.

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

An anonymous recommendation returns the raw guest token exactly once and the
database stores only its hash bound to the plan ID. The browser keeps the raw
token in `sessionStorage` and sends it through the `X-Guest-Token` header; it
never appears in a URL. Refinement requires either that header or an owner JWT.
Gemini quota reservations are atomic and count every attempted model call,
including timeout, HTTP 429, and malformed output. A separate planner compute
limit of 30 requests per hour for both IP and device buckets protects the free
database; exceeding it returns a retryable rate-limit error rather than calling
either engine. Quota dates use UTC and database time is authoritative.

Each revision records catalog, travel-time, and FX snapshot identifiers.
Filtering, validation, and persistence use the same snapshots. Refinement uses
compare-and-swap on the base revision; only one concurrent request can advance
it. Gemini has an eight-second timeout and returns only allowlisted candidate
IDs plus rationales of at most 240 characters. Unknown and duplicate IDs make
the AI result invalid and trigger deterministic ranking.

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

`vnd_per_usd` is stored as `numeric(20,8)`. USD budget cents convert to VND
with floor division so the itinerary never exceeds the customer's stated
budget. VND checkout converts to USD cents with ceiling division. Floating
point arithmetic is forbidden for money.

State transitions are explicit:

- Request: `draft -> pending_review -> changes_requested -> pending_review`,
  or `pending_review -> approved | rejected`.
- Quote: `active -> checkout_pending | expired | revoked`;
  `checkout_pending -> accepted | active | expired | revoked`. Acceptance,
  expiry, and revocation recheck the 48-hour validity under a database lock;
  only checkout compensation may return an unexpired quote to `active`.
- Booking: `pending_payment -> payment_processing -> confirmed -> completed`;
  failure exits are `payment_failed`, `expired`, and `cancelled`. A completed
  Stripe event after an inactive hold becomes `payment_review`, never an
  automatic confirmation.
- Payment review: `payment_review -> confirmed | cancelled`; only an admin
  reconciliation action may leave this state.
- Guide assignment: `assigned -> accepted | closed` and
  `accepted -> completed | closed`. Reassignment closes the old record before
  creating a new one.

## Public service contracts

- `recommend-itinerary(input, turnstileToken, guestToken?)`
- `refine-itinerary(planId, baseRevision, delta, lockedItemIds, guestToken?)`
- `claim-trip-plan(planId, guestToken)`
- `submit-custom-request(planId, revision)`
- `review-custom-request(requestId, decision, note)`
- `create-custom-quote(requestId, quote)`
- `start-checkout(departureId | quoteId, partySize, locale, idempotencyKey)`
- `stripe-webhook(rawBody)`
- `publish-seo(contentVersion)`
- `finalize-seo-publish(releaseId, buildId, artifactHash)`
- `get-fx-rate()`

Every function returns errors as
`{ code, messageKey, fieldErrors?, retryable, correlationId }`.
Stale itinerary refinement returns HTTP 409 with `STALE_REVISION`.

Public reads use typed PostgREST projections: published catalog and localized
content, live departure availability, owner plan/revisions, owner custom
request/quote, owner booking/payment status, and sanitized assigned booking for
guides. RLS remains authoritative for every read. The auth callback accepts
only relative allowlisted return paths, defaults to `/en/`, and rejects scheme,
host, protocol-relative, encoded traversal, admin, and guide destinations.

## Authorization and security

RLS is enabled on every public-schema table. Anonymous users only read
published catalog data. Customers only access their own plans, requests,
quotes, and bookings. Guides only access assigned booking summaries and
whitelisted assignment status transitions. Admin manages catalog, content,
departures, quotes, roles, assignments, and audit records. Signup cannot set a
role; admin and guide accounts are provisioned manually. Customers authenticate
with email/password or Google OAuth. Email confirmation may be disabled only in
the explicitly labeled demo environment. Service-role keys are
restricted to Edge Functions. Logs redact tokens and PII. Public functions use
CORS allowlists, body limits, input schemas, HMAC IP hashing, and replay-safe
idempotency.

Turnstile validation checks success, expected action, and allowlisted hostname.
Invalid, expired, duplicate, or unavailable validation fails closed; service
outage returns a retryable error and never bypasses the challenge. The verifier,
clock, UUID source, Gemini client, Stripe client, and FX client are injectable
at their boundaries so CI never calls live services.

Capacity hold creation locks the departure and commits atomically. Stripe
Checkout is orchestrated through one public `start-checkout` operation. Its
database transaction snapshots price/FX/policy, creates the booking and a
35-minute hold, and moves an applicable quote from `active` to
`checkout_pending`. The Edge Function then creates a card-only Stripe Test
Session expiring after 30 minutes with the attempt's durable provider
idempotency key. Recording that session atomically moves the booking to
`payment_processing` and the quote to `accepted`; provider failure releases the
hold and returns an unexpired quote to `active`. The five-minute database
cushion allows delayed webhooks without reopening capacity. A repeated client
idempotency key with the same request hash resumes the same booking/session; a
different hash returns `IDEMPOTENCY_CONFLICT`. Custom quotes have no departure
capacity, but the same operation prevents multiple sellable checkout attempts
for one quote.

The webhook reads the raw
body, verifies the Stripe signature, records unique event and session IDs,
checks booking ID, amount, currency, and active hold, and makes fulfillment
idempotent. Duplicate valid events return HTTP 200 without side effects.
Events with `livemode=true` are rejected. The MVP enables only the `card`
payment method and handles `checkout.session.completed` and
`checkout.session.expired`.

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

`publish-seo` creates and locks one immutable release, then calls the protected
Cloudflare deploy hook. The build reads that release with a public, RLS-limited
projection; it never receives a service-role key. After successful static
export, the build calls `finalize-seo-publish` using a dedicated build secret,
release ID, build ID, and artifact hash. Invalid or stale finalization fails
closed. Build or validation failure marks the release `failed`; the previously
published release remains active and can be rebuilt.

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
