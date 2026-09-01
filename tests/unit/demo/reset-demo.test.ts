import { describe, expect, it, vi } from "vitest";

import {
  clearLocalLensDemoStorage,
  type DemoStorageArea,
} from "@/lib/application/demo/reset-demo";

class MemoryStorage implements DemoStorageArea {
  private readonly values = new Map<string, string>();
  readonly clear = vi.fn();

  get length(): number {
    return this.values.size;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("LocalLens demo storage reset", () => {
  it("removes only owned exact session keys and booking prefixes", () => {
    const session = new MemoryStorage();
    const local = new MemoryStorage();
    session.setItem("localens.personalization.v1", "demo");
    session.setItem("localens.custom-request.v1", "demo");
    session.setItem("localens.demo.planner.e2e.v1", "demo");
    session.setItem("localens.portal.demo.v1", "demo");
    session.setItem("localens.future.v2", "keep");
    session.setItem("other-app", "keep");
    local.setItem("locallens.demo.booking.v1:booking-1", "demo");
    local.setItem("locallens.demo.booking.v2:booking-2", "keep");
    local.setItem("other-app", "keep");

    clearLocalLensDemoStorage({ session, local });

    expect(session.getItem("localens.personalization.v1")).toBeNull();
    expect(session.getItem("localens.custom-request.v1")).toBeNull();
    expect(session.getItem("localens.demo.planner.e2e.v1")).toBeNull();
    expect(session.getItem("localens.portal.demo.v1")).toBeNull();
    expect(local.getItem("locallens.demo.booking.v1:booking-1")).toBeNull();
    expect(session.getItem("localens.future.v2")).toBe("keep");
    expect(session.getItem("other-app")).toBe("keep");
    expect(local.getItem("locallens.demo.booking.v2:booking-2")).toBe("keep");
    expect(local.getItem("other-app")).toBe("keep");
    expect(session.clear).not.toHaveBeenCalled();
    expect(local.clear).not.toHaveBeenCalled();
  });

  it("fails safely when one storage area blocks enumeration or removal", () => {
    const blockedSession: DemoStorageArea = {
      get length(): number { throw new Error("blocked"); },
      key: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    const local = new MemoryStorage();
    local.setItem("locallens.demo.booking.v1:booking-1", "demo");

    expect(() => clearLocalLensDemoStorage({ session: blockedSession, local })).not.toThrow();
    expect(local.getItem("locallens.demo.booking.v1:booking-1")).toBeNull();
  });
});
