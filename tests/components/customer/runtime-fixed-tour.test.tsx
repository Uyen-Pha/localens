import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RuntimeFixedTourBooking } from "@/components/customer/runtime-fixed-tour-booking";
import { RuntimeTourCatalog } from "@/components/customer/runtime-tour-catalog";
import {
  FixedTourRuntimeError,
  type FixedTourRuntimePort,
} from "@/lib/application/fixed-tour/contracts";
import type { PortalIdentity, RuntimeSessionPort } from "@/lib/application/portal/contracts";
import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";
import type { LiveDepartureAvailability, PublishedTour } from "@/lib/domain/data/contracts";

const DEPARTURE_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "22222222-2222-4222-8222-222222222222";

const tours: Record<"en" | "vi", PublishedTour> = {
  en: {
    id: "33333333-3333-4333-8333-333333333333",
    versionId: VERSION_ID,
    slug: "runtime-saigon",
    locale: "en",
    title: "Runtime Saigon walk",
    summary: "A verified local-runtime walk.",
    meetingPoint: "Ben Thanh gate",
    durationMinutes: 180,
    priceVndMinor: "450000",
    inclusions: ["Local guide"],
    exclusions: ["Personal purchases"],
    cancellationPolicy: "Hold only; payment remains pending.",
    sourceUrl: "https://example.test/runtime",
    verifiedAt: "2099-01-01T00:00:00.000Z",
    attribution: "LocalLens synthetic fixture",
    license: "Local-only",
    stops: [{ position: 1, placeId: "44444444-4444-4444-8444-444444444444", placeSlug: "market", title: "Market" }],
  },
  vi: {
    id: "33333333-3333-4333-8333-333333333333",
    versionId: VERSION_ID,
    slug: "runtime-saigon",
    locale: "vi",
    title: "Dạo Sài Gòn runtime",
    summary: "Hành trình runtime cục bộ đã kiểm chứng.",
    meetingPoint: "Cổng Bến Thành",
    durationMinutes: 180,
    priceVndMinor: "450000",
    inclusions: ["Hướng dẫn viên địa phương"],
    exclusions: ["Chi tiêu cá nhân"],
    cancellationPolicy: "Chỉ giữ chỗ; thanh toán vẫn đang chờ.",
    sourceUrl: "https://example.test/runtime",
    verifiedAt: "2099-01-01T00:00:00.000Z",
    attribution: "Fixture tổng hợp LocalLens",
    license: "Chỉ dùng cục bộ",
    stops: [{ position: 1, placeId: "44444444-4444-4444-8444-444444444444", placeSlug: "market", title: "Chợ" }],
  },
};

const availability: LiveDepartureAvailability = {
  id: DEPARTURE_ID,
  tourVersionId: VERSION_ID,
  startAt: "2099-09-05T02:00:00.000Z",
  endAt: "2099-09-05T05:00:00.000Z",
  status: "scheduled",
  remainingCapacity: 8,
};

function fixedTour(overrides: Partial<FixedTourRuntimePort> = {}): FixedTourRuntimePort {
  return {
    listPublishedTours: vi.fn(async (locale: "en" | "vi") => [tours[locale]]),
    listAvailability: vi.fn(async () => [availability]),
    beginBooking: vi.fn(async () => ({
      bookingId: "55555555-5555-4555-8555-555555555555",
      holdExpiresAt: "2099-09-05T02:35:00.000Z",
      state: "created" as const,
    })),
    listOwnBookings: vi.fn(async () => []),
    listOwnPaymentStatuses: vi.fn(async () => []),
    completeSimulatedPayment: vi.fn(async () => ({
      bookingId: "55555555-5555-4555-8555-555555555555",
      bookingStatus: "confirmed" as const,
      paymentStatus: "paid" as const,
      simulatedAt: "2099-09-05T02:05:00.000Z",
      state: "completed" as const,
    })),
    ...overrides,
  };
}

function identity(role: PortalIdentity["role"]): PortalIdentity {
  return {
    userId: "66666666-6666-4666-8666-666666666666",
    role,
    locale: "en",
    displayName: "Runtime user",
    email: `${role}@localens.test`,
  };
}

function shell(port: FixedTourRuntimePort, current: PortalIdentity | null): SupabasePortalShell {
  const session: RuntimeSessionPort = {
    getSession: vi.fn(async () => current),
    signInWithPassword: vi.fn(async () => {
      throw new Error("not used");
    }),
    signOut: vi.fn(async () => undefined),
  };
  return { mode: "supabase", initialized: Promise.resolve(), session, fixedTour: port };
}

beforeEach(() => window.sessionStorage.clear());
afterEach(cleanup);

describe("runtime fixed-tour catalog", () => {
  it.each(["en", "vi"] as const)("renders localized %s data and live availability", async (locale) => {
    const port = fixedTour();
    render(<RuntimeTourCatalog locale={locale} fixedTour={port} initialized={Promise.resolve()} />);

    expect(await screen.findByRole("heading", { name: tours[locale].title })).toBeInTheDocument();
    expect(screen.getByText(tours[locale].summary)).toBeInTheDocument();
    expect(screen.getByText(tours[locale].meetingPoint)).toBeInTheDocument();
    expect(screen.getByText(tours[locale].cancellationPolicy)).toBeInTheDocument();
    expect(screen.getByText(locale === "vi" ? "Còn 8 chỗ" : "8 seats remaining")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(tours[locale].title) })).toHaveAttribute(
      "href",
      `/${locale}/booking?departure=${DEPARTURE_ID}&partySize=1`,
    );
    expect(port.listPublishedTours).toHaveBeenCalledWith(locale);
  });

  it("disables sold-out departures and redacts service errors", async () => {
    const secret = "postgres://secret@localhost";
    const port = fixedTour({
      listAvailability: vi.fn(async () => [{ ...availability, remainingCapacity: 0 }]),
    });
    const view = render(<RuntimeTourCatalog locale="en" fixedTour={port} initialized={Promise.resolve()} />);
    expect(await screen.findByText(/sold out/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Runtime Saigon walk/ })).not.toBeInTheDocument();

    view.unmount();
    render(<RuntimeTourCatalog
      locale="en"
      fixedTour={fixedTour({ listPublishedTours: vi.fn(async () => { throw new Error(secret); }) })}
      initialized={Promise.resolve()}
    />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable/i);
    expect(document.body).not.toHaveTextContent(secret);
  });
});

describe("runtime fixed-tour booking", () => {
  it.each([null, identity("guide"), identity("admin")])(
    "never calls the hold RPC for a non-customer session",
    async (current) => {
      const port = fixedTour();
      render(<RuntimeFixedTourBooking
        locale="en"
        composition={shell(port, current)}
        departureId={DEPARTURE_ID}
        initialPartySize="1"
        navigate={() => undefined}
      />);
      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(port.beginBooking).not.toHaveBeenCalled();
    },
  );

  it("validates party size and sends only the four browser-owned fields", async () => {
    const port = fixedTour();
    const destinations: string[] = [];
    render(<RuntimeFixedTourBooking
      locale="en"
      composition={shell(port, identity("customer"))}
      departureId={DEPARTURE_ID}
      initialPartySize="0"
      navigate={(path) => destinations.push(path)}
    />);

    await screen.findByRole("spinbutton", { name: /party size/i });
    fireEvent.click(screen.getByRole("button", { name: /hold/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/between 1 and 100/i);
    const correctedParty = screen.getByRole("spinbutton", { name: /party size/i });
    expect(correctedParty).toHaveFocus();
    expect(port.beginBooking).not.toHaveBeenCalled();

    fireEvent.change(correctedParty, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /hold/i }));
    await waitFor(() => expect(port.beginBooking).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(port.beginBooking).mock.calls[0]?.[0];
    expect(Object.keys(payload ?? {}).sort()).toEqual([
      "departureId", "idempotencyKey", "locale", "partySize",
    ]);
    expect(payload).toMatchObject({ departureId: DEPARTURE_ID, locale: "en", partySize: 2 });
    expect(destinations).toEqual(["/en/account/?hold=created"]);
  });

  it("reuses one session idempotency key for the same normalized payload", async () => {
    const beginBooking = vi.fn()
      .mockResolvedValueOnce({ bookingId: "55555555-5555-4555-8555-555555555555", holdExpiresAt: "2099-09-05T02:35:00.000Z", state: "created" })
      .mockResolvedValueOnce({ bookingId: "55555555-5555-4555-8555-555555555555", holdExpiresAt: "2099-09-05T02:35:00.000Z", state: "resumed" });
    const port = fixedTour({ beginBooking });
    const first = render(<RuntimeFixedTourBooking locale="en" composition={shell(port, identity("customer"))} departureId={DEPARTURE_ID} initialPartySize="1" navigate={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: /hold/i }));
    await waitFor(() => expect(beginBooking).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<RuntimeFixedTourBooking locale="en" composition={shell(port, identity("customer"))} departureId={DEPARTURE_ID} initialPartySize="1" navigate={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: /hold/i }));
    await waitFor(() => expect(beginBooking).toHaveBeenCalledTimes(2));
    expect(beginBooking.mock.calls[0][0].idempotencyKey).toBe(beginBooking.mock.calls[1][0].idempotencyKey);
  });

  it("suppresses a duplicate submit while the first hold is pending", async () => {
    const beginBooking = vi.fn(() => new Promise<never>(() => undefined));
    const port = fixedTour({ beginBooking });
    render(<RuntimeFixedTourBooking
      locale="en"
      composition={shell(port, identity("customer"))}
      departureId={DEPARTURE_ID}
      initialPartySize="1"
      navigate={() => undefined}
    />);

    const button = await screen.findByRole("button", { name: /hold/i });
    const form = button.closest("form");
    expect(form).not.toBeNull();
    await act(async () => {
      fireEvent.submit(form!);
      fireEvent.submit(form!);
    });

    expect(beginBooking).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["IDEMPOTENCY_CONFLICT", /earlier request/i],
    ["SOLD_OUT", /sold out/i],
    ["NOT_FOUND", /no longer available/i],
    ["SERVICE_UNAVAILABLE", /service is unavailable/i],
  ] as const)("maps %s without leaking adapter details", async (code, message) => {
    const port = fixedTour({ beginBooking: vi.fn(async () => { throw new FixedTourRuntimeError(code); }) });
    render(<RuntimeFixedTourBooking locale="en" composition={shell(port, identity("customer"))} departureId={DEPARTURE_ID} initialPartySize="1" navigate={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: /hold/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(document.body).not.toHaveTextContent("P0001");
  });
});
