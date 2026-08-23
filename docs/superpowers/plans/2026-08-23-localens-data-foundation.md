# LocalLens Supabase Data Foundation Implementation Plan

> **Execution rule:** implement sequentially with TDD and a fresh reviewer after every task. This milestone creates no remote Supabase project, calls no live provider, and never uses a service-role secret.

**Goal:** Add the versioned PostgreSQL schema, RLS/RPC boundaries, deterministic demo data, and adapter contracts needed by fixed tours and personalized itineraries while preserving the pure engine as the authority for scheduling, time, and money.

**Architecture:** `public` contains API-facing tables with RLS. `private` contains helper functions and sensitive operational tables that are not exposed through PostgREST. Browser clients receive only typed allowlisted projections. Stateful writes use narrow RPCs/Edge Functions; direct client writes remain denied. Historical rows snapshot names, prices, policies, FX, and engine snapshot IDs.

**Cost/runtime boundary:** Supabase Free and Stripe Test cost zero for the demo. This machine currently has no Docker, Supabase CLI, Deno, or local PostgreSQL. Static SQL/artifact tests are executable now; PostgreSQL syntax, pgTAP, RLS, locks, and concurrency remain **unverified** until the later container-backed integration gate. Never replace that gate with regex-only claims.

**Tech stack:** PostgreSQL/Supabase migrations, pgTAP integration tests, TypeScript/Zod adapter contracts, Vitest static checks, pnpm, Next.js 16.

---

## Global database rulings

- Create `private` explicitly in the first migration. Revoke schema/table/sequence/function privileges and matching default privileges from `PUBLIC`, `anon`, and `authenticated`; PostgREST exposed schemas remain only `public` and `graphql_public` in local config. Grants and RLS are separate mandatory checks.
- Use `uuid` primary keys; deterministic public catalog slugs are separate unique fields. Foreign keys use `ON DELETE RESTRICT` for immutable/historical facts unless a task explicitly states otherwise.
- VND and USD minor units use nonnegative `bigint` constrained to `<= 9007199254740991`; JS adapters receive database bigint as decimal strings and convert only after safe-bound checks.
- FX uses positive `numeric(20,8)`. All database timestamps are `timestamptz`; database/quotas use UTC. Opening weekdays/times/dates are HCMC local facts.
- Every public table enables RLS. Client roles receive no direct writes to stateful tables. `service_role` remains Edge-only. Named public views use `security_invoker=true`, `security_barrier=true`, explicit columns, and no `SELECT *`; sanitized definer RPCs are used only where an invoker view cannot work without unsafe base-table grants.
- `SECURITY DEFINER` functions set a fixed trusted `search_path`, schema-qualify relations, derive actors from `auth.uid()`, avoid dynamic SQL, revoke execute from `PUBLIC`, and grant only the intended role. Every public/customer/guide-callable definer is owned by a named `NOLOGIN NOBYPASSRLS` role, never `postgres` or `service_role`; an internal definer that intentionally bypasses RLS requires a separately named owner and per-function justification in the access matrix.
- Snapshots, itinerary revisions/items, recommendation attempts, idempotency records, webhook events, and audit rows are append-only.
- State changes use explicit transition guards. Database time is authoritative for expiry, quota, holds, and quote validity. Lock order is always idempotency row -> quote/departure -> booking -> hold/payment row.
- Raw guest tokens, IPs, device identifiers, Stripe signatures, auth tokens, payment payloads, and PII never appear in audit/error data.
- Migration filenames are immutable after review. Seed facts are deterministic and idempotent.

## Exact state machines

- Request: `draft -> pending_review`; `pending_review -> changes_requested | approved | rejected`; `changes_requested -> pending_review`.
- Quote: `active -> checkout_pending | expired | revoked`; `checkout_pending -> accepted | active | expired | revoked`. Expiry/revocation and acceptance recheck `valid_until` under the quote lock; only checkout compensation may return `checkout_pending -> active`.
- Hold: `active -> consumed | released | expired`.
- Booking: `pending_payment -> payment_processing | expired | cancelled`; `payment_processing -> confirmed | payment_failed | expired | payment_review | cancelled`; `confirmed -> completed | cancelled`; `payment_review -> confirmed | cancelled` by admin reconciliation only. Completed/payment-failed/expired/cancelled are terminal except the explicitly listed confirmed cancellation.
- Payment: `pending -> paid | failed | review`; `review -> paid | failed` by audited admin reconciliation only; paid/failed are terminal. Payment status never reuses booking-status values.
- Webhook event: `received -> processed | ignored | failed | conflict`; all four result states are terminal and a duplicate provider event ID must replay its stored result unless the payload hash differs, which records `conflict`.
- Assignment: `assigned -> accepted | closed`; `accepted -> completed | closed`; reassignment closes the old record before creating the next.
- Content: `draft -> publishing -> published | failed`.

## Exact literals and adapter registry

- Base/publication unions are exact: `Role="customer"|"guide"|"admin"`; `Locale="en"|"vi"`; `PlaceStatus="draft"|"published"|"archived"`; `TourStatus="draft"|"published"|"archived"`; `TourVersionStatus="draft"|"published"|"retired"`; `DepartureStatus="scheduled"|"sold_out"|"cancelled"|"completed"`; `SnapshotStatus="building"|"published"|"retired"`. State unions are exact: `RequestStatus="draft"|"pending_review"|"changes_requested"|"approved"|"rejected"`; `QuoteStatus="active"|"checkout_pending"|"accepted"|"expired"|"revoked"`; `HoldStatus="active"|"consumed"|"released"|"expired"`; `BookingStatus="pending_payment"|"payment_processing"|"confirmed"|"payment_failed"|"payment_review"|"expired"|"cancelled"|"completed"`; `PaymentStatus="pending"|"paid"|"failed"|"review"`; `WebhookEventStatus="received"|"processed"|"ignored"|"failed"|"conflict"`; `AssignmentStatus="assigned"|"accepted"|"completed"|"closed"`; `ContentStatus="draft"|"publishing"|"published"|"failed"`. Task 1 exports them and SQL enums/checks use the same literals.
- `DataAdapterError={code:"INVALID_SHAPE"|"UNKNOWN_FIELD"|"MISSING_FIELD"|"INVALID_DB_INTEGER"|"UNSAFE_DB_INTEGER"|"INVALID_DB_DECIMAL"|"INVALID_TIMESTAMP"|"SNAPSHOT_MISMATCH",messageKey:string,fieldPath?:string}`. It never contains rejected values. Every adapter uses a strict Zod schema; money is a canonical decimal bigint string, FX is a positive canonical decimal string, and every database timestamp DTO field is a canonical ISO-8601 offset string round-trippable to `timestamptz`.
- Engine read DTOs are exactly the existing strict `CatalogSnapshotSchema={id,places:PlaceCandidate[]}`, `TravelSnapshotSchema={id,edges:TravelEdge[]}`, and `FxSnapshotSchema={id,vndPerUsd,observedAtUtc}`; database-only membership/source fields are verified before projecting those exact shapes.
- `PublishedTour={id:string,versionId:string,slug:string,locale:Locale,title:string,summary:string,meetingPoint:string,durationMinutes:number,priceVndMinor:string,inclusions:string[],exclusions:string[],cancellationPolicy:string,sourceUrl:string,verifiedAt:string,attribution:string,license:string,stops:{position:number,placeId:string,placeSlug:string,title:string}[]}`; `LiveDepartureAvailability={id:string,tourVersionId:string,startAt:string,endAt:string,status:DepartureStatus,remainingCapacity:number}` is separate because its hold-aware projection is created only in Task 9.
- `PlanRevisionInsert={revisionNo:number,request:ItineraryRequest,result:ItineraryResult,fingerprint:string,rankingSource:"ai"|"deterministic",catalogSnapshotId:string,travelSnapshotId:string,fxSnapshotId:string|null,fxVndPerUsd:string|null,currency:"VND"|"USD",budgetVnd:string,totalCostVnd:string,totalDurationMinutes:number,lockedPlaceIds:string[],items:ItineraryItem[]}` where each item is the exact nine-field `ItineraryItemSchema`. `planId`, `baseRevisionNo`, and actor/capability are separate validated RPC parameters; they are never copied from this persistence DTO or caller-supplied actor data.
- Guest creation DTOs are exact: internal `CreateGuestPlanArgs={revision:PlanRevisionInsert,tokenHash:string,pepperVersion:number}` and application response `GuestPlanHandle={planId:string,revisionNo:1,guestToken:string,expiresAt:string}`. Edge generates the one-time raw token, sends only its HMAC hash to the internal RPC, and returns the raw token to the browser; the database sets expiry from its own clock and never stores or returns the raw token.
- Request/quote DTOs are exact: `SubmitCustomRequestInput={planId:string,revisionNo:number}`; `ReviewCustomRequestInput={requestId:string,decision:"changes_requested"|"approved"|"rejected",note:string|null}`; `CreateCustomQuoteInput={requestId:string,amountVndMinor:string,checkoutCurrency:"vnd"|"usd",titleEn:string,titleVi:string,policy:string}`; `CustomerCustomRequest={id:string,planId:string,revisionNo:number,status:RequestStatus,submittedAt:string,updatedAt:string}`; `AdminCustomRequest={id:string,planId:string,revisionNo:number,ownerUserId:string,status:RequestStatus,submittedAt:string,latestDecisionAt:string|null}`; `CustomerCustomQuote={id:string,requestId:string,status:QuoteStatus,title:string,amountVndMinor:string,currency:"vnd"|"usd",amountMinor:string,policy:string,validUntil:string}`. Quote RPCs derive actor, immutable snapshot IDs, exact FX, checkout amount, and `validUntil=createdAt+48h`; they reject extra fields.
- Checkout DTOs are exact: public `StartCheckoutInput={source:{kind:"departure",departureId:string}|{kind:"quote",quoteId:string},partySize:number,locale:Locale,idempotencyKey:string}`; internal `StartCheckoutTxArgs=StartCheckoutInput&{canonicalRequestHash:string}`, recomputed by Edge and independently recomputed/compared by SQL from normalized input plus authenticated owner; `StartCheckoutResult={bookingId:string,attemptId:string,providerIdempotencyKey:string,amountMinor:string,currency:"vnd"|"usd",holdExpiresAt:string,state:"created"|"resumed"}`; `StripeCheckoutSessionInput={mode:"payment",payment_method_types:["card"],expires_at:number,client_reference_id:string,metadata:{booking_id:string,attempt_id:string},line_items:{price_data:{currency:"vnd"|"usd",unit_amount:number,product_data:{name:string}},quantity:1}[],success_url:string,cancel_url:string}` with server-owned amounts and exactly one 30-minute expiry; `RecordCheckoutSessionInput={bookingId:string,attemptId:string,providerSessionId:string,providerExpiresAt:string}`; `RecordCheckoutSessionResult={bookingId:string,bookingStatus:BookingStatus,paymentStatus:PaymentStatus|null,quoteStatus:QuoteStatus|null,providerSessionId:string,state:"recorded"|"replayed"}`. A replay after an early webhook returns the stored confirmed/`payment_review` booking and payment state without downgrade. `CustomerBooking={id:string,status:BookingStatus,sourceKind:"departure"|"quote",sourceId:string,tourVersionId:string|null,quoteId:string|null,titleEn:string,titleVi:string,cancellationPolicy:string,catalogSnapshotId:string,travelSnapshotId:string,fxSnapshotId:string|null,fxVndPerUsd:string|null,perPersonVndMinor:string|null,totalVndMinor:string,checkoutCurrency:"vnd"|"usd",checkoutAmountMinor:string,partySize:number,language:Locale,meetingPoint:string,holdExpiresAt:string,createdAt:string}`.
- Payment DTOs are exact. `FinalizeStripeEventInput` is a strict discriminated union with common `{eventId:string,payloadHash:string,sessionId:string,bookingId:string,attemptId:string,amountMinor:string,currency:"vnd"|"usd",livemode:false,mode:"payment",accountId:string,endpointId:string}` and either `{eventType:"checkout.session.completed",sessionStatus:"complete",providerPaymentStatus:"paid",paymentIntentId:string}` or `{eventType:"checkout.session.expired",sessionStatus:"expired",providerPaymentStatus:"unpaid",paymentIntentId:string|null}`. `FinalizeStripeEventResult={eventStatus:WebhookEventStatus,bookingStatus:BookingStatus,paymentStatus:PaymentStatus|null,replayed:boolean}`; `CustomerPaymentStatus={bookingId:string,bookingStatus:BookingStatus,paymentStatus:PaymentStatus|null,amountMinor:string,currency:"vnd"|"usd",updatedAt:string}`.
- Guide DTO is exact: `GuideAssignedBooking={bookingId:string,tourVersionId:string,departureId:string,title:string,startAt:string,endAt:string,meetingPoint:string,partySize:number,language:Locale,mobilityFlags:string[],dietaryFlags:string[],assignmentStatus:AssignmentStatus}`.
- Content/audit DTOs are exact: `ImageAttribution={imageUrl:string,sourceUrl:string,creator:string,license:string}`; `ContentDraftWrite={locale:Locale,slug:string,title:string,description:string,body:string,sourceUrls:string[],verifiedAt:string,imageAttributions:ImageAttribution[]}`; `AdminContentDraft={id:string,locale:Locale,slug:string,title:string,description:string,body:string,sourceUrls:string[],verifiedAt:string,imageAttributions:ImageAttribution[],status:ContentStatus,updatedAt:string}`; `PublishedContent={releaseId:string,locale:Locale,slug:string,title:string,description:string,body:string,sourceUrls:string[],verifiedAt:string,imageAttributions:ImageAttribution[],publishedAt:string}`; `AdminAuditEvent={id:string,eventType:AuditEventType,actorUserId:string|null,actorRole:Role|null,targetType:string,targetId:string,fromState:string|null,toState:string|null,correlationId:string,metadata:Record<string,string|number|boolean|null>,createdAt:string}`. Every content/image URL is parsed as sanitized HTTPS, rejects credentials/fragments/tracking or PII query parameters, and must match the checked-in source/domain allowlist before draft write and again before publish/finalize.
- `AuditEventType` is exhaustive for this milestone: `role_provisioned|role_revoked|plan_claimed|request_submitted|request_changes_requested|request_approved|request_rejected|quote_created|quote_checkout_started|quote_accepted|quote_reactivated|quote_expired|quote_revoked|checkout_started|checkout_session_recorded|checkout_compensated|booking_status_changed|webhook_processed|webhook_ignored|webhook_failed|webhook_conflict|payment_reconciled|guide_assigned|guide_reassigned|guide_accepted|guide_completed|content_publish_started|content_published|content_publish_failed`.

---

### Task 1: Data contracts, state machines, and static SQL gate

**Files:**

- Create `lib/domain/data/contracts.ts`
- Create `lib/domain/data/state-machine.ts`
- Create `tests/unit/data/contracts.test.ts`
- Create `tests/unit/data/state-machine.test.ts`
- Create `scripts/check-supabase-artifacts.mjs`
- Create `tests/unit/supabase/artifacts.test.ts`
- Create `supabase/config.toml`
- Modify `package.json`

**Interfaces:** export every exact literal union, `DataContractError`, and `DataAdapterError` from the registry above plus `canTransition(machine, from, to): boolean`; task-specific files implement their registered DTO schemas. `DataContractError={code:"INVALID_DB_INTEGER"|"UNSAFE_DB_INTEGER",messageKey:string}`; `parseDbSafeInteger(value:unknown): Result<number,DataContractError>` accepts canonical unsigned decimal strings plus nonnegative safe `number|bigint`; `toDbBigint(value:unknown): Result<string,DataContractError>` returns a canonical unsigned decimal string.

1. RED/GREEN exact unions and every allowed/forbidden state transition.
2. RED/GREEN adapter cases: zero/max-safe, negative, fractional, exponent, leading sign, unsafe, bigint/string/number, malformed runtime values.
3. Add `db:static` that fails on unordered/duplicate valid 14-digit UTC migration timestamps, missing `begin/commit`, missing RLS declarations, forbidden raw secrets, or SQL files with unresolved template tokens. Function bodies are parsed as PostgreSQL dollar-quoted regions before transaction-marker checks. Seed files are optional at this stage.
4. Add a staged `db:static:seed` / `--require-seed` mode in Task 15; only that mode requires `seed.sql`, approval manifest, source hashes, and seed markers.
5. Add minimal local-only Supabase config with no project ref or remote secret and explicit API schemas `public,graphql_public` only.
6. Verify focused/full/lint/typecheck/build and `pnpm db:static`; commit `chore: scaffold LocalLens data contracts`.

### Task 2: Extensions, enums, identity, and role safety

**Files:**

- Create `supabase/migrations/20260823090000_extensions_enums.sql`
- Create `supabase/migrations/20260823091000_identity_roles.sql`
- Create `supabase/tests/database/identity_roles_test.sql`
- Extend artifact/unit tests

**Schema:** explicit `private` schema and default-privilege revokes; `public.profiles`, `private.user_roles`, `public.guide_profiles`, append-only unified `private.audit_events`, shared `private.set_updated_at()`, safe role helpers.

1. Create exact enums matching Task 1 and engine contracts, including the complete `AuditEventType` list; do not duplicate incompatible enum meanings.
2. `private.user_roles` has `UNIQUE(user_id,role)` and controlled provisioning uses explicit `ON CONFLICT` behavior. The auth trigger is `SECURITY DEFINER SET search_path=''`, schema-qualifies every object, is owned by a named `NOLOGIN NOBYPASSRLS` non-client role, has execute revoked from API roles, and creates one customer profile/role while ignoring signup role metadata. Any intentionally bypassing owner must instead be named and justified per function in the Task 13 matrix. Test signup success/failure, duplicate execution, hostile metadata, and the exact interaction with forced RLS.
3. No client can insert/update roles. `private.provision_role(target_user_id,target_role)` derives the actor from `auth.uid()`, requires admin, rejects self-elevation, and writes `private.audit_events` in the same transaction. Task 2 creates the complete scalar audit base schema and exhaustive event-type allowlist needed by Tasks 2–12; later tasks insert into this same table through named helpers and never copy or normalize precursor rows.
4. RLS: customer reads own profile; guide reads own guide profile; admins use named RPC `public.admin_user_summary()`. No direct access to `private.user_roles` or role audit.
5. pgTAP covers signup escalation, cross-user reads/writes, duplicate grants, definer `search_path`, execute grants, private-schema usage/default privileges, append-only audit, and owner/forced-RLS behavior.
6. Static gate now; integration test later; commit `feat: add identity roles and database enums`.

### Task 3: Catalog, translations, opening data, and catalog snapshots

**Files:**

- Create `supabase/migrations/20260823092000_catalog_snapshots.sql`
- Create `supabase/tests/database/catalog_snapshots_test.sql`
- Create `lib/infrastructure/supabase/catalog-adapter.ts`
- Create `tests/unit/infrastructure/catalog-adapter.test.ts`

**Schema:** mutable `areas`, `area_translations`, `places`, `place_translations`, `place_experience_types`, `place_guide_languages`, `place_supports`, `place_opening_hours`, `place_opening_exceptions`; immutable `catalog_snapshots` and snapshot child tables.

**Adapter:** `mapCatalogSnapshot(rows:unknown): Result<CatalogSnapshot,DataAdapterError>`; it accepts only the named PostgREST projection, canonical decimal-string money, dense child arrays, and exact snapshot/place IDs.

1. Opening facts use `smallint` weekday with `CHECK 0..6`, `time without time zone`, and exception `date`; runtime adapters attach HCMC `+07:00` only at the engine boundary. Constraints mirror `PlaceCandidate`: four experience types, bigint price safe bound, duration 15..480, guide languages are a unique non-empty subset of `{en,vi}` (both are not required), support tri-state, non-equal windows, unique exception dates, closed exceptions without windows, no normal/exception overlap including overnight carry.
2. Published places require complete EN/VI translations, source URL, verification date, attribution, and at least one experience type/language/opening window.
3. Composite foreign keys make every snapshot child reference `(snapshot_id,place_id)` and its matching area. All snapshot/history FKs use `ON DELETE RESTRICT`. `private.create_catalog_snapshot()` copies canonical facts transactionally; `private.reject_append_only_change()` rejects published snapshot/child update/delete. Current catalog changes never mutate prior snapshots.
4. Adapter maps typed PostgREST decimal strings to engine `CatalogSnapshot`, rejects missing/extra/unsafe facts, and never invents a place or price.
5. Index public slug/locale/status and snapshot place/area/type/opening/exception access.
6. Verify; commit `feat: add catalog and immutable snapshots`.

### Task 4: Directed travel snapshots and FX snapshots

**Files:**

- Create `supabase/migrations/20260823093000_travel_fx_snapshots.sql`
- Create `supabase/tests/database/travel_fx_snapshots_test.sql`
- Create `lib/infrastructure/supabase/travel-fx-adapter.ts`
- Create `tests/unit/infrastructure/travel-fx-adapter.test.ts`

**Schema:** `travel_edges`, `travel_snapshots`, `travel_snapshot_edges`, append-only `fx_snapshots`. Every travel snapshot stores its `catalog_snapshot_id`; every copied edge also carries that ID, has a composite FK to its travel snapshot, and has composite endpoint FKs `(catalog_snapshot_id,from_place_id)` and `(catalog_snapshot_id,to_place_id)` to catalog-snapshot membership.

**Adapter:** `mapTravelSnapshot(rows:unknown): Result<TravelSnapshot,DataAdapterError>` and `mapFxSnapshot(row:unknown): Result<FxSnapshot,DataAdapterError>`; bigint fields arrive as canonical decimal strings and FX remains the exact database decimal string.

1. Directed pair unique per snapshot; reject self edge; modes `walk|taxi|public_transport`; minutes 1..240; safe group cost; verification timestamp required. Never synthesize reverse/missing edges.
2. FX is positive `numeric(20,8)` with `source`, `observed_at timestamptz`, `environment demo|production`, and `is_demo`, with `CHECK (is_demo = (environment = 'demo'))`; immutable; latest-valid query does not claim freshness beyond seven days. VND plans persist `fx_snapshot_id=NULL`; USD plans require the FX snapshot and exact `vnd_per_usd` value.
3. Snapshot functions copy facts atomically and lock published rows against mutation.
4. Adapter returns exact engine `TravelSnapshot`/`FxSnapshot` and preserves decimal precision.
5. Tests cover asymmetry, missing edge, duplicate/self rejection, historic immutability, FX bounds/staleness mapping.
6. Verify; commit `feat: add travel and FX snapshots`.

### Task 5: Fixed tours, immutable versions, departures, and capacity facts

**Files:**

- Create `supabase/migrations/20260823094000_tours_departures.sql`
- Create `supabase/tests/database/tours_departures_test.sql`
- Create `lib/domain/data/public-tours.ts`
- Create `tests/unit/data/public-tours.test.ts`

**Schema:** `tours`, mutable `tour_translations`, append-only `tour_versions`, immutable `tour_version_translations`, `tour_version_stops`, `departures`; capacity holds are introduced later with bookings.

**Projection:** SQL view `public.published_tours_v` uses `security_invoker=true`, `security_barrier=true`, explicit columns; `mapPublishedTour(row:unknown): Result<PublishedTour,DataAdapterError>` maps the exact view shape. Hold-aware `public.get_live_departure_availability()` is intentionally deferred to Task 9.

1. A tour version snapshots catalog ID, duration, bigint per-person VND, inclusions, exclusions, cancellation policy, ordered stops, canonical `source_url`, source verification date, attribution, and license; `tour_version_translations` snapshots title/summary/meeting copy EN/VI. Composite foreign keys prove every stop belongs to the referenced catalog snapshot; delete behavior is `RESTRICT`.
2. Published tours require complete copy/attribution. Departures have positive capacity, valid time range/status, version reference, and unique version/start time.
3. Anonymous RLS exposes only the published localized tour projection in this task; no base-table writes. Live non-sensitive departure availability is not exposed until Task 9 can subtract active capacity holds correctly.
4. Typed mapper is safe for static generation and contains no draft/admin fields.
5. Verify; commit `feat: add fixed tour versions and departures`.

### Task 6: Immutable trip plans, revisions, items, fingerprints, and CAS

**Files:**

- Create `supabase/migrations/20260823095000_trip_plans_revisions.sql`
- Create `supabase/tests/database/trip_plan_revisions_test.sql`
- Create `lib/infrastructure/supabase/plan-revision-adapter.ts`
- Create `tests/unit/infrastructure/plan-revision-adapter.test.ts`

**Schema:** `trip_plans`, append-only `trip_plan_revisions`, `trip_plan_items`, `recommendation_runs`.

**Adapter:** `toPlanRevisionInsert(input:EngineInput,result:ItineraryResult,fingerprint:string,revision:number): Result<PlanRevisionInsert,DataAdapterError>`; output contains only allowlisted persistence columns and database bigint decimal strings.

1. Revisions store canonical request/result JSON, fingerprint, rank source, catalog/travel/FX snapshot IDs, revision/base numbers, locked IDs, actor, totals, and immutable ordered items with all nine engine item fields.
2. `trip_plans.owner_user_id` is nullable while unclaimed. Task 6 adds only a nullable UUID `guest_binding_id` placeholder, no FK and no anonymous RLS; its first `private.advance_trip_plan_revision` implementation authorizes customer owners only. Task 7 creates guest-binding/capability tables, adds the `guest_binding_id` FK, and replaces the CAS function with the server-verified guest-capability branch before any guest flow is considered usable.
3. Unique `(plan_id, revision_no)`, `(revision_id, position)`, and item place per revision. Triggers reject revision/item update/delete; snapshot FKs are `RESTRICT` and USD/VND FX nullability is checked.
4. `private.advance_trip_plan_revision(plan_id,base_revision_no,persistence_dto)` locks plan and uses compare-and-swap; Task 6 derives the customer owner from `auth.uid()`, and the Task 7 replacement additionally accepts only a server-verified guest capability, never a caller-supplied user ID. Exactly one concurrent winner, loser gets stable `STALE_REVISION` without orphan rows.
5. Database never accepts client price/totals as authority: Edge adapter recomputes, validates, fingerprints, then passes the allowlisted persistence DTO. SQL rechecks structural/snapshot/fingerprint presence.
6. Owner RLS only after claim; anonymous has no direct plan access before or after claim.
7. Verify; commit `feat: persist immutable itinerary revisions`.

### Task 7: Guest capability, claim-once flow, and atomic planner quotas

**Files:** `supabase/migrations/20260823100000_guest_quota.sql`, `supabase/tests/database/guest_quota_test.sql`, `lib/infrastructure/supabase/guest-quota-contracts.ts`, `tests/unit/infrastructure/guest-quota-contracts.test.ts`.

**Interfaces:** `GuestCapability={planId:string,tokenHash:string,pepperVersion:number}`; `QuotaReservation={reservationId:string,kind:"planner"|"gemini",bucketHashes:string[],periodStart:string}`; public browser never constructs either database DTO directly.

1. Private tables have unique token hash, partial unique active token per plan, unique `(bucket_kind,bucket_hash,period_start)`, unique global row per period, and unique reservation idempotency key. Add `pepper_version`; allow a bounded dual-key rotation window in Edge verification. Never trust client `X-Forwarded-For`; device hash is only a soft abuse signal.
2. Named internal RPC `private.create_guest_plan(args CreateGuestPlanArgs)` is revoked from `anon/authenticated`. Under one transaction it creates the unowned plan, guest binding/capability, revision 1, items, and recommendation run from the already validated engine persistence DTO; it rejects any raw token or client actor. The application operation returns `GuestPlanHandle`, retaining the Edge-generated raw token only in browser `sessionStorage`.
3. Customer RPC derives `auth.uid()`. Other guest/internal RPCs are revoked from `anon/authenticated` and receive only a server-produced HMAC capability through a dedicated internal database role/connection; they verify plan binding, expiry, claim state, and revision ownership. Webhook/build internal roles are separate.
4. `private.claim_guest_plan()` conditionally sets nullable owner once using database time. Wrong/expired/replayed/mismatched inputs share one safe error; exactly one concurrent winner.
5. Planner 30/hour IP+device and Gemini 5/day IP+device+100/day global reserve rows in deterministic order and increment all-or-none. Reservation retries are idempotent and failed provider attempts remain consumed.
6. No policy reads HTTP headers. pgTAP covers atomic guest creation, raw-token absence, forged/cross-plan capability, and single-transaction invariants here; the actual two-session claim and bucket-creation race harness is explicitly integration-deferred to Task 16.
7. Verify; commit `feat: add guest claims and planner quotas`.

### Task 8: Custom requests and immutable 48-hour quotes

**Files:** `supabase/migrations/20260823101000_requests_quotes.sql`, `supabase/tests/database/requests_quotes_test.sql`, `lib/infrastructure/supabase/request-quote-adapter.ts`, `tests/unit/infrastructure/request-quote-adapter.test.ts`.

**Contracts and projections:** `toSubmitCustomRequest(input:SubmitCustomRequestInput): Result<SubmitCustomRequestArgs,DataAdapterError>`; `toReviewCustomRequest(input:ReviewCustomRequestInput): Result<ReviewCustomRequestArgs,DataAdapterError>`; `toCreateCustomQuote(input:CreateCustomQuoteInput): Result<CreateCustomQuoteArgs,DataAdapterError>`; `mapCustomerCustomRequest(row:unknown): Result<CustomerCustomRequest,DataAdapterError>` from `public.customer_custom_requests_v`; `mapAdminCustomRequest(row:unknown): Result<AdminCustomRequest,DataAdapterError>` from `public.admin_custom_request_queue_v`; `mapCustomerCustomQuote(row:unknown): Result<CustomerCustomQuote,DataAdapterError>` from `public.customer_custom_quotes_v`. Shapes are exactly the shared registry; customer DTOs omit internal notes/actors, and actor/plan/base-revision authority remains separate in guarded RPC parameters.

1. Create `custom_requests`, append-only events, and `custom_quotes` whose commercial/snapshot facts are immutable and whose status alone changes through guarded RPCs; enforce the exact state machines and partial unique indexes for one active request per plan and one sellable quote per request, where sellable means status in `('active','checkout_pending')`.
2. Submitted requests reference one immutable plan revision. Quotes snapshot amount VND, checkout currency/minor amount, catalog/travel/FX IDs, exact FX decimal, EN/VI title, policy, and `valid_until=created_at+48 hours`.
3. Named RPCs `submit_custom_request`, `review_custom_request`, and `create_custom_quote` derive owner/admin from JWT, validate transitions, lock target rows, and audit safe scalar events.
4. The named views expose only the exact adapter columns. Customer views own rows only; admins use the narrow queue projection and RPCs.
5. Verify; commit `feat: add custom review requests and quotes`.

### Task 9: Checkout idempotency, bookings, and atomic capacity holds

**Files:** `supabase/migrations/20260823102000_bookings_holds_idempotency.sql`, `supabase/tests/database/bookings_holds_idempotency_test.sql`, `lib/infrastructure/supabase/checkout-contracts.ts`, `tests/unit/infrastructure/checkout-contracts.test.ts`.

**Contracts and projections:** use the exact shared `StartCheckoutInput`, internal `StartCheckoutTxArgs`, `StartCheckoutResult`, `StripeCheckoutSessionInput`, `RecordCheckoutSessionInput`, and `RecordCheckoutSessionResult` schemas. `toStripeCheckoutSession(result:StartCheckoutResult,urls:{successUrl:string,cancelUrl:string},now:Date): Result<StripeCheckoutSessionInput,DataAdapterError>` uses server-owned booking facts, `payment_method_types:["card"]`, and an exact 30-minute provider expiry. `mapCustomerBooking(row:unknown): Result<CustomerBooking,DataAdapterError>` reads only `public.customer_bookings_v`; `mapLiveDepartureAvailability(row:unknown): Result<LiveDepartureAvailability,DataAdapterError>` reads only the named table result of `public.get_live_departure_availability()`. All money uses safe decimal strings and all timestamp fields require canonical ISO-8601 offsets.

1. Create `checkout_idempotency`, `bookings`, and `capacity_holds`. Enforce `CHECK ((departure_id IS NOT NULL) <> (quote_id IS NOT NULL))`, `ON DELETE RESTRICT`, scoped unique `(owner_user_id,idempotency_key)`, one active hold per booking, one active payment/session per quote, and index `(departure_id,status,expires_at)`. Every booking immutably snapshots source kind and source ID, tour/quote version ID, EN/VI title, cancellation policy, catalog/travel/FX snapshot IDs, exact nullable FX decimal, per-person VND and total VND, checkout currency/minor amount, party size, language, meeting facts, created time, and hold terms. The fixed-departure and custom-quote tests prove these columns are populated from server-owned source rows, never client amounts.
2. Edge normalizes the public input and computes its canonical hash; `private.start_checkout_tx()` independently recomputes and constant-time-compares that hash from normalized source, party size, locale, and authenticated owner before following lock order idempotency -> quote/departure -> booking -> hold. It validates capacity/quote expiry, creates a 35-minute hold and retryable booking facts, and stores `provider_idempotency_key='localens:stripe-checkout:v1:' || checkout_attempt_id` on the checkout-attempt row before returning. Edge always supplies that same durable key to Stripe Checkout Session creation; after a timeout/crash it repeats the identical create request so Stripe returns the original idempotent result, or retrieves the session when its ID was already persisted, never creates a second attempt. The RPC does **not** irreversibly accept the quote before Stripe succeeds.
3. Quote moves `active -> checkout_pending`. Named `private.record_checkout_session()` locks the attempt/quote/booking/hold, idempotently persists the provider session, moves booking `pending_payment -> payment_processing`, and moves quote `checkout_pending -> accepted`, returning `recorded|replayed`; it rejects a different session for the attempt. Provider failure uses named `private.compensate_checkout_failure()` to CAS-release the hold, cancel the pending booking, and return an unexpired quote `checkout_pending -> active`; expired/revoked quotes never reactivate. Same client idempotency key/hash resumes the same attempt; a different hash returns `IDEMPOTENCY_CONFLICT`.
4. Create hold-aware `public.get_live_departure_availability()` here, not earlier, as a sanitized `SECURITY DEFINER SET search_path=''` RPC owned under the global definer-owner rules; the owner's forced-RLS policy permits only the aggregate inputs. It returns `remaining_capacity=capacity-confirmed_party_size-active_unexpired_hold_party_size`, so payment-processing bookings count only through their hold and are never double-counted, and exposes no customer/hold identity columns. Tests cover anonymous RPC access, direct base denial, hostile search path, no negative/leaked counts, expiry boundaries, and remaining-capacity changes under holds.
5. Adapter tests require exact card-only Stripe input, server-calculated line amount/product name, success/cancel URL allowlist, metadata binding, and 30-minute Session expiry inside the 35-minute database hold. Tests also cover provider timeout recovery with the durable Stripe key, record-session failure/retry results, and webhook arrival before session recording; the webhook may attach the same session only after matching attempt metadata, amount, currency, and booking under lock. Two-session tests prove no oversell and one quote/payment attempt winner. Custom quotes consume no departure capacity.
6. Verify; commit `feat: add atomic booking holds and checkout idempotency`.

### Task 10: Stripe Test payment and webhook idempotency facts

**Files:** `supabase/migrations/20260823103000_payments_webhooks.sql`, `supabase/tests/database/payments_webhooks_test.sql`, `lib/infrastructure/supabase/payment-contracts.ts`, `tests/unit/infrastructure/payment-contracts.test.ts`.

**Contracts and projection:** use the exact shared `FinalizeStripeEventInput`, `FinalizeStripeEventResult`, and `CustomerPaymentStatus` schemas. `mapCustomerPaymentStatus(row:unknown): Result<CustomerPaymentStatus,DataAdapterError>` accepts only exact columns from `public.customer_payment_status_v`.

1. Create payments and append-only events with the separate Task 1 `PaymentStatus` and `WebhookEventStatus` vocabularies and unique provider event/session/payment-intent IDs. A duplicate event ID with a different payload hash rejects and audits; raw body/signature is never client-readable.
2. Edge verifies signature on raw bytes with timestamp tolerance before calling internal-only `private.finalize_stripe_event()`. For `checkout.session.completed`, the finalizer requires `livemode=false`, `mode=payment`, `status=complete`, provider `payment_status=paid`, expected account/endpoint binding, booking/attempt metadata, amount/currency, and active hold. If this valid webhook arrives before `record_checkout_session`, the finalizer atomically attaches the same metadata-bound session and applies the guarded chain `pending_payment -> payment_processing -> confirmed|payment_review` under the same locks; later `record_checkout_session()` returns `replayed` with the stored terminal/current states and never downgrades them.
3. A valid provider-paid event records payment status `paid`; if its hold is inactive/expired, the **booking** becomes `payment_review` instead of confirmed. A valid metadata/account-bound `checkout.session.expired` event releases an active hold and moves only `pending_payment|payment_processing -> expired`; it creates no paid fact and never downgrades `confirmed|payment_review`. An expired booking never auto-confirms. Only audited admin reconciliation may move a booking out of `payment_review`.
4. Direct client execute/DML is revoked; customer sees only `public.customer_payment_status_v` explicit columns.
5. Verify; commit `feat: add Stripe Test webhook payment facts`.

### Task 11: Guide assignments and sanitized guide projection

**Files:** `supabase/migrations/20260823104000_guide_assignments.sql`, `supabase/tests/database/guide_assignments_test.sql`, `lib/domain/data/guide-booking.ts`, `tests/unit/data/guide-booking.test.ts`.

**Contract:** `getGuideAssignedBookings(): Promise<Result<GuideAssignedBooking[],DataAdapterError>>` maps only the named sanitized table result from `public.get_guide_assigned_bookings()`; fields are booking/tour/departure IDs, localized tour title, start/end/meeting facts, party size, language, normalized structured mobility/dietary flags, and assignment status.

1. Create assignments with partial unique active assignment per booking. Reassignment applies `assigned|accepted -> closed` under a lock before insert. Enforce the exact assignment transitions; admin assigns/reassigns, assigned guide accepts/completes.
2. Do not use an invoker view that would require booking-table SELECT. `public.get_guide_assigned_bookings()` is a `SECURITY DEFINER SET search_path=''` RPC with explicit named return columns only; execute is granted to `authenticated`, but the function derives `auth.uid()`, verifies an active guide role/assignment, and returns only that guide's booking/tour/departure facts, party size, language, meeting facts, normalized structured requirements, and assignment status. No contact identity, payment, raw notes, special text, or `SELECT *`.
3. Guides/authenticated receive no base booking or assignment SELECT. Test direct base denial, RPC success, return-column enumeration, cross-guide isolation, hostile search path, non-guide execution, and invalid status writes.
4. Verify; commit `feat: add secure guide assignments`.

### Task 12: Content releases, build capability, and allowlisted audit events

**Files:** `supabase/migrations/20260823105000_content_audit.sql`, `supabase/tests/database/content_audit_test.sql`, `lib/infrastructure/supabase/content-contracts.ts`, `tests/unit/infrastructure/content-contracts.test.ts`.

**Contracts and projections:** `toContentDraft(input:ContentDraftWrite): Result<ContentDraftWrite,DataAdapterError>`; `mapAdminContentDraft(row:unknown): Result<AdminContentDraft,DataAdapterError>` from `public.admin_content_drafts_v`; `mapPublishedContent(row:unknown): Result<PublishedContent,DataAdapterError>` from `public.published_content_release_v`; `mapAdminAuditEvent(row:unknown): Result<AdminAuditEvent,DataAdapterError>` from `public.admin_audit_events_v`. Shapes include exact source URLs, verification date, and structured image attribution from the shared registry; all reject extra fields and public output omits draft/audit/build-capability facts.

1. Create mutable content drafts, immutable release-copy rows, SEO releases, short-lived release-specific build capabilities, and named projections over the unified append-only `private.audit_events` created in Task 2. Partial unique index permits one `publishing` release.
2. Build capability is bound to release ID, build ID, expiry, one-time nonce, and read scope; build receives no service role and cannot read arbitrary drafts. Publishing refuses missing EN/VI source URLs, verification date, or per-image URL/source/creator/license attribution. Finalization consumes the nonce and verifies release/build/artifact hash, source commit, and the immutable provenance completeness gate.
3. The named admin/public views expose only their exact adapter columns and only one immutable public release. Failed build leaves prior published release active.
4. The Task 2 audit schema uses its exhaustive event enum plus scalar actor/target/from/to/correlation fields and tightly allowlisted safe metadata keys. Reject headers, notes, email/contact, tokens, raw IP/device hashes, payment bodies, and arbitrary JSON. Only internal function/trigger writes; admin reads through `public.admin_audit_events_v`.
5. Add CSP/output-encoding requirements to the future browser task because sessionStorage guest tokens are XSS-readable: no unsafe HTML or untrusted third-party scripts.
6. Verify; commit `feat: add content releases and safe audit events`.

### Task 13: Complete RLS matrix, projections, and guarded grants

**Files:** `supabase/migrations/20260823110000_rls_rpc_security.sql`, `supabase/tests/database/rls_matrix_test.sql`, `docs/security/data-access-matrix.json`, generated `docs/security/data-access-matrix.md`, and static checker extensions.

1. JSON is the machine-readable source of truth for every table/view/RPC: owner name, `rolcanlogin`, `rolbypassrls`, bypass justification, API exposure, reader roles, writer operation, RLS/force-RLS decision, policy names, predicate indexes, grants, and internal credential type. Generate Markdown and fail on drift/missing objects.
2. Revoke `private` and base stateful access/default privileges. Anonymous gets named published views plus the sanitized live-availability RPC only; customer gets owner views/RPCs; guide gets only the sanitized assignment RPC; admin gets explicit operations. Pin API schemas and prove `service_role` is not RLS evidence.
3. Harden every definer/auth/internal trigger with its matrix-declared owner, `SET search_path=''`, qualification, statement timeout, no dynamic SQL, and intended execute grants. Public/customer/guide-callable definers must have `NOLOGIN NOBYPASSRLS` owners and may not be owned by `postgres` or `service_role`; every internal bypass is individually justified and tested. Explicitly test auth trigger under force-RLS choices.
4. pgTAP covers tenant/guide isolation, role escalation, projection columns/expansion, unauthorized internal RPCs, hostile search path/temp objects, append-only/state guards, and private/default privileges.
5. Add Edge boundary checklist to the matrix/runbook: CORS allowlist, request/body limits, Turnstile action+hostname fail-closed, secret storage, correlation redaction, and no secret in static bundle.
6. Verify; commit `feat: enforce data access and RPC security`.

### Task 14: Sourced product-data manifest and approval gate

**Files:** `data/sources/hcmc-places.v1.json`, `data/sources/hcmc-tours.v1.json`, `data/sources/source-hashes.v1.json`, `data/approvals/hcmc-catalog.v1.json`, `tests/unit/supabase/source-approval.test.ts`.

1. Research only primary/official current sources. Store sanitized HTTPS URLs without tracking/PII query parameters, retrieved/verified dates, attribution/license, coordinates, hours, price provenance, language/support confidence, and explicit unknowns. Seed generation performs no network fetch and accepts only allowlisted domains plus checked-in hashes.
2. Approval contains reviewer, UTC approval date, exact source hashes/counts, fixed UUIDv5 namespace, slug/order rules, and status `draft|approved`. Any fact/hash change invalidates approval.
3. Demo FX is explicitly stale-able; USD is disabled when stale and can never be presented as production data.
4. Commit researched draft separately with `data: add sourced HCMC product manifest`; do not publish/seed until approval is valid.

### Task 15: Deterministic seed generation — exactly 30 places and 8 tours

**Files:** `scripts/generate-supabase-seed.mjs`, `supabase/seed.sql`, `tests/unit/supabase/seed-shape.test.ts`; modify static scripts/package scripts.

1. Generator refuses published output unless approval status/hash/counts match, uses fixed UUIDv5 namespace, deterministic slugs/order, and produces idempotent SQL from the single source manifests.
2. Seed exactly 30 places/four areas, one catalog snapshot, one directed travel snapshot with no guessed edges, one clearly demo FX snapshot, 8 immutable tour versions, 16 future demo departures, and complete EN/VI public copy.
3. `pnpm db:static:seed` now requires seed/approval/source markers, top-level `BEGIN`/`COMMIT`, and exact counts; test windows, money, snapshot membership, bilingual/source completeness, tour positions, and stop membership.
4. Commit `seed: add approved HCMC catalog and fixed tours`.

### Task 16: Container-backed integration gate and generated database types

**Files:** generate `lib/infrastructure/supabase/database.types.ts`; create `scripts/write-generated-db-types.mjs`, `scripts/check-generated-db-types.mjs`, `scripts/test-db-concurrency.mjs`, `scripts/run-db-gate.mjs`, `docs/runbooks/local-supabase.md`; modify `package.json` and lockfile.

1. Install reviewed CLI `supabase@2.115.0` as an exact dev dependency only when a container runtime is available. Add PowerShell-safe package scripts using the project-local binary exactly: `db:start="supabase start"`, `db:reset="supabase db reset --local"`, `db:lint="supabase db lint --local --level error --fail-on error"`, `db:test="supabase test db --local"`, `db:types="node scripts/write-generated-db-types.mjs"`, `db:types:check="node scripts/check-generated-db-types.mjs"`, `db:concurrency="node scripts/test-db-concurrency.mjs"`, `db:stop="supabase stop --no-backup"`, and `db:verify="node scripts/run-db-gate.mjs"`.
2. Reset all migrations/seed, lint, run pgTAP, and generate types only by spawning the project-local `supabase gen types --lang typescript --local`; never hand-edit types. `write-generated-db-types.mjs` captures stdout, requires a successful exit and nonempty TypeScript, then atomically replaces `database.types.ts` cross-platform. The drift checker uses the same helper into a temp path and compares bytes. `run-db-gate.mjs` spawns the project-local commands in order `db:start -> db:reset -> db:lint -> db:test -> db:concurrency -> db:types:check` and always invokes `db:stop` in `finally`, preserving the first failing exit code while reporting cleanup failure separately.
3. Node 24 two-session harness tests CAS revision, guest claim, quota bucket creation/reservation idempotency, departure capacity, quote checkout compensation, and webhook event races.
4. RLS harness creates temporary anon/customer A/customer B/guide/admin users; queries use their JWTs and never service role for policy proof.
5. Completion commands:

```powershell
pnpm install --frozen-lockfile
pnpm db:static:seed
pnpm db:verify
pnpm peers check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
```

`pnpm peers check` is the pnpm 11 peer-dependency command used by this repository; it was executed successfully during planning (`No peer dependency issues found`). It is not a package script and must remain separate from `pnpm check`.

6. Whole-range security/correctness review; commit `test: verify LocalLens data foundation`.

## Environment-dependent completion policy

- Tasks 1–15 may be implemented and statically checked without Docker, but the milestone remains **implementation complete / DB verification pending**.
- Task 16 is mandatory before claiming RLS, SQL syntax, transaction locks, state guards, or concurrency are verified.
- Do not link/push a remote Supabase project, deploy Edge Functions, or use live Stripe/Gemini/Turnstile in this milestone.
- If Docker remains unavailable, stop after the static whole-range review and report the exact unverified integration gate rather than weakening or skipping it.

## Known approval gates

- Current factual source data for the 30 real places and 8 tour products.
- Exact sanitized guide booking fields.
- Edge-only HMAC pepper secret provisioning and rotation.
- Dedicated internal database credentials for guest, Stripe webhook, and build-release operations; never browser-callable.
- The future public domain and Supabase project configuration.
- Docker/container runtime for truthful local PostgreSQL/RLS/concurrency verification.
