import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PortalSurface } from "@/components/portals/portal-surface";
import { createPortalComposition, type DemoPortalComposition } from "@/lib/application/portal/composition";
import {
  createMemorySessionStorage,
  PORTAL_DEMO_STORAGE_KEY,
} from "@/lib/infrastructure/demo/portal-repository";

const CLOCK = () => "2026-08-31T12:00:00.000Z";
const compositions: DemoPortalComposition[] = [];

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

    render(<PortalSurface locale="en" expectedRole="customer" composition={composition} />);

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(await screen.findByRole("heading", { name: /sign in to your demo account/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /choose a demo identity/i })).toHaveAttribute("href", "/en/sign-in/");
    expect(screen.queryByText(/markets and street food/i)).not.toBeInTheDocument();
  });

  it("does not expose customer data when a guide enters the customer route", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-guide");

    render(<PortalSurface locale="en" expectedRole="customer" composition={composition} />);

    expect(await screen.findByRole("heading", { name: /customer portal unavailable/i })).toBeInTheDocument();
    expect(screen.getByText(/signed in as a guide/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /your bookings/i })).not.toBeInTheDocument();
    expect(screen.queryByText("traveler@example.invalid")).not.toBeInTheDocument();
  });

  it("lets a customer request cancellation and reports the pending state", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-customer");

    render(<PortalSurface locale="en" expectedRole="customer" composition={composition} />);

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

    render(<PortalSurface locale="en" expectedRole="customer" composition={composition} />);

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

    render(<PortalSurface locale="en" expectedRole="guide" composition={composition} />);

    expect(await screen.findByRole("heading", { name: /guide portal/i })).toBeInTheDocument();
    expect(await screen.findByText(/markets and street food/i)).toBeInTheDocument();
    expect(screen.getByText(/history and memory/i)).toBeInTheDocument();
    expect(screen.queryByText(/markets and street food/i, { selector: "[data-unassigned-tour]" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept|complete|cancel/i })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /short bio/i })).toBeInTheDocument();
  });

  it("renders Vietnamese portal copy and demo disclosure", async () => {
    const composition = await createComposition();

    render(<PortalSurface locale="vi" expectedRole="customer" composition={composition} />);

    expect(await screen.findByRole("heading", { name: /đăng nhập tài khoản demo/i })).toBeInTheDocument();
    expect(screen.getByText(/chỉ là bản demo/i)).toBeInTheDocument();
  });

  it("shows the admin overview, fixed-only assignment, and simulated reporting", async () => {
    const composition = await createComposition();
    await signIn(composition, "demo-user-admin");

    render(<PortalSurface locale="en" expectedRole="admin" composition={composition} />);

    expect(await screen.findByRole("heading", { name: /admin portal/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /users and roles/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /locations/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /fixed tours and departures/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /personalized requests/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /bookings and cancellations/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /simulated reporting/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open catalog review/i })).toHaveAttribute("href", "/en/admin/catalog/");
    expect(screen.getByText(/fixed departures only/i)).toBeInTheDocument();
    expect(screen.getByText(/personalized-tour guide assignment is not supported/i)).toBeInTheDocument();
    expect(screen.getAllByText(/demo-only/i).length).toBeGreaterThan(0);
  });

  it("keeps the seeded fixture in session storage while portal operations run", async () => {
    const storage = createMemorySessionStorage();
    const composition = createPortalComposition({ mode: "demo", storage, now: CLOCK });
    await composition.initialized;
    await composition.session.selectDemoIdentity("demo-user-customer");

    render(<PortalSurface locale="en" expectedRole="customer" composition={composition} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /customer portal/i })).toBeInTheDocument());

    expect(storage.getItem(PORTAL_DEMO_STORAGE_KEY)).not.toBeNull();
  });
});
