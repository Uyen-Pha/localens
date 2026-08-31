import {
  PORTAL_PRODUCTION_GAP,
  PortalError,
  type PortalMode,
  type PortalPortBindings,
  type DemoSessionPort,
} from "@/lib/application/portal/contracts";
import {
  createDemoPortalRepository,
  type PortalSessionStorage,
} from "@/lib/infrastructure/demo/portal-repository";

export type { PortalMode, PortalPortBindings } from "@/lib/application/portal/contracts";

export interface PortalComposition extends PortalPortBindings {
  readonly mode: PortalMode;
  readonly productionGap: typeof PORTAL_PRODUCTION_GAP;
}

export type DemoPortalComposition = Omit<PortalComposition, "session"> & {
  readonly mode: "demo";
  readonly session: DemoSessionPort;
  /** Resolves once the composition's deterministic demo fixture initialization has completed. */
  readonly initialized: Promise<void>;
};
export type ProductionPortalComposition = PortalComposition & { readonly mode: "production" };

export interface DemoPortalCompositionOptions {
  readonly mode: "demo";
  readonly storage: PortalSessionStorage;
  readonly now?: () => string;
}

export interface ProductionPortalCompositionOptions {
  readonly mode: "production";
  readonly ports: PortalPortBindings;
}

export type CreatePortalCompositionOptions =
  | DemoPortalCompositionOptions
  | ProductionPortalCompositionOptions;

const PRODUCTION_FALLBACK_DISABLED = "demo fallback is disabled";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidMode(): never {
  throw new PortalError(
    "INVALID_INPUT",
    'Portal composition requires an explicit mode of "demo" or "production".',
  );
}

function productionConfiguration(detail: string): never {
  throw new PortalError(
    "PRODUCTION_CONFIGURATION",
    `Production portal ports ${detail}; ${PRODUCTION_FALLBACK_DISABLED}.`,
  );
}

function requirePort(
  value: unknown,
  path: string,
  methods: readonly string[],
): void {
  if (!isRecord(value)) productionConfiguration(`are incomplete at ${path}`);
  const missing = methods.find((method) => typeof value[method] !== "function");
  if (missing !== undefined) productionConfiguration(`are incomplete at ${path}.${missing}`);
}

function assertCompleteProductionBindings(value: unknown): asserts value is PortalPortBindings {
  if (!isRecord(value)) productionConfiguration("are required");

  if (isRecord(value.session) && "selectDemoIdentity" in value.session) {
    productionConfiguration("must be production-neutral at session.selectDemoIdentity");
  }
  requirePort(value.session, "session", ["getSession", "signOut"]);

  if (!isRecord(value.customer)) productionConfiguration("are incomplete at customer");
  requirePort(value.customer.account, "customer.account", [
    "getAccount",
    "updateAccount",
    "listCustomerBookings",
    "listCustomRequests",
  ]);
  requirePort(value.customer.cancellations, "customer.cancellations", [
    "requestCancellation",
    "listOwnCancellationRequests",
  ]);
  requirePort(value.customer.reviews, "customer.reviews", [
    "submitTourReview",
    "listOwnReviews",
  ]);

  if (!isRecord(value.guide)) productionConfiguration("are incomplete at guide");
  requirePort(value.guide.profile, "guide.profile", ["getGuideProfile", "updateGuideProfile"]);
  requirePort(value.guide.assignments, "guide.assignments", ["listAssignedTours", "getAssignedTour"]);

  if (!isRecord(value.admin)) productionConfiguration("are incomplete at admin");
  requirePort(value.admin.users, "admin.users", ["listUsers", "updateUserRole"]);
  requirePort(value.admin.catalog, "admin.catalog", ["listLocations", "listFixedTours", "listDepartures"]);
  requirePort(value.admin.personalizedRequests, "admin.personalizedRequests", [
    "listPersonalizedRequests",
    "reviewPersonalizedRequest",
  ]);
  requirePort(value.admin.bookings, "admin.bookings", ["listAdminBookings"]);
  requirePort(value.admin.cancellations, "admin.cancellations", [
    "listCancellationRequests",
    "decideCancellation",
  ]);
  requirePort(value.admin.assignments, "admin.assignments", ["assignGuideToFixedDeparture"]);
  requirePort(value.admin.reporting, "admin.reporting", ["getReport"]);
}

function assertDemoStorage(value: unknown): asserts value is PortalSessionStorage {
  if (!isRecord(value) ||
    typeof value.getItem !== "function" ||
    typeof value.setItem !== "function" ||
    typeof value.removeItem !== "function") {
    throw new PortalError(
      "INVALID_STORAGE",
      "Demo portal composition requires session storage to be injected explicitly.",
    );
  }
}

function withCompositionMetadata<TMode extends PortalMode>(
  mode: TMode,
  ports: PortalPortBindings,
): PortalComposition & { readonly mode: TMode } {
  return {
    mode,
    productionGap: PORTAL_PRODUCTION_GAP,
    session: ports.session,
    customer: ports.customer,
    guide: ports.guide,
    admin: ports.admin,
  };
}

function withDemoCompositionMetadata(
  ports: Omit<PortalPortBindings, "session"> & { readonly session: DemoSessionPort },
  initialized: Promise<void>,
): DemoPortalComposition {
  return {
    mode: "demo",
    productionGap: PORTAL_PRODUCTION_GAP,
    session: ports.session,
    customer: ports.customer,
    guide: ports.guide,
    admin: ports.admin,
    initialized,
  };
}

export function createPortalComposition(
  options: DemoPortalCompositionOptions,
): DemoPortalComposition;
export function createPortalComposition(
  options: ProductionPortalCompositionOptions,
): ProductionPortalComposition;
export function createPortalComposition(
  options: CreatePortalCompositionOptions,
): DemoPortalComposition | ProductionPortalComposition;
export function createPortalComposition(options: CreatePortalCompositionOptions): DemoPortalComposition | ProductionPortalComposition {
  if (!isRecord(options) || (options.mode !== "demo" && options.mode !== "production")) invalidMode();

  if (options.mode === "production") {
    assertCompleteProductionBindings(options.ports);
    return withCompositionMetadata("production", options.ports);
  }

  assertDemoStorage(options.storage);
  const repository = createDemoPortalRepository({ storage: options.storage, now: options.now });
  // Reset through the repository boundary during composition creation; callers can await this promise explicitly.
  const initialized = repository.reset();
  return withDemoCompositionMetadata({
    session: repository.session,
    customer: repository.customer,
    guide: repository.guide,
    admin: repository.admin,
  }, initialized);
}
