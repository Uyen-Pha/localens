/**
 * Browser-only demo booking boundary.
 *
 * The departure table is an internal, allowlisted stand-in for the future
 * `create-booking` Edge Function.  The URL may identify a departure, but it
 * never supplies price, capacity, or payment values.
 */

export type DemoDeparture = Readonly<{
  departureId: string;
  tourSlug: string;
  date: string;
  startsAt: string;
  timezone: "Asia/Ho_Chi_Minh";
  meetingPoint: string;
  currency: "VND";
  unitPriceMinor: number;
  remainingCapacity: number;
}>;

export const DEMO_DEPARTURES: readonly DemoDeparture[] = Object.freeze([
  {
    departureId: "demo-departure-markets-and-street-food-2026-09-05",
    tourSlug: "demo-markets-and-street-food",
    date: "2026-09-05",
    startsAt: "09:00",
    timezone: "Asia/Ho_Chi_Minh",
    meetingPoint: "Ben Thanh Market north gate",
    currency: "VND",
    unitPriceMinor: 480_000,
    remainingCapacity: 8,
  },
  {
    departureId: "demo-departure-history-and-memory-2026-09-06",
    tourSlug: "demo-history-and-memory",
    date: "2026-09-06",
    startsAt: "09:30",
    timezone: "Asia/Ho_Chi_Minh",
    meetingPoint: "War Remnants Museum entrance",
    currency: "VND",
    unitPriceMinor: 420_000,
    remainingCapacity: 8,
  },
  {
    departureId: "demo-departure-cho-lon-craft-2026-09-07",
    tourSlug: "demo-cho-lon-craft",
    date: "2026-09-07",
    startsAt: "08:30",
    timezone: "Asia/Ho_Chi_Minh",
    meetingPoint: "Binh Tay Market east gate",
    currency: "VND",
    unitPriceMinor: 520_000,
    remainingCapacity: 8,
  },
  {
    departureId: "demo-departure-city-life-mix-2026-09-08",
    tourSlug: "demo-city-life-mix",
    date: "2026-09-08",
    startsAt: "09:00",
    timezone: "Asia/Ho_Chi_Minh",
    meetingPoint: "Central District 1 meeting point",
    currency: "VND",
    unitPriceMinor: 680_000,
    remainingCapacity: 8,
  },
] as const);

export const DEMO_DEPARTURE_IDS = DEMO_DEPARTURES.map(({ departureId }) => departureId) as readonly string[];

export type BookingStatus = "held" | "paid";
export type PaymentStatus = "unpaid" | "succeeded";
export type DemoPaymentOutcome = "pending" | "succeeded" | "failed" | "cancelled" | "expired";

export type DemoPaymentAttempt = Readonly<{
  attemptId: string;
  bookingId: string;
  idempotencyKey: string;
  outcome: DemoPaymentOutcome;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
}>;

export type BookingQuote = Readonly<{
  currency: "VND";
  unitPriceMinor: number;
  partySize: number;
  totalMinor: number;
}>;

export type LocalDemoBooking = Readonly<{
  bookingId: string;
  departureId: string;
  partySize: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  quote: BookingQuote;
  holdExpiresAt: string;
  testSessionExpiresAt: string;
  paymentAttempts: readonly DemoPaymentAttempt[];
  createdAt: string;
  updatedAt: string;
  resumed: boolean;
}>;

export interface BookingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CreateLocalBookingInput {
  departureId: unknown;
  partySize: unknown;
  storage?: BookingStorage;
  now?: Date;
}

export interface CreateTestPaymentInput {
  bookingId: unknown;
  storage?: BookingStorage;
  now?: Date;
}

export interface StartTestPaymentInput {
  bookingId: unknown;
  idempotencyKey: unknown;
  storage?: BookingStorage;
  now?: Date;
}

export interface FinalizeTestPaymentInput extends StartTestPaymentInput {
  outcome: "succeeded" | "failed" | "cancelled";
}

const STORAGE_PREFIX = "locallens.demo.booking.v1:";
const PAYMENT_SESSION_MINUTES = 30;
const PAYMENT_IDEMPOTENCY_KEY = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const PAYMENT_OUTCOMES = new Set<DemoPaymentOutcome>(["pending", "succeeded", "failed", "cancelled", "expired"]);
const memoryStorageValues = new Map<string, string>();
const memoryStorage: BookingStorage = {
  getItem: (key) => memoryStorageValues.get(key) ?? null,
  setItem: (key, value) => memoryStorageValues.set(key, value),
};

function getDefaultStorage(): BookingStorage {
  if (typeof window === "undefined") return memoryStorage;
  try {
    const candidate = window.localStorage;
    const probe = `${STORAGE_PREFIX}probe`;
    candidate.setItem(probe, "1");
    candidate.removeItem(probe);
    return candidate;
  } catch {
    return memoryStorage;
  }
}

function storageKey(bookingId: string): string {
  return `${STORAGE_PREFIX}${bookingId}`;
}

function validNow(now: Date | undefined): Date {
  const candidate = now ?? new Date();
  if (!(candidate instanceof Date) || Number.isNaN(candidate.getTime())) {
    throw new Error("Invalid booking clock");
  }
  return candidate;
}

function validPartySize(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 20) {
    throw new Error("Party size must be between 1 and 20");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteDateString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return Object.keys(value).length === expected.size && Object.keys(value).every((key) => expected.has(key));
}

function validBookingId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Unknown demo booking");
  return value;
}

function validIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !PAYMENT_IDEMPOTENCY_KEY.test(value)) {
    throw new Error("Invalid payment idempotency key");
  }
  return value;
}

function paymentAttemptId(bookingId: string, idempotencyKey: string): string {
  return `${bookingId}:payment:${idempotencyKey}`;
}

function isValidPaymentAttempts(
  value: unknown,
  bookingId: string,
  bookingCreatedAt: number,
  bookingUpdatedAt: number,
  holdExpiresAt: number,
): value is DemoPaymentAttempt[] {
  if (!Array.isArray(value) || value.length > 20) return false;
  const keys = new Set<string>();
  let succeeded = 0;
  for (const attempt of value) {
    if (!isRecord(attempt) || !hasOnlyKeys(attempt, [
      "attemptId", "bookingId", "idempotencyKey", "outcome", "createdAt", "expiresAt", "updatedAt",
    ])) return false;
    if (
      attempt.bookingId !== bookingId ||
      typeof attempt.idempotencyKey !== "string" ||
      !PAYMENT_IDEMPOTENCY_KEY.test(attempt.idempotencyKey) ||
      attempt.attemptId !== paymentAttemptId(bookingId, attempt.idempotencyKey) ||
      keys.has(attempt.idempotencyKey) ||
      typeof attempt.outcome !== "string" ||
      !PAYMENT_OUTCOMES.has(attempt.outcome as DemoPaymentOutcome) ||
      !isFiniteDateString(attempt.createdAt) ||
      !isFiniteDateString(attempt.expiresAt) ||
      !isFiniteDateString(attempt.updatedAt)
    ) return false;
    keys.add(attempt.idempotencyKey);
    const createdAt = new Date(attempt.createdAt).getTime();
    const expiresAt = new Date(attempt.expiresAt).getTime();
    const updatedAt = new Date(attempt.updatedAt).getTime();
    if (
      createdAt < bookingCreatedAt ||
      expiresAt <= createdAt ||
      expiresAt > holdExpiresAt ||
      updatedAt < createdAt ||
      updatedAt > bookingUpdatedAt ||
      (attempt.outcome === "pending" && updatedAt !== createdAt) ||
      (attempt.outcome === "expired" && updatedAt < expiresAt)
    ) return false;
    if (attempt.outcome === "succeeded") succeeded += 1;
  }
  return succeeded <= 1;
}

function loadBooking(storage: BookingStorage, bookingId: string): Omit<LocalDemoBooking, "resumed"> | undefined {
  const raw = storage.getItem(storageKey(bookingId));
  if (raw === null) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !hasOnlyKeys(value, [
      "bookingId",
      "departureId",
      "partySize",
      "status",
      "paymentStatus",
      "quote",
      "holdExpiresAt",
      "testSessionExpiresAt",
      "paymentAttempts",
      "createdAt",
      "updatedAt",
    ])) return undefined;

    const departure = getDemoDeparture(value.departureId);
    const partySize = value.partySize;
    const quote = value.quote;
    if (
      typeof value.bookingId !== "string" ||
      value.bookingId !== bookingId ||
      departure === undefined ||
      typeof partySize !== "number" ||
      !Number.isSafeInteger(partySize) ||
      partySize < 1 ||
      partySize > 20 ||
      partySize > departure.remainingCapacity ||
      value.bookingId !== `demo-booking-${departure.departureId}-${partySize}` ||
      (value.status !== "held" && value.status !== "paid") ||
      (value.paymentStatus !== "unpaid" && value.paymentStatus !== "succeeded") ||
      (value.status === "held" && value.paymentStatus !== "unpaid") ||
      (value.status === "paid" && value.paymentStatus !== "succeeded") ||
      !isRecord(quote) ||
      !hasOnlyKeys(quote, ["currency", "unitPriceMinor", "partySize", "totalMinor"]) ||
      quote.currency !== departure.currency ||
      quote.unitPriceMinor !== departure.unitPriceMinor ||
      quote.partySize !== partySize ||
      quote.totalMinor !== departure.unitPriceMinor * partySize ||
      !Number.isSafeInteger(quote.unitPriceMinor) ||
      !Number.isSafeInteger(quote.partySize) ||
      !Number.isSafeInteger(quote.totalMinor) ||
      !isFiniteDateString(value.createdAt) ||
      !isFiniteDateString(value.updatedAt) ||
      !isFiniteDateString(value.holdExpiresAt) ||
      !isFiniteDateString(value.testSessionExpiresAt)
    ) return undefined;

    const createdAt = new Date(value.createdAt).getTime();
    const updatedAt = new Date(value.updatedAt).getTime();
    const holdExpiresAt = new Date(value.holdExpiresAt).getTime();
    const testSessionExpiresAt = new Date(value.testSessionExpiresAt).getTime();
    if (!isValidPaymentAttempts(value.paymentAttempts, bookingId, createdAt, updatedAt, holdExpiresAt)) return undefined;
    const paymentAttempts = value.paymentAttempts;
    const successfulAttempts = paymentAttempts.filter((attempt) => attempt.outcome === "succeeded");
    if (
      updatedAt < createdAt ||
      holdExpiresAt !== createdAt + 35 * 60_000 ||
      testSessionExpiresAt <= createdAt ||
      testSessionExpiresAt > holdExpiresAt ||
      (paymentAttempts.length === 0 && testSessionExpiresAt !== createdAt + PAYMENT_SESSION_MINUTES * 60_000) ||
      (paymentAttempts.length > 0 && testSessionExpiresAt !== new Date(paymentAttempts.at(-1)!.expiresAt).getTime()) ||
      (value.status === "paid" && successfulAttempts.length !== 1) ||
      (value.status === "held" && successfulAttempts.length !== 0)
    ) return undefined;

    return value as Omit<LocalDemoBooking, "resumed">;
  } catch {
    return undefined;
  }
}

function saveBooking(storage: BookingStorage, booking: Omit<LocalDemoBooking, "resumed">): void {
  storage.setItem(storageKey(booking.bookingId), JSON.stringify(booking));
}

export function getDemoDeparture(departureId: unknown): DemoDeparture | undefined {
  if (typeof departureId !== "string") return undefined;
  return DEMO_DEPARTURES.find((departure) => departure.departureId === departureId);
}

export function getDemoDepartureForTourSlug(tourSlug: string): DemoDeparture | undefined {
  return DEMO_DEPARTURES.find((departure) => departure.tourSlug === tourSlug);
}

export function createLocalBooking(input: CreateLocalBookingInput): LocalDemoBooking {
  const departure = getDemoDeparture(input.departureId);
  if (departure === undefined) throw new Error("Unknown demo departure");

  const partySize = validPartySize(input.partySize);
  if (partySize > departure.remainingCapacity) throw new Error("Not enough demo capacity");

  const clock = validNow(input.now);
  const storage = input.storage ?? getDefaultStorage();
  const bookingId = `demo-booking-${departure.departureId}-${partySize}`;
  const existing = loadBooking(storage, bookingId);
  if (existing !== undefined) {
    const holdIsActive = existing.status === "paid" || (
      new Date(existing.holdExpiresAt).getTime() > clock.getTime() &&
      new Date(existing.testSessionExpiresAt).getTime() > clock.getTime()
    );
    if (holdIsActive) return { ...existing, resumed: true };
  }

  const createdAt = clock.toISOString();
  const booking: Omit<LocalDemoBooking, "resumed"> = {
    bookingId,
    departureId: departure.departureId,
    partySize,
    status: "held",
    paymentStatus: "unpaid",
    quote: {
      currency: departure.currency,
      unitPriceMinor: departure.unitPriceMinor,
      partySize,
      totalMinor: departure.unitPriceMinor * partySize,
    },
    holdExpiresAt: new Date(clock.getTime() + 35 * 60_000).toISOString(),
    testSessionExpiresAt: new Date(clock.getTime() + 30 * 60_000).toISOString(),
    paymentAttempts: [],
    createdAt,
    updatedAt: createdAt,
  };
  saveBooking(storage, booking);
  return { ...booking, resumed: false };
}

export function startTestPayment(input: StartTestPaymentInput): DemoPaymentAttempt {
  const bookingId = validBookingId(input.bookingId);
  const idempotencyKey = validIdempotencyKey(input.idempotencyKey);
  const storage = input.storage ?? getDefaultStorage();
  const existing = loadBooking(storage, bookingId);
  if (existing === undefined) throw new Error("Unknown demo booking");

  const clock = validNow(input.now);
  const prior = existing.paymentAttempts.find((attempt) => attempt.idempotencyKey === idempotencyKey);
  if (prior !== undefined) {
    if (prior.outcome !== "pending" || clock.getTime() < new Date(prior.expiresAt).getTime()) return prior;
    const expiredAttempt: DemoPaymentAttempt = { ...prior, outcome: "expired", updatedAt: clock.toISOString() };
    const expiredBooking: Omit<LocalDemoBooking, "resumed"> = {
      ...existing,
      paymentAttempts: existing.paymentAttempts.map((attempt) => attempt.idempotencyKey === idempotencyKey ? expiredAttempt : attempt),
      updatedAt: clock.toISOString(),
    };
    saveBooking(storage, expiredBooking);
    return expiredAttempt;
  }
  if (clock.getTime() >= new Date(existing.holdExpiresAt).getTime()) {
    throw new Error("Demo booking hold expired");
  }
  if (existing.status === "paid") throw new Error("Demo booking already paid");
  if (existing.paymentAttempts.length >= 20) throw new Error("Too many demo payment attempts");

  const currentSessionExpiresAt = new Date(existing.testSessionExpiresAt).getTime();
  const holdExpiresAt = new Date(existing.holdExpiresAt).getTime();
  const expiresAt = existing.paymentAttempts.length === 0 || clock.getTime() < currentSessionExpiresAt
    ? currentSessionExpiresAt
    : Math.min(clock.getTime() + PAYMENT_SESSION_MINUTES * 60_000, holdExpiresAt);
  const expiredAtStart = clock.getTime() >= expiresAt;
  const createdAt = expiredAtStart ? existing.createdAt : clock.toISOString();
  const attempt: DemoPaymentAttempt = {
    attemptId: paymentAttemptId(bookingId, idempotencyKey),
    bookingId,
    idempotencyKey,
    outcome: expiredAtStart ? "expired" : "pending",
    createdAt,
    expiresAt: new Date(expiresAt).toISOString(),
    updatedAt: clock.toISOString(),
  };
  const nextBooking: Omit<LocalDemoBooking, "resumed"> = {
    ...existing,
    testSessionExpiresAt: attempt.expiresAt,
    paymentAttempts: [...existing.paymentAttempts, attempt],
    updatedAt: clock.toISOString(),
  };
  saveBooking(storage, nextBooking);
  return attempt;
}

export function finalizeTestPayment(input: FinalizeTestPaymentInput): LocalDemoBooking {
  const bookingId = validBookingId(input.bookingId);
  const idempotencyKey = validIdempotencyKey(input.idempotencyKey);
  const storage = input.storage ?? getDefaultStorage();
  const existing = loadBooking(storage, bookingId);
  if (existing === undefined) throw new Error("Unknown demo booking");
  const prior = existing.paymentAttempts.find((attempt) => attempt.idempotencyKey === idempotencyKey);
  if (prior === undefined) throw new Error("Unknown demo payment attempt");
  if (prior.outcome !== "pending") return { ...existing, resumed: true };

  const clock = validNow(input.now);
  if (clock.getTime() >= new Date(existing.holdExpiresAt).getTime()) {
    throw new Error("Demo booking hold expired");
  }
  const outcome: DemoPaymentOutcome = clock.getTime() >= new Date(prior.expiresAt).getTime()
    ? "expired"
    : input.outcome;
  const updatedAttempt: DemoPaymentAttempt = { ...prior, outcome, updatedAt: clock.toISOString() };
  const next: Omit<LocalDemoBooking, "resumed"> = {
    ...existing,
    status: outcome === "succeeded" ? "paid" : "held",
    paymentStatus: outcome === "succeeded" ? "succeeded" : "unpaid",
    paymentAttempts: existing.paymentAttempts.map((attempt) => attempt.idempotencyKey === idempotencyKey ? updatedAttempt : attempt),
    updatedAt: clock.toISOString(),
  };
  saveBooking(storage, next);
  return { ...next, resumed: false };
}

export function createTestPayment(input: CreateTestPaymentInput): LocalDemoBooking {
  const bookingId = validBookingId(input.bookingId);
  const storage = input.storage ?? getDefaultStorage();
  const existing = loadBooking(storage, bookingId);
  if (existing === undefined) throw new Error("Unknown demo booking");
  if (existing.status === "paid") return { ...existing, resumed: true };

  const idempotencyKey = "legacy-success";
  const attempt = startTestPayment({ bookingId, idempotencyKey, storage, now: input.now });
  if (attempt.outcome === "expired") throw new Error("Demo payment session expired");
  return finalizeTestPayment({ bookingId, idempotencyKey, outcome: "succeeded", storage, now: input.now });
}
