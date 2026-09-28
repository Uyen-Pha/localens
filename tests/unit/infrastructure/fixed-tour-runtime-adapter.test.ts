import { describe, expect, it, vi } from "vitest";

import { FixedTourRuntimeError } from "@/lib/application/fixed-tour/contracts";
import { createSupabaseFixedTourRuntimeAdapter } from "@/lib/infrastructure/supabase/fixed-tour-runtime-adapter";

const ids = {
  tour: "00000000-0000-0000-0000-000000000101",
  version: "00000000-0000-0000-0000-000000000102",
  place: "00000000-0000-0000-0000-000000000103",
  departure: "00000000-0000-0000-0000-000000000104",
  booking: "00000000-0000-0000-0000-000000000105",
  catalog: "00000000-0000-0000-0000-000000000106",
  travel: "00000000-0000-0000-0000-000000000107",
};

function tourRow(overrides: Record<string, unknown> = {}) {
  return {
    tour_id: ids.tour,
    tour_version_id: ids.version,
    slug: "markets-and-street-food",
    locale: "en",
    title: "Markets and street food",
    summary: "A synthetic local-runtime tour.",
    meeting_point: "LocalLens meeting point",
    duration_minutes: 180,
    price_vnd_minor: "750000",
    inclusions: ["Licensed guide"],
    exclusions: ["Personal expenses"],
    cancellation_policy: "Pending-payment holds expire automatically.",
    source_url: "https://example.invalid/runtime-fixture",
    verified_at: "2026-09-02",
    attribution: "Synthetic LocalLens fixture",
    license: "Local fixture only",
    stops: [{ position: 1, place_id: ids.place, place_slug: "demo-market", title: "Demo market" }],
    ...overrides,
  };
}

function availabilityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.departure,
    tour_version_id: ids.version,
    start_at: "2099-09-05T02:00:00.000Z",
    end_at: "2099-09-05T05:00:00.000Z",
    status: "scheduled",
    remaining_capacity: 8,
    ...overrides,
  };
}

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.booking,
    status: "pending_payment",
    source_kind: "departure",
    source_id: ids.departure,
    tour_version_id: ids.version,
    quote_id: null,
    title_en: "Markets and street food",
    title_vi: "Chợ và ẩm thực đường phố",
    cancellation_policy: "Pending-payment holds expire automatically.",
    catalog_snapshot_id: ids.catalog,
    travel_snapshot_id: ids.travel,
    fx_snapshot_id: null,
    fx_vnd_per_usd: null,
    per_person_vnd_minor: "750000",
    total_vnd_minor: "1500000",
    checkout_currency: "vnd",
    checkout_amount_minor: "1500000",
    party_size: 2,
    language: "en",
    meeting_point: "LocalLens meeting point",
    payment_status: null,
    payment_deadline_at: "2099-09-05T01:15:00.000Z",
    trip_start_at: "2099-09-05T02:00:00.000Z",
    hold_expires_at: "2099-09-05T01:15:00.000Z",
    created_at: "2099-09-05T01:00:00.000Z",
    ...overrides,
  };
}

function paymentStatusRow(overrides: Record<string, unknown> = {}) {
  return {
    booking_id: ids.booking,
    booking_status: "confirmed",
    payment_status: "paid",
    amount_minor: "1500000",
    currency: "vnd",
    simulated_at: "2099-09-05T01:05:00.000Z",
    ...overrides,
  };
}

function paymentResultRow(overrides: Record<string, unknown> = {}) {
  return {
    booking_id: ids.booking,
    booking_status: "confirmed",
    payment_status: "paid",
    simulated_at: "2099-09-05T01:05:00.000Z",
    state: "completed",
    ...overrides,
  };
}

type QueryResponse = { data: unknown; error: unknown };

function queryDouble(response: QueryResponse) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    then: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.then.mockImplementation((resolve, reject) => Promise.resolve(response).then(resolve, reject));
  return query;
}

function clientDouble({
  tours = { data: [tourRow()], error: null },
  bookings = { data: [bookingRow()], error: null },
  payments = { data: [paymentStatusRow()], error: null },
  rpc = {},
  session = { data: { session: { user: { id: "customer-a" } } }, error: null },
}: {
  tours?: QueryResponse;
  bookings?: QueryResponse;
  payments?: QueryResponse;
  rpc?: Record<string, QueryResponse>;
  session?: QueryResponse;
} = {}) {
  const tourQuery = queryDouble(tours);
  const bookingQuery = queryDouble(bookings);
  const paymentQuery = queryDouble(payments);
  const client = {
    auth: { getSession: vi.fn().mockResolvedValue(session) },
    from: vi.fn((relation: string) => {
      if (relation === "published_tours_v") return tourQuery;
      if (relation === "customer_simulated_payment_status_v") return paymentQuery;
      return bookingQuery;
    }),
    rpc: vi.fn((name: string) => Promise.resolve(
      rpc[name] ?? (name === "get_live_departure_availability"
        ? { data: [availabilityRow()], error: null }
        : name === "complete_simulated_fixed_tour_payment"
          ? { data: [paymentResultRow()], error: null }
        : {
            data: [{
              booking_id: ids.booking,
              hold_expires_at: "2099-09-05T01:35:00.000Z",
              state: "created",
            }],
            error: null,
          }),
    )),
  };
  return { client, tourQuery, bookingQuery, paymentQuery };
}

function expectCode(error: unknown, code: FixedTourRuntimeError["code"]): void {
  expect(error).toBeInstanceOf(FixedTourRuntimeError);
  expect(error).toMatchObject({ code });
}

async function expectRejectCode(
  operation: Promise<unknown>,
  code: FixedTourRuntimeError["code"],
): Promise<void> {
  let thrown: unknown;
  try {
    await operation;
  } catch (error) {
    thrown = error;
  }
  expectCode(thrown, code);
}

describe("Supabase fixed-tour runtime adapter", () => {
  it.each(["payment_status", "payment_deadline_at", "trip_start_at"])(
    "retries a recognized missing %s column with the legacy owner-scoped projection", async (column) => {
      const legacy: Record<string, unknown> = bookingRow();
      delete legacy.payment_status;
      delete legacy.payment_deadline_at;
      delete legacy.trip_start_at;
      for (const error of [
        { code: "42703", message: `column customer_bookings_v.${column} does not exist` },
        { code: "PGRST204", message: `Could not find the '${column}' column of 'customer_bookings_v' in the schema cache` },
      ]) {
        const { client } = clientDouble();
        const currentQuery = queryDouble({ data: null, error });
        const legacyQuery = queryDouble({ data: [legacy], error: null });
        client.from.mockReturnValueOnce(currentQuery).mockReturnValueOnce(legacyQuery);
        const result = await createSupabaseFixedTourRuntimeAdapter(client as never).listOwnBookings();
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ id: ids.booking, status: "pending_payment" });
        expect(result[0].paymentStatus).toBeUndefined();
        expect(result[0].paymentDeadlineAt).toBeUndefined();
        expect(result[0].tripStartAt).toBeUndefined();
        expect(client.from.mock.calls).toEqual([["customer_bookings_v"], ["customer_bookings_v"]]);
        expect(legacyQuery.select).toHaveBeenCalledWith("id,status,source_kind,source_id,tour_version_id,quote_id,title_en,title_vi,cancellation_policy,catalog_snapshot_id,travel_snapshot_id,fx_snapshot_id,fx_vnd_per_usd,per_person_vnd_minor,total_vnd_minor,checkout_currency,checkout_amount_minor,party_size,language,meeting_point,hold_expires_at,created_at");
        expect(legacyQuery.eq).not.toHaveBeenCalled();
        expect(legacyQuery.order.mock.calls).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
      }
    },
  );

  it.each([
    [{ code: "42501", message: "permission denied" }, "FORBIDDEN"],
    [{ code: "PGRST301", message: "JWT expired" }, "UNAUTHENTICATED"],
    [{ code: "08006", message: "connection failure" }, "SERVICE_UNAVAILABLE"],
    [{ code: "42501", message: "column customer_bookings_v.payment_status does not exist" }, "FORBIDDEN"],
    [{ code: "42703", message: "column customer_bookings_v.title_en does not exist" }, "SERVICE_UNAVAILABLE"],
    [{ code: "42703", message: "column other_view.payment_status does not exist" }, "SERVICE_UNAVAILABLE"],
    [{ code: "PGRST204", message: "Could not find the 'payment_status' column of 'other_view' in the schema cache" }, "SERVICE_UNAVAILABLE"],
    [{ code: "42P01", message: "relation customer_bookings_v does not exist" }, "SERVICE_UNAVAILABLE"],
    [{ code: "42703", message: "unknown schema error payment_status" }, "SERVICE_UNAVAILABLE"],
  ] as const)("does not downgrade unrelated failure %j", async (error, code) => {
    const { client } = clientDouble({ bookings: { data: null, error } });
    await expectRejectCode(createSupabaseFixedTourRuntimeAdapter(client as never).listOwnBookings(), code);
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ code: "42501", message: "permission denied" }, "FORBIDDEN"],
    [{ code: "08006", message: "network failed" }, "SERVICE_UNAVAILABLE"],
    [{ code: "42703", message: "column customer_bookings_v.payment_status does not exist" }, "SERVICE_UNAVAILABLE"],
  ] as const)("preserves legacy retry failure without another downgrade %j", async (error, code) => {
    const { client } = clientDouble();
    client.from
      .mockReturnValueOnce(queryDouble({ data: null, error: { code: "42703", message: "column customer_bookings_v.payment_status does not exist" } }))
      .mockReturnValueOnce(queryDouble({ data: null, error }));
    await expectRejectCode(createSupabaseFixedTourRuntimeAdapter(client as never).listOwnBookings(), code);
    expect(client.from).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])("preserves a thrown network failure (legacy retry: %s)", async (legacy) => {
    const { client } = clientDouble();
    const failedQuery = queryDouble({ data: null, error: null });
    failedQuery.then.mockImplementation((_resolve, reject) => Promise.reject(new Error("network private detail")).catch(reject));
    if (legacy) client.from.mockReturnValueOnce(queryDouble({
      data: null, error: { code: "42703", message: "column customer_bookings_v.payment_status does not exist" },
    }));
    client.from.mockReturnValueOnce(failedQuery);
    await expectRejectCode(createSupabaseFixedTourRuntimeAdapter(client as never).listOwnBookings(), "SERVICE_UNAVAILABLE");
    expect(client.from).toHaveBeenCalledTimes(legacy ? 2 : 1);
  });

  it("does not mask malformed legacy rows as an empty booking list", async () => {
    const { client } = clientDouble();
    client.from
      .mockReturnValueOnce(queryDouble({ data: null, error: { code: "42703", message: "column customer_bookings_v.payment_status does not exist" } }))
      .mockReturnValueOnce(queryDouble({ data: [{ id: ids.booking, owner_user_id: "private" }], error: null }));
    await expectRejectCode(createSupabaseFixedTourRuntimeAdapter(client as never).listOwnBookings(), "INVALID_RESPONSE");
    expect(client.from).toHaveBeenCalledTimes(2);
  });

  it("uses an exact locale-filtered published-tour projection and existing mapper", async () => {
    const { client, tourQuery } = clientDouble();
    const adapter = createSupabaseFixedTourRuntimeAdapter(client as never);

    await expect(adapter.listPublishedTours("en")).resolves.toMatchObject([
      { id: ids.tour, versionId: ids.version, locale: "en", title: "Markets and street food" },
    ]);
    expect(client.from).toHaveBeenCalledWith("published_tours_v");
    expect(tourQuery.select).toHaveBeenCalledWith(
      "tour_id,tour_version_id,slug,locale,title,summary,meeting_point,duration_minutes,price_vnd_minor,inclusions,exclusions,cancellation_policy,source_url,verified_at,attribution,license,stops",
    );
    expect(tourQuery.eq).toHaveBeenCalledWith("locale", "en");
    expect(tourQuery.order).toHaveBeenNthCalledWith(1, "slug", { ascending: true });
    expect(tourQuery.order).toHaveBeenNthCalledWith(2, "tour_version_id", { ascending: true });
  });

  it("rejects invalid locales before issuing a query", async () => {
    const { client } = clientDouble();
    const adapter = createSupabaseFixedTourRuntimeAdapter(client as never);

    await expectRejectCode(adapter.listPublishedTours("fr" as never), "INVALID_INPUT");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("maps live availability and rejects malformed or leaked rows", async () => {
    const good = clientDouble();
    await expect(createSupabaseFixedTourRuntimeAdapter(good.client as never).listAvailability())
      .resolves.toMatchObject([{ id: ids.departure, remainingCapacity: 8 }]);
    expect(good.client.rpc).toHaveBeenCalledWith("get_live_departure_availability");

    for (const row of [availabilityRow({ remaining_capacity: -1 }), availabilityRow({ hold_id: ids.booking })]) {
      const bad = clientDouble({ rpc: { get_live_departure_availability: { data: [row], error: null } } });
      await expectRejectCode(
        createSupabaseFixedTourRuntimeAdapter(bad.client as never).listAvailability(),
        "INVALID_RESPONSE",
      );
    }
  });

  it("sends only the four public RPC arguments and maps one bounded result row", async () => {
    const { client } = clientDouble();
    const adapter = createSupabaseFixedTourRuntimeAdapter(client as never);

    await expect(adapter.beginBooking({
      departureId: ids.departure,
      partySize: 2,
      locale: "vi",
      idempotencyKey: "booking-attempt-1",
    })).resolves.toEqual({
      bookingId: ids.booking,
      holdExpiresAt: "2099-09-05T01:35:00.000Z",
      state: "created",
    });
    expect(client.rpc).toHaveBeenCalledWith("begin_fixed_tour_booking", {
      departure_id: ids.departure,
      party_size: 2,
      booking_locale: "vi",
      idempotency_key: "booking-attempt-1",
    });
    expect(JSON.stringify(client.rpc.mock.calls)).not.toMatch(
      /actor|owner|user_id|role|amount|currency|status|hash|provider/i,
    );
  });

  it("requires an authenticated session before a hold without sending an RPC", async () => {
    const { client } = clientDouble({ session: { data: { session: null }, error: null } });
    const adapter = createSupabaseFixedTourRuntimeAdapter(client as never);

    await expectRejectCode(
      adapter.beginBooking({
        departureId: ids.departure,
        partySize: 1,
        locale: "en",
        idempotencyKey: "booking-attempt-2",
      }),
      "UNAUTHENTICATED",
    );
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid input before auth or RPC", async () => {
    const { client } = clientDouble();
    const adapter = createSupabaseFixedTourRuntimeAdapter(client as never);

    await expectRejectCode(
      adapter.beginBooking({
        departureId: "not-a-uuid",
        partySize: 0,
        locale: "en",
        idempotencyKey: "booking-attempt-3",
      }),
      "INVALID_INPUT",
    );
    expect(client.auth.getSession).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects zero, multiple, malformed, and sensitive-extra hold rows", async () => {
    const valid = {
      booking_id: ids.booking,
      hold_expires_at: "2099-09-05T01:35:00.000Z",
      state: "created",
    };
    for (const data of [
      [],
      [valid, valid],
      [{ ...valid, state: "paid" }],
      [{ ...valid, amount_minor: "1500000" }],
      [{ ...valid, provider_idempotency_key: "secret" }],
    ]) {
      const { client } = clientDouble({ rpc: { begin_fixed_tour_booking: { data, error: null } } });
      await expectRejectCode(
        createSupabaseFixedTourRuntimeAdapter(client as never).beginBooking({
          departureId: ids.departure,
          partySize: 2,
          locale: "en",
          idempotencyKey: "booking-attempt-4",
        }),
        "INVALID_RESPONSE",
      );
    }
  });

  it("uses the owner-scoped booking view with exact columns and no owner filter", async () => {
    const { client, bookingQuery } = clientDouble();
    const adapter = createSupabaseFixedTourRuntimeAdapter(client as never);

    await expect(adapter.listOwnBookings()).resolves.toMatchObject([
      { id: ids.booking, sourceKind: "departure", status: "pending_payment", partySize: 2 },
    ]);
    expect(client.from).toHaveBeenCalledWith("customer_bookings_v");
    expect(bookingQuery.select).toHaveBeenCalledWith(
      "id,status,source_kind,source_id,tour_version_id,quote_id,title_en,title_vi,cancellation_policy,catalog_snapshot_id,travel_snapshot_id,fx_snapshot_id,fx_vnd_per_usd,per_person_vnd_minor,total_vnd_minor,checkout_currency,checkout_amount_minor,party_size,language,meeting_point,payment_status,payment_deadline_at,trip_start_at,hold_expires_at,created_at",
    );
    expect(bookingQuery.eq).not.toHaveBeenCalled();
    expect(bookingQuery.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(bookingQuery.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
  });

  it("rejects sparse arrays and malformed mapped rows as invalid responses", async () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    for (const bookings of [sparse, [bookingRow({ total_vnd_minor: "9007199254740992" })]]) {
      const { client } = clientDouble({ bookings: { data: bookings, error: null } });
      await expectRejectCode(
        createSupabaseFixedTourRuntimeAdapter(client as never).listOwnBookings(),
        "INVALID_RESPONSE",
      );
    }
  });

  it("reads the exact owner-scoped simulated-payment projection without an owner filter", async () => {
    const { client, paymentQuery } = clientDouble();
    const adapter = createSupabaseFixedTourRuntimeAdapter(client as never);

    await expect(adapter.listOwnPaymentStatuses()).resolves.toEqual([{
      bookingId: ids.booking,
      bookingStatus: "confirmed",
      paymentStatus: "paid",
      amountMinor: "1500000",
      currency: "vnd",
      simulatedAt: "2099-09-05T01:05:00.000Z",
    }]);
    expect(client.from).toHaveBeenCalledWith("customer_simulated_payment_status_v");
    expect(paymentQuery.select).toHaveBeenCalledWith(
      "booking_id,booking_status,payment_status,amount_minor,currency,simulated_at",
    );
    expect(paymentQuery.eq).not.toHaveBeenCalled();
    expect(paymentQuery.order).toHaveBeenCalledWith("simulated_at", { ascending: false });
  });

  it("rejects malformed, sparse, or authority-leaking simulated-payment rows", async () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    for (const payments of [
      sparse,
      [paymentStatusRow({ amount_minor: "9007199254740992" })],
      [paymentStatusRow({ owner_user_id: "leak" })],
      [paymentStatusRow({ payment_status: "failed" })],
    ]) {
      const { client } = clientDouble({ payments: { data: payments, error: null } });
      await expectRejectCode(
        createSupabaseFixedTourRuntimeAdapter(client as never).listOwnPaymentStatuses(),
        "INVALID_RESPONSE",
      );
    }
  });

  it("sends only booking identity and idempotency to simulated-payment RPC", async () => {
    const { client } = clientDouble();
    const adapter = createSupabaseFixedTourRuntimeAdapter(client as never);

    await expect(adapter.completeSimulatedPayment({
      bookingId: ids.booking,
      idempotencyKey: "payment-attempt-1",
    })).resolves.toEqual({
      bookingId: ids.booking,
      bookingStatus: "confirmed",
      paymentStatus: "paid",
      simulatedAt: "2099-09-05T01:05:00.000Z",
      state: "completed",
    });
    expect(client.rpc).toHaveBeenCalledWith("complete_simulated_fixed_tour_payment", {
      booking_id: ids.booking,
      idempotency_key: "payment-attempt-1",
    });
    expect(JSON.stringify(client.rpc.mock.calls.at(-1))).not.toMatch(
      /actor|owner|user_id|role|amount|currency|outcome|status|provider|card/i,
    );
  });

  it("accepts one nullable expired payment result and rejects malformed result cardinality", async () => {
    const expired = paymentResultRow({
      booking_status: "expired",
      payment_status: null,
      state: "expired",
    });
    const good = clientDouble({ rpc: { complete_simulated_fixed_tour_payment: { data: [expired], error: null } } });
    await expect(createSupabaseFixedTourRuntimeAdapter(good.client as never).completeSimulatedPayment({
      bookingId: ids.booking,
      idempotencyKey: "payment-attempt-expired",
    })).resolves.toMatchObject({ bookingStatus: "expired", paymentStatus: null, state: "expired" });

    for (const data of [
      [],
      [paymentResultRow(), paymentResultRow()],
      [paymentResultRow({ state: "created" })],
      [paymentResultRow({ provider_session_id: "secret" })],
    ]) {
      const { client } = clientDouble({ rpc: { complete_simulated_fixed_tour_payment: { data, error: null } } });
      await expectRejectCode(
        createSupabaseFixedTourRuntimeAdapter(client as never).completeSimulatedPayment({
          bookingId: ids.booking,
          idempotencyKey: "payment-attempt-malformed",
        }),
        "INVALID_RESPONSE",
      );
    }
  });

  it("requires auth and validates simulated-payment input before issuing an RPC", async () => {
    const unauthenticated = clientDouble({ session: { data: { session: null }, error: null } });
    await expectRejectCode(
      createSupabaseFixedTourRuntimeAdapter(unauthenticated.client as never).completeSimulatedPayment({
        bookingId: ids.booking,
        idempotencyKey: "payment-attempt-auth",
      }),
      "UNAUTHENTICATED",
    );
    expect(unauthenticated.client.rpc).not.toHaveBeenCalled();

    const invalid = clientDouble();
    await expectRejectCode(
      createSupabaseFixedTourRuntimeAdapter(invalid.client as never).completeSimulatedPayment({
        bookingId: "not-a-uuid",
        idempotencyKey: "bad key",
      }),
      "INVALID_INPUT",
    );
    expect(invalid.client.auth.getSession).not.toHaveBeenCalled();
    expect(invalid.client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "22023", message: "invalid party size" }, "INVALID_INPUT"],
    [{ code: "42501", message: "permission denied" }, "FORBIDDEN"],
    [{ code: "PGRST301", message: "jwt expired" }, "UNAUTHENTICATED"],
    [{ code: "P0001", message: "idempotency_conflict: payload differs" }, "IDEMPOTENCY_CONFLICT"],
    [{ code: "P0001", message: "departure sold out" }, "SOLD_OUT"],
    [{ code: "P0001", message: "tour translation unavailable" }, "NOT_FOUND"],
    [{ code: "08006", message: "postgres://secret@localhost/database" }, "SERVICE_UNAVAILABLE"],
  ] as const)("maps database errors to stable redacted code %s", async (source, expectedCode) => {
    const { client } = clientDouble({ rpc: { begin_fixed_tour_booking: { data: null, error: source } } });
    let thrown: unknown;
    try {
      await createSupabaseFixedTourRuntimeAdapter(client as never).beginBooking({
        departureId: ids.departure,
        partySize: 2,
        locale: "en",
        idempotencyKey: "booking-attempt-5",
      });
    } catch (error) {
      thrown = error;
    }
    expectCode(thrown, expectedCode);
    expect((thrown as Error).message).not.toContain(source.message);
    expect(JSON.stringify(thrown)).not.toContain(source.message);
  });

  it("maps rejected promises and unknown details without leaking them", async () => {
    const secret = "service-role-secret-do-not-leak";
    const { client } = clientDouble();
    client.rpc.mockRejectedValueOnce(new Error(secret));
    let thrown: unknown;
    try {
      await createSupabaseFixedTourRuntimeAdapter(client as never).listAvailability();
    } catch (error) {
      thrown = error;
    }
    expectCode(thrown, "SERVICE_UNAVAILABLE");
    expect((thrown as Error).message).not.toContain(secret);
  });
});
