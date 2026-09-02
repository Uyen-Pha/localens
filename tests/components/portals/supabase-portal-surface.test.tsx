import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PortalSurface } from "@/components/portals/portal-surface";
import {
  PortalError,
  type PortalIdentity,
  type RuntimeSessionPort,
} from "@/lib/application/portal/contracts";
import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";
import type { Locale } from "@/lib/i18n/config";

const loaderHarness = vi.hoisted(() => ({
  results: [] as unknown[],
  async load(): Promise<unknown> {
    const next = this.results.length > 1 ? this.results.shift() : this.results[0];
    if (next instanceof Error) throw next;
    return next;
  },
}));

vi.mock("@/components/portals/portal-session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/portals/portal-session")>();
  return {
    ...original,
    loadPortalSurfaceComposition: loaderHarness.load.bind(loaderHarness),
  };
});

const COPY = {
  en: {
    heading: "Sign in to LocalLens",
    password: "Password",
    submit: "Sign in",
    authError: "We could not sign you in. Check your details and try again.",
    runtimeHeading: "Your secure portal",
    disclosure: "Secure runtime connected. Customer bookings, cancellation decisions, and fixed-departure guide assignments use authoritative local runtime data.",
    accessDenied: "Access denied",
    ownPortal: "Open your portal",
    serviceTitle: "Service unavailable",
    reference: /Reference ID: LL-[A-Z0-9-]+/i,
    signOut: "Sign out",
    actionError: "We could not complete that account action. Try again.",
  },
  vi: {
    heading: "Đăng nhập LocalLens",
    password: "Mật khẩu",
    submit: "Đăng nhập",
    authError: "Không thể đăng nhập. Hãy kiểm tra thông tin và thử lại.",
    runtimeHeading: "Cổng bảo mật của bạn",
    disclosure: "Runtime bảo mật đã kết nối. Booking khách hàng, quyết định hủy và phân công hướng dẫn viên cho tour cố định dùng dữ liệu runtime cục bộ chính thức.",
    accessDenied: "Truy cập bị từ chối",
    ownPortal: "Mở cổng của bạn",
    serviceTitle: "Dịch vụ không khả dụng",
    reference: /Mã tham chiếu: LL-[A-Z0-9-]+/i,
    signOut: "Đăng xuất",
    actionError: "Không thể hoàn tất thao tác tài khoản. Hãy thử lại.",
  },
} as const;

const ACCOUNTS = [
  {
    email: "traveler@localens.test",
    password: "traveler-password",
    identity: {
      userId: "11111111-1111-4111-8111-111111111111",
      role: "customer",
      locale: "en",
      displayName: "Runtime Traveler",
      email: "traveler@localens.test",
    },
  },
  {
    email: "guide@localens.test",
    password: "guide-password",
    identity: {
      userId: "22222222-2222-4222-8222-222222222222",
      role: "guide",
      locale: "vi",
      displayName: "Runtime Guide",
      email: "guide@localens.test",
    },
  },
  {
    email: "admin@localens.test",
    password: "admin-password",
    identity: {
      userId: "33333333-3333-4333-8333-333333333333",
      role: "admin",
      locale: "en",
      displayName: "Runtime Administrator",
      email: "admin@localens.test",
    },
  },
] as const satisfies ReadonlyArray<{
  email: string;
  password: string;
  identity: PortalIdentity;
}>;

class MemoryRuntimeSession implements RuntimeSessionPort {
  private current: PortalIdentity | null = null;
  private sessionReadError: Error | null = null;
  private signInGate: Promise<void> | null = null;
  private signOutError: Error | null = null;
  reads = 0;
  signInCalls = 0;
  signOutCalls = 0;

  seed(identity: PortalIdentity): void {
    this.current = { ...identity };
  }

  pauseSignInUntil(gate: Promise<void>): void {
    this.signInGate = gate;
  }

  rejectSessionReadWith(error: Error): void {
    this.sessionReadError = error;
  }

  rejectSignOutWith(error: Error): void {
    this.signOutError = error;
  }

  async getSession(): Promise<PortalIdentity | null> {
    this.reads += 1;
    if (this.sessionReadError) throw this.sessionReadError;
    return this.current === null ? null : { ...this.current };
  }

  async signInWithPassword(input: { email: string; password: string }): Promise<PortalIdentity> {
    this.signInCalls += 1;
    if (this.signInGate) await this.signInGate;
    const account = ACCOUNTS.find(
      (candidate) => candidate.email === input.email && candidate.password === input.password,
    );
    if (!account) {
      throw new PortalError("UNAUTHENTICATED", "Adapter detail must not reach the UI.");
    }
    this.current = { ...account.identity };
    return { ...account.identity };
  }

  async signOut(): Promise<void> {
    this.signOutCalls += 1;
    if (this.signOutError) throw this.signOutError;
    this.current = null;
  }
}

function shellFor(
  session = new MemoryRuntimeSession(),
  fixedTourOverrides: Partial<SupabasePortalShell["fixedTour"]> = {},
  assignmentOverrides: Partial<SupabasePortalShell["guideAssignments"]> = {},
): SupabasePortalShell {
  return {
    mode: "supabase",
    session,
    fixedTour: {
      listPublishedTours: async () => [],
      listAvailability: async () => [],
      beginBooking: async () => {
        throw new Error("not used by the portal shell test");
      },
      listOwnBookings: async () => [],
      listOwnPaymentStatuses: async () => [],
      completeSimulatedPayment: async () => {
        throw new Error("not used by the portal shell test");
      },
      listOwnCancellationRequests: async () => [],
      requestCancellation: async () => {
        throw new Error("not used by the portal shell test");
      },
      listCancellationQueue: async () => [],
      decideCancellation: async () => {
        throw new Error("not used by the portal shell test");
      },
      ...fixedTourOverrides,
    },
    guideAssignments: {
      listAdminQueue: async () => [],
      listEligibleGuides: async () => [],
      assignGuide: async () => {
        throw new Error("not used by the portal shell test");
      },
      listOwnAssignments: async () => [],
      ...assignmentOverrides,
    },
    initialized: Promise.resolve(),
  };
}

function renderSurface({
  locale,
  shell,
  expectedRole,
  destinations = [],
}: {
  locale: Locale;
  shell: SupabasePortalShell;
  expectedRole?: "customer" | "guide" | "admin";
  destinations?: string[];
}) {
  return render(
    <PortalSurface
      locale={locale}
      expectedRole={expectedRole}
      composition={shell}
      navigate={(path) => destinations.push(path)}
    />,
  );
}

async function submitCredentials(locale: Locale, email: string, password: string): Promise<void> {
  fireEvent.change(await screen.findByRole("textbox", { name: "Email" }), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(COPY[locale].password), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: COPY[locale].submit }));
}

beforeEach(() => {
  loaderHarness.results = [];
});

afterEach(() => {
  cleanup();
});

describe.each(["en", "vi"] as const)("Supabase PortalSurface (%s)", (locale) => {
  const copy = COPY[locale];

  it("renders only the runtime email/password sign-in controls when signed out", async () => {
    renderSurface({ locale, shell: shellFor() });

    expect(await screen.findByRole("heading", { name: copy.heading })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByLabelText(copy.password)).toHaveAttribute("type", "password");
    expect(screen.getAllByRole("button", { name: copy.submit })).toHaveLength(1);
    expect(screen.queryByText(/Demo Traveler|Demo Guide|Demo Administrator/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reset|đặt lại/i })).not.toBeInTheDocument();
  });

  it("maps invalid credentials to a generic localized error and clears the password", async () => {
    const email = "private.person@example.com";
    const password = "do-not-echo-this";
    renderSurface({ locale, shell: shellFor() });

    await submitCredentials(locale, email, password);

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.authError);
    expect(screen.getByLabelText(copy.password)).toHaveValue("");
    expect(document.body.textContent).not.toContain(email);
    expect(document.body.textContent).not.toContain(password);
    expect(document.body.textContent).not.toContain("Adapter detail");
  });

  it("disables duplicate password submissions while authentication is pending", async () => {
    let releaseSignIn: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseSignIn = resolve;
    });
    const session = new MemoryRuntimeSession();
    session.pauseSignInUntil(gate);
    const destinations: string[] = [];
    renderSurface({ locale, shell: shellFor(session), destinations });

    fireEvent.change(await screen.findByRole("textbox", { name: "Email" }), {
      target: { value: ACCOUNTS[0].email },
    });
    fireEvent.change(screen.getByLabelText(copy.password), {
      target: { value: ACCOUNTS[0].password },
    });
    const submit = screen.getByRole("button", { name: copy.submit });
    const form = submit.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(submit).toBeDisabled();
    expect(session.signInCalls).toBe(1);
    releaseSignIn?.();
    await waitFor(() => expect(destinations).toEqual([`/${locale}/account/`]));
  });

  it.each([
    ["customer", "/account/"],
    ["guide", "/guide/"],
    ["admin", "/admin/"],
  ] as const)("routes a signed-in %s by the database role", async (role, suffix) => {
    const destinations: string[] = [];
    const account = ACCOUNTS.find((candidate) => candidate.identity.role === role)!;
    renderSurface({ locale, shell: shellFor(), destinations });

    await submitCredentials(locale, account.email, account.password);

    await waitFor(() => expect(destinations).toEqual([`/${locale}${suffix}`]));
    fireEvent.click(screen.getByRole("button", { name: copy.signOut }));
    expect(await screen.findByLabelText(copy.password)).toHaveValue("");
  });

  it("restores the database-backed identity after a refresh-style remount", async () => {
    const session = new MemoryRuntimeSession();
    session.seed(ACCOUNTS[0].identity);
    const shell = shellFor(session);
    const first = renderSurface({ locale, shell, expectedRole: "customer" });

    expect(await screen.findByRole("heading", { name: copy.runtimeHeading })).toBeInTheDocument();
    expect(screen.getByText("Runtime Traveler")).toBeInTheDocument();
    first.unmount();
    renderSurface({ locale, shell, expectedRole: "customer" });

    expect(await screen.findByRole("heading", { name: copy.runtimeHeading })).toBeInTheDocument();
    expect(screen.getByText("traveler@localens.test")).toBeInTheDocument();
    expect(session.reads).toBe(2);
  });

  it("denies a different role route and links to the signed-in actor's portal", async () => {
    const session = new MemoryRuntimeSession();
    session.seed(ACCOUNTS[1].identity);
    renderSurface({ locale, shell: shellFor(session), expectedRole: "customer" });

    expect(await screen.findByRole("heading", { name: copy.accessDenied })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.ownPortal }).getAttribute("href")).toMatch(
      new RegExp(`^/${locale}/guide/?$`),
    );
    expect(screen.queryByText(copy.disclosure)).not.toBeInTheDocument();
  });

  it("announces a generic sign-out failure from the wrong-role access-denied view", async () => {
    const secret = "sign-out-detail-do-not-leak";
    const session = new MemoryRuntimeSession();
    session.seed(ACCOUNTS[1].identity);
    session.rejectSignOutWith(new Error(secret));
    renderSurface({ locale, shell: shellFor(session), expectedRole: "customer" });

    expect(await screen.findByRole("heading", { name: copy.accessDenied })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.signOut }));

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.actionError);
    expect(document.body.textContent).not.toContain(secret);
    expect(screen.getByRole("heading", { name: copy.accessDenied })).toBeInTheDocument();
  });

  it("returns to runtime sign-in after sign-out", async () => {
    const session = new MemoryRuntimeSession();
    session.seed(ACCOUNTS[2].identity);
    renderSurface({ locale, shell: shellFor(session), expectedRole: "admin" });

    expect(await screen.findByText(copy.disclosure)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.signOut }));

    expect(await screen.findByRole("heading", { name: copy.heading })).toBeInTheDocument();
    expect(screen.getByLabelText(copy.password)).toBeInTheDocument();
  });

  it("mounts the runtime cancellation queue only for an administrator", async () => {
    const session = new MemoryRuntimeSession();
    session.seed(ACCOUNTS[2].identity);
    const listCancellationQueue = vi.fn(async () => [{
      requestId: "77777777-7777-4777-8777-777777777777",
      bookingId: "11111111-1111-4111-8111-111111111111",
      bookingStatus: "pending_payment" as const,
      customerDisplayName: "Runtime Traveler",
      titleEn: "Runtime Saigon walk",
      titleVi: "Dạo Sài Gòn runtime",
      status: "pending" as const,
      reason: "My schedule changed.",
      requestedAt: "2099-09-05T02:06:00.000Z",
      decisionNote: null,
      decidedAt: null,
    }]);
    renderSurface({
      locale,
      shell: shellFor(session, { listCancellationQueue }),
      expectedRole: "admin",
    });

    expect(await screen.findByRole("heading", {
      name: locale === "vi" ? "Yêu cầu hủy booking" : "Cancellation requests",
    })).toBeInTheDocument();
    expect(screen.getByText(locale === "vi" ? "Dạo Sài Gòn runtime" : "Runtime Saigon walk")).toBeInTheDocument();
    expect(listCancellationQueue).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", {
      name: locale === "vi" ? "Các giữ chỗ tour cố định của bạn" : "Your fixed-tour holds",
    })).not.toBeInTheDocument();
  });

  it("mounts the runtime assignment queue only for an administrator", async () => {
    const session = new MemoryRuntimeSession();
    session.seed(ACCOUNTS[2].identity);
    const listAdminQueue = vi.fn(async () => [{
      bookingId: "11111111-1111-4111-8111-111111111111",
      tourVersionId: "22222222-2222-4222-8222-222222222222",
      departureId: "33333333-3333-4333-8333-333333333333",
      titleEn: "Runtime evening markets",
      titleVi: "Chợ đêm runtime",
      startAt: "2099-09-05T11:00:00.000Z",
      endAt: "2099-09-05T14:00:00.000Z",
      meetingPoint: "Runtime Gate",
      partySize: 2,
      language: "en" as const,
      assignmentId: null,
      guideUserId: null,
      guideDisplayName: null,
      assignmentStatus: null,
    }]);
    const listEligibleGuides = vi.fn(async () => [{
      guideUserId: "44444444-4444-4444-8444-444444444444",
      displayName: "Runtime Guide",
      language: "vi" as const,
    }]);
    renderSurface({
      locale,
      shell: shellFor(session, {}, { listAdminQueue, listEligibleGuides }),
      expectedRole: "admin",
    });

    expect(await screen.findByRole("heading", {
      name: locale === "vi" ? "Phân công hướng dẫn viên" : "Guide assignments",
    })).toBeInTheDocument();
    expect(listAdminQueue).toHaveBeenCalledTimes(1);
    expect(listEligibleGuides).toHaveBeenCalledTimes(1);
  });

  it("mounts a read-only assignment list only for the authenticated guide", async () => {
    const session = new MemoryRuntimeSession();
    session.seed(ACCOUNTS[1].identity);
    const listOwnAssignments = vi.fn(async () => [{
      assignmentId: "66666666-6666-4666-8666-666666666666",
      bookingId: "11111111-1111-4111-8111-111111111111",
      tourVersionId: "22222222-2222-4222-8222-222222222222",
      departureId: "33333333-3333-4333-8333-333333333333",
      title: "Chợ đêm runtime",
      startAt: "2099-09-05T11:00:00.000Z",
      endAt: "2099-09-05T14:00:00.000Z",
      meetingPoint: "Runtime Gate",
      partySize: 2,
      language: "en" as const,
      mobilityFlags: ["step-free" as const],
      dietaryFlags: ["halal" as const],
      assignmentStatus: "assigned" as const,
    }]);
    renderSurface({
      locale,
      shell: shellFor(session, {}, { listOwnAssignments }),
      expectedRole: "guide",
    });

    expect(await screen.findByRole("heading", {
      name: locale === "vi" ? "Tour được phân công" : "Your assigned tours",
    })).toBeInTheDocument();
    expect(screen.getByText("Chợ đêm runtime")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept|complete|tiếp nhận|hoàn thành/i })).not.toBeInTheDocument();
    expect(listOwnAssignments).toHaveBeenCalledTimes(1);
  });

  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)(
    "clears a stale runtime session after a %s identity failure even when remote sign-out fails",
    async (code) => {
      const session = new MemoryRuntimeSession();
      session.seed(ACCOUNTS[0].identity);
      session.rejectSessionReadWith(new PortalError(code, "stale-session-detail-do-not-leak"));
      session.rejectSignOutWith(new Error("remote-sign-out-detail-do-not-leak"));

      renderSurface({ locale, shell: shellFor(session), expectedRole: "customer" });

      expect(await screen.findByRole("heading", { name: copy.heading })).toBeInTheDocument();
      expect(screen.getByLabelText(copy.password)).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: copy.serviceTitle })).not.toBeInTheDocument();
      expect(session.signOutCalls).toBe(1);
      expect(document.body.textContent).not.toContain("stale-session-detail-do-not-leak");
      expect(document.body.textContent).not.toContain("remote-sign-out-detail-do-not-leak");
    },
  );

  it.each([
    ["network", new Error("network-detail-do-not-leak")],
    ["configuration", new PortalError("PRODUCTION_CONFIGURATION", "config-detail-do-not-leak")],
  ])("keeps %s session recovery failures retryable as service unavailable", async (_kind, error) => {
    const session = new MemoryRuntimeSession();
    session.seed(ACCOUNTS[0].identity);
    session.rejectSessionReadWith(error);

    renderSurface({ locale, shell: shellFor(session), expectedRole: "customer" });

    expect(await screen.findByRole("heading", { name: copy.serviceTitle })).toBeInTheDocument();
    expect(screen.getByText(copy.reference)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: copy.heading })).not.toBeInTheDocument();
    expect(session.signOutCalls).toBe(0);
    expect(document.body.textContent).not.toContain(error.message);
  });

  it("shows service unavailable with a correlation reference and retries without demo fallback", async () => {
    loaderHarness.results = [new Error("missing runtime config"), shellFor()];
    render(<PortalSurface locale={locale} navigate={() => undefined} />);

    expect(await screen.findByRole("heading", { name: copy.serviceTitle })).toBeInTheDocument();
    expect(screen.getByText(copy.reference)).toBeInTheDocument();
    expect(screen.queryByText(/Demo Traveler|Demo Guide|Demo Administrator/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again|thử lại/i }));

    expect(await screen.findByRole("heading", { name: copy.heading })).toBeInTheDocument();
    expect(screen.queryByText(/Demo Traveler|Demo Guide|Demo Administrator/)).not.toBeInTheDocument();
  });
});
