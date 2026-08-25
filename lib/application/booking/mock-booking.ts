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

const STORAGE_PREFIX = "locallens.demo.booking.v1:";
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

function loadBooking(storage: BookingStorage, bookingId: string): Omit<LocalDemoBooking, "resumed"> | undefined {
  const raw = storage.getItem(storageKey(bookingId));
  if (raw === null) return undefined;
  try {
    const value = JSON.parse(raw) as Omit<LocalDemoBooking, "resumed">;
    if (
      typeof value !== "object" ||
      value === null ||
      value.bookingId !== bookingId ||
      (value.status !== "held" && value.status !== "paid") ||
      (value.paymentStatus !== "unpaid" && value.paymentStatus !== "succeeded")
    ) return undefined;
    return value;
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
    const holdIsActive = existing.status === "paid" || new Date(existing.holdExpiresAt).getTime() > clock.getTime();
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
    createdAt,
    updatedAt: createdAt,
  };
  saveBooking(storage, booking);
  return { ...booking, resumed: false };
}

export function createTestPayment(input: CreateTestPaymentInput): LocalDemoBooking {
  if (typeof input.bookingId !== "string" || input.bookingId.length === 0) {
    throw new Error("Unknown demo booking");
  }
  const storage = input.storage ?? getDefaultStorage();
  const existing = loadBooking(storage, input.bookingId);
  if (existing === undefined) throw new Error("Unknown demo booking");

  const clock = validNow(input.now);
  if (existing.status === "paid") return { ...existing, resumed: true };
  if (clock.getTime() >= new Date(existing.testSessionExpiresAt).getTime()) {
    throw new Error("Demo payment session expired");
  }
  if (clock.getTime() >= new Date(existing.holdExpiresAt).getTime()) {
    throw new Error("Demo booking hold expired");
  }

  const paid: Omit<LocalDemoBooking, "resumed"> = {
    ...existing,
    status: "paid",
    paymentStatus: "succeeded",
    updatedAt: clock.toISOString(),
  };
  saveBooking(storage, paid);
  return { ...paid, resumed: false };
}
