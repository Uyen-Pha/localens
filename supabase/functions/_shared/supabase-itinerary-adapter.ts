import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { RankRequest, Ranker } from "@/lib/application/itinerary/ranking-port";
import {
  itineraryRequestSchema,
  itineraryResultSchema,
  parseEngineInput,
  type EngineInput,
  type ItineraryRequest,
  type ItineraryResult,
} from "@/lib/domain/itinerary/contracts";
import { fingerprintRevisionBinding } from "@/lib/domain/itinerary/fingerprint";
import { mapCatalogSnapshot } from "@/lib/infrastructure/supabase/catalog-adapter";
import type { Database, Json } from "@/lib/infrastructure/supabase/database.types";
import { toPlanRevisionInsert } from "@/lib/infrastructure/supabase/plan-revision-adapter";
import {
  mapFxSnapshot,
  mapTravelSnapshot,
} from "@/lib/infrastructure/supabase/travel-fx-adapter";
import {
  GeminiProviderResponseError,
  createGeminiRanker,
} from "@/supabase/functions/_shared/gemini-ranker";
import type {
  AccessTokenVerification,
  PersistedPlannerRevision,
  PlannerOperationClaimInput,
  PlannerOperationContext,
  PlannerOperationExecutionFailure,
  PlannerQuotaIdentityCheck,
  PlannerQuotaReservation,
  RecommendItineraryAdapter,
  RecommendationAdapterContext,
  RecommendationAdapterErrorCode,
} from "@/supabase/functions/_shared/recommend-itinerary";
import {
  parseOperationDecision,
  parseOperationRejectedCode,
  type OperationDecision,
  type OperationRejectedCode,
} from "@/supabase/functions/_shared/planner-operation";
import type {
  CanonicalPreviousItem,
  RefineItineraryAdapter,
  RefineItineraryAdapterContext,
  RefineItineraryAdapterErrorCode,
  RefineItineraryInput,
  RefinementRanker,
} from "@/supabase/functions/_shared/refine-itinerary";

export type SupabaseItineraryClient = Pick<
  SupabaseClient<Database>,
  "auth" | "from" | "rpc"
>;

export interface SupabaseItineraryAdapterConfig {
  readonly supabaseUrl?: string;
  readonly supabaseAnonKey?: string;
  readonly supabaseServiceRoleKey?: string;
  readonly userClient?: SupabaseItineraryClient;
  readonly serviceClient?: SupabaseItineraryClient;
  readonly quotaHmacKey: string;
  readonly geminiEnabled: boolean;
  readonly geminiApiKey?: string;
  readonly geminiEndpointBase?: string;
  readonly fetchImpl?: typeof fetch;
  readonly randomUuid?: () => string;
  readonly cryptoImpl?: Pick<Crypto, "randomUUID" | "subtle">;
}

type QueryResponse = { data: unknown; error: unknown };
type QuotaKind = "planner" | "gemini";
type QuotaIdentity = { ipHash: string; deviceHash: string };
type QuotaIdentityResult =
  | { ok: true; value: QuotaIdentity }
  | { ok: false; code: "CHALLENGE_REQUIRED" | "CHALLENGE_INVALID" };

type SnapshotBinding = {
  catalogSnapshotId: string;
  travelSnapshotId: string;
  fxSnapshotId: string | null;
  asOfUtc: string;
  fxRow: Record<string, unknown> | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OPAQUE_DEVICE_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const HMAC_KEY_MIN_LENGTH = 32;
const HMAC_KEY_MAX_LENGTH = 4096;

type RpcInvoker = (
  name: string,
  args: Record<string, unknown>,
) => Promise<QueryResponse>;

const CURRENT_SNAPSHOT_COLUMNS = [
  "catalog_snapshot_id",
  "travel_snapshot_id",
  "travel_published_at",
  "fx_snapshot_id",
  "fx_vnd_per_usd",
  "fx_source",
  "fx_observed_at",
  "fx_environment",
  "fx_is_demo",
].join(",");

const CATALOG_PLACE_COLUMNS = [
  "snapshot_id",
  "place_id",
  "area_id",
  "price_vnd_per_person",
  "visit_duration_minutes",
  "experience_types",
  "guide_languages",
  "dietary_support",
  "mobility_support",
  "opening_hours",
  "opening_exceptions",
].join(",");

const FOOD_VENDOR_COLUMNS = [
  "snapshot_id",
  "place_id",
  "vendor_id",
  "slug",
  "title",
  "description",
  "location_note",
  "service_type",
  "capacity_note",
  "dietary_support",
  "mobility_support",
  "opening_hours",
  "opening_exceptions",
  "status",
  "verified_at",
].join(",");

const FOOD_ITEM_COLUMNS = [
  "snapshot_id",
  "place_id",
  "vendor_id",
  "item_id",
  "slug",
  "title",
  "description",
  "serving_unit",
  "price_vnd_min",
  "price_vnd_max",
  "portion_description",
  "dietary_support",
  "allergens",
  "available",
  "status",
  "verified_at",
].join(",");

const REVISION_COLUMNS = [
  "id",
  "plan_id",
  "revision_no",
  "fingerprint",
  "catalog_snapshot_id",
  "travel_snapshot_id",
  "fx_snapshot_id",
  "request_json",
  "result_json",
  "created_at",
].join(",");

const PLAN_ITEM_COLUMNS = [
  "revision_id",
  "position",
  "place_id",
  "start_at",
  "end_at",
  "visit_duration_minutes",
].join(",");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && value === value.toLowerCase() && UUID_PATTERN.test(value);
}

function canonicalUtc(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 80 || CONTROL_CHARACTER_PATTERN.test(value)) return null;
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return null;
  return new Date(epoch).toISOString();
}

function sameInstant(left: unknown, right: unknown): boolean {
  const leftUtc = canonicalUtc(left);
  const rightUtc = canonicalUtc(right);
  return leftUtc !== null && rightUtc !== null && leftUtc === rightUtc;
}

function responseRows(response: unknown): unknown[] | null {
  if (!isRecord(response) || response.error !== null || !Array.isArray(response.data)) return null;
  return response.data;
}

function oneRow(response: unknown): Record<string, unknown> | null {
  const rows = responseRows(response);
  return rows?.length === 1 && isRecord(rows[0]) ? rows[0] : null;
}

function invokeRpc(
  client: SupabaseItineraryClient,
  name: string,
  args: Record<string, unknown>,
): Promise<QueryResponse> {
  const rpc = client.rpc as unknown as RpcInvoker;
  return rpc.call(client, name, args);
}

function rpcData(response: unknown): unknown | null {
  if (!isRecord(response) || response.error !== null) return null;
  return response.data;
}

function operationDecisionFromRpc(response: unknown): OperationDecision | null {
  return parseOperationDecision(rpcData(response));
}

function isQuotaExceeded(error: unknown): boolean {
  return isRecord(error) && error.code === "P0001" && error.message === "quota exceeded";
}

function isPlannerPlanNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === "P0001" && error.message === "PLAN_NOT_FOUND";
}

function sameHashBinding(row: Record<string, unknown>, identity: QuotaIdentity): boolean {
  return Array.isArray(row.bucket_hashes)
    && row.bucket_hashes.length === 2
    && row.bucket_hashes[0] === identity.ipHash
    && row.bucket_hashes[1] === identity.deviceHash;
}

function currentBinding(row: Record<string, unknown>): SnapshotBinding | null {
  const catalogSnapshotId = row.catalog_snapshot_id;
  const travelSnapshotId = row.travel_snapshot_id;
  const asOfUtc = canonicalUtc(row.travel_published_at);
  if (!isUuid(catalogSnapshotId) || !isUuid(travelSnapshotId) || asOfUtc === null) return null;

  const nullableFx = [
    row.fx_snapshot_id,
    row.fx_vnd_per_usd,
    row.fx_source,
    row.fx_observed_at,
    row.fx_environment,
    row.fx_is_demo,
  ];
  if (nullableFx.every((value) => value === null)) {
    return { catalogSnapshotId, travelSnapshotId, fxSnapshotId: null, asOfUtc, fxRow: null };
  }
  if (
    !isUuid(row.fx_snapshot_id)
    || typeof row.fx_vnd_per_usd !== "string"
    || typeof row.fx_source !== "string"
    || canonicalUtc(row.fx_observed_at) === null
    || row.fx_environment !== "production"
    || row.fx_is_demo !== false
  ) {
    return null;
  }
  const fxObservedAt = canonicalUtc(row.fx_observed_at)!;
  return {
    catalogSnapshotId,
    travelSnapshotId,
    fxSnapshotId: row.fx_snapshot_id,
    asOfUtc: new Date(Math.max(Date.parse(asOfUtc), Date.parse(fxObservedAt))).toISOString(),
    fxRow: {
      id: row.fx_snapshot_id,
      vnd_per_usd: row.fx_vnd_per_usd,
      source: row.fx_source,
      observed_at: fxObservedAt,
      environment: "production",
      is_demo: false,
    },
  };
}

function normalizeIpv4(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.some((part) => part < 0 || part > 255)) return null;
  return numbers.join(".");
}

function normalizeIpv6(value: string): string | null {
  if (!value.includes(":") || !/^[0-9a-fA-F:.]+$/.test(value)) return null;
  try {
    const host = new URL(`http://[${value}]/`).hostname;
    return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1).toLowerCase() : null;
  } catch {
    return null;
  }
}

function normalizedForwardedAddress(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded === null || forwarded.length > 512 || CONTROL_CHARACTER_PATTERN.test(forwarded)) return null;
  const leftmost = forwarded.split(",", 1)[0]?.trim() ?? "";
  if (leftmost.length === 0 || leftmost.length > 64) return null;
  return normalizeIpv4(leftmost) ?? normalizeIpv6(leftmost);
}

function normalizedDeviceId(request: Request): string | null {
  const deviceId = request.headers.get("x-localens-device-id");
  if (deviceId === null) return null;
  if (deviceId !== deviceId.trim() || !OPAQUE_DEVICE_PATTERN.test(deviceId)) return "";
  return deviceId;
}

async function hmacHex(
  cryptoImpl: Pick<Crypto, "subtle">,
  secret: string,
  value: string,
): Promise<string> {
  const key = await cryptoImpl.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await cryptoImpl.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateConfig(config: SupabaseItineraryAdapterConfig): void {
  if (
    typeof config?.quotaHmacKey !== "string"
    || config.quotaHmacKey.length < HMAC_KEY_MIN_LENGTH
    || config.quotaHmacKey.length > HMAC_KEY_MAX_LENGTH
    || CONTROL_CHARACTER_PATTERN.test(config.quotaHmacKey)
  ) {
    throw new Error("Invalid itinerary adapter configuration");
  }
  if (typeof config.geminiEnabled !== "boolean") throw new Error("Invalid itinerary adapter configuration");
}

function resolveClients(
  config: SupabaseItineraryAdapterConfig,
  request: Request,
): { userClient: SupabaseItineraryClient; serviceClient: SupabaseItineraryClient } {
  if (config.userClient !== undefined && config.serviceClient !== undefined) {
    return { userClient: config.userClient, serviceClient: config.serviceClient };
  }
  if (
    config.userClient !== undefined
    || config.serviceClient !== undefined
    || typeof config.supabaseUrl !== "string"
    || typeof config.supabaseAnonKey !== "string"
    || typeof config.supabaseServiceRoleKey !== "string"
  ) {
    throw new Error("Invalid itinerary adapter clients");
  }
  const authorization = request.headers.get("Authorization");
  const authOptions = {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  };
  const userClient = createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    auth: authOptions,
    ...(authorization === null ? {} : { global: { headers: { Authorization: authorization } } }),
  });
  const serviceClient = createClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: authOptions,
  });
  return { userClient, serviceClient };
}

function runtime(
  config: SupabaseItineraryAdapterConfig,
  request: Request,
) {
  validateConfig(config);
  const clients = resolveClients(config, request);
  const cryptoImpl = config.cryptoImpl ?? globalThis.crypto;
  if (cryptoImpl === undefined || typeof cryptoImpl.randomUUID !== "function" || cryptoImpl.subtle === undefined) {
    throw new Error("Web Crypto is required");
  }
  const randomUuid = config.randomUuid ?? (() => cryptoImpl.randomUUID());
  const nextUuid = (): string => {
    const value = randomUuid();
    if (!isUuid(value)) throw new Error("Invalid generated UUID");
    return value;
  };
  let quotaIdentityPromise: Promise<QuotaIdentityResult> | null = null;
  let activeOperation: PlannerOperationContext | null = null;
  let operationFailure: PlannerOperationExecutionFailure | null = null;

  const quotaIdentity = (): Promise<QuotaIdentityResult> => {
    if (quotaIdentityPromise !== null) return quotaIdentityPromise;
    quotaIdentityPromise = (async () => {
      const deviceId = normalizedDeviceId(request);
      const address = normalizedForwardedAddress(request);
      if (deviceId === null || address === null) return { ok: false, code: "CHALLENGE_REQUIRED" };
      if (deviceId === "") return { ok: false, code: "CHALLENGE_INVALID" };
      try {
        const [ipHash, deviceHash] = await Promise.all([
          hmacHex(cryptoImpl, config.quotaHmacKey, `ip:${address}`),
          hmacHex(cryptoImpl, config.quotaHmacKey, `device:${deviceId}`),
        ]);
        return { ok: true, value: { ipHash, deviceHash } };
      } catch {
        return { ok: false, code: "CHALLENGE_INVALID" };
      }
    })();
    return quotaIdentityPromise;
  };

  const reserveQuota = async (
    kind: QuotaKind,
    identity: QuotaIdentity,
    reservationId = nextUuid(),
  ): Promise<PlannerQuotaReservation> => {
    let response: QueryResponse;
    try {
      response = await clients.serviceClient.rpc("reserve_ai_quota", {
        p_reservation_id: reservationId,
        p_kind: kind,
        p_ip_hash: identity.ipHash,
        p_device_hash: identity.deviceHash,
      }) as QueryResponse;
    } catch {
      return { ok: false, kind: "unavailable" };
    }
    const row = oneRow(response);
    if (isQuotaExceeded(response.error)) return { ok: false, kind: "rejected", code: "QUOTA_EXCEEDED" };
    if (
      row === null
      || row.kind !== kind
      || (row.state !== "created" && row.state !== "replayed")
      || row.reservation_id !== reservationId
      || !isUuid(row.reservation_id)
      || !sameHashBinding(row, identity)
    ) {
      return { ok: false, kind: "unavailable" };
    }
    return { ok: true };
  };

  const verifyAccessToken = async (token: string): Promise<AccessTokenVerification> => {
    try {
      const auth = await clients.userClient.auth.getUser(token);
      if (auth.error !== null || auth.data.user === null || !isUuid(auth.data.user.id)) {
        return { ok: false, error: { code: "AUTH_EXPIRED" } };
      }
      const identity = oneRow(await clients.userClient.rpc("get_portal_identity"));
      if (
        identity === null
        || identity.user_id !== auth.data.user.id
        || identity.role !== "customer"
      ) {
        return { ok: false, error: { code: "AUTH_EXPIRED" } };
      }
      return { ok: true, principal: { userId: auth.data.user.id } };
    } catch {
      return { ok: false, error: { code: "AUTH_EXPIRED" } };
    }
  };

  const readCurrentBinding = async (): Promise<SnapshotBinding | null> => {
    try {
      const response = await clients.userClient
        .from("current_itinerary_snapshot_v")
        .select(CURRENT_SNAPSHOT_COLUMNS)
        .limit(2);
      const row = oneRow(response);
      return row === null ? null : currentBinding(row);
    } catch {
      return null;
    }
  };

  const loadEngineInput = async (
    input: ItineraryRequest,
    binding: SnapshotBinding,
  ): Promise<
    | { ok: true; value: EngineInput }
    | { ok: false; code: "CATALOG_UNAVAILABLE" | "TRAVEL_DATA_UNAVAILABLE" | "FX_UNAVAILABLE" }
  > => {
    let areaRows: unknown[] | null;
    try {
      areaRows = responseRows(await clients.userClient
        .from("catalog_snapshot_areas_v")
        .select("snapshot_id,area_id,slug")
        .eq("snapshot_id", binding.catalogSnapshotId));
    } catch {
      areaRows = null;
    }
    if (areaRows === null) return { ok: false, code: "CATALOG_UNAVAILABLE" };
    const areaIds = new Set<string>();
    for (const row of areaRows) {
      if (!isRecord(row) || row.snapshot_id !== binding.catalogSnapshotId || !isUuid(row.area_id)) {
        return { ok: false, code: "CATALOG_UNAVAILABLE" };
      }
      areaIds.add(row.area_id);
    }
    if (input.areas.some((areaId) => !isUuid(areaId) || !areaIds.has(areaId))) {
      return { ok: false, code: "CATALOG_UNAVAILABLE" };
    }

    let placeRows: unknown[] | null;
    let vendorRows: unknown[] | null;
    let itemRows: unknown[] | null;
    try {
      [placeRows, vendorRows, itemRows] = await Promise.all([
        clients.userClient.from("catalog_snapshot_places_v")
          .select(CATALOG_PLACE_COLUMNS)
          .eq("snapshot_id", binding.catalogSnapshotId)
          .then(responseRows),
        clients.userClient.from("catalog_snapshot_food_vendors_v")
          .select(FOOD_VENDOR_COLUMNS)
          .eq("snapshot_id", binding.catalogSnapshotId)
          .then(responseRows),
        clients.userClient.from("catalog_snapshot_food_items_v")
          .select(FOOD_ITEM_COLUMNS)
          .eq("snapshot_id", binding.catalogSnapshotId)
          .then(responseRows),
      ]);
    } catch {
      return { ok: false, code: "CATALOG_UNAVAILABLE" };
    }
    if (placeRows === null || vendorRows === null || itemRows === null) {
      return { ok: false, code: "CATALOG_UNAVAILABLE" };
    }
    const catalog = mapCatalogSnapshot(placeRows, { vendors: vendorRows, items: itemRows });
    if (!catalog.ok || catalog.value.id !== binding.catalogSnapshotId) {
      return { ok: false, code: "CATALOG_UNAVAILABLE" };
    }
    const placeIds = new Set(catalog.value.places.map((place) => place.id));
    if (input.lockedStopIds.some((placeId) => !isUuid(placeId) || !placeIds.has(placeId))) {
      return { ok: false, code: "CATALOG_UNAVAILABLE" };
    }

    let travelRows: unknown[] | null;
    try {
      travelRows = responseRows(await clients.userClient.from("travel_snapshots_v")
        .select("snapshot_id,catalog_snapshot_id,edges")
        .eq("snapshot_id", binding.travelSnapshotId)
        .eq("catalog_snapshot_id", binding.catalogSnapshotId)
        .limit(2));
    } catch {
      travelRows = null;
    }
    if (
      travelRows === null
      || travelRows.length !== 1
      || !isRecord(travelRows[0])
      || travelRows[0].snapshot_id !== binding.travelSnapshotId
      || travelRows[0].catalog_snapshot_id !== binding.catalogSnapshotId
    ) {
      return { ok: false, code: "TRAVEL_DATA_UNAVAILABLE" };
    }
    const travel = mapTravelSnapshot(travelRows);
    if (!travel.ok || travel.value.id !== binding.travelSnapshotId) {
      return { ok: false, code: "TRAVEL_DATA_UNAVAILABLE" };
    }

    let fx: EngineInput["fx"];
    if (input.budget.currency === "USD") {
      if (binding.fxSnapshotId === null || binding.fxRow === null) return { ok: false, code: "FX_UNAVAILABLE" };
      const mappedFx = mapFxSnapshot(binding.fxRow);
      if (!mappedFx.ok || mappedFx.value.id !== binding.fxSnapshotId) return { ok: false, code: "FX_UNAVAILABLE" };
      fx = mappedFx.value;
    }
    const parsed = parseEngineInput({
      request: input,
      catalog: catalog.value,
      travel: travel.value,
      ...(fx === undefined ? {} : { fx }),
      asOfUtc: binding.asOfUtc,
    });
    if (!parsed.ok) {
      return { ok: false, code: input.budget.currency === "USD" ? "FX_UNAVAILABLE" : "CATALOG_UNAVAILABLE" };
    }
    return { ok: true, value: parsed.value };
  };

  const historicalBinding = async (
    revision: Record<string, unknown>,
  ): Promise<SnapshotBinding | null> => {
    const catalogSnapshotId = revision.catalog_snapshot_id;
    const travelSnapshotId = revision.travel_snapshot_id;
    const fxSnapshotId = revision.fx_snapshot_id;
    if (
      !isUuid(catalogSnapshotId)
      || !isUuid(travelSnapshotId)
      || (fxSnapshotId !== null && !isUuid(fxSnapshotId))
    ) {
      return null;
    }
    let travelMeta: Record<string, unknown> | null;
    try {
      travelMeta = oneRow(await clients.userClient.from("itinerary_travel_snapshot_history_v")
        .select("travel_snapshot_id,catalog_snapshot_id,travel_published_at")
        .eq("travel_snapshot_id", travelSnapshotId)
        .eq("catalog_snapshot_id", catalogSnapshotId)
        .limit(2));
    } catch {
      return null;
    }
    const asOfUtc = travelMeta === null ? null : canonicalUtc(travelMeta.travel_published_at);
    if (
      travelMeta?.travel_snapshot_id !== travelSnapshotId
      || travelMeta.catalog_snapshot_id !== catalogSnapshotId
      || asOfUtc === null
    ) {
      return null;
    }

    let fxRow: Record<string, unknown> | null = null;
    if (fxSnapshotId !== null) {
      try {
        const rawFx = oneRow(await clients.userClient.from("itinerary_fx_snapshot_history_v")
          .select("fx_snapshot_id,fx_vnd_per_usd,fx_source,fx_observed_at,fx_environment,fx_is_demo")
          .eq("fx_snapshot_id", fxSnapshotId)
          .limit(2));
        if (rawFx === null || rawFx.fx_environment !== "production" || rawFx.fx_is_demo !== false) return null;
        const numeric = rawFx.fx_vnd_per_usd;
        const vndPerUsd = typeof numeric === "string"
          ? numeric
          : typeof numeric === "number" && Number.isFinite(numeric) ? numeric.toFixed(8) : null;
        const observedAt = canonicalUtc(rawFx.fx_observed_at);
        if (vndPerUsd === null || observedAt === null) return null;
        fxRow = {
          id: rawFx.fx_snapshot_id,
          vnd_per_usd: vndPerUsd,
          source: rawFx.fx_source,
          observed_at: observedAt,
          environment: rawFx.fx_environment,
          is_demo: rawFx.fx_is_demo,
        };
      } catch {
        return null;
      }
    }
    const observedAt = fxRow === null ? null : canonicalUtc(fxRow.observed_at);
    return {
      catalogSnapshotId,
      travelSnapshotId,
      fxSnapshotId,
      asOfUtc: observedAt === null
        ? asOfUtc
        : new Date(Math.max(Date.parse(asOfUtc), Date.parse(observedAt))).toISOString(),
      fxRow,
    };
  };

  const sha256 = async (bytes: Uint8Array): Promise<Uint8Array> => {
    const digest = await cryptoImpl.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
    return new Uint8Array(digest);
  };

  const geminiRanker = config.geminiEnabled
    ? createGeminiRanker({
        apiKey: config.geminiApiKey ?? "",
        ...(config.fetchImpl === undefined ? {} : { fetchImpl: config.fetchImpl }),
        ...(config.geminiEndpointBase === undefined ? {} : { endpointBase: config.geminiEndpointBase }),
      })
    : undefined;

  const ranker: Ranker | undefined = geminiRanker === undefined
    ? undefined
    : async (rankRequest: RankRequest, signal: AbortSignal) => {
        let identity: QuotaIdentityResult;
        try {
          identity = await quotaIdentity();
        } catch {
          if (activeOperation !== null) operationFailure = { kind: "ambiguous_provider" };
          throw new Error("Gemini unavailable");
        }
        if (!identity.ok) {
          if (activeOperation !== null) operationFailure = { kind: "ambiguous_provider" };
          throw new Error("Gemini unavailable");
        }
        const reservationId = activeOperation?.geminiReservationId;
        const reserved = await reserveQuota(
          "gemini",
          identity.value,
          reservationId ?? undefined,
        );
        if (!reserved.ok) {
          if (activeOperation !== null) {
            operationFailure = reserved.kind === "rejected"
              ? { kind: "quota", code: reserved.code }
              : { kind: "ambiguous_provider" };
          }
          throw new Error("Gemini unavailable");
        }
        try {
          return await geminiRanker(rankRequest, signal);
        } catch (error) {
          if (activeOperation !== null && !(error instanceof GeminiProviderResponseError)) {
            operationFailure = { kind: "ambiguous_provider" };
          }
          throw new Error("Gemini unavailable");
        }
      };

  return {
    ...clients,
    nextUuid,
    quotaIdentity,
    reserveQuota,
    get activeOperation() {
      return activeOperation;
    },
    set activeOperation(value: PlannerOperationContext | null) {
      activeOperation = value;
    },
    get operationFailure() {
      return operationFailure;
    },
    set operationFailure(value: PlannerOperationExecutionFailure | null) {
      operationFailure = value;
    },
    verifyAccessToken,
    readCurrentBinding,
    loadEngineInput,
    historicalBinding,
    sha256,
    ranker,
  };
}

function validPrincipal(
  context: RecommendationAdapterContext | RefineItineraryAdapterContext,
): boolean {
  return context.principal !== null && isUuid(context.principal.userId);
}

function sameOperation(left: PlannerOperationContext, right: PlannerOperationContext): boolean {
  return left.operationId === right.operationId
    && left.requestDigest === right.requestDigest
    && left.kind === right.kind
    && left.leaseToken === right.leaseToken
    && left.planId === right.planId
    && left.baseRevision === right.baseRevision
    && left.plannerReservationId === right.plannerReservationId
    && left.geminiReservationId === right.geminiReservationId;
}

function operationForContext(
  context: RecommendationAdapterContext | RefineItineraryAdapterContext,
  kind: PlannerOperationContext["kind"],
  activeOperation: PlannerOperationContext | null,
): PlannerOperationContext | null {
  const operation = context.operation;
  if (operation === undefined || operation.kind !== kind || activeOperation === null) return null;
  return sameOperation(operation, activeOperation) ? operation : null;
}

export function createSupabaseRecommendAdapter(
  config: SupabaseItineraryAdapterConfig,
  request: Request,
): RecommendItineraryAdapter {
  const shared = runtime(config, request);

  return {
    verifyAccessToken: (token) => shared.verifyAccessToken(token),
    async claimOperation(input: PlannerOperationClaimInput, context: RecommendationAdapterContext) {
      if (!validPrincipal(context)) throw new Error("Authenticated planner operation required");
      let response: QueryResponse;
      try {
        response = await invokeRpc(shared.serviceClient, "claim_runtime_planner_operation", {
          p_actor_user_id: context.principal!.userId,
          p_operation_id: input.operationId,
          p_kind: input.kind,
          p_request_digest: input.requestDigest,
          p_target_plan_id: input.targetPlanId,
          p_base_revision: input.baseRevision,
        });
      } catch {
        return { ok: false as const, error: { code: "SERVICE_UNAVAILABLE" as const } };
      }
      if (response.error !== null) {
        return { ok: false as const, error: { code: "SERVICE_UNAVAILABLE" as const } };
      }
      const decision = operationDecisionFromRpc(response);
      if (decision === null) return { ok: false as const, error: { code: "SERVICE_UNAVAILABLE" as const } };
      if (decision.state === "claimed") {
        shared.activeOperation = {
          operationId: input.operationId,
          requestDigest: input.requestDigest,
          kind: input.kind,
          leaseToken: decision.leaseToken,
          leaseExpiresAt: decision.leaseExpiresAt,
          planId: decision.planId,
          baseRevision: input.baseRevision,
          plannerReservationId: decision.plannerReservationId,
          geminiReservationId: decision.geminiReservationId,
        };
        shared.operationFailure = null;
      } else {
        shared.activeOperation = null;
        shared.operationFailure = null;
      }
      return decision;
    },
    async validateQuotaIdentity(): Promise<PlannerQuotaIdentityCheck> {
      const identity = await shared.quotaIdentity();
      return identity.ok
        ? { ok: true }
        : { ok: false, error: { code: identity.code } };
    },
    async reservePlannerQuota(reservationId: string, context: RecommendationAdapterContext): Promise<PlannerQuotaReservation> {
      const operation = operationForContext(context, "recommend", shared.activeOperation);
      if (operation === null || reservationId !== operation.plannerReservationId) {
        return { ok: false, kind: "unavailable" };
      }
      const identity = await shared.quotaIdentity();
      if (!identity.ok) return { ok: false, kind: "unavailable" };
      return shared.reserveQuota("planner", identity.value, reservationId);
    },
    async rejectOperation(
      input: { operationId: string; requestDigest: string; leaseToken: string },
      errorCode: OperationRejectedCode,
      context: RecommendationAdapterContext,
    ) {
      if (!validPrincipal(context) || parseOperationRejectedCode(errorCode) === null) {
        throw new Error("Invalid planner operation rejection");
      }
      const response = await invokeRpc(shared.serviceClient, "reject_runtime_planner_operation", {
        p_actor_user_id: context.principal!.userId,
        p_operation_id: input.operationId,
        p_request_digest: input.requestDigest,
        p_lease_token: input.leaseToken,
        p_error_code: errorCode,
      });
      if (response.error !== null) throw new Error("Planner operation rejection unavailable");
      const decision = operationDecisionFromRpc(response);
      if (decision === null) throw new Error("Invalid planner operation rejection decision");
      shared.activeOperation = null;
      shared.operationFailure = null;
      return decision;
    },
    async readCommittedRevision(
      input: { planId: string; revision: number },
      context: RecommendationAdapterContext,
    ): Promise<PersistedPlannerRevision> {
      if (!validPrincipal(context) || !isUuid(input.planId) || !Number.isSafeInteger(input.revision) || input.revision < 1) {
        return { ok: false, error: { code: "SERVICE_UNAVAILABLE" } };
      }
      try {
        const response = await shared.userClient.from("trip_plan_revisions")
          .select("plan_id,revision_no,result_json,ranking_source")
          .eq("plan_id", input.planId)
          .eq("revision_no", input.revision)
          .limit(2);
        const row = oneRow(response);
        if (
          row === null
          || row.plan_id !== input.planId
          || row.revision_no !== input.revision
          || (row.ranking_source !== "ai" && row.ranking_source !== "deterministic")
        ) {
          return { ok: false, error: { code: "SERVICE_UNAVAILABLE" } };
        }
        const result = itineraryResultSchema.safeParse(row.result_json);
        if (!result.success || result.data.rankingSource !== row.ranking_source) {
          return { ok: false, error: { code: "SERVICE_UNAVAILABLE" } };
        }
        return {
          ok: true,
          planId: row.plan_id,
          revision: row.revision_no,
          rankingSource: row.ranking_source,
          result: result.data,
        };
      } catch {
        return { ok: false, error: { code: "SERVICE_UNAVAILABLE" } };
      }
    },
    readOperationFailure: () => shared.operationFailure,
    async resolveEngineInput(input, context) {
      if (!validPrincipal(context)) return { ok: false, error: { code: "AUTH_REQUIRED" } };
      const operation = context.operation === undefined
        ? null
        : operationForContext(context, "recommend", shared.activeOperation);
      if (context.operation !== undefined && operation === null) {
        return { ok: false, error: { code: "CATALOG_UNAVAILABLE" } };
      }
      let identity: QuotaIdentity | null = null;
      if (operation === null) {
        const identityResult = await shared.quotaIdentity();
        if (!identityResult.ok) return { ok: false, error: { code: identityResult.code } };
        identity = identityResult.value;
      }
      const binding = await shared.readCurrentBinding();
      if (binding === null) return { ok: false, error: { code: "CATALOG_UNAVAILABLE" } };
      if (identity !== null) {
        const reserved = await shared.reserveQuota("planner", identity);
        if (!reserved.ok) {
          return reserved.kind === "rejected"
            ? { ok: false, error: { code: "QUOTA_EXCEEDED" } }
            : { ok: false, error: { code: "CATALOG_UNAVAILABLE" } };
        }
      }
      const resolved = await shared.loadEngineInput(input, binding);
      if (!resolved.ok) return { ok: false, error: { code: resolved.code } };
      return { ok: true, input: resolved.value };
    },
    async commitRecommendation(input, context) {
      if (!validPrincipal(context)) return { ok: false, error: { code: "AUTH_REQUIRED" } };
      const operation = operationForContext(context, "recommend", shared.activeOperation);
      if (operation === null) return { ok: false, error: { code: "CATALOG_UNAVAILABLE" } };
      try {
        const fingerprint = await fingerprintRevisionBinding(
          operation.planId,
          1,
          input.input,
          input.result,
          shared.sha256,
        );
        const persistence = toPlanRevisionInsert(input.input, input.result, fingerprint, 1);
        if (!persistence.ok) return { ok: false, error: { code: "CATALOG_UNAVAILABLE" } };
        const response = await invokeRpc(shared.serviceClient, "complete_runtime_recommendation", {
          p_actor_user_id: context.principal!.userId,
          p_operation_id: operation.operationId,
          p_request_digest: operation.requestDigest,
          p_lease_token: operation.leaseToken,
          p_persistence_dto: persistence.value as unknown as Json,
        });
        if (response.error !== null) {
          shared.operationFailure = { kind: "ambiguous_commit" };
          return { ok: false, error: { code: "SERVICE_UNAVAILABLE" } };
        }
        const decision = operationDecisionFromRpc(response);
        if (decision === null) {
          shared.operationFailure = { kind: "ambiguous_commit" };
          return { ok: false, error: { code: "SERVICE_UNAVAILABLE" } };
        }
        if (decision.state === "completed") {
          return decision.planId === operation.planId && decision.revision === 1
            ? { ok: true, planId: decision.planId, revision: 1 }
            : { ok: false, error: { code: "CATALOG_UNAVAILABLE" } };
        }
        return { ok: false, decision };
      } catch {
        shared.operationFailure = { kind: "ambiguous_commit" };
        return { ok: false, error: { code: "SERVICE_UNAVAILABLE" } };
      }
    },
    ...(shared.ranker === undefined ? {} : { ranker: shared.ranker }),
  };
}

function refinementFailure(code: RefineItineraryAdapterErrorCode) {
  return { ok: false as const, error: { code } };
}

function recommendationCodeToRefinement(code: RecommendationAdapterErrorCode): RefineItineraryAdapterErrorCode {
  if (code === "QUOTA_EXCEEDED") return "QUOTA_EXCEEDED";
  if (code === "AUTH_REQUIRED" || code === "AUTH_EXPIRED") return code;
  return "SNAPSHOT_MISMATCH";
}

function mapPreviousItems(
  rows: unknown[],
  revisionId: string,
  result: ItineraryResult,
): CanonicalPreviousItem[] | null {
  if (rows.length !== result.items.length) return null;
  const mapped: CanonicalPreviousItem[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const item = result.items[index];
    if (
      !isRecord(row)
      || item === undefined
      || row.revision_id !== revisionId
      || row.position !== index + 1
      || !isUuid(row.place_id)
      || row.place_id !== item.placeId
      || !sameInstant(row.start_at, item.startAt)
      || !sameInstant(row.end_at, item.endAt)
      || row.visit_duration_minutes !== item.visitDurationMinutes
    ) {
      return null;
    }
    mapped.push({ ...item, itemId: row.place_id, position: index + 1 });
  }
  return mapped;
}

export function createSupabaseRefineAdapter(
  config: SupabaseItineraryAdapterConfig,
  request: Request,
): RefineItineraryAdapter {
  const shared = runtime(config, request);

  return {
    verifyAccessToken: (token) => shared.verifyAccessToken(token),
    async verifyGuestCapability() {
      return { ok: false, error: { code: "AUTH_EXPIRED" } };
    },
    async claimOperation(input: PlannerOperationClaimInput, context: RefineItineraryAdapterContext) {
      if (!validPrincipal(context)) throw new Error("Authenticated planner operation required");
      let response: QueryResponse;
      try {
        response = await invokeRpc(shared.serviceClient, "claim_runtime_planner_operation", {
          p_actor_user_id: context.principal!.userId,
          p_operation_id: input.operationId,
          p_kind: input.kind,
          p_request_digest: input.requestDigest,
          p_target_plan_id: input.targetPlanId,
          p_base_revision: input.baseRevision,
        });
      } catch {
        return { ok: false as const, error: { code: "SERVICE_UNAVAILABLE" as const } };
      }
      if (response.error !== null) {
        if (isPlannerPlanNotFound(response.error)) {
          return { ok: false as const, error: { code: "PLAN_NOT_FOUND" as const } };
        }
        return { ok: false as const, error: { code: "SERVICE_UNAVAILABLE" as const } };
      }
      const decision = operationDecisionFromRpc(response);
      if (decision === null) return { ok: false as const, error: { code: "SERVICE_UNAVAILABLE" as const } };
      if (decision.state === "claimed") {
        shared.activeOperation = {
          operationId: input.operationId,
          requestDigest: input.requestDigest,
          kind: input.kind,
          leaseToken: decision.leaseToken,
          leaseExpiresAt: decision.leaseExpiresAt,
          planId: decision.planId,
          baseRevision: input.baseRevision,
          plannerReservationId: decision.plannerReservationId,
          geminiReservationId: decision.geminiReservationId,
        };
        shared.operationFailure = null;
      } else {
        shared.activeOperation = null;
        shared.operationFailure = null;
      }
      return decision;
    },
    async validateQuotaIdentity(): Promise<PlannerQuotaIdentityCheck> {
      const identity = await shared.quotaIdentity();
      return identity.ok
        ? { ok: true }
        : { ok: false, error: { code: identity.code } };
    },
    async reservePlannerQuota(reservationId: string, context: RefineItineraryAdapterContext): Promise<PlannerQuotaReservation> {
      const operation = operationForContext(context, "refine", shared.activeOperation);
      if (operation === null || reservationId !== operation.plannerReservationId) {
        return { ok: false, kind: "unavailable" };
      }
      const identity = await shared.quotaIdentity();
      if (!identity.ok) return { ok: false, kind: "unavailable" };
      return shared.reserveQuota("planner", identity.value, reservationId);
    },
    async rejectOperation(
      input: { operationId: string; requestDigest: string; leaseToken: string },
      errorCode: OperationRejectedCode,
      context: RefineItineraryAdapterContext,
    ) {
      if (!validPrincipal(context) || parseOperationRejectedCode(errorCode) === null) {
        throw new Error("Invalid planner operation rejection");
      }
      const response = await invokeRpc(shared.serviceClient, "reject_runtime_planner_operation", {
        p_actor_user_id: context.principal!.userId,
        p_operation_id: input.operationId,
        p_request_digest: input.requestDigest,
        p_lease_token: input.leaseToken,
        p_error_code: errorCode,
      });
      if (response.error !== null) throw new Error("Planner operation rejection unavailable");
      const decision = operationDecisionFromRpc(response);
      if (decision === null) throw new Error("Invalid planner operation rejection decision");
      shared.activeOperation = null;
      shared.operationFailure = null;
      return decision;
    },
    async readCommittedRevision(
      input: { planId: string; revision: number },
      context: RefineItineraryAdapterContext,
    ): Promise<PersistedPlannerRevision> {
      if (!validPrincipal(context) || !isUuid(input.planId) || !Number.isSafeInteger(input.revision) || input.revision < 1) {
        return { ok: false, error: { code: "SERVICE_UNAVAILABLE" } };
      }
      try {
        const response = await shared.userClient.from("trip_plan_revisions")
          .select("plan_id,revision_no,result_json,ranking_source")
          .eq("plan_id", input.planId)
          .eq("revision_no", input.revision)
          .limit(2);
        const row = oneRow(response);
        if (
          row === null
          || row.plan_id !== input.planId
          || row.revision_no !== input.revision
          || (row.ranking_source !== "ai" && row.ranking_source !== "deterministic")
        ) {
          return { ok: false, error: { code: "SERVICE_UNAVAILABLE" } };
        }
        const result = itineraryResultSchema.safeParse(row.result_json);
        if (!result.success || result.data.rankingSource !== row.ranking_source) {
          return { ok: false, error: { code: "SERVICE_UNAVAILABLE" } };
        }
        return {
          ok: true,
          planId: row.plan_id,
          revision: row.revision_no,
          rankingSource: row.ranking_source,
          result: result.data,
        };
      } catch {
        return { ok: false, error: { code: "SERVICE_UNAVAILABLE" } };
      }
    },
    readOperationFailure: () => shared.operationFailure,
    async prepareRefinement(input: RefineItineraryInput, context: RefineItineraryAdapterContext) {
      if (!validPrincipal(context) || context.guestCapability !== null) return refinementFailure("AUTH_REQUIRED");
      const operation = context.operation === undefined
        ? null
        : operationForContext(context, "refine", shared.activeOperation);
      if (context.operation !== undefined && operation === null) return refinementFailure("PLAN_UNAVAILABLE");
      let identity: QuotaIdentity | null = null;
      if (operation === null) {
        const identityResult = await shared.quotaIdentity();
        if (!identityResult.ok) return refinementFailure(identityResult.code);
        identity = identityResult.value;
      }

      let plan: Record<string, unknown> | null;
      try {
        plan = oneRow(await shared.userClient.from("trip_plans")
          .select("id,latest_revision_no")
          .eq("id", input.planId)
          .limit(2));
      } catch {
        return refinementFailure("PLAN_UNAVAILABLE");
      }
      if (plan === null) return refinementFailure("PLAN_NOT_FOUND");
      if (plan.id !== input.planId || !Number.isSafeInteger(plan.latest_revision_no)) {
        return refinementFailure("PLAN_UNAVAILABLE");
      }
      if (plan.latest_revision_no !== input.baseRevision) return refinementFailure("STALE_REVISION");

      let revision: Record<string, unknown> | null;
      try {
        revision = oneRow(await shared.userClient.from("trip_plan_revisions")
          .select(REVISION_COLUMNS)
          .eq("plan_id", input.planId)
          .eq("revision_no", input.baseRevision)
          .limit(2));
      } catch {
        return refinementFailure("PLAN_UNAVAILABLE");
      }
      if (
        revision === null
        || !isUuid(revision.id)
        || revision.plan_id !== input.planId
        || revision.revision_no !== input.baseRevision
        || typeof revision.fingerprint !== "string"
        || !/^[0-9a-f]{64}$/.test(revision.fingerprint)
      ) {
        return refinementFailure("SNAPSHOT_MISMATCH");
      }
      if (identity !== null) {
        const reserved = await shared.reserveQuota("planner", identity);
        if (!reserved.ok) {
          return refinementFailure(reserved.kind === "rejected" ? "QUOTA_EXCEEDED" : "PLAN_UNAVAILABLE");
        }
      }

      const parsedRequest = itineraryRequestSchema.safeParse(revision.request_json);
      const parsedResult = itineraryResultSchema.safeParse(revision.result_json);
      if (!parsedRequest.success || !parsedResult.success) return refinementFailure("SNAPSHOT_MISMATCH");
      const binding = await shared.historicalBinding(revision);
      if (binding === null) return refinementFailure("SNAPSHOT_MISMATCH");
      const reconstructed = await shared.loadEngineInput(parsedRequest.data, binding);
      if (!reconstructed.ok) return refinementFailure(recommendationCodeToRefinement(reconstructed.code));

      let itemRows: unknown[] | null;
      try {
        itemRows = responseRows(await shared.userClient.from("trip_plan_items")
          .select(PLAN_ITEM_COLUMNS)
          .eq("revision_id", revision.id)
          .order("position", { ascending: true }));
      } catch {
        itemRows = null;
      }
      if (itemRows === null) return refinementFailure("PLAN_UNAVAILABLE");
      const items = mapPreviousItems(itemRows, revision.id, parsedResult.data);
      if (items === null) return refinementFailure("SNAPSHOT_MISMATCH");
      const itemsById = new Map(items.map((item) => [item.itemId, item]));
      const lockedItems = [];
      for (const itemId of input.lockedItemIds) {
        const item = itemsById.get(itemId);
        if (item === undefined) return refinementFailure("LOCKED_ITEM_INVALID");
        lockedItems.push({
          itemId,
          placeId: item.placeId,
          position: item.position,
          startAt: item.startAt,
          endAt: item.endAt,
          visitDurationMinutes: item.visitDurationMinutes,
        });
      }

      const ranker: RefinementRanker | undefined = shared.ranker === undefined
        ? undefined
        : (rankRequest, signal) => shared.ranker!(rankRequest, signal);
      return {
        ok: true,
        planId: input.planId,
        currentRevision: input.baseRevision,
        normalizedDelta: { feedback: input.delta.feedback, scope: input.delta.scope },
        previousRevision: {
          planId: input.planId,
          revision: input.baseRevision,
          fingerprint: revision.fingerprint,
          catalogSnapshotId: binding.catalogSnapshotId,
          travelSnapshotId: binding.travelSnapshotId,
          fxSnapshotId: binding.fxSnapshotId,
          authoritativeInput: reconstructed.value,
          authoritativeResult: parsedResult.data,
          items,
          lockedItems,
        },
        ...(ranker === undefined ? {} : { ranker }),
      };
    },
    async commitRefinement(input, context) {
      if (!validPrincipal(context) || context.guestCapability !== null) return refinementFailure("AUTH_REQUIRED");
      const operation = operationForContext(context, "refine", shared.activeOperation);
      if (operation === null || operation.planId !== input.planId || operation.baseRevision !== input.baseRevision) {
        return refinementFailure("PLAN_UNAVAILABLE");
      }
      if (
        input.previousRevision.planId !== input.planId
        || input.previousRevision.revision !== input.baseRevision
      ) {
        return refinementFailure("SNAPSHOT_MISMATCH");
      }
      const parsedPrevious = parseEngineInput(input.previousRevision.authoritativeInput);
      if (!parsedPrevious.ok) return refinementFailure("SNAPSHOT_MISMATCH");
      const expectedLockedIds = input.previousRevision.lockedItems.map((item) => item.itemId);
      if (
        expectedLockedIds.length !== input.lockedItemIds.length
        || expectedLockedIds.some((itemId, index) => itemId !== input.lockedItemIds[index])
      ) {
        return refinementFailure("LOCKED_ITEM_INVALID");
      }
      const nextRevision = input.baseRevision + 1;
      const engineInput: EngineInput = {
        ...parsedPrevious.value,
        request: {
          ...parsedPrevious.value.request,
          lockedStopIds: input.previousRevision.lockedItems.map((item) => item.placeId),
        },
      };
      try {
        const fingerprint = await fingerprintRevisionBinding(
          input.planId,
          nextRevision,
          engineInput,
          input.result,
          shared.sha256,
        );
        const persistence = toPlanRevisionInsert(engineInput, input.result, fingerprint, nextRevision);
        if (!persistence.ok) return refinementFailure("SNAPSHOT_MISMATCH");
        const response = await invokeRpc(shared.serviceClient, "complete_runtime_refinement", {
          p_actor_user_id: context.principal!.userId,
          p_operation_id: operation.operationId,
          p_request_digest: operation.requestDigest,
          p_lease_token: operation.leaseToken,
          p_persistence_dto: persistence.value as unknown as Json,
        });
        if (response.error !== null) {
          shared.operationFailure = { kind: "ambiguous_commit" };
          return refinementFailure("SERVICE_UNAVAILABLE");
        }
        const decision = operationDecisionFromRpc(response);
        if (decision === null) {
          shared.operationFailure = { kind: "ambiguous_commit" };
          return refinementFailure("SERVICE_UNAVAILABLE");
        }
        if (decision.state === "completed") {
          return decision.planId === operation.planId && decision.revision === nextRevision
            ? { ok: true, revision: nextRevision }
            : refinementFailure("PLAN_UNAVAILABLE");
        }
        return { ok: false, decision };
      } catch {
        shared.operationFailure = { kind: "ambiguous_commit" };
        return refinementFailure("SERVICE_UNAVAILABLE");
      }
    },
  };
}
