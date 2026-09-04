import { describe, expect, it, vi } from "vitest";

import { PortalError } from "@/lib/application/portal/contracts";
import { createSupabaseBookingCancellationAdapter } from "@/lib/infrastructure/supabase/booking-cancellation-adapter";

const ids = {
  cancellation: "00000000-0000-0000-0000-000000004201",
  booking: "00000000-0000-0000-0000-000000004202",
  customer: "00000000-0000-0000-0000-000000004203",
};

const cancellationRow = (overrides: Record<string, unknown> = {}) => ({
  id: ids.cancellation,
  booking_id: ids.booking,
  customer_user_id: ids.customer,
  source_kind: "departure",
  reason_code: "trip_plan_changed",
  other_reason: null,
  idempotency_key: "cancel-adapter-1",
  cancelled_at: "2026-09-04T08:30:00.000Z",
  ...overrides,
});

function queryDouble(response: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    order: vi.fn(),
    then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve),
  };
  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  return query;
}

function clientDouble(options: {
  session?: { data: { session: { user: { id: string } } | null }; error: unknown };
  rpc?: { data: unknown; error: unknown };
  customer?: { data: unknown; error: unknown };
  admin?: { data: unknown; error: unknown };
} = {}) {
  const customerQuery = queryDouble(options.customer ?? { data: [cancellationRow()], error: null });
  const adminQuery = queryDouble(options.admin ?? { data: [cancellationRow({ source_kind: "quote" })], error: null });
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue(options.session ?? {
        data: { session: { user: { id: ids.customer } } },
        error: null,
      }),
    },
    rpc: vi.fn().mockResolvedValue(options.rpc ?? {
      data: [{
        ...cancellationRow(),
        booking_status: "cancelled",
        state: "created",
      }],
      error: null,
    }),
    from: vi.fn((name: string) => {
      if (name === "customer_booking_cancellations_v") return customerQuery;
      if (name === "admin_booking_cancellations_v") return adminQuery;
      throw new Error(`unexpected projection ${name}`);
    }),
  };
  return { client, customerQuery, adminQuery };
}

async function expectPortalCode(promise: Promise<unknown>, code: PortalError["code"]) {
  await expect(promise).rejects.toMatchObject({ name: "PortalError", code });
}

describe("Supabase booking cancellation adapter", () => {
  it("maps optional and other reasons to the generic cancellation RPC and parses its exact result", async () => {
    const first = clientDouble({ rpc: {
      data: [{ ...cancellationRow({ reason_code: null }), booking_status: "cancelled", state: "created" }],
      error: null,
    } });
    const adapter = createSupabaseBookingCancellationAdapter(first.client as never);

    await expect(adapter.cancelBooking({
      bookingId: ids.booking,
      reasonCode: null,
      otherReason: null,
      idempotencyKey: "cancel-adapter-1",
    })).resolves.toEqual({
      cancellation: {
        id: ids.cancellation,
        bookingId: ids.booking,
        customerUserId: ids.customer,
        sourceKind: "departure",
        reasonCode: null,
        otherReason: null,
        idempotencyKey: "cancel-adapter-1",
        cancelledAt: "2026-09-04T08:30:00.000Z",
      },
      bookingStatus: "cancelled",
      state: "created",
    });
    expect(first.client.rpc).toHaveBeenCalledWith("cancel_booking", {
      booking_id: ids.booking,
      idempotency_key: "cancel-adapter-1",
    });

    const second = clientDouble({ rpc: {
      data: [{
        ...cancellationRow({ source_kind: "quote", reason_code: "other", other_reason: "Schedule changed" }),
        booking_status: "cancelled",
        state: "replayed",
      }],
      error: null,
    } });
    await expect(createSupabaseBookingCancellationAdapter(second.client as never).cancelBooking({
      bookingId: ids.booking,
      reasonCode: "other",
      otherReason: "Schedule changed",
      idempotencyKey: "cancel-adapter-1",
    })).resolves.toMatchObject({
      cancellation: { sourceKind: "quote", reasonCode: "other", otherReason: "Schedule changed" },
      state: "replayed",
    });
  });

  it("parses exact customer and administrator projections without browser-authored owner filters", async () => {
    const { client, customerQuery, adminQuery } = clientDouble();
    const adapter = createSupabaseBookingCancellationAdapter(client as never);

    await expect(adapter.listOwnCancellations()).resolves.toEqual([{
      id: ids.cancellation,
      bookingId: ids.booking,
      customerUserId: ids.customer,
      sourceKind: "departure",
      reasonCode: "trip_plan_changed",
      otherReason: null,
      idempotencyKey: "cancel-adapter-1",
      cancelledAt: "2026-09-04T08:30:00.000Z",
    }]);
    await expect(adapter.listAdminCancellations()).resolves.toMatchObject([{ sourceKind: "quote" }]);
    expect(client.from).toHaveBeenCalledWith("customer_booking_cancellations_v");
    expect(client.from).toHaveBeenCalledWith("admin_booking_cancellations_v");
    expect(customerQuery.select).toHaveBeenCalledWith(
      "id,booking_id,customer_user_id,source_kind,reason_code,other_reason,idempotency_key,cancelled_at",
    );
    expect(adminQuery.select).toHaveBeenCalledWith(
      "id,booking_id,customer_user_id,source_kind,reason_code,other_reason,idempotency_key,cancelled_at",
    );
    expect(Object.hasOwn(customerQuery, "eq")).toBe(false);
    expect(Object.hasOwn(adminQuery, "eq")).toBe(false);
  });

  it("fails closed on invalid input, unauthenticated sessions, malformed rows, and cardinality drift", async () => {
    const invalid = clientDouble();
    await expectPortalCode(createSupabaseBookingCancellationAdapter(invalid.client as never).cancelBooking({
      bookingId: "not-a-uuid",
      reasonCode: null,
      otherReason: null,
      idempotencyKey: "bad key",
    }), "INVALID_INPUT");
    expect(invalid.client.auth.getSession).not.toHaveBeenCalled();
    expect(invalid.client.rpc).not.toHaveBeenCalled();

    const unauthenticated = clientDouble({ session: { data: { session: null }, error: null } });
    await expectPortalCode(
      createSupabaseBookingCancellationAdapter(unauthenticated.client as never).listOwnCancellations(),
      "UNAUTHENTICATED",
    );
    expect(unauthenticated.client.from).not.toHaveBeenCalled();

    for (const rpc of [
      { data: [], error: null },
      { data: [{ ...cancellationRow(), booking_status: "cancelled", state: "created", provider_session_id: "secret" }], error: null },
      { data: [{ ...cancellationRow({ cancelled_at: "2026-02-30T08:30:00.000Z" }), booking_status: "cancelled", state: "created" }], error: null },
    ]) {
      const malformed = clientDouble({ rpc });
      await expectPortalCode(createSupabaseBookingCancellationAdapter(malformed.client as never).cancelBooking({
        bookingId: ids.booking,
        reasonCode: "trip_plan_changed",
        otherReason: null,
        idempotencyKey: "cancel-adapter-1",
      }), "INVALID_STORAGE");
    }

    const malformedProjection = clientDouble({ customer: {
      data: [cancellationRow({ owner_user_id: ids.customer })],
      error: null,
    } });
    await expectPortalCode(
      createSupabaseBookingCancellationAdapter(malformedProjection.client as never).listOwnCancellations(),
      "INVALID_STORAGE",
    );
  });

  it.each([
    [{ code: "22023", message: "cancellation input rejected" }, "INVALID_INPUT"],
    [{ code: "42501", message: "cancellation customer role required" }, "FORBIDDEN"],
    [{ code: "PGRST301", message: "jwt expired" }, "UNAUTHENTICATED"],
    [{ code: "P0001", message: "IDEMPOTENCY_CONFLICT" }, "CONFLICT"],
    [{ code: "P0001", message: "cancellation unavailable" }, "CONFLICT"],
    [{ code: "08006", message: "postgres://secret@localhost/database" }, "STORAGE_UNAVAILABLE"],
  ] as const)("maps database failures to stable redacted portal code %s", async (source, expectedCode) => {
    const { client } = clientDouble({ rpc: { data: null, error: source } });
    let thrown: unknown;
    try {
      await createSupabaseBookingCancellationAdapter(client as never).cancelBooking({
        bookingId: ids.booking,
        reasonCode: "trip_plan_changed",
        otherReason: null,
        idempotencyKey: "cancel-adapter-1",
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PortalError);
    expect(thrown).toMatchObject({ code: expectedCode });
    expect((thrown as Error).message).not.toContain("secret");
    expect((thrown as Error).message).not.toContain("postgres://");
  });
});
