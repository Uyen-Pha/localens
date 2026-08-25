// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  getGuideAssignedBookings,
  mapGuideAssignedBooking,
  mapGuideAssignedBookings,
  type GuideAssignedBookingsRpcClient,
} from "@/lib/domain/data/guide-booking";

const ids = {
  booking: "00000000-0000-0000-0000-000000000a01",
  version: "00000000-0000-0000-0000-000000000a02",
  departure: "00000000-0000-0000-0000-000000000a03",
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    booking_id: ids.booking,
    tour_version_id: ids.version,
    departure_id: ids.departure,
    title: "Chợ Lớn after dark",
    start_at: "2026-09-10T18:00:00+07:00",
    end_at: "2026-09-10T21:00:00+07:00",
    meeting_point: "Ben Thanh Market",
    party_size: 3,
    language: "en",
    mobility_flags: ["step-free"],
    dietary_flags: ["halal", "vegetarian"],
    assignment_status: "assigned",
    ...overrides,
  };
}

describe("guide booking data adapter", () => {
  it("maps the exact sanitized guide projection and keeps structured flags", () => {
    expect(mapGuideAssignedBooking(row())).toEqual({
      ok: true,
      value: {
        bookingId: ids.booking,
        tourVersionId: ids.version,
        departureId: ids.departure,
        title: "Chợ Lớn after dark",
        startAt: "2026-09-10T18:00:00+07:00",
        endAt: "2026-09-10T21:00:00+07:00",
        meetingPoint: "Ben Thanh Market",
        partySize: 3,
        language: "en",
        mobilityFlags: ["step-free"],
        dietaryFlags: ["halal", "vegetarian"],
        assignmentStatus: "assigned",
      },
    });
  });

  it("maps a collection without exposing or accepting non-projection fields", () => {
    expect(mapGuideAssignedBookings([row(), row({ assignment_status: "accepted" })])).toMatchObject({
      ok: true,
      value: [expect.objectContaining({ assignmentStatus: "assigned" }), expect.objectContaining({ assignmentStatus: "accepted" })],
    });
    expect(mapGuideAssignedBooking({ ...row(), owner_user_id: ids.booking })).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_FIELD", fieldPath: "row.owner_user_id" },
    });
  });

  it("rejects raw, duplicated, unknown, or malformed requirements", () => {
    for (const invalid of [
      { mobility_flags: ["wheelchair-ramp"] },
      { dietary_flags: ["halal", "halal"] },
      { mobility_flags: ["special note"] },
      { dietary_flags: ["vegan"] },
    ]) {
      expect(mapGuideAssignedBooking(row(invalid))).toMatchObject({ ok: false });
    }
    expect(mapGuideAssignedBooking(row({ party_size: "3" }))).toMatchObject({ ok: false });
    expect(mapGuideAssignedBooking(row({ end_at: "2026-09-10T17:00:00+07:00" }))).toMatchObject({ ok: false });
    expect(mapGuideAssignedBooking(row({ assignment_status: "pending_payment" }))).toMatchObject({ ok: false });
  });

  it("uses the named RPC and maps only its returned rows", async () => {
    const calls: string[] = [];
    const client: GuideAssignedBookingsRpcClient = {
      async rpc(name) {
        calls.push(name);
        return { data: [row()], error: null };
      },
    };
    await expect(getGuideAssignedBookings(client)).resolves.toEqual({
      ok: true,
      value: [expect.objectContaining({ bookingId: ids.booking })],
    });
    expect(calls).toEqual(["get_guide_assigned_bookings"]);
  });

  it("returns a value-free adapter error when the RPC fails", async () => {
    const client: GuideAssignedBookingsRpcClient = {
      async rpc() {
        return { data: null, error: new Error("owner_user_id leaked") };
      },
    };
    await expect(getGuideAssignedBookings(client)).resolves.toEqual({
      ok: false,
      error: { code: "INVALID_SHAPE", messageKey: "data.adapter.rpc_failed" },
    });
  });
});
