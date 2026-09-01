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
    hold_expires_at: "2099-09-05T01:35:00.000Z",
    created_at: "2099-09-05T01:00:00.000Z",
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
  rpc = {},
  session = { data: { session: { user: { id: "customer-a" } } }, error: null },
}: {
  tours?: QueryResponse;
  bookings?: QueryResponse;
  rpc?: Record<string, QueryResponse>;
  session?: QueryResponse;
} = {}) {
  const tourQuery = queryDouble(tours);
  const bookingQuery = queryDouble(bookings);
  const client = {
    auth: { getSession: vi.fn().mockResolvedValue(session) },
    from: vi.fn((relation: string) => relation === "published_tours_v" ? tourQuery : bookingQuery),
    rpc: vi.fn((name: string) => Promise.resolve(
      rpc[name] ?? (name === "get_live_departure_availability"
        ? { data: [availabilityRow()], error: null }
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
  return { client, tourQuery, bookingQuery };
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
      "id,status,source_kind,source_id,tour_version_id,quote_id,title_en,title_vi,cancellation_policy,catalog_snapshot_id,travel_snapshot_id,fx_snapshot_id,fx_vnd_per_usd,per_person_vnd_minor,total_vnd_minor,checkout_currency,checkout_amount_minor,party_size,language,meeting_point,hold_expires_at,created_at",
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
