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
  createMemorySessionStorage,
} from "@/lib/infrastructure/demo/portal-repository";

async function sentinel(): Promise<never> {
  throw new Error("production sentinel must not be invoked by composition");
}

function productionBindings(): PortalPortBindings {
  return {
    session: {
      selectDemoIdentity: sentinel,
      getSession: sentinel,
      signOut: sentinel,
    },
    customer: {
      account: {
        getAccount: sentinel,
        updateAccount: sentinel,
        listBookings: sentinel,
        listCustomRequests: sentinel,
      },
      cancellations: {
        requestCancellation: sentinel,
        listOwnCancellationRequests: sentinel,
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
        listBookings: sentinel,
      },
      cancellations: {
        listCancellationRequests: sentinel,
        decideCancellation: sentinel,
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

  it("resets the injected demo storage deterministically and exposes grouped bindings", async () => {
    const firstStorage = createMemorySessionStorage({
      [PORTAL_DEMO_STORAGE_KEY]: "stale fixture",
      unrelated: "preserve",
    });
    const first = createPortalComposition({ mode: "demo", storage: firstStorage });
    await first.initialized;
    const firstRaw = firstStorage.getItem(PORTAL_DEMO_STORAGE_KEY);

    const secondStorage = createMemorySessionStorage();
    const second = createPortalComposition({ mode: "demo", storage: secondStorage });
    await second.initialized;

    expect(first.mode).toBe("demo");
    expect(firstRaw).not.toBeNull();
    expect(firstRaw).not.toBe("stale fixture");
    expect(firstRaw).toBe(secondStorage.getItem(PORTAL_DEMO_STORAGE_KEY));
    expect(firstStorage.getItem("unrelated")).toBe("preserve");
    expect(first.productionGap).toBe(PORTAL_PRODUCTION_GAP);
    expect(Object.isFrozen(first.productionGap)).toBe(true);
    expect(first.customer.account).toBe(first.session);
    expect(first.customer.cancellations).toBe(first.session);
    expect(first.customer.reviews).toBe(first.session);
    expect(first.guide.profile).toBe(first.session);
    expect(first.guide.assignments).toBe(first.session);
    expect(first.admin.users).toBe(first.session);
    expect(first.admin.catalog).toBe(first.session);
    expect(first.admin.personalizedRequests).toBe(first.session);
    expect(first.admin.bookings).toBe(first.session);
    expect(first.admin.cancellations).toBe(first.session);
    expect(first.admin.assignments).toBe(first.session);
    expect(first.admin.reporting).toBe(first.session);
    await expect(first.session.selectDemoIdentity("demo-user-customer")).resolves.toMatchObject({
      role: "customer",
      demo: true,
    });
  });

  it("returns the exact injected production bindings without a demo fallback", () => {
    const ports = productionBindings();
    const storage = createMemorySessionStorage();
    const composition = createPortalComposition({ mode: "production", ports, storage } as never);

    expect(composition.mode).toBe("production");
    expect(composition.productionGap).toBe(PORTAL_PRODUCTION_GAP);
    expect(storage.getItem(PORTAL_DEMO_STORAGE_KEY)).toBeNull();
    expect(composition.session).toBe(ports.session);
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
    expect(composition.admin.cancellations).toBe(ports.admin.cancellations);
    expect(composition.admin.assignments).toBe(ports.admin.assignments);
    expect(composition.admin.reporting).toBe(ports.admin.reporting);
  });
});
