import { describe, expect, it } from "vitest";

import {
  parseAdminGuideAssignmentQueueItem,
  parseEligibleGuideCandidate,
  parseGuideAssignmentInput,
  parseGuideAssignmentResult,
  parseGuideOwnAssignment,
} from "@/lib/application/guide-assignment/contracts";

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

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    guide_user_id: ids.guide,
    display_name: "Runtime Guide",
    language: "vi",
    ...overrides,
  };
}

function assignmentResultRow(overrides: Record<string, unknown> = {}) {
  return {
    assignment_id: ids.assignment,
    booking_id: ids.booking,
    guide_user_id: ids.guide,
    status: "assigned",
    outcome: "assigned",
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
    dietary_flags: ["halal", "vegetarian"],
    assignment_status: "assigned",
    ...overrides,
  };
}

describe("runtime guide-assignment contracts", () => {
  it("maps the exact admin queue projection and nullable unassigned facts", () => {
    expect(parseAdminGuideAssignmentQueueItem(queueRow())).toEqual({
      ok: true,
      value: {
        bookingId: ids.booking,
        tourVersionId: ids.version,
        departureId: ids.departure,
        titleEn: "Markets and street food",
        titleVi: "Chợ và ẩm thực đường phố",
        startAt: "2099-09-05T02:00:00.000Z",
        endAt: "2099-09-05T05:00:00.000Z",
        meetingPoint: "LocalLens meeting point",
        partySize: 2,
        language: "vi",
        assignmentId: ids.assignment,
        guideUserId: ids.guide,
        guideDisplayName: "Runtime Guide",
        assignmentStatus: "assigned",
      },
    });

    expect(parseAdminGuideAssignmentQueueItem(queueRow({
      assignment_id: null,
      guide_user_id: null,
      guide_display_name: null,
      assignment_status: null,
    }))).toMatchObject({
      ok: true,
      value: {
        assignmentId: null,
        guideUserId: null,
        guideDisplayName: null,
        assignmentStatus: null,
      },
    });
  });

  it("rejects unknown and missing admin queue fields", () => {
    expect(parseAdminGuideAssignmentQueueItem(queueRow({ customer_email: "hidden@example.test" }))).toEqual({
      ok: false,
      error: {
        code: "UNKNOWN_FIELD",
        messageKey: "guideAssignment.contract.unknown_field",
        fieldPath: "row.customer_email",
      },
    });

    const missing: Record<string, unknown> = queueRow();
    delete missing.meeting_point;
    expect(parseAdminGuideAssignmentQueueItem(missing)).toEqual({
      ok: false,
      error: {
        code: "MISSING_FIELD",
        messageKey: "guideAssignment.contract.missing_field",
        fieldPath: "row.meeting_point",
      },
    });
  });

  it("rejects inconsistent nullable assignment facts", () => {
    expect(parseAdminGuideAssignmentQueueItem(queueRow({ assignment_id: null }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE", fieldPath: "row.assignment_id" },
    });
  });

  it("retains assignment identity when an assigned guide has no display name", () => {
    expect(parseAdminGuideAssignmentQueueItem(queueRow({ guide_display_name: null }))).toMatchObject({
      ok: true,
      value: {
        assignmentId: ids.assignment,
        guideUserId: ids.guide,
        guideDisplayName: null,
        assignmentStatus: "assigned",
      },
    });
  });

  it("maps exact eligible pure-guide candidates", () => {
    expect(parseEligibleGuideCandidate(candidateRow())).toEqual({
      ok: true,
      value: {
        guideUserId: ids.guide,
        displayName: "Runtime Guide",
        language: "vi",
      },
    });
    expect(parseEligibleGuideCandidate(candidateRow({ role: "guide" }))).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_FIELD", fieldPath: "row.role" },
    });
  });

  it("validates the idempotent assignment input", () => {
    expect(parseGuideAssignmentInput({
      bookingId: ids.booking,
      guideUserId: ids.guide,
      idempotencyKey: "b2.4-assignment:001",
    })).toEqual({
      ok: true,
      value: {
        bookingId: ids.booking,
        guideUserId: ids.guide,
        idempotencyKey: "b2.4-assignment:001",
      },
    });
    expect(parseGuideAssignmentInput({
      bookingId: ids.booking,
      guideUserId: ids.guide,
      idempotencyKey: " contains spaces ",
    })).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE", fieldPath: "input.idempotencyKey" },
    });
  });

  it.each(["assigned", "reassigned", "unchanged", "replayed"])(
    "maps the stable %s assignment outcome",
    (outcome) => {
      expect(parseGuideAssignmentResult(assignmentResultRow({ outcome }))).toMatchObject({
        ok: true,
        value: { assignmentId: ids.assignment, outcome },
      });
    },
  );

  it("rejects invalid assignment status and outcome fields", () => {
    expect(parseGuideAssignmentResult(assignmentResultRow({ status: "closed" }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE", fieldPath: "result.status" },
    });
    expect(parseGuideAssignmentResult(assignmentResultRow({ outcome: "created" }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE", fieldPath: "result.outcome" },
    });
  });

  it("maps the sanitized guide-own projection including assignment ID", () => {
    expect(parseGuideOwnAssignment(guideRow())).toEqual({
      ok: true,
      value: {
        assignmentId: ids.assignment,
        bookingId: ids.booking,
        tourVersionId: ids.version,
        departureId: ids.departure,
        title: "Chợ và ẩm thực đường phố",
        startAt: "2099-09-05T02:00:00.000Z",
        endAt: "2099-09-05T05:00:00.000Z",
        meetingPoint: "LocalLens meeting point",
        partySize: 2,
        language: "vi",
        mobilityFlags: ["step-free"],
        dietaryFlags: ["halal", "vegetarian"],
        assignmentStatus: "assigned",
      },
    });
    expect(parseGuideOwnAssignment(guideRow({ end_at: null }))).toMatchObject({
      ok: true,
      value: { endAt: null },
    });
  });

  it("rejects unsafe guide requirements and malformed scalar values", () => {
    expect(parseGuideOwnAssignment(guideRow({ mobility_flags: ["wheelchair"] }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE", fieldPath: "row.mobility_flags" },
    });
    expect(parseGuideOwnAssignment(guideRow({ dietary_flags: ["halal", "halal"] }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_SHAPE", fieldPath: "row.dietary_flags" },
    });
    expect(parseGuideOwnAssignment(guideRow({ start_at: "not-a-timestamp" }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_TIMESTAMP", fieldPath: "row.start_at" },
    });
    expect(parseGuideOwnAssignment(guideRow({ party_size: 1.5 }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_DB_INTEGER", fieldPath: "row.party_size" },
    });
  });
});
