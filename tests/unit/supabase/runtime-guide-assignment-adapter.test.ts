import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RuntimeGuideAssignmentError,
} from "@/lib/application/guide-assignment/contracts";
import {
  createSupabaseRuntimeGuideAssignmentAdapter,
} from "@/lib/infrastructure/supabase/runtime-guide-assignment-adapter";

const ids = {
  assignment: "00000000-0000-0000-0000-000000000401",
  booking: "00000000-0000-0000-0000-000000000402",
  departure: "00000000-0000-0000-0000-000000000403",
  guide: "00000000-0000-0000-0000-000000000404",
  version: "00000000-0000-0000-0000-000000000405",
};

function queueRow(overrides: Record<string, unknown> = {}) {
  return {
    booking_id: ids.booking,
    tour_version_id: ids.version,
    departure_id: ids.departure,
    title_en: "Markets and street food",
    title_vi: "Chợ và ẩm thực đường phố",
    start_at: "2099-09-05T02:00:00.000Z",
    end_at: "2099-09-05T05:00:00.000Z",
    meeting_point: "LocalLens meeting point",
    party_size: 2,
    language: "vi",
    assignment_id: ids.assignment,
    guide_user_id: ids.guide,
    guide_display_name: "Runtime Guide",
    assignment_status: "assigned",
    ...overrides,
  };
}

function guideRow(overrides: Record<string, unknown> = {}) {
  return {
    assignment_id: ids.assignment,
    booking_id: ids.booking,
    tour_version_id: ids.version,
    departure_id: ids.departure,
    title: "Chợ và ẩm thực đường phố",
    start_at: "2099-09-05T02:00:00.000Z",
    end_at: "2099-09-05T05:00:00.000Z",
    meeting_point: "LocalLens meeting point",
    party_size: 2,
    language: "vi",
    mobility_flags: ["step-free"],
    dietary_flags: ["halal"],
    assignment_status: "assigned",
    ...overrides,
  };
}

type RpcResponse = { data: unknown; error: unknown };

function createClient() {
  const getSession = vi.fn(async (): Promise<{
    data: { session: unknown | null };
    error: unknown;
  }> => ({
    data: { session: { access_token: "test-token" } },
    error: null,
  }));
  const rpc = vi.fn(async (): Promise<RpcResponse> => ({ data: [], error: null }));
  return { auth: { getSession }, rpc };
}

describe("Supabase runtime guide-assignment adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the exact admin queue RPC and strictly maps its rows", async () => {
    const client = createClient();
    client.rpc.mockResolvedValueOnce({ data: [queueRow()], error: null });
    const adapter = createSupabaseRuntimeGuideAssignmentAdapter(client);

    await expect(adapter.listAdminQueue()).resolves.toEqual([
      expect.objectContaining({ bookingId: ids.booking, guideUserId: ids.guide }),
    ]);
    expect(client.rpc).toHaveBeenCalledWith("get_admin_guide_assignment_queue");
  });

  it("calls the exact pure-guide candidate projection without browser filtering", async () => {
    const client = createClient();
    client.rpc.mockResolvedValueOnce({
      data: [{ guide_user_id: ids.guide, display_name: "Runtime Guide", language: "vi" }],
      error: null,
    });
    const adapter = createSupabaseRuntimeGuideAssignmentAdapter(client);

    await expect(adapter.listEligibleGuides()).resolves.toEqual([
      { guideUserId: ids.guide, displayName: "Runtime Guide", language: "vi" },
    ]);
    expect(client.rpc).toHaveBeenCalledWith("get_admin_eligible_guides");
  });

  it("sends the exact idempotent assignment payload and maps one result row", async () => {
    const client = createClient();
    client.rpc.mockResolvedValueOnce({
      data: [{
        assignment_id: ids.assignment,
        booking_id: ids.booking,
        guide_user_id: ids.guide,
        status: "assigned",
        outcome: "reassigned",
      }],
      error: null,
    });
    const adapter = createSupabaseRuntimeGuideAssignmentAdapter(client);

    await expect(adapter.assignGuide({
      bookingId: ids.booking,
      guideUserId: ids.guide,
      idempotencyKey: "b2.4-assignment:001",
    })).resolves.toEqual({
      assignmentId: ids.assignment,
      bookingId: ids.booking,
      guideUserId: ids.guide,
      status: "assigned",
      outcome: "reassigned",
    });
    expect(client.rpc).toHaveBeenCalledWith("assign_fixed_departure_guide", {
      booking_id: ids.booking,
      guide_user_id: ids.guide,
      idempotency_key: "b2.4-assignment:001",
    });
  });

  it("maps the guide's exact sanitized assignment list including assignment ID", async () => {
    const client = createClient();
    client.rpc.mockResolvedValueOnce({ data: [guideRow()], error: null });
    const adapter = createSupabaseRuntimeGuideAssignmentAdapter(client);

    await expect(adapter.listOwnAssignments()).resolves.toEqual([
      expect.objectContaining({
        assignmentId: ids.assignment,
        bookingId: ids.booking,
        mobilityFlags: ["step-free"],
        dietaryFlags: ["halal"],
      }),
    ]);
    expect(client.rpc).toHaveBeenCalledWith("get_guide_assigned_bookings");
  });

  it.each([
    ["listAdminQueue", [queueRow({ owner_user_id: "private" })]],
    ["listAdminQueue", [{ ...queueRow(), meeting_point: undefined }]],
    ["listOwnAssignments", [guideRow({ customer_email: "hidden@example.test" })]],
  ] as const)("rejects malformed %s response rows", async (method, data) => {
    const client = createClient();
    client.rpc.mockResolvedValueOnce({ data, error: null });
    const adapter = createSupabaseRuntimeGuideAssignmentAdapter(client);

    await expect(adapter[method]()).rejects.toMatchObject({
      name: "RuntimeGuideAssignmentError",
      code: "INVALID_RESPONSE",
      message: "The guide-assignment service returned an invalid response.",
    });
  });

  it("rejects non-array and multi-row mutation responses", async () => {
    const client = createClient();
    const adapter = createSupabaseRuntimeGuideAssignmentAdapter(client);
    client.rpc.mockResolvedValueOnce({ data: {}, error: null });
    await expect(adapter.listAdminQueue()).rejects.toBeInstanceOf(RuntimeGuideAssignmentError);

    client.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(adapter.assignGuide({
      bookingId: ids.booking,
      guideUserId: ids.guide,
      idempotencyKey: "b2.4-assignment:001",
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("requires a session and rejects invalid input before making an RPC", async () => {
    const client = createClient();
    client.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const adapter = createSupabaseRuntimeGuideAssignmentAdapter(client);

    await expect(adapter.listAdminQueue()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(adapter.assignGuide({
      bookingId: "not-a-uuid",
      guideUserId: ids.guide,
      idempotencyKey: "b2.4-assignment:001",
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "22023", message: "booking secret" }, "INVALID_INPUT"],
    [{ code: "42501", message: "role and jwt secret" }, "FORBIDDEN"],
    [{ code: "PGRST301", message: "token secret" }, "UNAUTHENTICATED"],
    [{ code: "P0001", message: "guide_assignment_idempotency_conflict secret" }, "IDEMPOTENCY_CONFLICT"],
    [{ code: "P0001", message: "guide_assignment_schedule_conflict secret" }, "SCHEDULE_CONFLICT"],
    [{ code: "P0001", message: "guide_assignment_not_found secret" }, "NOT_FOUND"],
    [{ code: "P0001", message: "guide_assignment_state_conflict secret" }, "CONFLICT"],
    [{ code: "XX000", message: "database credentials secret" }, "SERVICE_UNAVAILABLE"],
  ])("maps database failure %# deterministically without leaking detail", async (databaseError, expectedCode) => {
    const client = createClient();
    client.rpc.mockResolvedValueOnce({ data: null, error: databaseError });
    const adapter = createSupabaseRuntimeGuideAssignmentAdapter(client);

    let caught: unknown;
    try {
      await adapter.listAdminQueue();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RuntimeGuideAssignmentError);
    expect(caught).toMatchObject({ code: expectedCode });
    expect((caught as Error).message).not.toContain("secret");
    expect((caught as Error).message).not.toContain("credentials");
  });

  it("does not load the demo repository in Supabase mode", async () => {
    vi.resetModules();
    vi.doMock("@/lib/infrastructure/demo/portal-repository", () => {
      throw new Error("demo repository must not load");
    });

    await expect(import("@/lib/infrastructure/supabase/runtime-guide-assignment-adapter"))
      .resolves.toHaveProperty("createSupabaseRuntimeGuideAssignmentAdapter");
  });
});
