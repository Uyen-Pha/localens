import { describe, expect, it } from "vitest";

import {
  destinationAfterSignIn,
  parseSafeReturnTo,
  signInPath,
} from "@/lib/navigation/safe-return-to";

describe("safe return-to navigation", () => {
  it("accepts only the current locale booking path and preserves its query", () => {
    const returnTo = "/en/booking/?departure=departure-1&partySize=2";

    expect(parseSafeReturnTo("en", returnTo)).toBe(returnTo);
    expect(parseSafeReturnTo("vi", "/vi/booking/?departure=departure-2&partySize=3")).toBe(
      "/vi/booking/?departure=departure-2&partySize=3",
    );
  });

  it.each([
    "https://example.com/en/booking/",
    "//example.com/en/booking/",
    "/en\\booking/?departure=departure-1",
    "/en/booking/\u0000?departure=departure-1",
    "#booking",
    "/vi/booking/?departure=departure-1",
    "/en/account/",
    "/en/booking/../admin/",
    "/en/booking/%2e%2e/admin/",
    "/en/booking/a/../?departure=departure-1",
    "/en/booking/a/%2e%2e/?departure=departure-1",
    "/en/booking/a/%2E./?departure=departure-1",
    "/en/booking/a/.%2e/?departure=departure-1",
    "/en/booking/%2e/?departure=departure-1",
    "/en/booking/%252e%252e/?departure=departure-1",
    "/en/booking/a%2f../?departure=departure-1",
    "/en/booking/#identity",
    "/en/booking/#",
  ])("rejects unsafe or out-of-scope candidate %j", (candidate) => {
    expect(parseSafeReturnTo("en", candidate)).toBeNull();
  });

  it("accepts 2048 characters and rejects oversized input", () => {
    const prefix = "/en/booking/?departure=";
    const atLimit = prefix + "a".repeat(2048 - prefix.length);

    expect(parseSafeReturnTo("en", atLimit)).toBe(atLimit);
    expect(parseSafeReturnTo("en", `${atLimit}a`)).toBeNull();
  });

  it("builds a relative sign-in path only from a safe return-to", () => {
    expect(signInPath("en", "/en/booking/?departure=departure-1&partySize=2")).toBe(
      "/en/sign-in/?returnTo=%2Fen%2Fbooking%2F%3Fdeparture%3Ddeparture-1%26partySize%3D2",
    );
    expect(signInPath("en", "https://example.com")).toBe("/en/sign-in/");
    expect(signInPath("vi")).toBe("/vi/sign-in/");
  });

  it("accepts only exact planner and custom-request paths for demo handoff return", () => {
    expect(parseSafeReturnTo("en", "/en/planner/")).toBe("/en/planner/");
    expect(parseSafeReturnTo("en", "/en/custom-request")).toBe("/en/custom-request");
    expect(parseSafeReturnTo("en", "/en/planner/other")).toBeNull();
    expect(parseSafeReturnTo("en", "/en/custom-request/other")).toBeNull();
    expect(signInPath("en", "/en/planner/")).toBe("/en/sign-in/?returnTo=%2Fen%2Fplanner%2F");
  });

  it("returns customers to safe booking intent and sends every other case to its role portal", () => {
    const returnTo = "/en/booking/?departure=departure-1&partySize=2";

    expect(destinationAfterSignIn({ locale: "en", role: "customer", returnTo })).toBe(returnTo);
    expect(destinationAfterSignIn({ locale: "en", role: "customer", returnTo: "https://example.com" })).toBe(
      "/en/account/",
    );
    expect(destinationAfterSignIn({ locale: "en", role: "guide", returnTo })).toBe("/en/guide/");
    expect(destinationAfterSignIn({ locale: "en", role: "admin", returnTo })).toBe("/en/admin/");
  });
});
