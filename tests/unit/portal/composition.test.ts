// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  createPortalComposition,
  type PortalPortBindings,
} from "@/lib/application/portal/composition";
import {
  PORTAL_PRODUCTION_GAP,
  PortalError,
} from "@/lib/application/portal/contracts";
import {
  PORTAL_DEMO_STORAGE_KEY,
  createDemoPortalRepository,
  createMemorySessionStorage,
} from "@/lib/infrastructure/demo/portal-repository";

async function sentinel(): Promise<never> {
  throw new Error("production sentinel must not be invoked by composition");
}

function productionBindings(): PortalPortBindings {
  return {
    session: {
      getSession: sentinel,
      signOut: sentinel,
    },
    customer: {
      account: {
        getAccount: sentinel,
        updateAccount: sentinel,
        listCustomerBookings: sentinel,
        listCustomRequests: sentinel,
      },
      cancellations: {
        cancelBooking: sentinel,
      },
      reviews: {
        submitTourReview: sentinel,
        listOwnReviews: sentinel,
      },
    },
    guide: {
      profile: {
        getGuideProfile: sentinel,
        updateGuideProfile: sentinel,
      },
      assignments: {
        listAssignedTours: sentinel,
        getAssignedTour: sentinel,
      },
    },
    admin: {
      users: {
        listUsers: sentinel,
        updateUserRole: sentinel,
      },
      catalog: {
        listLocations: sentinel,
        listFixedTours: sentinel,
        listDepartures: sentinel,
      },
      personalizedRequests: {
        listPersonalizedRequests: sentinel,
        reviewPersonalizedRequest: sentinel,
      },
      bookings: {
        listAdminBookings: sentinel,
      },
      assignments: {
        assignGuideToFixedDeparture: sentinel,
      },
      reporting: {
        getReport: sentinel,
      },
    },
  };
}

function expectProductionConfigurationFailure(options: unknown): void {
  let thrown: unknown;
  try {
    createPortalComposition(options as never);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(PortalError);
  expect(thrown).toMatchObject({ code: "PRODUCTION_CONFIGURATION" });
  expect((thrown as Error).message).toMatch(/production.*ports.*demo fallback.*disabled/i);
}

describe("portal composition", () => {
  it("requires an explicit mode and fails closed for absent or incomplete production bindings", () => {
    expect(() => createPortalComposition({} as never)).toThrowError(/explicit.*mode/i);
    expectProductionConfigurationFailure({ mode: "production" });

    const complete = productionBindings();
    expectProductionConfigurationFailure({
      mode: "production",
      ports: {
        ...complete,
        customer: { ...complete.customer, account: undefined },
      },
    });
  });

  it("requires an injected session storage boundary for demo mode", () => {
    expect(() => createPortalComposition({ mode: "demo" } as never)).toThrowError(
      /demo.*session storage.*injected/i,
    );
    expect(() => createPortalComposition({ mode: "demo", storage: {} } as never)).toThrowError(
      /demo.*session storage/i,
    );
  });

  it("seeds absent demo storage once and exposes grouped bindings", async () => {
    const firstStorage = createMemorySessionStorage({ unrelated: "preserve" });
    const first = createPortalComposition({ mode: "demo", storage: firstStorage });
    await first.initialized;
    const firstRaw = firstStorage.getItem(PORTAL_DEMO_STORAGE_KEY);

    const secondStorage = createMemorySessionStorage();
    const second = createPortalComposition({ mode: "demo", storage: secondStorage });
    await second.initialized;

    expect(first.mode).toBe("demo");
    expect(firstRaw).not.toBeNull();
    expect(firstRaw).toBe(secondStorage.getItem(PORTAL_DEMO_STORAGE_KEY));
    expect(firstStorage.getItem("unrelated")).toBe("preserve");
    expect(first.productionGap).toBe(PORTAL_PRODUCTION_GAP);
    expect(Object.isFrozen(first.productionGap)).toBe(true);
    expect(first.session).not.toBe(first.customer);
    expect(first.session).not.toBe(first.guide);
    expect(first.session).not.toBe(first.admin);
    expect(first.customer).not.toBe(first.guide);
    expect(first.customer).not.toBe(first.admin);
    expect(first.guide).not.toBe(first.admin);
    expect(first.customer.account).not.toBe(first.session);
    expect(first.customer.cancellations).not.toBe(first.session);
    expect(first.customer.reviews).not.toBe(first.session);
    expect(first.guide.profile).not.toBe(first.session);
    expect(first.guide.assignments).not.toBe(first.session);
    expect(first.admin.users).not.toBe(first.session);
    expect(first.admin.catalog).not.toBe(first.session);
    expect(first.admin.personalizedRequests).not.toBe(first.session);
    expect(first.demoQuotes).not.toBe(first.session);
    expect(first.admin.bookings).not.toBe(first.session);
    expect(first.admin).not.toHaveProperty("cancellations");
    expect(first.admin.assignments).not.toBe(first.session);
    expect(first.admin.reporting).not.toBe(first.session);
    expect(first.resetDemo).toEqual(expect.any(Function));
    expect(first.customer.account).toHaveProperty("listCustomerBookings");
    expect(first.customer.account).not.toHaveProperty("listAdminBookings");
    expect(first.customer.account).not.toHaveProperty("selectDemoIdentity");
    expect(first.admin.bookings).toHaveProperty("listAdminBookings");
    expect(first.admin.bookings).not.toHaveProperty("listCustomerBookings");
    await expect(first.session.selectDemoIdentity("demo-user-customer")).resolves.toMatchObject({
      role: "customer",
      demo: true,
    });
  });

  it("preserves the selected identity when a second composition initializes over the same storage", async () => {
    const storage = createMemorySessionStorage();
    const first = createPortalComposition({ mode: "demo", storage });
    await first.initialized;
    await first.session.selectDemoIdentity("demo-user-guide");

    const selectedRaw = storage.getItem(PORTAL_DEMO_STORAGE_KEY);
    const second = createPortalComposition({ mode: "demo", storage });
    await second.initialized;

    await expect(second.session.getSession()).resolves.toMatchObject({
      userId: "demo-user-guide",
      role: "guide",
      demo: true,
    });
    expect(storage.getItem(PORTAL_DEMO_STORAGE_KEY)).toBe(selectedRaw);
  });

  it("resets the demo fixture through the composition and signs out", async () => {
    const storage = createMemorySessionStorage({ unrelated: "keep" });
    const composition = createPortalComposition({ mode: "demo", storage });
    await composition.initialized;
    await composition.session.selectDemoIdentity("demo-user-customer");
    await composition.customer.account.updateAccount({ displayName: "Changed traveler" });

    await composition.resetDemo();

    await expect(composition.session.getSession()).resolves.toBeNull();
    expect(storage.getItem("unrelated")).toBe("keep");
    await composition.session.selectDemoIdentity("demo-user-customer");
    await expect(composition.customer.account.getAccount()).resolves.toMatchObject({ displayName: "Demo Traveler" });
  });

  it.each([
    ["corrupt JSON", () => "not-json"],
    ["an unknown root field", (raw: string) => {
      const envelope = JSON.parse(raw) as Record<string, unknown>;
      envelope.unexpected = true;
      return JSON.stringify(envelope);
    }],
    ["tampered fixture data", (raw: string) => {
      const envelope = JSON.parse(raw) as Record<string, unknown>;
      const users = envelope.users as Array<Record<string, unknown>>;
      users[0]!.displayName = "Tampered Traveler";
      return JSON.stringify(envelope);
    }],
  ] as const)("rejects %s during initialization without resetting it", async (_label, invalidate) => {
    const storage = createMemorySessionStorage({ unrelated: "preserve" });
    const repository = createDemoPortalRepository({ storage });
    await repository.reset();
    const seededRaw = storage.getItem(PORTAL_DEMO_STORAGE_KEY);
    if (seededRaw === null) throw new Error("Expected a seeded demo envelope.");
    const invalidRaw = invalidate(seededRaw);
    storage.setItem(PORTAL_DEMO_STORAGE_KEY, invalidRaw);
    const composition = createPortalComposition({ mode: "demo", storage });

    await expect(composition.initialized).rejects.toMatchObject({ code: "INVALID_STORAGE" });
    await expect(composition.retryInitialization()).rejects.toMatchObject({ code: "INVALID_STORAGE" });
    expect(storage.getItem(PORTAL_DEMO_STORAGE_KEY)).toBe(invalidRaw);
    expect(storage.getItem("unrelated")).toBe("preserve");
  });

  it("retries a temporary initialization read failure without replacing the composition", async () => {
    const storage = createMemorySessionStorage();
    const originalGetItem = storage.getItem.bind(storage);
    let failFirstRead = true;
    storage.getItem = (key: string) => {
      if (failFirstRead) {
        failFirstRead = false;
        throw new Error("temporary session storage failure");
      }
      return originalGetItem(key);
    };
    const composition = createPortalComposition({ mode: "demo", storage });
    const failedInitialization = composition.initialized;

    await expect(composition.initialized).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    expect(storage.getItem(PORTAL_DEMO_STORAGE_KEY)).toBeNull();

    await expect(composition.retryInitialization()).resolves.toBeUndefined();
    expect(composition.initialized).not.toBe(failedInitialization);
    await expect(composition.initialized).resolves.toBeUndefined();
    await expect(composition.session.getSession()).resolves.toBeNull();
    expect(storage.getItem(PORTAL_DEMO_STORAGE_KEY)).not.toBeNull();
  });

  it("keeps explicit repository reset deterministic and clears a composition session", async () => {
    const storage = createMemorySessionStorage();
    const composition = createPortalComposition({ mode: "demo", storage });
    await composition.initialized;
    await composition.session.selectDemoIdentity("demo-user-admin");

    const repository = createDemoPortalRepository({ storage });
    await repository.reset();
    const reopened = createPortalComposition({ mode: "demo", storage });
    await reopened.initialized;

    await expect(reopened.session.getSession()).resolves.toBeNull();
  });

  it("returns the exact injected production bindings without a demo fallback", () => {
    const ports = productionBindings();
    const storage = createMemorySessionStorage();
    const composition = createPortalComposition({ mode: "production", ports });
    expect(composition).not.toHaveProperty("resetDemo");

    expect(composition.mode).toBe("production");
    expect(composition.productionGap).toBe(PORTAL_PRODUCTION_GAP);
    expect(storage.getItem(PORTAL_DEMO_STORAGE_KEY)).toBeNull();
    expect(composition).not.toHaveProperty("demoIntegration");
    expect(composition).not.toHaveProperty("demoQuotes");
    expect(composition.session).toBe(ports.session);
    expect(composition.session).not.toHaveProperty("selectDemoIdentity");
    expect(composition).not.toHaveProperty("demo");
    expect(composition).not.toHaveProperty("demoSession");
    expect(composition.customer).toBe(ports.customer);
    expect(composition.customer.account).toBe(ports.customer.account);
    expect(composition.customer.cancellations).toBe(ports.customer.cancellations);
    expect(composition.customer.reviews).toBe(ports.customer.reviews);
    expect(composition.guide).toBe(ports.guide);
    expect(composition.guide.profile).toBe(ports.guide.profile);
    expect(composition.guide.assignments).toBe(ports.guide.assignments);
    expect(composition.admin).toBe(ports.admin);
    expect(composition.admin.users).toBe(ports.admin.users);
    expect(composition.admin.catalog).toBe(ports.admin.catalog);
    expect(composition.admin.personalizedRequests).toBe(ports.admin.personalizedRequests);
    expect(composition.admin.bookings).toBe(ports.admin.bookings);
    expect(composition.admin).not.toHaveProperty("cancellations");
    expect(composition.admin.assignments).toBe(ports.admin.assignments);
    expect(composition.admin.reporting).toBe(ports.admin.reporting);
  });

  it("rejects a demo session injected into otherwise-complete production bindings", () => {
    const demoRepository = createDemoPortalRepository({ storage: createMemorySessionStorage() });
    const ports = productionBindings();

    expectProductionConfigurationFailure({
      mode: "production",
      ports: {
        ...ports,
        session: demoRepository.session,
      },
    });
  });
});
