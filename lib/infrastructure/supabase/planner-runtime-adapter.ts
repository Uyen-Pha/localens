import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  RuntimePlannerError,
  RuntimePlannerErrorCode,
  RuntimePlannerErrorStatus,
  RuntimePlannerOperation,
  RuntimePlannerPort,
  RuntimePlannerProposal,
  RuntimeRefinementRequest,
} from "@/lib/application/planner/runtime-planner";
import { isRuntimePlannerErrorContract } from "@/lib/application/planner/runtime-planner";
import {
  toRuntimePlannerProposal,
  type RuntimePlannerDisplayRow,
  type RuntimePlannerResponse,
} from "@/lib/application/planner/itinerary-view-model";
import { PERSONALIZATION_AREA_SLUG_PATTERN } from "@/lib/application/planner/personalization-areas";
import { ItineraryResultSchema, type ItineraryRequest, type Locale, type Result } from "@/lib/domain/itinerary/contracts";
import type { Database } from "@/lib/infrastructure/supabase/database.types";
import { serializeItineraryWireResponse } from "@/supabase/functions/_shared/itinerary-wire-response";

type PlannerSupabaseClient = Pick<SupabaseClient<Database>, "auth" | "from" | "functions" | "rpc">;
type UnknownRecord = Record<string, unknown>;
type AuthenticatedCustomer = Readonly<{ userId: string; accessToken: string }>;

const DEVICE_STORAGE_KEY = "localens.ai-device.v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FALLBACK_CORRELATION_ID = "00000000-0000-4000-8000-000000000000";
const DISPLAY_COLUMNS = "snapshot_id,place_id,locale,title,summary";
const FOOD_VENDOR_COLUMNS = "snapshot_id,place_id,vendor_id,title";
const FOOD_ITEM_COLUMNS = "snapshot_id,place_id,vendor_id,item_id,title";

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function denseArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
    && Object.keys(value).every((key) => /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < value.length);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function isAccessToken(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 8192
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function plannerOperationId(operation: RuntimePlannerOperation): string | null {
  return isRecord(operation) && typeof operation.operationId === "string" && CANONICAL_UUID_PATTERN.test(operation.operationId)
    ? operation.operationId
    : null;
}

const LOCAL_FAILURE_DEFINITIONS = {
  AUTH_REQUIRED: { status: 401, messageKey: "planner.auth_required", retryable: false },
  AUTH_EXPIRED: { status: 401, messageKey: "planner.auth_expired", retryable: false },
  INVALID_REQUEST: { status: 400, messageKey: "planner.invalid_request", retryable: false },
  PLAN_NOT_FOUND: { status: 404, messageKey: "refinement.plan_not_found", retryable: false },
  SERVICE_UNAVAILABLE: { status: 503, messageKey: "planner.service_unavailable", retryable: true },
} as const satisfies Readonly<Record<
  Extract<RuntimePlannerErrorCode, "AUTH_REQUIRED" | "AUTH_EXPIRED" | "INVALID_REQUEST" | "PLAN_NOT_FOUND" | "SERVICE_UNAVAILABLE">,
  { status: RuntimePlannerErrorStatus; messageKey: string; retryable: boolean }
>>;

type LocalFailureCode = keyof typeof LOCAL_FAILURE_DEFINITIONS;

function failure(
  code: LocalFailureCode = "SERVICE_UNAVAILABLE",
  correlationId = FALLBACK_CORRELATION_ID,
): Result<never, RuntimePlannerError> {
  const definition = LOCAL_FAILURE_DEFINITIONS[code];
  return {
    ok: false,
    error: {
      code,
      status: definition.status,
      messageKey: definition.messageKey,
      retryable: definition.retryable,
      correlationId,
    },
  };
}

function responseCorrelation(value: unknown): string {
  if (!isRecord(value) || !isUuid(value.correlationId)) return FALLBACK_CORRELATION_ID;
  return value.correlationId;
}

type GatewayErrorEnvelope = {
  code: RuntimePlannerErrorCode;
  status: RuntimePlannerErrorStatus;
  messageKey: string;
  retryable: boolean;
  correlationId: string;
  operationState?: RuntimePlannerError["operationState"];
};

type ResponseContext = {
  status: number;
  clone(): unknown;
};

const PERSONALIZATION_AREA_SLUGS: Readonly<Record<string, string>> = {
  "demo-hcmc-district-1": "central-historical",
  "demo-hcmc-district-3": "district-3-cultural",
  "demo-hcmc-district-5": "district-5-chinatown",
  "demo-hcmc-thu-duc": "outer-hcmc",
};

function parseGatewayErrorEnvelope(value: unknown, status: number): GatewayErrorEnvelope | null {
  if (!isRecord(value) || !isUuid(value.correlationId)) return null;
  const hasOperationState = Object.prototype.hasOwnProperty.call(value, "operationState");
  const expectedKeys = hasOperationState
    ? ["code", "messageKey", "retryable", "operationState", "correlationId"]
    : ["code", "messageKey", "retryable", "correlationId"];
  if (!isExactKeys(value, expectedKeys)) return null;
  const candidate = {
    code: value.code,
    status,
    messageKey: value.messageKey,
    retryable: value.retryable,
    ...(hasOperationState ? { operationState: value.operationState } : {}),
  };
  if (!isRuntimePlannerErrorContract(candidate)) return null;
  return {
    ...candidate,
    correlationId: value.correlationId,
  };
}

function responseContext(error: unknown): ResponseContext | null {
  if (!isRecord(error) || !isRecord(error.context) || typeof error.context.status !== "number" || !Number.isInteger(error.context.status) || typeof error.context.clone !== "function") return null;
  return error.context as unknown as ResponseContext;
}

async function parseFunctionsHttpError(error: unknown): Promise<{ status: number; envelope: GatewayErrorEnvelope | null } | null> {
  const context = responseContext(error);
  if (context === null) return null;
  try {
    const clone = context.clone();
    if (!isRecord(clone) || typeof clone.json !== "function") return { status: context.status, envelope: null };
    return { status: context.status, envelope: parseGatewayErrorEnvelope(await clone.json(), context.status) };
  } catch {
    return { status: context.status, envelope: null };
  }
}

function deviceId(): string | null {
  try {
    const existing = window.sessionStorage.getItem(DEVICE_STORAGE_KEY);
    if (existing !== null && UUID_PATTERN.test(existing)) return existing;
    const generated = globalThis.crypto.randomUUID();
    if (!UUID_PATTERN.test(generated)) return null;
    window.sessionStorage.setItem(DEVICE_STORAGE_KEY, generated);
    return generated;
  } catch {
    return null;
  }
}

function localize(value: unknown, locale: Locale): string | null {
  if (!isRecord(value) || !isIdentifier(value[locale])) return null;
  return value[locale];
}

function isExactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function responseProjection(value: unknown): { catalogId: string; placeIds: string[]; food: Array<{ vendorId: string; itemId: string }> } | null {
  if (!isRecord(value) || !isRecord(value.proposal) || !isRecord(value.proposal.snapshotIds) || !isUuid(value.proposal.snapshotIds.catalog) || !denseArray(value.proposal.items)) return null;
  const placeIds: string[] = [];
  const food: Array<{ vendorId: string; itemId: string }> = [];
  for (const item of value.proposal.items) {
    if (!isRecord(item) || !isIdentifier(item.placeId) || placeIds.includes(item.placeId)) return null;
    placeIds.push(item.placeId);
    if (item.foodSelection === null) continue;
    if (!isRecord(item.foodSelection) || !isIdentifier(item.foodSelection.vendorId) || !isIdentifier(item.foodSelection.menuItemId)) return null;
    food.push({ vendorId: item.foodSelection.vendorId, itemId: item.foodSelection.menuItemId });
  }
  return placeIds.length > 0 ? { catalogId: value.proposal.snapshotIds.catalog, placeIds, food } : null;
}

async function readRows(operation: PromiseLike<{ data: unknown; error: unknown }>): Promise<unknown[] | null> {
  try {
    const response = await operation;
    return response.error === null && denseArray(response.data) ? response.data : null;
  } catch {
    return null;
  }
}

type OwnerPlanRevisionRead =
  | { kind: "found"; row: unknown }
  | { kind: "missing" }
  | { kind: "auth_expired" }
  | { kind: "unavailable" };

function readHttpStatus(value: unknown): number | null {
  if (!isRecord(value)) return null;
  if (typeof value.status === "number" && Number.isInteger(value.status)) return value.status;
  if (isRecord(value.context) && typeof value.context.status === "number" && Number.isInteger(value.context.status)) {
    return value.context.status;
  }
  return null;
}

async function readOwnerPlanRevision(
  operation: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<OwnerPlanRevisionRead> {
  try {
    const response = await operation;
    if (response.error !== null) {
      const status = readHttpStatus(response.error) ?? readHttpStatus(response);
      if (status === 401) return { kind: "auth_expired" };
      if (status === 403 || status === 404) return { kind: "missing" };
      return { kind: "unavailable" };
    }
    if (!denseArray(response.data)) return { kind: "unavailable" };
    if (response.data.length === 0) return { kind: "missing" };
    return response.data.length === 1
      ? { kind: "found", row: response.data[0] }
      : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

async function canonicalizeAreas(client: PlannerSupabaseClient, request: ItineraryRequest): Promise<ItineraryRequest | null> {
  const current = await readRows(client.from("current_itinerary_snapshot_v").select("catalog_snapshot_id"));
  const snapshot = current?.length === 1 && isRecord(current[0]) ? current[0] : null;
  const snapshotId = snapshot?.catalog_snapshot_id;
  if (snapshot === null || !isExactKeys(snapshot, ["catalog_snapshot_id"]) || !isUuid(snapshotId)) return null;
  const requestedSlugs = request.areas.map((area) => PERSONALIZATION_AREA_SLUGS[area] ?? area);
  if (!requestedSlugs.every((slug) => PERSONALIZATION_AREA_SLUG_PATTERN.test(slug))) return null;
  const rows = await readRows(
    client.from("catalog_snapshot_areas_v").select("snapshot_id,area_id,slug")
      .eq("snapshot_id", snapshotId).in("slug", requestedSlugs),
  );
  if (rows === null || rows.length !== requestedSlugs.length) return null;
  const areas = new Map<string, string>();
  for (const row of rows) {
    if (!isRecord(row) || !isExactKeys(row, ["snapshot_id", "area_id", "slug"]) || row.snapshot_id !== snapshotId || !isUuid(row.area_id) || !isIdentifier(row.slug) || !requestedSlugs.includes(row.slug) || areas.has(row.slug)) return null;
    areas.set(row.slug, row.area_id);
  }
  const canonical = requestedSlugs.map((slug) => areas.get(slug));
  return canonical.every((area): area is string => area !== undefined)
    ? { ...request, areas: canonical }
    : null;
}

async function loadDisplayRows(
  client: PlannerSupabaseClient,
  response: unknown,
  locale: Locale,
): Promise<RuntimePlannerDisplayRow[] | null> {
  const projection = responseProjection(response);
  if (projection === null) return null;
  const display = await readRows(
    client.from("catalog_snapshot_place_display_v").select(DISPLAY_COLUMNS)
      .eq("snapshot_id", projection.catalogId).eq("locale", locale).in("place_id", projection.placeIds),
  );
  if (display === null) return null;

  const foodByPlace = new Map<string, Array<{
    vendorId: string;
    title: string;
    items: Array<{ itemId: string; title: string }>;
  }>>();
  if (projection.food.length > 0) {
    const vendors = await readRows(
      client.from("catalog_snapshot_food_vendors_v").select(FOOD_VENDOR_COLUMNS)
        .eq("snapshot_id", projection.catalogId).in("place_id", projection.placeIds),
    );
    const items = await readRows(
      client.from("catalog_snapshot_food_items_v").select(FOOD_ITEM_COLUMNS)
        .eq("snapshot_id", projection.catalogId).in("place_id", projection.placeIds),
    );
    if (vendors === null || items === null) return null;
    const vendorsByKey = new Map<string, { placeId: string; vendorId: string; title: string; items: Array<{ itemId: string; title: string }> }>();
    for (const vendor of vendors) {
      if (!isRecord(vendor) || !isExactKeys(vendor, ["snapshot_id", "place_id", "vendor_id", "title"]) || vendor.snapshot_id !== projection.catalogId || !isIdentifier(vendor.place_id) || !isIdentifier(vendor.vendor_id)) return null;
      const title = localize(vendor.title, locale);
      const key = `${vendor.place_id}\u0000${vendor.vendor_id}`;
      if (title === null || vendorsByKey.has(key)) return null;
      vendorsByKey.set(key, { placeId: vendor.place_id, vendorId: vendor.vendor_id, title, items: [] });
    }
    for (const item of items) {
      if (!isRecord(item) || !isExactKeys(item, ["snapshot_id", "place_id", "vendor_id", "item_id", "title"]) || item.snapshot_id !== projection.catalogId || !isIdentifier(item.place_id) || !isIdentifier(item.vendor_id) || !isIdentifier(item.item_id)) return null;
      const parent = vendorsByKey.get(`${item.place_id}\u0000${item.vendor_id}`);
      const title = localize(item.title, locale);
      if (parent === undefined || title === null || parent.items.some((candidate) => candidate.itemId === item.item_id)) return null;
      parent.items.push({ itemId: item.item_id, title });
    }
    for (const vendor of vendorsByKey.values()) {
      const current = foodByPlace.get(vendor.placeId) ?? [];
      current.push({ vendorId: vendor.vendorId, title: vendor.title, items: vendor.items });
      foodByPlace.set(vendor.placeId, current);
    }
  }

  const rows: RuntimePlannerDisplayRow[] = [];
  for (const row of display) {
    if (!isRecord(row) || !isExactKeys(row, ["snapshot_id", "place_id", "locale", "title", "summary"]) || row.snapshot_id !== projection.catalogId || row.locale !== locale || !isIdentifier(row.place_id) || !isIdentifier(row.title) || !isIdentifier(row.summary)) return null;
    rows.push({ snapshotId: row.snapshot_id, placeId: row.place_id, locale, title: row.title, summary: row.summary, food: foodByPlace.get(row.place_id) ?? [] });
  }
  return rows;
}

function persistedResponse(row: unknown, planId: string): RuntimePlannerResponse | null {
  if (!isRecord(row) || !isExactKeys(row, ["plan_id", "revision_no", "result_json", "ranking_source"]) || row.plan_id !== planId || row.ranking_source !== "ai" && row.ranking_source !== "deterministic") return null;
  const revision = row.revision_no;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) return null;
  const result = ItineraryResultSchema.safeParse(row.result_json);
  if (!result.success) return null;
  return {
    advisoryOnly: true,
    degraded: row.ranking_source === "deterministic",
    planId,
    revision,
    proposal: serializeItineraryWireResponse(result.data),
    rationales: {},
  };
}

export function createSupabasePlannerRuntimeAdapter(client: PlannerSupabaseClient): RuntimePlannerPort {
  let observedUserId: string | null | undefined;
  let authGeneration = 0;

  function observeUser(userId: string | null): void {
    if (observedUserId === undefined) {
      observedUserId = userId;
      return;
    }
    if (observedUserId !== userId) {
      observedUserId = userId;
      authGeneration += 1;
    }
  }

  async function authenticatedCustomer(): Promise<AuthenticatedCustomer | null> {
    try {
      const session = await client.auth.getSession();
      if (
        session.error !== null
        || session.data.session === null
        || !isUuid(session.data.session.user.id)
        || !isAccessToken(session.data.session.access_token)
      ) return null;
      const identity = await client.rpc("get_portal_identity");
      const row = denseArray(identity.data) && identity.data.length === 1 && isRecord(identity.data[0])
        ? identity.data[0]
        : null;
      if (identity.error !== null || row === null || !isExactKeys(row, ["user_id", "display_name", "role", "language"]) || row.user_id !== session.data.session.user.id || !isIdentifier(row.display_name) || row.role !== "customer" || row.language !== "en" && row.language !== "vi") return null;
      observeUser(session.data.session.user.id);
      return {
        userId: session.data.session.user.id,
        accessToken: session.data.session.access_token,
      };
    } catch {
      return null;
    }
  }

  async function getSession(): Promise<{ userId: string; role: "customer" } | null> {
    const session = await authenticatedCustomer();
    return session === null ? null : { userId: session.userId, role: "customer" };
  }

  async function mapProposal(response: unknown, locale: Locale): Promise<Result<RuntimePlannerProposal, RuntimePlannerError>> {
    const displayRows = await loadDisplayRows(client, response, locale);
    const proposal = displayRows === null ? null : toRuntimePlannerProposal(response, displayRows, locale);
    return proposal === null ? failure("SERVICE_UNAVAILABLE", responseCorrelation(response)) : { ok: true, value: proposal };
  }

  async function invoke(
    functionName: "recommend-itinerary" | "refine-itinerary",
    body: Record<string, unknown>,
    locale: Locale,
    session: AuthenticatedCustomer,
    expectedAuthGeneration: number,
  ): Promise<Result<RuntimePlannerProposal, RuntimePlannerError>> {
    if (authGeneration !== expectedAuthGeneration) return failure("AUTH_EXPIRED");
    const id = deviceId();
    if (id === null) return failure();
    try {
      const response = await client.functions.invoke(functionName, {
        body,
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "x-localens-device-id": id,
        },
      });
      if (response.error !== null) {
        const httpError = await parseFunctionsHttpError(response.error);
        if (httpError !== null && httpError.envelope !== null) {
          return { ok: false, error: httpError.envelope };
        }
        if (httpError !== null) return failure("SERVICE_UNAVAILABLE");
        return failure("SERVICE_UNAVAILABLE");
      }
      return mapProposal(response.data, locale);
    } catch {
      return failure("SERVICE_UNAVAILABLE");
    }
  }

  return {
    getSession,
    subscribeSession(listener) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
          const initialUserId = session !== null && isUuid(session.user.id) ? session.user.id : null;
          observeUser(initialUserId);
          return;
        }
        if (
          event !== "SIGNED_IN"
          && event !== "SIGNED_OUT"
          && event !== "USER_UPDATED"
          && event !== "PASSWORD_RECOVERY"
        ) return;

        const nextUserId = event === "SIGNED_OUT"
          ? null
          : session !== null && isUuid(session.user.id)
            ? session.user.id
            : null;
        const previousUserId = observedUserId;
        observeUser(nextUserId);
        if (previousUserId !== nextUserId) listener(nextUserId);
      });
      return () => data.subscription.unsubscribe();
    },
    async recommend(request, locale, operation) {
      const operationId = plannerOperationId(operation);
      if (operationId === null || locale !== "en" && locale !== "vi") return failure("INVALID_REQUEST");
      const expectedAuthGeneration = authGeneration;
      const session = await authenticatedCustomer();
      if (session === null) return failure("AUTH_REQUIRED");
      if (authGeneration !== expectedAuthGeneration) return failure("AUTH_EXPIRED");
      const canonical = await canonicalizeAreas(client, request);
      if (authGeneration !== expectedAuthGeneration) return failure("AUTH_EXPIRED");
      return canonical === null
        ? failure("INVALID_REQUEST")
        : invoke("recommend-itinerary", { operationId, input: canonical }, locale, session, expectedAuthGeneration);
    },
    async refine(input: RuntimeRefinementRequest, locale, operation) {
      const operationId = plannerOperationId(operation);
      if (operationId === null || locale !== "en" && locale !== "vi") return failure("INVALID_REQUEST");
      const expectedAuthGeneration = authGeneration;
      const session = await authenticatedCustomer();
      if (session === null) return failure("AUTH_REQUIRED");
      if (authGeneration !== expectedAuthGeneration) return failure("AUTH_EXPIRED");
      return invoke("refine-itinerary", {
        operationId,
        planId: input.planId,
        baseRevision: input.baseRevision,
        delta: { feedback: input.delta.feedback, scope: input.delta.scope },
        lockedItemIds: [...input.lockedItemIds],
      }, locale, session, expectedAuthGeneration);
    },
    async getPlan(planId, locale) {
      if (locale !== "en" && locale !== "vi" || !isUuid(planId)) return failure("INVALID_REQUEST");
      if (await getSession() === null) return failure("AUTH_REQUIRED");
      const revision = await readOwnerPlanRevision(
        client.from("trip_plan_revisions").select("plan_id,revision_no,result_json,ranking_source")
          .eq("plan_id", planId).order("revision_no", { ascending: false }).limit(1),
      );
      if (revision.kind === "missing") return failure("PLAN_NOT_FOUND");
      if (revision.kind === "auth_expired") return failure("AUTH_EXPIRED");
      if (revision.kind === "unavailable") return failure("SERVICE_UNAVAILABLE");
      const response = persistedResponse(revision.row, planId);
      return response === null ? failure() : mapProposal(response, locale);
    },
  };
}
