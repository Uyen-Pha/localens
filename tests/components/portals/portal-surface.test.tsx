import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";

import { PortalSurface, type PortalSurfaceProps } from "@/components/portals/portal-surface";
import { createPortalComposition, type DemoPortalComposition } from "@/lib/application/portal/composition";
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
  compositions.push(composition);
  await composition.initialized;
  return composition;
}

async function signIn(composition: DemoPortalComposition, userId: string): Promise<void> {
  await composition.session.selectDemoIdentity(userId);
}

afterEach(async () => {
  cleanup();
  for (const composition of compositions) {
    await composition.session.signOut();
  }
  compositions.length = 0;
});

describe("PortalSurface", () => {
  it("shows a safe sign-in prompt for direct unauthenticated entry", async () => {
    const composition = await createComposition();

    render(<TestSurface locale="en" expectedRole="customer" composition={composition} />);

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(await screen.findByRole("heading", { name: /sign in to your demo account/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /choose a demo identity/i }).getAttribute("href")).toMatch(/^\/en\/sign-in\/?$/);
    expect(screen.queryByText(/markets and street food/i)).not.toBeInTheDocument();
  });

  it("does not expose customer data when a guide enters the customer route", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-guide");

    render(<TestSurface locale="en" expectedRole="customer" composition={composition} />);

    expect(await screen.findByRole("heading", { name: /customer portal unavailable/i })).toBeInTheDocument();
    expect(screen.getByText(/signed in as a guide/i)).toBeInTheDocument();
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
    fireEvent.click(customerLinks[0]);

    expect(await screen.findByRole("heading", { name: /your customer portal/i })).toBeInTheDocument();
    expect(destinations).toEqual(["/en/account/"]);
    await expect(composition.session.getSession()).resolves.toMatchObject({ userId: "demo-user-customer" });
    expect(await screen.findByText(/markets and street food/i)).toBeInTheDocument();
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

  it("lets a customer request cancellation and reports the pending state", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-customer");

    render(<TestSurface locale="en" expectedRole="customer" composition={composition} />);

    const booking = await screen.findByRole("article", { name: /history and memory/i });
    fireEvent.click(within(booking).getByRole("button", { name: /request cancellation/i }));
    fireEvent.change(within(booking).getByRole("textbox", { name: /cancellation reason/i }), {
      target: { value: "Plans changed." },
    });
    fireEvent.click(within(booking).getByRole("button", { name: /send cancellation request/i }));

    expect(await within(booking).findByRole("status")).toHaveTextContent(/pending/i);
    await expect(composition.customer.cancellations.listOwnCancellationRequests()).resolves.toHaveLength(1);
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
    expect(screen.getByText(/history and memory/i)).toBeInTheDocument();
    expect(screen.queryByText(/markets and street food/i, { selector: "[data-unassigned-tour]" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept|complete|cancel/i })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /short bio/i })).toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: /bookings and cancellations/i })).toBeInTheDocument();
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

  it("executes personalized-request and cancellation decisions from the admin surface", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-customer");
    await composition.customer.cancellations.requestCancellation({
      bookingId: "demo-booking-cancellation",
      reason: "Plans changed.",
    });
    await signIn(composition, "demo-user-admin");

    render(<TestSurface locale="en" expectedRole="admin" composition={composition} />);

    const cancellationDecision = await screen.findByRole("combobox", { name: /decision: demo-booking-cancellation/i });
    const cancellationForm = cancellationDecision.closest("form");
    expect(cancellationForm).not.toBeNull();
    fireEvent.click(within(cancellationForm as HTMLFormElement).getByRole("button", { name: /save request decision/i }));
    expect(await screen.findByText(/cancellation decision saved/i)).toBeInTheDocument();

    const updatedCancellations = await composition.admin.cancellations.listCancellationRequests();
    expect(updatedCancellations.find((request) => request.bookingId === "demo-booking-cancellation")?.status).toBe("approved");
    expect((await composition.admin.bookings.listAdminBookings()).find((booking) => booking.id === "demo-booking-cancellation")?.status).toBe("cancelled");

    const requestDecision = await screen.findByRole("combobox", { name: /decision: demo-request-personalized/i });
    const requestForm = requestDecision.closest("form");
    expect(requestForm).not.toBeNull();
    fireEvent.click(within(requestForm as HTMLFormElement).getByRole("button", { name: /save request decision/i }));
    expect(await screen.findByText(/request decision saved/i)).toBeInTheDocument();
    expect((await composition.admin.personalizedRequests.listPersonalizedRequests()).find((request) => request.id === "demo-request-personalized")?.status).toBe("approved");
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
    compositions.push(composition);
    await composition.initialized;

    render(<TestSurface locale="en" expectedRole="customer" composition={composition} />);

    expect(await screen.findByRole("heading", { name: /could not load this portal/i })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/try again/i);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("heading", { name: /sign in to your demo account/i })).toBeInTheDocument();
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
});
