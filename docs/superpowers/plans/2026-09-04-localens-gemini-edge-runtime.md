# LocalLens Gemini Edge Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy authenticated Supabase Edge Functions that build and persist authoritative itineraries, call Gemini safely, and fall back to the deterministic engine.

**Architecture:** Keep the existing itinerary engine authoritative. The Edge adapter verifies the user, reads the latest published snapshot bundle through narrow projections, consumes database quota, calls Gemini with an allowlisted structured payload, validates the response, and persists the resulting revision through guarded RPCs. Recommendation and refinement use separate entrypoints but share the provider, database adapter, environment parser, and gateway.

**Tech Stack:** TypeScript 6, Vitest 4, Supabase Edge Runtime/Deno, `@supabase/supabase-js` 2.112.3, Zod 4.4.3, PostgreSQL 17, pgTAP, Gemini REST API

**Spec:** `docs/superpowers/specs/2026-09-04-localens-public-thesis-demo-design.md`

## Global Constraints

- Use the stable exact model name `gemini-3.6-flash`; never use a `latest` alias.
- `GEMINI_API_KEY`, service-role credentials, quota HMAC material, prompts, and raw provider responses never enter browser code, logs, database rows, or committed files.
- AI receives internal allowlisted IDs and structured constraints only; it never receives `specialNeeds`, email, phone, auth IDs, payment data, or raw refinement feedback.
- The existing engine remains authoritative for scheduling, time, money, opening hours, validation, and deterministic fallback.
- Provider timeout, 429, 5xx, malformed JSON, invalid IDs, and disabled AI all return a valid deterministic proposal when the engine can produce one.
- Runtime cloud recommendation and refinement require an authenticated customer; public self-signup and guest AI are not enabled in this release.
- Every mutation remains idempotent or compare-and-swap protected at PostgreSQL level.
- Do not modify or stage unrelated dirty-worktree files.

---

## File structure

- `supabase/functions/_shared/refinement-signals.ts`: converts bounded bilingual feedback into a small non-sensitive enum object.
- `supabase/functions/_shared/gemini-ranker.ts`: builds the exact Gemini request, performs the bounded fetch, and parses JSON without trusting it.
- `supabase/functions/_shared/edge-env.ts`: parses required Edge secrets/configuration with fail-closed defaults.
- `supabase/functions/_shared/supabase-itinerary-adapter.ts`: verifies JWTs, loads canonical snapshots, reserves quota, and persists revisions.
- `supabase/functions/recommend-itinerary/index.ts`: deployable recommendation entrypoint.
- `supabase/functions/refine-itinerary/index.ts`: deployable refinement entrypoint.
- `supabase/functions/recommend-itinerary/deno.json` and `supabase/functions/refine-itinerary/deno.json`: function-local pinned Deno dependency maps.
- `supabase/migrations/20260904120000_authenticated_ai_runtime.sql`: current-snapshot projections and guarded authenticated/service-role RPCs.
- `supabase/tests/database/authenticated_ai_runtime_test.sql`: pgTAP coverage for grants, ownership, creation, quota, and cross-user denial.
- `tests/unit/supabase/*.test.ts`: handler, provider, environment, and adapter tests runnable by the existing Vitest gate.

### Task 1: Make the handler contract authenticated and privacy-safe

**Files:**
- Create: `supabase/functions/_shared/refinement-signals.ts`
- Create: `tests/unit/supabase/refinement-signals.test.ts`
- Modify: `supabase/functions/_shared/recommend-itinerary.ts`
- Modify: `supabase/functions/_shared/refine-itinerary.ts`
- Modify: `tests/unit/supabase/recommend-itinerary-handler.test.ts`
- Modify: `tests/unit/supabase/refine-itinerary-handler.test.ts`

**Interfaces:**
- Produces: `RefinementSignals`, `normalizeRefinementSignals(feedback: string): RefinementSignals`.
- Produces: `RecommendItineraryHandlerOptions.requireAuthenticated: boolean`.
- Produces: `RecommendItineraryAdapter.commitRecommendation(...) => Promise<RecommendationCommit>`.
- Produces: `RecommendItineraryResponse.planId` and `RecommendItineraryResponse.revision`.
- Changes: `RecommendationAdapterContext.turnstileToken` from `string` to `string | null`.
- Changes: `RefinementRankRequest` replaces `feedback: string` with `signals: RefinementSignals`.

- [ ] **Step 1: Write failing recommendation authentication and persistence tests**

Add focused cases using the existing request/service helpers:

```ts
it("requires a verified customer before snapshot resolution", async () => {
  const handler = createRecommendItineraryHandler(service(), {
    policy,
    requireAuthenticated: true,
  });
  const response = await handler(makeRequest(validBody, {}));
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
});

it("persists the validated proposal and returns its plan binding", async () => {
  const adapter = service({
    commitRecommendation: vi.fn(async () => ({
      ok: true as const,
      planId: "11111111-1111-4111-8111-111111111111",
      revision: 1,
    })),
  });
  const response = await createRecommendItineraryHandler(adapter, {
    policy,
    requireAuthenticated: true,
  })(makeRequest(validBody, { Authorization: "Bearer valid-token" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ revision: 1 });
  expect(adapter.commitRecommendation).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused recommendation tests and verify RED**

Run: `pnpm test:run -- tests/unit/supabase/recommend-itinerary-handler.test.ts`

Expected: FAIL because `requireAuthenticated`, `commitRecommendation`, `planId`, and `revision` are absent.

- [ ] **Step 3: Add failing refinement privacy tests**

```ts
it("passes structured refinement signals without raw feedback", async () => {
  const ranker = vi.fn(async (request: RefinementRankRequest) => validRankResponse);
  const adapter = service({
    prepareRefinement: vi.fn(async () => ({
      ...validPreparation,
      normalizedDelta: { feedback: "Đi chậm hơn và bỏ đồ ăn", scope: "partial" },
      ranker,
    })),
  });
  await handlerFor(adapter)(ownerRequest());
  expect(ranker).toHaveBeenCalledWith(expect.objectContaining({
    signals: { pace: "slower", food: "remove", preferTypes: [], avoidTypes: [] },
  }), expect.any(AbortSignal));
  expect(ranker.mock.calls[0]?.[0]).not.toHaveProperty("feedback");
});
```

- [ ] **Step 4: Run the focused refinement tests and verify RED**

Run: `pnpm test:run -- tests/unit/supabase/refine-itinerary-handler.test.ts tests/unit/supabase/refinement-signals.test.ts`

Expected: FAIL because the signal normalizer and privacy-safe rank request do not exist.

- [ ] **Step 5: Implement the bounded signal normalizer**

Use this exact public shape and deterministic bilingual matching:

```ts
import type { ExperienceType } from "@/lib/domain/itinerary/contracts";

export interface RefinementSignals {
  readonly pace: "keep" | "slower" | "faster";
  readonly food: "keep" | "more" | "remove";
  readonly preferTypes: readonly ExperienceType[];
  readonly avoidTypes: readonly ExperienceType[];
}

export function normalizeRefinementSignals(feedback: string): RefinementSignals {
  const value = feedback.normalize("NFKC").toLocaleLowerCase("vi-VN");
  const has = (...terms: string[]) => terms.some((term) => value.includes(term));
  return {
    pace: has("chậm", "thư giãn", "slower", "relaxed")
      ? "slower"
      : has("nhanh", "faster", "active") ? "faster" : "keep",
    food: has("bỏ đồ ăn", "không ăn", "remove food", "without food")
      ? "remove"
      : has("thêm đồ ăn", "ẩm thực", "more food", "street food") ? "more" : "keep",
    preferTypes: has("lịch sử", "history") ? ["history"]
      : has("làng nghề", "craft") ? ["traditional_craft"]
      : has("chợ", "market") ? ["traditional_market"] : [],
    avoidTypes: [],
  };
}
```

Keep the persisted feedback unchanged for the owner-visible revision record, but pass only `signals`, `scope`, and locked place IDs to the provider ranker.

- [ ] **Step 6: Implement authenticated recommendation commit sequencing**

Require a principal before `resolveEngineInput` when `requireAuthenticated` is true. Invoke `commitRecommendation` only after `recommendItinerary` succeeds and after `itineraryResultSchema` validation. Map commit failures to existing safe error envelopes; reject revision numbers other than `1` for a new plan.

```ts
export type RecommendationCommit =
  | { ok: true; planId: string; revision: 1 }
  | { ok: false; error: RecommendationAdapterFailure };
```

The response must contain exactly `advisoryOnly`, `degraded`, optional `messageKey`, `planId`, `revision`, `proposal`, and `rationales`.

- [ ] **Step 7: Run both handler suites and the type checker**

Run: `pnpm test:run -- tests/unit/supabase/recommend-itinerary-handler.test.ts tests/unit/supabase/refine-itinerary-handler.test.ts tests/unit/supabase/refinement-signals.test.ts`

Run: `pnpm typecheck`

Expected: all selected tests PASS and TypeScript exits 0.

- [ ] **Step 8: Commit the contract boundary**

```powershell
git add -- supabase/functions/_shared/refinement-signals.ts supabase/functions/_shared/recommend-itinerary.ts supabase/functions/_shared/refine-itinerary.ts tests/unit/supabase/refinement-signals.test.ts tests/unit/supabase/recommend-itinerary-handler.test.ts tests/unit/supabase/refine-itinerary-handler.test.ts
git commit -m "feat: require authenticated itinerary persistence"
```

### Task 2: Implement the Gemini structured-output ranker

**Files:**
- Create: `supabase/functions/_shared/gemini-ranker.ts`
- Create: `tests/unit/supabase/gemini-ranker.test.ts`

**Interfaces:**
- Consumes: `RankRequest`, `RankResponse`, `Ranker`, `RefinementRankRequest`.
- Produces: `GEMINI_MODEL = "gemini-3.6-flash"`.
- Produces: `createGeminiRanker(config: GeminiRankerConfig): Ranker`.

- [ ] **Step 1: Write provider request and privacy tests**

```ts
it("calls the pinned model with JSON schema and only allowlisted fields", async () => {
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) =>
    new Response(JSON.stringify(geminiEnvelope(validRankResponse)), { status: 200 }),
  );
  const rank = createGeminiRanker({ apiKey: "test-key", fetchImpl });
  await rank(validRankRequest, new AbortController().signal);
  const [url, init] = fetchImpl.mock.calls[0]!;
  expect(url).toContain("/models/gemini-3.6-flash:generateContent");
  expect(init.headers).toMatchObject({ "x-goog-api-key": "test-key" });
  const serialized = String(init.body);
  expect(serialized).not.toContain("test-key");
  expect(serialized).not.toContain("specialNeeds");
  expect(serialized).not.toContain("feedback");
  expect(serialized).toContain("responseJsonSchema");
});
```

Add cases for 401/429/500, empty candidates, missing parts, multiple text parts, response larger than 64 KiB, invalid JSON, aborted fetch, and an attempted model value ending in `-latest`.

- [ ] **Step 2: Run the provider suite and verify RED**

Run: `pnpm test:run -- tests/unit/supabase/gemini-ranker.test.ts`

Expected: FAIL because `gemini-ranker.ts` does not exist.

- [ ] **Step 3: Implement the exact provider configuration and request**

```ts
export const GEMINI_MODEL = "gemini-3.6-flash" as const;

export interface GeminiRankerConfig {
  readonly apiKey: string;
  readonly model?: typeof GEMINI_MODEL;
  readonly fetchImpl?: typeof fetch;
  readonly endpointBase?: "https://generativelanguage.googleapis.com/v1beta";
}
```

POST to `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent` with `x-goog-api-key`, `Content-Type: application/json`, `temperature: 0.1`, `maxOutputTokens: 2048`, `responseMimeType: application/json`, and a `responseJsonSchema` whose only top-level keys are `orderedIds`, `rationales`, and `foodSelections`.

The text prompt must state that IDs may only be copied from the supplied arrays, rationales are at most 240 Unicode code points, prices and schedules must not be invented, and the answer must contain JSON only.

- [ ] **Step 4: Implement bounded response extraction**

Read `response.text()` once, reject more than `65_536` UTF-8 bytes, parse the Gemini envelope, require exactly one candidate and one text part, then `JSON.parse` that text. Return the unknown object as `RankResponse`; the existing `validateRankResponse` remains the semantic trust boundary. Throw a provider error for every non-2xx or malformed envelope so `recommendItinerary` activates fallback.

- [ ] **Step 5: Run provider and engine fallback tests**

Run: `pnpm test:run -- tests/unit/supabase/gemini-ranker.test.ts tests/unit/itinerary/recommend.test.ts`

Expected: both suites PASS; provider failures still produce `rankingSource: "deterministic"` through the engine suite.

- [ ] **Step 6: Commit the provider adapter**

```powershell
git add -- supabase/functions/_shared/gemini-ranker.ts tests/unit/supabase/gemini-ranker.test.ts
git commit -m "feat: add bounded Gemini itinerary ranker"
```

### Task 3: Add narrow database projections and authenticated persistence RPCs

**Files:**
- Create: `supabase/migrations/20260904120000_authenticated_ai_runtime.sql`
- Create: `supabase/tests/database/authenticated_ai_runtime_test.sql`
- Modify: `tests/unit/supabase/artifacts.test.ts`
- Modify: `tests/unit/supabase/rls-matrix.test.ts`

**Interfaces:**
- Produces: `public.current_itinerary_snapshot_v`.
- Produces: `public.catalog_snapshot_areas_v` and `public.catalog_snapshot_place_display_v`.
- Produces: `public.create_authenticated_trip_plan(p_plan_id uuid, persistence_dto jsonb)`.
- Produces: `public.reserve_ai_quota(p_reservation_id uuid, p_kind text, p_ip_hash text, p_device_hash text)` restricted to `service_role`.

- [ ] **Step 1: Write pgTAP assertions for least privilege**

Assert all three views exist, only published/current rows are exposed, anon can read area/display metadata, authenticated can read them, and no API role can mutate them. Assert `create_authenticated_trip_plan(uuid,jsonb)` is executable only by `authenticated`; assert `reserve_ai_quota(uuid,text,text,text)` is executable only by `service_role` and not by `anon` or `authenticated`.

```sql
SELECT has_function_privilege('authenticated', 'public.create_authenticated_trip_plan(uuid,jsonb)', 'EXECUTE');
SELECT has_function_privilege('service_role', 'public.reserve_ai_quota(uuid,text,text,text)', 'EXECUTE');
SELECT is(has_function_privilege('authenticated', 'public.reserve_ai_quota(uuid,text,text,text)', 'EXECUTE'), false);
```

- [ ] **Step 2: Run the database test and verify RED**

Run: `pnpm db:start`

Run: `pnpm db:reset`

Run: `pnpm exec supabase test db --local supabase/tests/database/authenticated_ai_runtime_test.sql`

Expected: FAIL because the migration objects do not exist.

- [ ] **Step 3: Implement current published-snapshot projections**

`current_itinerary_snapshot_v` must return one deterministic row: latest published travel snapshot joined to its published catalog snapshot, ordered by `travel.published_at DESC, travel.id DESC`; include the latest non-stale production FX row when available. `catalog_snapshot_areas_v` exposes only `snapshot_id`, `area_id`, and `slug`. `catalog_snapshot_place_display_v` exposes only `snapshot_id`, `place_id`, `locale`, `title`, and `summary` for published snapshots.

Create all views as `security_barrier = true`, owned by the existing narrow catalog projection owner, and revoke DML from API roles.

- [ ] **Step 4: Implement authenticated initial-plan creation**

The function derives `request.jwt.claim.sub`, verifies the `customer` role, and takes a server-generated `p_plan_id` so the fingerprint can bind that ID before persistence. Serialize concurrent/replayed calls with `pg_advisory_xact_lock(hashtextextended(p_plan_id::text, 0))`. A first call inserts `public.trip_plans(id, owner_user_id)` and delegates revision validation/insertion to `private.persist_trip_plan_revision(..., actor_user_id, NULL, NULL, NULL)`. A replay returns revision 1 only when owner and fingerprint match; otherwise it raises a conflict. On any failure the transaction rolls back, so no empty plan remains.

```sql
REVOKE ALL ON FUNCTION public.create_authenticated_trip_plan(uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_authenticated_trip_plan(uuid,jsonb)
  TO authenticated;
```

- [ ] **Step 5: Implement the service-role quota wrapper**

The wrapper validates `p_kind IN ('planner','gemini')`, delegates only to `private.reserve_quota`, returns the immutable receipt, and owns no table privileges beyond that helper. Revoke from all roles before granting `EXECUTE` only to `service_role`.

- [ ] **Step 6: Add success, replay, quota exhaustion, role, and rollback pgTAP cases**

Use `set_config('request.jwt.claim.sub', customer_id::text, true)` for owner creation. Verify another authenticated customer cannot read the plan. Reuse a reservation UUID to prove replay does not increment counters. Force the sixth Gemini reservation for one bucket to raise `P0001`. Submit a malformed persistence DTO and prove the plan count is unchanged.

- [ ] **Step 7: Run database, static artifact, and concurrency gates**

Run: `pnpm db:test`

Run: `pnpm db:static`

Run: `pnpm db:concurrency`

Expected: all pgTAP files, artifact tests, and concurrency scenarios PASS.

- [ ] **Step 8: Regenerate and verify database types**

Run: `pnpm db:types`

Run: `pnpm db:types:check`

Expected: generated types include the three views and two RPCs; drift check exits 0.

- [ ] **Step 9: Commit the database boundary**

```powershell
git add -- supabase/migrations/20260904120000_authenticated_ai_runtime.sql supabase/tests/database/authenticated_ai_runtime_test.sql tests/unit/supabase/artifacts.test.ts tests/unit/supabase/rls-matrix.test.ts lib/infrastructure/supabase/database.types.ts
git commit -m "feat: add authenticated itinerary runtime RPCs"
```

### Task 4: Implement the Supabase itinerary adapter

**Files:**
- Create: `supabase/functions/_shared/supabase-itinerary-adapter.ts`
- Create: `tests/unit/supabase/supabase-itinerary-adapter.test.ts`
- Modify: `supabase/functions/_shared/gateway.ts`
- Modify: `tests/unit/supabase/edge-gateway.test.ts`
- Modify: `lib/infrastructure/supabase/catalog-adapter.ts` only if a projection mapper needs an exported row type.
- Modify: `lib/infrastructure/supabase/travel-fx-adapter.ts` only if a projection mapper needs an exported row type.

**Interfaces:**
- Consumes: `mapCatalogSnapshot`, `mapTravelSnapshot`, `mapFxSnapshot`, `toPlanRevisionInsert`, `fingerprintRevisionBinding`, `createGeminiRanker`.
- Produces: `createSupabaseRecommendAdapter(config, request): RecommendItineraryAdapter`.
- Produces: `createSupabaseRefineAdapter(config, request): RefineItineraryAdapter`.

- [ ] **Step 1: Write failing adapter query and persistence tests**

Use a narrow fake client that records `.from(...).select(...).eq(...).order(...)` and `.rpc(...)`. Cover:

- JWT verification uses `auth.getUser(token)` and never returns the raw token.
- missing/non-customer principal returns `AUTH_REQUIRED` or `AUTH_INVALID` before snapshot reads;
- exactly one current snapshot bundle is accepted;
- catalog, food, travel, and FX rows are mapped through existing strict mappers;
- area UUIDs in the request belong to the current snapshot;
- CORS preflight allows the bounded `x-localens-device-id` request header;
- planner quota failure returns `QUOTA_EXCEEDED`;
- Gemini quota failure throws only inside the ranker, producing deterministic fallback;
- persistence generates the plan UUID before fingerprinting, then uses `toPlanRevisionInsert` and `create_authenticated_trip_plan` for revision 1;
- refinement loads the owner-visible latest revision and commits with `advance_trip_plan_revision` CAS.

- [ ] **Step 2: Run the adapter suite and verify RED**

Run: `pnpm test:run -- tests/unit/supabase/supabase-itinerary-adapter.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement request-derived quota hashing**

Read the leftmost normalized address from `x-forwarded-for`; read a bounded opaque `x-localens-device-id`; HMAC each with `LOCALLENS_QUOTA_HMAC_KEY` using Web Crypto SHA-256. Never log the input or digest. Reject a missing/invalid device ID before any provider call.

```ts
async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
```

Add `x-localens-device-id` to the gateway's fixed lowercase CORS header allowlist and update the exact preflight assertion in `edge-gateway.test.ts`. Do not reflect arbitrary requested headers.

- [ ] **Step 4: Load and parse one authoritative engine input**

Query `current_itinerary_snapshot_v` first. Filter every subsequent projection by its returned IDs. Use `mapCatalogSnapshot(placeRows, { vendors, items })`, `mapTravelSnapshot(travelRows)`, and `mapFxSnapshot(fxRow)`; construct `{ environment: "production", request, catalog, travel, fx }` and pass it through `parseEngineInput` before returning it to the handler.

- [ ] **Step 5: Bind quota and Gemini to the adapter**

Reserve `planner` quota during `resolveEngineInput`. Wrap `createGeminiRanker` so it reserves `gemini` quota immediately before the provider call. A planner quota rejection maps to HTTP 429; a Gemini reservation/provider rejection throws from `ranker` and therefore degrades through the existing engine.

- [ ] **Step 6: Persist recommendation and refinement revisions**

For a new recommendation, generate `planId = crypto.randomUUID()`, compute `fingerprintRevisionBinding(planId, 1, input, result, sha256)`, call `toPlanRevisionInsert(input, result, fingerprint, 1)`, and pass `planId` plus the DTO to `create_authenticated_trip_plan`. Implement `sha256` with `crypto.subtle.digest("SHA-256", bytes)` and return a `Uint8Array`. For refinement, load the current owner projection, reconstruct and validate `PreviousRevisionContext`, compute revision `baseRevision + 1`, fingerprint with that exact plan/revision, and call `advance_trip_plan_revision(planId, baseRevision, dto)`. Map PostgreSQL CAS errors to `STALE_REVISION` without exposing SQL text.

- [ ] **Step 7: Run adapter, handler, mapper, and fingerprint suites**

Run: `pnpm test:run -- tests/unit/supabase/supabase-itinerary-adapter.test.ts tests/unit/supabase/recommend-itinerary-handler.test.ts tests/unit/supabase/refine-itinerary-handler.test.ts tests/unit/supabase/edge-gateway.test.ts tests/unit/infrastructure/catalog-adapter.test.ts tests/unit/infrastructure/travel-fx-adapter.test.ts tests/unit/infrastructure/plan-revision-adapter.test.ts tests/unit/itinerary/fingerprint.test.ts`

Expected: all selected suites PASS.

- [ ] **Step 8: Commit the Supabase adapter**

```powershell
git add -- supabase/functions/_shared/supabase-itinerary-adapter.ts tests/unit/supabase/supabase-itinerary-adapter.test.ts supabase/functions/_shared/gateway.ts tests/unit/supabase/edge-gateway.test.ts lib/infrastructure/supabase/catalog-adapter.ts lib/infrastructure/supabase/travel-fx-adapter.ts
git commit -m "feat: bind itinerary engine to Supabase runtime"
```

### Task 5: Add fail-closed Edge environment configuration

**Files:**
- Create: `supabase/functions/_shared/edge-env.ts`
- Create: `tests/unit/supabase/edge-env.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `parseItineraryEdgeEnv(source): ItineraryEdgeEnv`.

- [ ] **Step 1: Write failing environment tests**

```ts
expect(parseItineraryEdgeEnv(validSource)).toMatchObject({
  geminiEnabled: true,
  geminiModel: "gemini-3.6-flash",
  allowedOrigins: ["https://localens.vercel.app"],
});
expect(() => parseItineraryEdgeEnv({ ...validSource, GEMINI_MODEL: "gemini-flash-latest" })).toThrow();
expect(() => parseItineraryEdgeEnv({ ...validSource, ALLOWED_ORIGINS: "*" })).toThrow();
expect(() => parseItineraryEdgeEnv({ ...validSource, GEMINI_API_KEY: undefined })).toThrow();
```

- [ ] **Step 2: Run the environment suite and verify RED**

Run: `pnpm test:run -- tests/unit/supabase/edge-env.test.ts`

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement exact secret/config parsing**

Require `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LOCALLENS_QUOTA_HMAC_KEY`, and an HTTPS comma-separated `ALLOWED_ORIGINS`. Accept `LOCALLENS_GEMINI_ENABLED` only as `"0"` or `"1"`; when it is `"1"`, require `GEMINI_API_KEY`. Accept `GEMINI_MODEL` only when absent or exactly `gemini-3.6-flash`.

- [ ] **Step 4: Document server-only variables without values**

Add names and comments to `.env.example`; do not add realistic secrets. Keep every secret without the `NEXT_PUBLIC_` prefix.

- [ ] **Step 5: Run environment tests and secret scans**

Run: `pnpm test:run -- tests/unit/supabase/edge-env.test.ts tests/unit/env/public.test.ts`

Run: `rg -n "GEMINI_API_KEY=.*[^_]$|SUPABASE_SERVICE_ROLE_KEY=.*[^_]$|LOCALLENS_QUOTA_HMAC_KEY=.*[^_]$" . --glob '!node_modules/**' --glob '!.git/**'`

Expected: tests PASS; the scan returns no committed secret value.

- [ ] **Step 6: Commit environment handling**

```powershell
git add -- supabase/functions/_shared/edge-env.ts tests/unit/supabase/edge-env.test.ts .env.example
git commit -m "feat: validate itinerary Edge configuration"
```

### Task 6: Create deployable Edge Function entrypoints

**Files:**
- Create: `supabase/functions/recommend-itinerary/index.ts`
- Create: `supabase/functions/recommend-itinerary/deno.json`
- Create: `supabase/functions/refine-itinerary/index.ts`
- Create: `supabase/functions/refine-itinerary/deno.json`
- Modify: `supabase/config.toml`
- Modify: `tests/unit/supabase/artifacts.test.ts`

**Interfaces:**
- Consumes: environment parser, gateway policy, Supabase adapters, recommendation/refinement handlers.
- Produces: authenticated HTTP functions at `/functions/v1/recommend-itinerary` and `/functions/v1/refine-itinerary`.

- [ ] **Step 1: Write failing artifact tests**

Assert both entrypoints exist, both call `Deno.serve`, both instantiate an adapter per request, both set `requireAuthenticated: true` where applicable, both function configs use `verify_jwt = true`, and each function-local `deno.json` pins `@supabase/supabase-js` to `2.112.3` and `zod` to `4.4.3`.

- [ ] **Step 2: Run artifact tests and verify RED**

Run: `pnpm test:run -- tests/unit/supabase/artifacts.test.ts`

Expected: FAIL because the deployable function directories are absent.

- [ ] **Step 3: Add function-local dependency maps**

Each `deno.json` must contain:

```json
{
  "imports": {
    "@/": "../../../",
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2.112.3",
    "zod": "npm:zod@4.4.3"
  }
}
```

- [ ] **Step 4: Implement per-request entrypoint composition**

```ts
Deno.serve(async (request: Request) => {
  const env = parseItineraryEdgeEnv(Deno.env.toObject());
  const adapter = await createSupabaseRecommendAdapter(env, request);
  return createRecommendItineraryHandler(adapter, {
    policy: { allowedOrigins: env.allowedOrigins, allowedMethods: ["POST", "OPTIONS"] },
    requireAuthenticated: true,
  })(request);
});
```

Use equivalent composition for refinement. Catch only startup/configuration errors at the outermost boundary and return the existing redacted gateway envelope with a correlation ID; never include thrown messages.

- [ ] **Step 5: Configure Supabase JWT verification**

Add:

```toml
[functions.recommend-itinerary]
verify_jwt = true

[functions.refine-itinerary]
verify_jwt = true
```

- [ ] **Step 6: Run static and TypeScript gates**

Run: `pnpm test:run -- tests/unit/supabase/artifacts.test.ts tests/unit/supabase/edge-env.test.ts`

Run: `pnpm typecheck`

Run: `pnpm db:static`

Expected: all commands exit 0.

- [ ] **Step 7: Serve and smoke-test functions locally**

Run in one terminal: `pnpm exec supabase functions serve recommend-itinerary --env-file supabase/.env.local`

Invoke without a JWT and verify HTTP 401. Invoke with the seeded customer JWT and a valid canonical request and verify HTTP 200 with `planId`, `revision: 1`, and either `rankingSource: "ai"` or deterministic fallback. Repeat for refinement and verify revision 2.

- [ ] **Step 8: Commit deployable functions**

```powershell
git add -- supabase/functions/recommend-itinerary supabase/functions/refine-itinerary supabase/config.toml tests/unit/supabase/artifacts.test.ts
git commit -m "feat: add deployable itinerary Edge functions"
```

### Task 7: Run the complete local AI runtime gate

**Files:**
- Create: `scripts/run-runtime-itinerary-e2e.mjs`
- Create: `tests/e2e/runtime-itinerary.spec.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/acceptance/ai-runtime-local.md`

**Interfaces:**
- Produces: `pnpm test:e2e:runtime-itinerary`.
- Produces: local evidence labeled `runtime-verified-local@<SHA>` only after every listed gate passes on that SHA.

- [ ] **Step 1: Write an E2E test for authenticated recommendation and refinement**

Cover customer login, valid recommendation persistence, page reload retaining revision 1, partial refinement to revision 2, cross-customer read denial, Gemini-mock success, Gemini-mock malformed output fallback, and quota exhaustion. Use a local fake Gemini HTTP endpoint; never require a real key in CI.

- [ ] **Step 2: Add the bounded runner**

The runner must start Supabase if needed, reset and seed it, start the fake provider, serve both Edge Functions with test-only environment variables, start Next.js in Supabase mode, run the dedicated Playwright file, redact failure artifacts, and stop only processes it created.

- [ ] **Step 3: Verify the new runner fails before final wiring**

Run: `pnpm test:e2e:runtime-itinerary`

Expected: FAIL at the first missing orchestration hook before the runner is completed.

- [ ] **Step 4: Complete runner wiring and package/CI scripts**

Add `"test:e2e:runtime-itinerary": "node scripts/run-runtime-itinerary-e2e.mjs"`. Add a `runtime-local` CI step after auth and before fixed-tour tests, writing output only to `ci-logs/runtime-itinerary.log`.

- [ ] **Step 5: Run the complete verification sequence**

Run: `pnpm lint`

Run: `pnpm typecheck`

Run: `pnpm test:run -- --no-file-parallelism --testTimeout=30000`

Run: `pnpm db:verify`

Run: `pnpm test:e2e:runtime-itinerary`

Run: `pnpm build:demo`

Run: `pnpm build:supabase`

Expected: every command exits 0. Record exact test counts, timestamps, tool versions, and `git rev-parse HEAD` in `docs/acceptance/ai-runtime-local.md`.

- [ ] **Step 6: Commit runtime acceptance**

```powershell
git add -- scripts/run-runtime-itinerary-e2e.mjs tests/e2e/runtime-itinerary.spec.ts package.json .github/workflows/ci.yml docs/acceptance/ai-runtime-local.md
git commit -m "test: verify local AI itinerary runtime"
```

## Plan completion gate

This plan is complete only when both deployable Edge Functions exist, local Supabase serves them with JWT verification, the fake-provider runtime E2E covers AI success and deterministic fallback, all database gates pass, and the acceptance record names the exact verified product SHA. No cloud deployment claim is made by this plan.
