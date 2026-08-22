// @vitest-environment node

import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  formatHcmMinute,
  normalizeToHcmMinute,
} from "@/lib/domain/itinerary/local-time";

const minuteOf = (value: string) => Math.floor(Date.parse(value) / 60_000);

describe("HCMC local time", () => {
  it("normalizes explicit UTC and non-HCMC offsets to one epoch minute", () => {
    expect(normalizeToHcmMinute("2026-09-05T08:15:00+07:00")).toEqual({
      ok: true,
      value: minuteOf("2026-09-05T08:15:00+07:00"),
    });
    expect(normalizeToHcmMinute("2026-09-05T01:15:00Z")).toEqual({
      ok: true,
      value: minuteOf("2026-09-05T01:15:00Z"),
    });
    expect(normalizeToHcmMinute("2026-09-05T10:15:00+09:00")).toEqual({
      ok: true,
      value: minuteOf("2026-09-05T10:15:00+09:00"),
    });
  });

  it("ceil-rounds any nonzero seconds or milliseconds to the next minute", () => {
    const exact = minuteOf("2026-09-05T08:15:00+07:00");
    expect(normalizeToHcmMinute("2026-09-05T08:15:00+07:00")).toEqual({
      ok: true,
      value: exact,
    });
    expect(normalizeToHcmMinute("2026-09-05T08:15:01+07:00")).toEqual({
      ok: true,
      value: exact + 1,
    });
    expect(normalizeToHcmMinute("2026-09-05T08:15:00.001+07:00")).toEqual({
      ok: true,
      value: exact + 1,
    });
    expect(normalizeToHcmMinute("2026-09-05T08:15:59.999+07:00")).toEqual({
      ok: true,
      value: exact + 1,
    });
  });

  it("rejects timestamps without an explicit offset", () => {
    const result = normalizeToHcmMinute("2026-09-05T08:15:00");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ITINERARY_INPUT");
    }
  });

  it("rejects malformed and impossible calendar values", () => {
    expect(normalizeToHcmMinute("2026-02-30T08:15:00+07:00").ok).toBe(false);
    expect(normalizeToHcmMinute("not-a-timestamp").ok).toBe(false);
    expect(normalizeToHcmMinute(null).ok).toBe(false);
  });

  it("formats epoch minutes at HCMC date, weekday, and minute boundaries", () => {
    const midnight = minuteOf("2026-09-05T17:00:00Z");
    expect(formatHcmMinute(midnight)).toBe("2026-09-06T00:00:00+07:00");
    expect(formatHcmMinute(midnight + 1)).toBe("2026-09-06T00:01:00+07:00");
    expect(formatHcmMinute(midnight + 24 * 60 - 1)).toBe(
      "2026-09-06T23:59:00+07:00",
    );
  });

  it("stays machine-timezone independent when parsing explicit offsets", () => {
    const script = [
      "const value = process.argv[1];",
      "process.stdout.write(String(Math.ceil(Date.parse(value) / 60000)));",
    ].join(" ");
    const value = "2026-09-05T08:15:00.001+07:00";
    const child = execFileSync(process.execPath, ["-e", script, value], {
      env: { ...process.env, TZ: "America/Los_Angeles" },
      encoding: "utf8",
    });

    const normalized = normalizeToHcmMinute(value);
    expect(normalized.ok).toBe(true);
    if (normalized.ok) expect(Number(child)).toBe(normalized.value);
  });
});
