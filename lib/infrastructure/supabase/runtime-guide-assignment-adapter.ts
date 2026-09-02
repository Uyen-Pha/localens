import {
  RuntimeGuideAssignmentError,
  parseAdminGuideAssignmentQueueItem,
  parseEligibleGuideCandidate,
  parseGuideAssignmentInput,
  parseGuideAssignmentResult,
  parseGuideOwnAssignment,
  type RuntimeGuideAssignmentErrorCode,
  type RuntimeGuideAssignmentPort,
} from "@/lib/application/guide-assignment/contracts";
import type { DataAdapterError, Result } from "@/lib/domain/data/contracts";

type RpcName =
  | "get_admin_guide_assignment_queue"
  | "get_admin_eligible_guides"
  | "assign_fixed_departure_guide"
  | "get_guide_assigned_bookings";
type RpcArgs = Record<string, string>;
type RpcResponse = { data: unknown; error: unknown };

export interface RuntimeGuideAssignmentSupabaseClient {
  auth: {
    getSession(): PromiseLike<{ data: { session: unknown | null }; error: unknown }>;
  };
  rpc(name: RpcName, args?: RpcArgs): PromiseLike<RpcResponse>;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(code: RuntimeGuideAssignmentErrorCode): never {
  throw new RuntimeGuideAssignmentError(code);
}

function databaseCode(error: unknown): string {
  return isRecord(error) && typeof error.code === "string" ? error.code : "";
}

function databaseMessage(error: unknown): string {
  return isRecord(error) && typeof error.message === "string" ? error.message.toLowerCase() : "";
}

function mapServiceError(error: unknown): RuntimeGuideAssignmentError {
  const code = databaseCode(error);
  const message = databaseMessage(error);
  if (code === "22023") return new RuntimeGuideAssignmentError("INVALID_INPUT");
  if (code === "42501") return new RuntimeGuideAssignmentError("FORBIDDEN");
  if (code === "PGRST301" || code === "PGRST302") {
    return new RuntimeGuideAssignmentError("UNAUTHENTICATED");
  }
  if (code === "P0001") {
    if (message.includes("guide_assignment_idempotency_conflict")) {
      return new RuntimeGuideAssignmentError("IDEMPOTENCY_CONFLICT");
    }
    if (message.includes("guide_assignment_schedule_conflict")) {
      return new RuntimeGuideAssignmentError("SCHEDULE_CONFLICT");
    }
    if (message.includes("guide_assignment_not_found")) {
      return new RuntimeGuideAssignmentError("NOT_FOUND");
    }
    if (message.includes("guide_assignment_state_conflict")) {
      return new RuntimeGuideAssignmentError("CONFLICT");
    }
  }
  return new RuntimeGuideAssignmentError("SERVICE_UNAVAILABLE");
}

async function requireSession(client: RuntimeGuideAssignmentSupabaseClient): Promise<void> {
  try {
    const response = await client.auth.getSession();
    if (response.error !== null || response.data.session === null) fail("UNAUTHENTICATED");
  } catch (error) {
    if (error instanceof RuntimeGuideAssignmentError) throw error;
    fail("SERVICE_UNAVAILABLE");
  }
}

async function responseData(operation: PromiseLike<RpcResponse>): Promise<unknown> {
  try {
    const response = await operation;
    if (response.error !== null) throw mapServiceError(response.error);
    return response.data;
  } catch (error) {
    if (error instanceof RuntimeGuideAssignmentError) throw error;
    throw mapServiceError(error);
  }
}

function rows(value: unknown): unknown[] {
  if (!Array.isArray(value)) fail("INVALID_RESPONSE");
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) fail("INVALID_RESPONSE");
  }
  if (Object.keys(value).some((key) => !/^(?:0|[1-9]\d*)$/.test(key))) {
    fail("INVALID_RESPONSE");
  }
  return value;
}

function mappedRows<T>(
  value: unknown,
  parser: (row: unknown) => Result<T, DataAdapterError>,
): T[] {
  return rows(value).map((row) => {
    const parsed = parser(row);
    if (!parsed.ok) fail("INVALID_RESPONSE");
    return parsed.value;
  });
}

export function createSupabaseRuntimeGuideAssignmentAdapter(
  client: RuntimeGuideAssignmentSupabaseClient,
): RuntimeGuideAssignmentPort {
  return {
    async listAdminQueue() {
      await requireSession(client);
      const data = await responseData(client.rpc("get_admin_guide_assignment_queue"));
      return mappedRows(data, parseAdminGuideAssignmentQueueItem);
    },

    async listEligibleGuides() {
      await requireSession(client);
      const data = await responseData(client.rpc("get_admin_eligible_guides"));
      return mappedRows(data, parseEligibleGuideCandidate);
    },

    async assignGuide(rawInput) {
      const input = parseGuideAssignmentInput(rawInput);
      if (!input.ok) fail("INVALID_INPUT");
      await requireSession(client);
      const data = await responseData(client.rpc("assign_fixed_departure_guide", {
        booking_id: input.value.bookingId,
        guide_user_id: input.value.guideUserId,
        idempotency_key: input.value.idempotencyKey,
      }));
      const resultRows = rows(data);
      if (resultRows.length !== 1) fail("INVALID_RESPONSE");
      const result = parseGuideAssignmentResult(resultRows[0]);
      if (!result.ok) fail("INVALID_RESPONSE");
      return result.value;
    },

    async listOwnAssignments() {
      await requireSession(client);
      const data = await responseData(client.rpc("get_guide_assigned_bookings"));
      return mappedRows(data, parseGuideOwnAssignment);
    },
  };
}
