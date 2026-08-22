# LocalLens Deterministic Itinerary Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` task-by-task, with a fresh implementer and independent reviewer for every task.

**Goal:** Build the pure deterministic itinerary engine that remains authoritative when AI is unavailable and can later be called by Supabase Edge Functions.

**Architecture:** Pure TypeScript under `lib/domain/itinerary` has no browser, Next.js, Supabase, Deno, network, environment, wall-clock, UUID, or mutable global dependency. Every snapshot and evaluation time is an explicit input. AI is a narrow candidate-ranking port; deterministic code always owns hard constraints, timeline construction, validation, repair, and fingerprint material.

**Tech stack:** Existing TypeScript 6, Zod 4, Vitest 4, Node 24 runtime, Web Crypto-compatible injected hasher; no new package.

**Spec:** `docs/superpowers/specs/2026-08-22-localens-mvp-design.md`

## Exact domain contracts

Implement these semantic shapes in Task 1. Zod schemas are `.strict()` at every external-object boundary. Branded aliases are allowed, but field names and meanings are fixed.

```ts
type Locale = "en" | "vi";
type Result<T, E = DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
type ExperienceType =
  | "street_food"
  | "history"
  | "traditional_craft"
  | "traditional_market";
type SupportStatus = "supported" | "unsupported" | "unknown";
type Pace = "relaxed" | "balanced" | "active";
type Currency = "VND" | "USD";

type PriorityWeights = Record<ExperienceType, 0 | 1 | 2 | 3 | 4 | 5>;

interface ItineraryRequest {
  startAt: string; // ISO 8601 with Z or explicit ±HH:MM
  durationMinutes: number; // integer 60..720
  areas: string[]; // unique published area IDs, 1..12
  budget: { currency: Currency; amountMinor: number }; // VND or USD cents
  partySize: number; // integer 1..20
  guideLanguage: "en" | "vi";
  priorityWeights: PriorityWeights;
  pace: Pace;
  dietaryRequirements: string[]; // unique catalog support keys, max 12
  mobilityRequirements: string[]; // unique catalog support keys, max 12
  lockedStopIds: string[]; // unique, relative order is authoritative, max 8
}

interface OpeningWindow {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  opensAt: string; // HH:mm
  closesAt: string; // HH:mm; < opensAt means overnight; equality is invalid
}
interface OpeningException {
  localDate: string; // YYYY-MM-DD
  closed: boolean;
  windows: Array<{ opensAt: string; closesAt: string }>;
}
interface OpeningInterval {
  startEpochMinute: number; // inclusive
  endEpochMinute: number; // inclusive finish boundary; start < end
  sourceWindowKey: string;
}
interface PlaceCandidate {
  id: string;
  areaId: string;
  types: ExperienceType[];
  priceVndPerPerson: number;
  visitDurationMinutes: number; // integer 15..480
  guideLanguages: Array<"en" | "vi">;
  dietarySupport: Record<string, SupportStatus>;
  mobilitySupport: Record<string, SupportStatus>;
  openingHours: OpeningWindow[]; // max 28
  openingExceptions: OpeningException[]; // unique dates, max 366; max 8 windows/date
}
interface CatalogSnapshot {
  id: string;
  places: PlaceCandidate[]; // unique IDs, max 5000
}

interface TravelEdge {
  fromPlaceId: string;
  toPlaceId: string;
  mode: "walk" | "taxi" | "public_transport";
  minutes: number; // integer 1..240
  groupCostVnd: number;
  verifiedAt: string; // ISO offset
}
interface TravelSnapshot { id: string; edges: TravelEdge[]; }

interface FxSnapshot {
  id: string;
  vndPerUsd: string; // positive decimal, max 8 fraction digits
  observedAtUtc: string; // canonical ISO Z
}

interface EngineInput {
  request: ItineraryRequest;
  catalog: CatalogSnapshot;
  travel: TravelSnapshot;
  fx?: FxSnapshot;
  asOfUtc: string; // injected canonical ISO Z; no implicit clock
}

interface ItineraryItem {
  placeId: string;
  startAt: string; // canonical +07:00
  endAt: string; // canonical +07:00
  visitDurationMinutes: number;
  travelMinutesBefore: number;
  transitionBufferMinutesBefore: 0 | 10;
  travelCostVndBefore: number;
  placeCostVnd: number;
  score: number;
}
interface ItineraryTotals {
  durationMinutes: number; // final end minus normalized request start
  visitMinutes: number;
  travelMinutes: number;
  transitionBufferMinutes: number;
  groupCostVnd: number;
  score: number;
}
interface ItineraryResult {
  normalizedStartAt: string;
  budgetVnd: number;
  rankingSource: "ai" | "deterministic";
  items: ItineraryItem[];
  totals: ItineraryTotals;
  snapshotIds: { catalog: string; travel: string; fx: string | null };
}

type DomainErrorCode =
  | "INVALID_ITINERARY_INPUT"
  | "USD_DISABLED"
  | "NO_FEASIBLE_ITINERARY"
  | "ITINERARY_SEARCH_LIMIT"
  | "INVALID_ITINERARY_RESULT";
interface DomainError {
  code: DomainErrorCode;
  messageKey: string;
  retryable: boolean;
  issueKeys?: string[];
}
```

Pure domain errors intentionally omit `correlationId`; the future Edge adapter injects it into the public envelope without changing domain decisions. All listed functions return `Result` for domain/input failures unless their signature explicitly returns a nullable lookup. They do not throw for expected invalid input; programmer-only invariant violations may throw in tests but may not cross `createItinerary`.
`ITINERARY_SEARCH_LIMIT` is the only retryable domain error; every other domain error sets `retryable:false`.

## Exact algorithm rulings

- HCMC is fixed `+07:00` with no DST. Internal time is integer epoch minutes. Inputs with nonzero seconds/milliseconds are rounded up to the next minute so the engine never starts earlier than requested.
- Normal hours belong to their starting weekday. Overnight windows are represented as two adjacent dated `OpeningInterval` fragments carrying one `sourceWindowKey`. An exception on either local date replaces every normal/carry-over fragment touching that date; `closed=true` suppresses the full date. `findEarliestVisitStart` may merge only adjacent fragments with the same `sourceWindowKey` after exceptions, so a visit can cross midnight only within one uninterrupted source window.
- `findEarliestVisitStart(place, earliestEpochMinute, latestEndEpochMinute, durationMinutes)` never searches beyond `latestEndEpochMinute`.
- There is no origin/start-place input. The first stop has zero travel, zero transition buffer, and zero travel cost. Every later transition requires a directed edge and adds its minutes/cost plus exactly 10 buffer minutes. Waiting for opening counts in total duration because totals use request start to final end.
- Pace caps are the engineering mapping for the approved pace field: `relaxed=3`, `balanced=5`, `active=8`. Cost if wrong: relaxed plans may contain one stop more/fewer than product preference; the hard global maximum remains eight.
- Candidate ranking is zero-based. The ranked list must be a duplicate-free subset of filtered IDs. Omitted IDs append in lexicographic ID order; `rankedIndex` continues after the provided list; `candidateCount` is the filtered count.
- Candidate score is `max(priorityWeights for candidate types) * 1000 + (candidateCount - rankedIndex)`. Priority weights are limited to 0..5 and candidates to 5000, so an eight-stop total remains safely below `Number.MAX_SAFE_INTEGER`.
- Beam expansion order is lexicographic candidate ID. After each depth, sort by: higher score, lower group cost, earlier finish, then lexicographic joined stop IDs; keep the first 50. Do not add “more stops” ahead of the spec tie-break.
- Unlocked stops may appear before, between, or after locked stops. A partial path may add locked stop `i` only after locked stops `0..i-1`; it may never add a later lock first.
- To prevent false infeasibility from beam pruning: if the beam yields no valid path, run a deterministic depth-first fallback across filtered IDs, including unlocked bridges before/between/after locks, subject to the same pace/eight-stop cap. Expand IDs lexicographically, retain the best valid result under the exact path comparator, and finish the bounded search before returning it. The fallback may evaluate at most 20,000 complete or partial states; reaching that cap returns retryable `ITINERARY_SEARCH_LIMIT` even if a provisional valid path was seen, because optimal comparison is incomplete. Without locks, enumerate every filtered single stop and select by the same comparator before returning `NO_FEASIBLE_ITINERARY`.
- Authoritative validation recomputes candidate membership, selected area/type, language, support, normalized budget/FX, exact place duration/cost, directed travel/buffer/cost, opening windows/exceptions, overlap, request start/end, lock presence/order, uniqueness, pace cap, global eight-stop cap, snapshot IDs, and all totals.
- Repair receives validator issues and may drop or reorder only unlocked items. It uses the same scheduler on the remaining candidate set for one pass. It cannot alter locked IDs/order, snapshots, request, catalog facts, travel facts, or money. The validator must pass after repair or the engine rejects.
- USD FX is usable through exactly `observedAtUtc + 168 hours`; later is `USD_DISABLED`. `asOfUtc` earlier than observed is invalid input. USD cents→VND floors; VND→USD cents ceilings; all decision arithmetic uses `BigInt()` constructor (no bigint literals under the ES2017 target) and returns safe integer/decimal-string public values.
- At least one priority weight must be positive. Duplicate/overlapping normal windows, duplicate exception dates, overlapping exception windows, `opensAt===closesAt`, and `closed=true` with nonempty windows are invalid input.
- Canonical fingerprint material uses recursively lexicographically sorted object keys, ordered arrays, explicit nulls for optional snapshot IDs, decimal strings for BigInt-derived values, and UTF-8 JSON. SHA-256 is injected as `(bytes: Uint8Array) => Promise<Uint8Array>` and encoded lowercase hex. Fingerprinting is async and separate from synchronous scheduling.
- AI may return a non-empty duplicate-free subset of candidate IDs; omitted candidates append lexicographically under the scheduler rule. Rationales are keyed exactly by returned candidate IDs and limited to 240 Unicode code points. Any unknown/duplicate ID, missing rationale for a returned ID, extra rationale key, overlong rationale, thrown error, abort, eight-second timeout, empty or malformed response invalidates the entire AI ranking and triggers deterministic fallback. The direct scheduler rejects invalid rank lists; the application orchestrator catches adapter validation failure and omits the list.
- Domain tests begin with `// @vitest-environment node` and include a child-process/mocked-timezone assertion so results are independent of the Windows/Linux machine timezone.
- Each task removes `next-env.d.ts` and `tsconfig.tsbuildinfo` only when they are untracked artifacts generated by that task. Never remove or edit `AGENTS.md`, `CLAUDE.md`, or other instruction files. Use the task's literal `git add` scope only.
- The accepted warning baseline is exactly the two existing Vitest messages about native config loading and `vite-tsconfig-paths`; no new warning is accepted. The foundation evidence is in ignored `.superpowers/sdd/2026-08-22-localens-foundation/progress.md`.

---

### Task 1: Complete contracts and deterministic fixtures

**Files:** Create `lib/domain/itinerary/contracts.ts`, `errors.ts`, `tests/fixtures/itinerary/catalog.v1.ts`, `tests/unit/itinerary/contracts.test.ts`.

**Interface:** `parseEngineInput(source: unknown): Result<EngineInput>`; schemas/types above; `domainError(code,messageKey,issueKeys?): DomainError` applies the fixed retryable mapping.

1. RED: valid fixture plus missing offset, duplicate IDs/locks, all-zero priorities, invalid enums/HH:mm/date, equal/overlapping/duplicate hours or exceptions, unsafe amounts/multiplication inputs, missing USD FX, invalid `asOfUtc`, catalog >5000.
2. GREEN: exact strict schemas/types. Input accepts offset seconds/milliseconds; Task 2 performs ceiling-to-minute normalization.
3. Fixtures include all four types, districts/areas, normal/overnight/exception hours, support states, budget boundary, asymmetric/missing travel, FX and snapshot IDs at `2026-09-05T01:00:00Z`.
4. Verify focused/full tests, lint, typecheck, build. `git add lib/domain/itinerary/contracts.ts lib/domain/itinerary/errors.ts tests/fixtures/itinerary tests/unit/itinerary/contracts.test.ts`; commit `feat: define itinerary engine contracts`.

### Task 2: HCMC local time and opening hours

**Files:** Create `local-time.ts`, `opening-hours.ts`, `tests/unit/itinerary/local-time.test.ts`, `opening-hours.test.ts`.

**Interfaces:** `normalizeToHcmMinute(value): Result<number>`, `formatHcmMinute(epochMinute): string`, `getOpeningIntervals(place, localDate): Result<OpeningInterval[]>`, `findEarliestVisitStart(place, earliest, latestEnd, duration): Result<number | null>`.

1. RED local-time, then GREEN: explicit offsets, UTC/other offset normalization, nonzero-second ceiling, no-offset rejection, date/weekday/minute boundaries, machine-TZ independence.
2. RED opening, then GREEN: normal/exact inclusive finish boundary, exception replace/close, prior-day overnight carry-over suppressed by next-date exception, same-source cross-midnight visit, bounded latest end, no interval.
3. Verify/clean; `git add lib/domain/itinerary/local-time.ts lib/domain/itinerary/opening-hours.ts tests/unit/itinerary/local-time.test.ts tests/unit/itinerary/opening-hours.test.ts`; commit `feat: add HCMC itinerary opening hours`.

### Task 3: Directed travel primitives

**Files:** Create `travel.ts`, `tests/unit/itinerary/travel.test.ts`.

**Interfaces:** `type TravelIndex = ReadonlyMap<string, ReadonlyMap<string, TravelEdge>>`; `indexTravelSnapshot(snapshot): Result<TravelIndex>`, `getTransition(index, fromId, toId): TravelEdge | null`, `toScheduledTransition(edge): { travelMinutes:number; bufferMinutes:10; groupCostVnd:number }`.

1. RED: directed/asymmetric lookup, duplicate edge rejection, missing edge null, verification timestamp retained, self-edge is not synthesized, transition adds exact buffer.
2. GREEN: immutable map/index with deterministic duplicate error.
3. Verify/clean; `git add lib/domain/itinerary/travel.ts tests/unit/itinerary/travel.test.ts`; commit `feat: add directed itinerary travel rules`.

### Task 4: Integer money and FX snapshot rules

**Files:** Create `money.ts`, `tests/unit/itinerary/money.test.ts`.

**Interfaces:** `multiplyVnd(a,b): Result<number>`, `sumVnd(values): Result<number>`, `parseFxRate(value): Result<{numerator:bigint;denominator:bigint}>`, `usdCentsToVndFloor(cents,rate): Result<number>`, `vndToUsdCentsCeil(vnd,rate): Result<number>`, `normalizeBudgetToVnd(request,fx,asOfUtc): Result<{budgetVnd:number;fxSnapshotId:string|null}>`.

1. RED: safe boundary/overflow, rate precision, invalid rate, 168-hour exact-valid and one-minute-stale, asOf before observed, floor/ceil, round-trip inequality, missing FX/VND without FX.
2. GREEN: `BigInt()` arithmetic without literals; `USD_DISABLED` is a non-retryable domain error; public result must fit safe integer.
3. Verify/clean; `git add lib/domain/itinerary/money.ts tests/unit/itinerary/money.test.ts`; commit `feat: enforce itinerary money rules`.

### Task 5: Candidate filtering and authoritative validator

**Files:** Create `candidate-filter.ts`, `validator.ts`, tests of the same names.

**Interfaces:** `filterCandidates(input,budgetVnd): Result<PlaceCandidate[]>`, `validateItinerary(input,result,rankOrder): {valid:true}|{valid:false;issues:ValidationIssue[]}` where `ValidationIssue={key:string;itemIndex?:number;placeId?:string}` contains no PII and never throws for invalid result data. `rankOrder` is the complete order returned by `buildRankOrder`, allowing authoritative score recomputation.

1. RED/GREEN filter: area, at least one positive-weight selected type, language, mandatory support (`unknown` fails), single-place group budget, locked absent/non-time failure, deterministic lexicographic output. Locked zero-weight types remain eligible if other hard filters pass.
2. RED/GREEN validator: every recomputation listed in Exact algorithm rulings, including FX budget/snapshots and candidate filters. Create one test per issue family.
3. Verify/clean; `git add lib/domain/itinerary/candidate-filter.ts lib/domain/itinerary/validator.ts tests/unit/itinerary/candidate-filter.test.ts tests/unit/itinerary/validator.test.ts`; commit `feat: filter and validate itinerary candidates`.

### Task 6: Scoring and bounded beam scheduler

**Files:** Create `scoring.ts`, `scheduler.ts`, `tests/unit/itinerary/scoring.test.ts`, `scheduler.test.ts`.

**Interfaces:** `buildRankOrder(filteredIds,rankedSubset?): Result<string[]>`, `scoreCandidate(candidate,weights,rankedIndex,candidateCount): number`, `comparePaths(a,b): number`, `scheduleItinerary(input,filtered,rankOrder,budgetVnd,rankingSource): Result<ItineraryResult>`.

1. RED/GREEN ranking/scoring: zero-based bonus, omitted lexicographic order, invalid direct list rejection, safe max score, comparator exact order.
2. RED/GREEN scheduler: first stop semantics, directed transitions, waiting, hours, duration/budget, every pace cap, uniqueness, lock insertion/order, 50-state pruning, eight max, deterministic repeats.
3. RED fallback, then GREEN: construct a fixture whose valid locked path requires an unlocked bridge and is pruned from the beam; DFS fallback finds it. A fixture exceeding 20,000 states returns retryable `ITINERARY_SEARCH_LIMIT`. No-lock beam failure tries all single stops before `NO_FEASIBLE_ITINERARY`.
4. Verify/clean; `git add lib/domain/itinerary/scoring.ts lib/domain/itinerary/scheduler.ts tests/unit/itinerary/scoring.test.ts tests/unit/itinerary/scheduler.test.ts`; commit `feat: schedule deterministic itineraries`.

### Task 7: One-pass repair and engine orchestration

**Files:** Create `repair.ts`, `engine.ts`, `tests/unit/itinerary/repair.test.ts`, `engine.test.ts`, `invariants.test.ts`.

**Interfaces:** `repairItinerary(input,invalidResult,issues,rankOrder): Result<ItineraryResult>`, `createItinerary(input,rankedSubset?,rankingSource="deterministic"): Result<ItineraryResult>`.

1. RED repair, then GREEN: derive an exclusion set only from unlocked item IDs named by validation issues, compute `remainingCandidates = filteredCandidates - excludedUnlockedIds`, compute `remainingRankOrder = originalRankOrder.filter(id => remainingCandidateIds.has(id))`, rerun the scheduler once with those matching collections, and allow it to reorder remaining unlocked candidates. Locked IDs/order and all input facts remain unchanged; invalid repaired output rejects. No issue may exclude a locked stop.
2. RED engine, then GREEN: parse→budget normalize→filter→build complete rank order→schedule→validate with that rank order→one repair with filtered rank order→validate with the repaired rank order. Domain errors are stable/safe.
3. Invariant matrix: at least 30 variations; every success validates, fits budget/duration, unique stops, preserves locks, deterministic byte-equal result. Failures only use declared codes.
4. Verify/clean; `git add lib/domain/itinerary/repair.ts lib/domain/itinerary/engine.ts tests/unit/itinerary/repair.test.ts tests/unit/itinerary/engine.test.ts tests/unit/itinerary/invariants.test.ts`; commit `feat: orchestrate deterministic itinerary engine`.

### Task 8: Stable canonical fingerprint

**Files:** Create `fingerprint.ts`, `tests/unit/itinerary/fingerprint.test.ts`.

**Interfaces:** `canonicalizeItinerary(input,result): string`, `fingerprintItinerary(input,result,sha256): Promise<string>`.

1. RED canonicalization against this exact versioned whitelist: `{version:1,request:{normalizedStartAt,durationMinutes,areas(sorted),budget:{currency,amountMinor},budgetVnd,partySize,guideLanguage,priorityWeights(keys in ExperienceType order),pace,dietaryRequirements(sorted),mobilityRequirements(sorted),lockedStopIds(order preserved)},snapshotIds:{catalog,travel,fx},rankingSource,items:[all nine ItineraryItem fields in declared order],totals:{all six declared fields}}`. Exclude `asOfUtc`, FX rate contents, plan/revision/correlation/token/rationale and arbitrary extras. Test fixed output independent of object insertion order, explicit null FX, decimal strings, and UTF-8.
2. GREEN canonical serializer with only that whitelist projection—not generic serialization of arbitrary result extras.
3. RED/GREEN async hasher: injected promise API, lowercase 64-char hex; schedule/cost/snapshot/request/ranking-source changes alter fingerprint; excluded metadata does not.
4. Verify/clean; `git add lib/domain/itinerary/fingerprint.ts tests/unit/itinerary/fingerprint.test.ts`; commit `feat: fingerprint itinerary revisions`.

### Task 9: AI ranking port and deterministic fallback

**Files:** Create `lib/application/itinerary/ranking-port.ts`, `recommend.ts`, `tests/unit/itinerary/recommend.test.ts`.

**Interfaces:**

```ts
interface PublicRankCandidate { id:string; areaId:string; types:ExperienceType[]; visitDurationMinutes:number; }
interface RankRequest { candidates:PublicRankCandidate[]; priorityWeights:PriorityWeights; pace:Pace; }
interface RankResponse { orderedIds:string[]; rationales:Record<string,string>; }
type Ranker = (request:RankRequest, signal:AbortSignal)=>Promise<RankResponse>;
interface RecommendOptions { ranker?:Ranker; signal?:AbortSignal; }
interface Recommendation { result:ItineraryResult; degraded:boolean; messageKey?:"itinerary.ai_unavailable"|"itinerary.ai_invalid"|"itinerary.ai_aborted"; rationales:Record<string,string>; }
```

`recommendItinerary(input,options): Promise<Result<Recommendation>>`. Ranker/provider failures are converted into a successful degraded `Recommendation` after deterministic fallback. Deterministic domain failures such as `NO_FEASIBLE_ITINERARY`, `USD_DISABLED`, or `ITINERARY_SEARCH_LIMIT` return `{ok:false,error:DomainError}`; provider errors never escape and never replace a deterministic domain error.

1. RED ranking, then GREEN: valid non-empty subset; duplicates/unknown IDs; omitted candidates allowed and appended; exact rationale keys for returned IDs; 240 Unicode-code-point limit (overlong invalid, not truncated); empty/malformed/thrown response.
2. RED/GREEN fallback: invalid AI never reaches direct scheduler ranking validation; deterministic order runs with `rankingSource="deterministic"`, degraded true. Valid AI result still passes authoritative engine validation.
3. Timeout/abort: orchestrator combines optional caller signal with its own exact 8,000ms timeout signal; either abort produces safe `itinerary.ai_aborted` fallback and no provider error. Use fake timers/injected timeout-signal factory so tests do not sleep.
4. Security test: rank request contains only declared fields and no name/email/phone/auth ID/token/payment/free-form notes or raw support text.
5. Verify/clean; `git add lib/application/itinerary/ranking-port.ts lib/application/itinerary/recommend.ts tests/unit/itinerary/recommend.test.ts`; commit `feat: orchestrate safe itinerary ranking fallback`.

## Milestone completion gate

Fresh commands:

```powershell
pnpm install --frozen-lockfile
pnpm peers check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
```

Then whole-range review from the plan-start SHA through Task 9 head. This milestone makes no Supabase, Gemini, paid, or network call.
