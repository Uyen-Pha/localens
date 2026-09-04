import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { PortalSurface, type PortalSurfaceProps } from "@/components/portals/portal-surface";
import { createPortalComposition, type DemoPortalComposition } from "@/lib/application/portal/composition";
import { PortalError } from "@/lib/application/portal/contracts";
import {
  createMemorySessionStorage,
  PORTAL_DEMO_STORAGE_KEY,
} from "@/lib/infrastructure/demo/portal-repository";

const CLOCK = () => "2026-08-31T12:00:00.000Z";
const compositions: DemoPortalComposition[] = [];

function TestSurface(props: PortalSurfaceProps) {
  return <PortalSurface {...props} navigate={() => undefined} />;
}

async function createComposition(): Promise<DemoPortalComposition> {
  const composition = createPortalComposition({
    mode: "demo",
    storage: createMemorySessionStorage(),
    now: CLOCK,
  });
  await composition.initialized;
  compositions.push(composition);
  return composition;
}

async function signIn(composition: DemoPortalComposition, userId: string): Promise<void> {
  await composition.session.selectDemoIdentity(userId);
}

async function signOutTrackedCompositions(tracked: readonly DemoPortalComposition[]): Promise<void> {
  await Promise.all(tracked.map((composition) => composition.session.signOut()));
}

afterEach(async () => {
  cleanup();
  try {
    await signOutTrackedCompositions(compositions);
  } finally {
    compositions.length = 0;
    window.history.replaceState({}, "", "/");
  }
});

describe("PortalSurface", () => {
  it("shows a safe sign-in prompt for direct unauthenticated entry", async () => {
    const composition = await createComposition();

    render(<TestSurface locale="en" expectedRole="customer" composition={composition} />);

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(await screen.findByRole(
      "heading",
      { name: /sign in to your demo account/i },
      { timeout: 5_000 },
    )).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /choose a demo identity/i }).getAttribute("href")).toMatch(/^\/en\/sign-in\/?$/);
    expect(screen.queryByText(/markets and street food/i)).not.toBeInTheDocument();
  });

  it("does not expose customer data when a guide enters the customer route", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-guide");

    render(<TestSurface locale="en" expectedRole="customer" composition={composition} />);

    expect(await screen.findByRole("heading", { name: /customer portal unavailable/i })).toBeInTheDocument();
    expect(screen.getByText(/signed in as a guide/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open your portal/i })).toHaveAttribute("href", "/en/guide");
    expect(screen.queryByRole("heading", { name: /your bookings/i })).not.toBeInTheDocument();
    expect(screen.queryByText("traveler@example.invalid")).not.toBeInTheDocument();
  });

  it("soft-navigates after the actual identity link click and keeps the same composition", async () => {
    const composition = await createComposition();
    const destinations: string[] = [];

    function BrowserCompositionHarness() {
      const [path, setPath] = useState("/en/sign-in/");
      const expectedRole = path.includes("/account") ? "customer" : undefined;
      return (
        <PortalSurface
          locale="en"
          expectedRole={expectedRole}
          composition={composition}
          navigate={(nextPath) => {
            destinations.push(nextPath);
            setPath(nextPath);
          }}
        />
      );
    }

    render(<BrowserCompositionHarness />);

    const customerLinks = await screen.findAllByRole("link", { name: /continue as customer/i });
    expect(customerLinks).toHaveLength(2);
    const primaryCustomerHeading = screen.getByRole("heading", { name: "Demo Traveler" });
    const secondaryCustomerHeading = screen.getByRole("heading", { name: "Second Demo Traveler" });
    expect(primaryCustomerHeading).toBeInTheDocument();
    expect(secondaryCustomerHeading).toBeInTheDocument();
    const primaryCustomerCard = primaryCustomerHeading.closest("article");
    const secondaryCustomerCard = secondaryCustomerHeading.closest("article");
    expect(primaryCustomerCard).not.toBeNull();
    expect(secondaryCustomerCard).not.toBeNull();
    expect(customerLinks).toContain(within(primaryCustomerCard!).getByRole("link", { name: "Continue as Customer" }));
    expect(customerLinks).toContain(within(secondaryCustomerCard!).getByRole("link", { name: "Continue as Customer" }));
    fireEvent.click(within(primaryCustomerCard!).getByRole("link", { name: "Continue as Customer" }));

    expect(await screen.findByRole("heading", { name: /your customer portal/i })).toBeInTheDocument();
    expect(destinations).toEqual(["/en/account/"]);
    await expect(composition.session.getSession()).resolves.toMatchObject({ userId: "demo-user-customer" });
    expect(await screen.findByText(/markets and street food/i)).toBeInTheDocument();
  });

  it.each([
    {
      name: "returns a customer to the exact valid booking URL",
      userId: "demo-user-customer",
      linkName: "Continue as Customer",
      returnTo: "/en/booking/?departure=departure-1&partySize=2",
      expected: "/en/booking/?departure=departure-1&partySize=2",
    },
    {
      name: "falls back for an invalid customer return-to",
      userId: "demo-user-customer",
      linkName: "Continue as Customer",
      returnTo: "https://example.com",
      expected: "/en/account/",
    },
    {
      name: "falls back for an oversized customer return-to",
      userId: "demo-user-customer",
      linkName: "Continue as Customer",
      returnTo: `/en/booking/?departure=${"a".repeat(2048)}`,
      expected: "/en/account/",
    },
    {
      name: "ignores a booking return-to for a guide",
      userId: "demo-user-guide",
      linkName: "Continue as Guide",
      returnTo: "/en/booking/?departure=departure-1&partySize=2",
      expected: "/en/guide/",
    },
    {
      name: "ignores a booking return-to for an administrator",
      userId: "demo-user-admin",
      linkName: "Continue as Administrator",
      returnTo: "/en/booking/?departure=departure-1&partySize=2",
      expected: "/en/admin/",
    },
  ])("$name", async ({ userId, linkName, returnTo, expected }) => {
    const composition = await createComposition();
    const destinations: string[] = [];

    render(
      <PortalSurface
        locale="en"
        composition={composition}
        returnTo={returnTo}
        navigate={(path) => destinations.push(path)}
      />,
    );

    const identity = userId === "demo-user-customer"
      ? screen.findByRole("heading", { name: "Demo Traveler" })
      : screen.findByRole("heading", {
        name: userId === "demo-user-guide" ? "Demo Guide" : "Demo Administrator",
      });
    const card = (await identity).closest("article");
    expect(card).not.toBeNull();
    fireEvent.click(within(card!).getByRole("link", { name: linkName }));

    await waitFor(() => expect(destinations).toEqual([expected]));
  });

  it("resets only LocalLens browser keys, signs out, and returns focus to sign-in", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-customer");
    window.sessionStorage.setItem("other-app", "keep");
    window.localStorage.setItem("other-app", "keep");
    window.sessionStorage.setItem("localens.custom-request.v1", "remove");
    window.localStorage.setItem("locallens.demo.booking.v1:booking-1", "remove");

    render(<TestSurface locale="en" composition={composition} />);
    const reset = await screen.findByRole("button", { name: /reset locallens demo/i });
    fireEvent.click(reset);

    expect(await screen.findByRole("status")).toHaveTextContent(/demo state was reset/i);
    await waitFor(() => expect(screen.getByRole("heading", { name: /sign in to your demo account/i })).toHaveFocus());
    await expect(composition.session.getSession()).resolves.toBeNull();
    expect(window.sessionStorage.getItem("localens.custom-request.v1")).toBeNull();
    expect(window.localStorage.getItem("locallens.demo.booking.v1:booking-1")).toBeNull();
    expect(window.sessionStorage.getItem("other-app")).toBe("keep");
    expect(window.localStorage.getItem("other-app")).toBe("keep");

    window.sessionStorage.removeItem("other-app");
    window.localStorage.removeItem("other-app");
  });

  it("reports an incomplete reset instead of announcing success when browser storage is blocked", async () => {
    const composition = await createComposition();
    window.sessionStorage.setItem("localens.custom-request.v1", "remove");
    const storagePrototype = Object.getPrototypeOf(window.sessionStorage) as Storage;
    const originalRemoveItem = storagePrototype.removeItem;
    const removeSpy = vi.spyOn(storagePrototype, "removeItem").mockImplementation(function (this: Storage, key: string) {
      if (key === "localens.custom-request.v1") throw new Error("blocked");
      originalRemoveItem.call(this, key);
    });

    try {
      render(<TestSurface locale="en" composition={composition} />);
      fireEvent.click(await screen.findByRole("button", { name: /reset locallens demo/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/could not be fully reset/i);
      expect(screen.queryByText(/demo state was reset/i)).not.toBeInTheDocument();
    } finally {
      removeSpy.mockRestore();
      window.sessionStorage.removeItem("localens.custom-request.v1");
    }
  });

  it("isolates every direct cross-role portal entry", async () => {
    const composition = await createComposition();
    const cases = [
      { userId: "demo-user-customer", expectedRole: "guide" as const, heading: /guide portal unavailable/i },
      { userId: "demo-user-admin", expectedRole: "customer" as const, heading: /customer portal unavailable/i },
    ];

    for (const testCase of cases) {
      cleanup();
      await signIn(composition, testCase.userId);
      render(<TestSurface locale="en" expectedRole={testCase.expectedRole} composition={composition} />);
      expect(await screen.findByRole("heading", { name: testCase.heading })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /your bookings|your schedule|admin portal/i })).not.toBeInTheDocument();
    }
  });

  it("does not offer immediate cancellation for a confirmed booking", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-customer");

    render(<TestSurface locale="en" expectedRole="customer" composition={composition} />);

    const booking = await screen.findByRole("article", { name: /a personal saigon day/i });
    expect(within(booking).queryByRole("button", { name: /cancel booking/i })).not.toBeInTheDocument();
  });

  it("cancels a pending demo booking only after the accessible confirmation dialog", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-customer");
    const cancelBooking = vi.spyOn(composition.customer.cancellations, "cancelBooking");

    render(<TestSurface locale="vi" expectedRole="customer" composition={composition} />);

    const booking = await screen.findByRole("article", { name: /lịch sử và ký ức/i });
    const trigger = within(booking).getByRole("button", { name: "Hủy đơn" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Hủy đơn đặt tour?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("Đơn sẽ được hủy ngay và không thể hoàn tác.");
    expect(within(dialog).getByRole("button", { name: "Quay lại" })).toHaveFocus();
    expect(cancelBooking).not.toHaveBeenCalled();

    const reason = within(dialog).getByRole("combobox", { name: "Lý do hủy (không bắt buộc)" });
    expect(within(reason).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Chọn lý do",
      "Kế hoạch hoặc thời gian tham gia thay đổi",
      "Chọn nhầm tour hoặc ngày khởi hành",
      "Cần thay đổi số khách hoặc thông tin đặt tour",
      "Lịch trình, điểm đón hoặc ngôn ngữ không phù hợp",
      "Chi phí không phù hợp",
      "Không thể hoàn tất thanh toán",
      "Lý do khác",
    ]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận hủy" }));
    await waitFor(() => expect(cancelBooking).toHaveBeenCalledTimes(1));
    expect(cancelBooking).toHaveBeenCalledWith({
      bookingId: "demo-booking-cancellation",
      reasonCode: null,
      otherReason: null,
      idempotencyKey: expect.any(String),
    });
    expect((await within(booking).findAllByText("Đã hủy", { exact: true })).length).toBeGreaterThan(0);
    expect(within(booking).getByText("Không cung cấp lý do", { exact: true })).toBeInTheDocument();
    expect(within(booking).getByText(/19:00/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the demo dialog and idempotency key when a successful cancellation cannot refresh", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-customer");
    const originalList = composition.customer.account.listCustomerBookings.bind(composition.customer.account);
    vi.spyOn(composition.customer.account, "listCustomerBookings")
      .mockImplementationOnce(originalList)
      .mockRejectedValueOnce(new Error("temporary demo reload failure"))
      .mockImplementation(originalList);
    const cancelBooking = vi.spyOn(composition.customer.cancellations, "cancelBooking");

    render(<TestSurface locale="en" expectedRole="customer" composition={composition} />);
    const booking = await screen.findByRole("article", { name: /history and memory/i });
    fireEvent.click(within(booking).getByRole("button", { name: "Cancel booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    const dialog = await screen.findByRole("dialog", { name: "Cancel tour booking?" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("latest booking status could not be loaded");
    expect(screen.queryByText(/booking cancelled\. the latest authoritative status/i)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }));

    await waitFor(() => expect(cancelBooking).toHaveBeenCalledTimes(2));
    expect(cancelBooking.mock.calls[0]?.[0].idempotencyKey).toBe(cancelBooking.mock.calls[1]?.[0].idempotencyKey);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect((await within(booking).findAllByText("Cancelled", { exact: true })).length).toBeGreaterThan(0);
  });

  it("keeps the demo dialog when a stale response cannot refresh, then safely retries", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-customer");
    const initialBookings = await composition.customer.account.listCustomerBookings();
    const refreshedBookings = initialBookings.map((item) => item.id === "demo-booking-cancellation"
      ? { ...item, status: "confirmed" as const }
      : item);
    vi.spyOn(composition.customer.account, "listCustomerBookings")
      .mockResolvedValueOnce(initialBookings)
      .mockRejectedValueOnce(new Error("temporary stale demo reload failure"))
      .mockResolvedValue(refreshedBookings);
    const cancelBooking = vi.spyOn(composition.customer.cancellations, "cancelBooking")
      .mockRejectedValue(new PortalError("CONFLICT", "stale demo detail"));

    render(<TestSurface locale="en" expectedRole="customer" composition={composition} />);
    const booking = await screen.findByRole("article", { name: /history and memory/i });
    fireEvent.click(within(booking).getByRole("button", { name: "Cancel booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    const dialog = await screen.findByRole("dialog", { name: "Cancel tour booking?" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("latest booking status could not be loaded");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }));

    await waitFor(() => expect(cancelBooking).toHaveBeenCalledTimes(2));
    expect(cancelBooking.mock.calls[0]?.[0].idempotencyKey).toBe(cancelBooking.mock.calls[1]?.[0].idempotencyKey);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(booking).queryByRole("button", { name: "Cancel booking" })).not.toBeInTheDocument();
  });

  it("closes the demo dialog without mutation and restores trigger focus", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-customer");
    const cancelBooking = vi.spyOn(composition.customer.cancellations, "cancelBooking");

    render(<TestSurface locale="vi" expectedRole="customer" composition={composition} />);

    const booking = await screen.findByRole("article", { name: /lịch sử và ký ức/i });
    const trigger = within(booking).getByRole("button", { name: "Hủy đơn" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(cancelBooking).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("allows exactly one completed-booking review and then replaces the form with success copy", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-customer");

    render(<TestSurface locale="en" expectedRole="customer" composition={composition} />);

    const booking = await screen.findByRole("article", { name: /markets and street food/i });
    fireEvent.change(within(booking).getByRole("combobox", { name: /rating/i }), { target: { value: "5" } });
    fireEvent.change(within(booking).getByRole("textbox", { name: /review text/i }), {
      target: { value: "A thoughtful local tour." },
    });
    fireEvent.click(within(booking).getByRole("button", { name: /submit review/i }));

    expect(await within(booking).findByRole("status")).toHaveTextContent(/review submitted/i);
    expect(within(booking).queryByRole("button", { name: /submit review/i })).not.toBeInTheDocument();
    await expect(composition.customer.reviews.listOwnReviews()).resolves.toHaveLength(1);
  });

  it("keeps guide details read-only and limited to assigned tours", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-guide");

    render(<TestSurface locale="en" expectedRole="guide" composition={composition} />);

    expect(await screen.findByRole("heading", { name: /guide portal/i })).toBeInTheDocument();
    expect(await screen.findByText(/markets and street food/i)).toBeInTheDocument();
    expect(screen.queryByText(/history and memory/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/markets and street food/i, { selector: "[data-unassigned-tour]" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept|complete|cancel/i })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /short bio/i })).toBeInTheDocument();
  });

  it("does not expose a cancelled booking to the guide", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-customer");
    await composition.customer.cancellations.cancelBooking({
      bookingId: "demo-booking-cancellation",
      reasonCode: "trip_plan_changed",
      otherReason: null,
      idempotencyKey: "guide-visibility-cancellation",
    });
    await signIn(composition, "demo-user-guide");

    render(<TestSurface locale="en" expectedRole="guide" composition={composition} />);
    expect(await screen.findByText("Markets and Street Food")).toBeInTheDocument();
    expect(screen.queryByText("History and Memory")).not.toBeInTheDocument();
  });

  it("renders Vietnamese portal copy and demo disclosure", async () => {
    const composition = await createComposition();

    render(<TestSurface locale="vi" expectedRole="customer" composition={composition} />);

    expect(await screen.findByRole("heading", { name: /đăng nhập tài khoản demo/i })).toBeInTheDocument();
    expect(screen.getByText(/chỉ là bản demo/i)).toBeInTheDocument();
  });

  it("shows the admin overview, fixed-only assignment, and simulated reporting", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-admin");

    render(<TestSurface locale="en" expectedRole="admin" composition={composition} />);

    expect(await screen.findByRole("heading", { name: /admin portal/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /users and roles/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /locations/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /fixed tours and departures/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /personalized requests/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /booking management/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /simulated reporting/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open catalog review/i }).getAttribute("href")).toMatch(/^\/en\/admin\/catalog\/?$/);
    expect(screen.getByText(/fixed departures only/i)).toBeInTheDocument();
    expect(screen.getByText(/personalized-tour guide assignment is not supported/i)).toBeInTheDocument();
    expect(screen.getAllByText(/demo-only/i).length).toBeGreaterThan(0);
  });

  it("submits the visibly selected fallback guide and exposes the assignment in that guide portal", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-admin");

    render(<TestSurface locale="en" expectedRole="admin" composition={composition} />);

    const assignmentSelect = await screen.findByRole("combobox", {
      name: /assign guide: demo-booking-secondary-customer/i,
    });
    expect(assignmentSelect).toHaveValue("demo-user-guide");
    const assignmentForm = assignmentSelect.closest("form");
    expect(assignmentForm).not.toBeNull();
    fireEvent.click(within(assignmentForm as HTMLFormElement).getByRole("button", { name: /assign guide/i }));

    expect(await screen.findByText(/guide assignment saved/i)).toBeInTheDocument();
    const updatedBookings = await composition.admin.bookings.listAdminBookings();
    expect(updatedBookings.some((booking) => booking.id === "demo-booking-secondary-customer" && booking.assignedGuideUserId === "demo-user-guide")).toBe(true);

    cleanup();
    await signIn(composition, "demo-user-guide");
    render(<TestSurface locale="en" expectedRole="guide" composition={composition} />);
    expect(await screen.findByText("demo-departure-secondary")).toBeInTheDocument();
  });

  it("shows cancellation history read-only while preserving personalized-request decisions", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-customer");
    await composition.customer.cancellations.cancelBooking({
      bookingId: "demo-booking-cancellation",
      reasonCode: "trip_plan_changed",
      otherReason: null,
      idempotencyKey: "admin-history-cancellation",
    });
    await signIn(composition, "demo-user-admin");

    render(<TestSurface locale="en" expectedRole="admin" composition={composition} />);

    const bookingManagement = await screen.findByRole("region", { name: "Booking management" });
    expect(bookingManagement).toHaveTextContent("Cancelled");
    expect(bookingManagement).toHaveTextContent("Trip plan or participation time changed");
    expect(within(bookingManagement).queryByRole("button", { name: /approve|reject/i })).not.toBeInTheDocument();
    expect(within(bookingManagement).queryByRole("textbox", { name: /decision note/i })).not.toBeInTheDocument();

    const requestDecision = await screen.findByRole("combobox", { name: /decision: demo-request-personalized/i });
    const requestForm = requestDecision.closest("form");
    expect(requestForm).not.toBeNull();
    fireEvent.click(within(requestForm as HTMLFormElement).getByRole("button", { name: /save request decision/i }));
    expect(await screen.findByText(/request decision saved/i)).toBeInTheDocument();
    expect((await composition.admin.personalizedRequests.listPersonalizedRequests()).find((request) => request.id === "demo-request-personalized")?.status).toBe("approved");
    expect(screen.queryByRole("spinbutton", { name: /quote amount:/i })).not.toBeInTheDocument();
    const issueQuoteForm = await screen.findByRole("button", { name: /issue demo quote/i });
    fireEvent.click(issueQuoteForm);
    expect(await screen.findByText(/demo quote issued/i)).toBeInTheDocument();
  });

  it("announces a portal load error and recovers through the retry action", async () => {
    let failFirstRead = true;
    const storage = createMemorySessionStorage();
    const originalGetItem = storage.getItem.bind(storage);
    storage.getItem = (key: string) => {
      if (failFirstRead) {
        failFirstRead = false;
        throw new Error("temporary session storage failure");
      }
      return originalGetItem(key);
    };
    const composition = createPortalComposition({ mode: "demo", storage, now: CLOCK });

    render(<TestSurface locale="en" expectedRole="customer" composition={composition} />);

    expect(await screen.findByRole("heading", { name: /could not load this portal/i })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/try again/i);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("heading", { name: /sign in to your demo account/i })).toBeInTheDocument();
    compositions.push(composition);
  });

  it("shows the empty assigned-tour state with an accessible landmark for a guide without assignments", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-guide-secondary");

    render(<TestSurface locale="en" expectedRole="guide" composition={composition} />);

    expect(await screen.findByRole("heading", { name: /guide portal/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /locallens/i })).toBeInTheDocument();
    expect((await screen.findAllByText(/no tours are assigned/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole("textbox", { name: /short bio/i })).toBeInTheDocument();
  });

  it("uses Vietnamese labels for catalog, departure, payment, and role surfaces", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-admin");

    render(<TestSurface locale="vi" expectedRole="admin" composition={composition} />);

    expect(await screen.findByRole("heading", { name: /cổng quản trị viên/i })).toBeInTheDocument();
    expect((await screen.findAllByText("Đã xuất bản")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Đã lên lịch")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Đã hoàn thành")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Đã thanh toán")).length).toBeGreaterThan(0);
    expect(screen.getByRole("navigation", { name: /locallens/i })).toBeInTheDocument();
  });

  it("keeps the seeded fixture in session storage while portal operations run", async () => {
    const storage = createMemorySessionStorage();
    const composition = createPortalComposition({ mode: "demo", storage, now: CLOCK });
    await composition.initialized;
    await composition.session.selectDemoIdentity("demo-user-customer");

    render(<TestSurface locale="en" expectedRole="customer" composition={composition} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /customer portal/i })).toBeInTheDocument());

    expect(storage.getItem(PORTAL_DEMO_STORAGE_KEY)).not.toBeNull();
  });

  it("propagates cleanup failures for a successfully initialized composition", async () => {
    const storage = createMemorySessionStorage();
    const composition = createPortalComposition({ mode: "demo", storage, now: CLOCK });
    await composition.initialized;
    storage.getItem = () => {
      throw new Error("cleanup storage failure");
    };

    await expect(signOutTrackedCompositions([composition])).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
  });
});
