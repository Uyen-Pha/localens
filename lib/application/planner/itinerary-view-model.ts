import {
  ItineraryResultSchema,
  type ItineraryResult,
  type Locale,
} from "@/lib/domain/itinerary/contracts";
import type {
  RuntimePlannerFoodItem,
  RuntimePlannerItem,
  RuntimePlannerMessageKey,
  RuntimePlannerProposal,
  RuntimePlannerSnapshotIds,
} from "@/lib/application/planner/runtime-planner";

export interface RuntimePlannerDisplayRow {
  readonly snapshotId: string;
  readonly placeId: string;
  readonly locale: Locale;
  readonly title: string;
  readonly summary: string;
  readonly food: readonly RuntimePlannerFoodDisplayRow[];
}

export interface RuntimePlannerFoodDisplayRow {
  readonly vendorId: string;
  readonly title: string;
  readonly items: readonly RuntimePlannerFoodItemDisplayRow[];
}

export interface RuntimePlannerFoodItemDisplayRow {
  readonly itemId: string;
  readonly title: string;
}

export interface RuntimePlannerResponse {
  readonly advisoryOnly: true;
  readonly degraded: boolean;
  readonly messageKey?: RuntimePlannerMessageKey;
  readonly planId: string;
  readonly proposal: ItineraryResult;
  readonly rationales: Readonly<Record<string, string>>;
  readonly revision: number;
  readonly baseRevision?: number;
  readonly regeneration?: "partial" | "full";
}

const RESPONSE_KEYS = new Set([
  "advisoryOnly",
  "degraded",
  "messageKey",
  "planId",
  "proposal",
  "rationales",
  "revision",
  "baseRevision",
  "regeneration",
]);
const MESSAGE_KEYS = new Set<RuntimePlannerMessageKey>([
  "itinerary.ai_unavailable",
  "itinerary.ai_invalid",
  "itinerary.ai_aborted",
]);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 160
    && value.trim() === value
    && !CONTROL_CHARACTER_PATTERN.test(value);
}

function isText(value: unknown, maxLength = 2_000): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && value.trim() === value
    && !CONTROL_CHARACTER_PATTERN.test(value);
}

function isSafeMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647;
}

function isDenseArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
    && Object.keys(value).every((key) => /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < value.length);
}

function hasExactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function mapDisplayRows(
  displayRows: unknown,
  snapshotIds: RuntimePlannerSnapshotIds,
  locale: Locale,
  itemPlaceIds: readonly string[],
): Map<string, RuntimePlannerDisplayRow> | null {
  if (!isDenseArray(displayRows) || displayRows.length !== itemPlaceIds.length) return null;

  const expectedPlaceIds = new Set(itemPlaceIds);
  if (expectedPlaceIds.size !== itemPlaceIds.length) return null;

  const rowsByPlace = new Map<string, RuntimePlannerDisplayRow>();
  for (const row of displayRows) {
    if (!isRecord(row) || !hasExactKeys(row, new Set(["snapshotId", "placeId", "locale", "title", "summary", "food"]))) return null;
    if (
      row.snapshotId !== snapshotIds.catalog
      || !isIdentifier(row.placeId)
      || row.locale !== locale
      || !isText(row.title)
      || !isText(row.summary)
      || !expectedPlaceIds.has(row.placeId)
      || rowsByPlace.has(row.placeId)
      || !isDenseArray(row.food)
    ) return null;

    const vendors = new Set<string>();
    const food: RuntimePlannerFoodDisplayRow[] = [];
    for (const vendor of row.food) {
      if (!isRecord(vendor) || !hasExactKeys(vendor, new Set(["vendorId", "title", "items"]))) return null;
      if (!isIdentifier(vendor.vendorId) || !isText(vendor.title) || vendors.has(vendor.vendorId) || !isDenseArray(vendor.items)) return null;
      vendors.add(vendor.vendorId);

      const itemIds = new Set<string>();
      const items: RuntimePlannerFoodItemDisplayRow[] = [];
      for (const item of vendor.items) {
        if (!isRecord(item) || !hasExactKeys(item, new Set(["itemId", "title"]))) return null;
        if (!isIdentifier(item.itemId) || !isText(item.title) || itemIds.has(item.itemId)) return null;
        itemIds.add(item.itemId);
        items.push({ itemId: item.itemId, title: item.title });
      }
      food.push({ vendorId: vendor.vendorId, title: vendor.title, items });
    }

    rowsByPlace.set(row.placeId, {
      snapshotId: row.snapshotId,
      placeId: row.placeId,
      locale,
      title: row.title,
      summary: row.summary,
      food,
    });
  }

  return rowsByPlace.size === expectedPlaceIds.size ? rowsByPlace : null;
}

function mapRationales(value: unknown, itemPlaceIds: readonly string[]): Readonly<Record<string, string>> | null {
  if (!isRecord(value)) return null;
  const allowedPlaceIds = new Set(itemPlaceIds);
  const rationales: Record<string, string> = {};
  for (const [placeId, rationale] of Object.entries(value)) {
    if (!allowedPlaceIds.has(placeId) || !isText(rationale)) return null;
    rationales[placeId] = rationale;
  }
  return rationales;
}

function mapFood(
  item: ItineraryResult["items"][number],
  row: RuntimePlannerDisplayRow,
): RuntimePlannerFoodItem | null | undefined {
  if (item.foodSelection === null) return null;
  const selection = item.foodSelection;
  const vendor = row.food.find((candidate) => candidate.vendorId === selection.vendorId);
  const menuItem = vendor?.items.find((candidate) => candidate.itemId === selection.menuItemId);
  if (vendor === undefined || menuItem === undefined) return undefined;
  if (
    !isSafeMoney(item.foodCostMinVnd)
    || !isSafeMoney(item.foodCostMaxVnd)
    || !isSafeMoney(item.payAtVendorMinVnd)
    || !isSafeMoney(item.payAtVendorMaxVnd)
  ) return undefined;
  return {
    vendorId: vendor.vendorId,
    vendorTitle: vendor.title,
    itemId: menuItem.itemId,
    itemTitle: menuItem.title,
    quantity: selection.quantity,
    activity: selection.activity,
    foodCostMinVnd: item.foodCostMinVnd,
    foodCostMaxVnd: item.foodCostMaxVnd,
    payAtVendorMinVnd: item.payAtVendorMinVnd,
    payAtVendorMaxVnd: item.payAtVendorMaxVnd,
  };
}

/**
 * Converts an untrusted Edge response and an exact localized catalog projection
 * into UI data. Any mismatch returns null so callers can map it to a stable
 * runtime failure without inventing labels or accepting stale catalog facts.
 */
export function toRuntimePlannerProposal(
  response: unknown,
  displayRows: unknown,
  locale: Locale,
): RuntimePlannerProposal | null {
  if ((locale !== "en" && locale !== "vi") || !isRecord(response) || !hasExactKeys(response, RESPONSE_KEYS)) return null;
  if (response.advisoryOnly !== true || typeof response.degraded !== "boolean" || !isIdentifier(response.planId) || !isPositiveRevision(response.revision)) return null;
  if (response.messageKey !== undefined && (typeof response.messageKey !== "string" || !MESSAGE_KEYS.has(response.messageKey as RuntimePlannerMessageKey))) return null;
  if ((response.baseRevision === undefined) !== (response.regeneration === undefined)) return null;
  if (response.baseRevision !== undefined && (!isPositiveRevision(response.baseRevision) || (response.regeneration !== "partial" && response.regeneration !== "full"))) return null;

  const proposal = ItineraryResultSchema.safeParse(response.proposal);
  if (!proposal.success || !isSafeMoney(proposal.data.budgetVnd)) return null;
  const snapshotIds: RuntimePlannerSnapshotIds = proposal.data.snapshotIds;
  if (!isIdentifier(snapshotIds.catalog) || !isIdentifier(snapshotIds.travel) || (snapshotIds.fx !== null && !isIdentifier(snapshotIds.fx))) return null;

  const placeIds = proposal.data.items.map((item) => item.placeId);
  const rowsByPlace = mapDisplayRows(displayRows, snapshotIds, locale, placeIds);
  const rationales = mapRationales(response.rationales, placeIds);
  if (rowsByPlace === null || rationales === null) return null;

  const items: RuntimePlannerItem[] = [];
  for (const item of proposal.data.items) {
    const row = rowsByPlace.get(item.placeId);
    if (row === undefined || !isSafeMoney(item.placeCostVnd) || !isSafeMoney(item.travelCostVndBefore) || !isSafeMoney(item.customerPayableVnd)) return null;
    const food = mapFood(item, row);
    if (food === undefined) return null;
    items.push({
      placeId: item.placeId,
      title: row.title,
      summary: row.summary,
      startAt: item.startAt,
      endAt: item.endAt,
      visitDurationMinutes: item.visitDurationMinutes,
      travelMinutesBefore: item.travelMinutesBefore,
      transitionBufferMinutesBefore: item.transitionBufferMinutesBefore,
      admissionCostVnd: item.placeCostVnd,
      travelCostVnd: item.travelCostVndBefore,
      food,
      customerPayableVnd: item.customerPayableVnd,
      score: item.score,
      rationale: rationales[item.placeId] ?? null,
    });
  }

  return {
    planId: response.planId,
    revision: response.revision,
    source: proposal.data.rankingSource,
    degraded: response.degraded,
    ...(response.messageKey === undefined ? {} : { messageKey: response.messageKey as RuntimePlannerMessageKey }),
    normalizedStartAt: proposal.data.normalizedStartAt,
    rationales,
    items,
    totals: proposal.data.totals,
    budgetVnd: proposal.data.budgetVnd,
    snapshotIds,
  };
}
