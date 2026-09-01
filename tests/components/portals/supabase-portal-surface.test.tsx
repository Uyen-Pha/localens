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
    disclosure: "Secure runtime connected. Operational portal data is enabled in the next verified slice.",
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
    disclosure: "Runtime bảo mật đã kết nối. Dữ liệu nghiệp vụ của cổng sẽ được bật ở lát cắt đã kiểm chứng tiếp theo.",
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
  private signInGate: Promise<void> | null = null;
  private signOutError: Error | null = null;
  reads = 0;
  signInCalls = 0;

  seed(identity: PortalIdentity): void {
    this.current = { ...identity };
  }

  pauseSignInUntil(gate: Promise<void>): void {
    this.signInGate = gate;
  }

  rejectSignOutWith(error: Error): void {
    this.signOutError = error;
  }

  async getSession(): Promise<PortalIdentity | null> {
    this.reads += 1;
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
    if (this.signOutError) throw this.signOutError;
    this.current = null;
  }
}

function shellFor(session = new MemoryRuntimeSession()): SupabasePortalShell {
  return {
    mode: "supabase",
    session,
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
