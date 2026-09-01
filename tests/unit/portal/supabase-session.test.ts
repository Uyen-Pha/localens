// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { PortalError } from "@/lib/application/portal/contracts";
import { createSupabasePortalSessionAdapter } from "@/lib/infrastructure/supabase/portal-session-adapter";

const authUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "traveler@example.com",
  user_metadata: {
    display_name: "Untrusted metadata name",
    language: "vi",
    role: "admin",
  },
};

const identityRow = {
  user_id: authUser.id,
  display_name: "Database Traveler",
  language: "en",
  role: "customer",
};

interface ClientOptions {
  session?: unknown;
  sessionError?: unknown;
  sessionReject?: unknown;
  signInUser?: unknown;
  signInError?: unknown;
  signInReject?: unknown;
  rpcData?: unknown;
  rpcError?: unknown;
  rpcReject?: unknown;
  signOutError?: unknown;
  signOutReject?: unknown;
}

function clientDouble(options: ClientOptions = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data: options.rpcData ?? [identityRow],
    error: options.rpcError ?? null,
  });
  const getSession = vi.fn().mockResolvedValue({
    data: { session: options.session ?? null },
    error: options.sessionError ?? null,
  });
  const signInWithPassword = vi.fn().mockResolvedValue({
    data: { user: options.signInUser ?? authUser, session: { user: options.signInUser ?? authUser } },
    error: options.signInError ?? null,
  });
  const signOut = vi.fn().mockResolvedValue({ error: options.signOutError ?? null });
  if (options.sessionReject !== undefined) getSession.mockRejectedValue(options.sessionReject);
  if (options.signInReject !== undefined) signInWithPassword.mockRejectedValue(options.signInReject);
  if (options.rpcReject !== undefined) rpc.mockRejectedValue(options.rpcReject);
  if (options.signOutReject !== undefined) signOut.mockRejectedValue(options.signOutReject);

  return {
    client: {
      auth: { getSession, signInWithPassword, signOut },
      rpc,
    },
    getSession,
    rpc,
    signInWithPassword,
    signOut,
  };
}

function adapterFor(options: ClientOptions = {}) {
  const double = clientDouble(options);
  return {
    ...double,
    adapter: createSupabasePortalSessionAdapter(double.client as never),
  };
}

async function expectPortalFailure(
  promise: Promise<unknown>,
  code: PortalError["code"],
): Promise<PortalError> {
  let thrown: unknown;
  try {
    await promise;
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(PortalError);
  expect(thrown).toMatchObject({ code });
  return thrown as PortalError;
}

describe("Supabase portal session adapter", () => {
  it("returns null without calling the identity RPC when Auth has no session", async () => {
    const { adapter, rpc } = adapterFor();

    await expect(adapter.getSession()).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("resolves the database identity immediately after password sign-in", async () => {
    const { adapter, rpc, signInWithPassword } = adapterFor();

    await expect(
      adapter.signInWithPassword({ email: authUser.email, password: "correct-password" }),
    ).resolves.toEqual({
      userId: authUser.id,
      email: authUser.email,
      displayName: identityRow.display_name,
      locale: identityRow.language,
      role: identityRow.role,
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: authUser.email,
      password: "correct-password",
    });
    expect(rpc).toHaveBeenCalledWith("get_portal_identity");
  });

  it("uses Auth only for userId and email and ignores user metadata", async () => {
    const { adapter } = adapterFor({
      session: { user: authUser },
      rpcData: [{ ...identityRow, display_name: "Authoritative Name", language: "en", role: "guide" }],
    });

    await expect(adapter.getSession()).resolves.toEqual({
      userId: authUser.id,
      email: authUser.email,
      displayName: "Authoritative Name",
      locale: "en",
      role: "guide",
    });
  });

  it("rejects an identity whose user_id differs from the Auth user", async () => {
    const { adapter } = adapterFor({
      session: { user: authUser },
      rpcData: [{ ...identityRow, user_id: "22222222-2222-4222-8222-222222222222" }],
    });

    await expectPortalFailure(adapter.getSession(), "FORBIDDEN");
  });

  it.each([
    ["missing identity", []],
    ["duplicate identity", [identityRow, identityRow]],
    ["empty display name", [{ ...identityRow, display_name: "" }]],
    ["invalid role", [{ ...identityRow, role: "owner" }]],
    ["invalid locale", [{ ...identityRow, language: "fr" }]],
  ])("fails closed for %s", async (_case, rpcData) => {
    const { adapter } = adapterFor({ session: { user: authUser }, rpcData });

    const error = await expectPortalFailure(adapter.getSession(), "FORBIDDEN");
    expect(error.message).not.toMatch(/demo/i);
    expect(adapter).not.toHaveProperty("selectDemoIdentity");
  });

  it("fails closed when the Auth email is empty", async () => {
    const { adapter } = adapterFor({
      session: { user: { ...authUser, email: "" } },
    });

    await expectPortalFailure(adapter.getSession(), "FORBIDDEN");
  });

  it("maps invalid credentials to UNAUTHENTICATED without leaking secrets", async () => {
    const password = "password-do-not-leak";
    const token = "token-do-not-leak";
    const publishableKey = "publishable-key-do-not-leak";
    const { adapter, rpc } = adapterFor({
      signInError: new Error(`${password} ${token} ${publishableKey}`),
    });

    const error = await expectPortalFailure(
      adapter.signInWithPassword({ email: authUser.email, password }),
      "UNAUTHENTICATED",
    );
    expect(error.message).not.toContain(password);
    expect(error.message).not.toContain(token);
    expect(error.message).not.toContain(publishableKey);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps RPC failures to FORBIDDEN without leaking upstream details", async () => {
    const token = "rpc-token-do-not-leak";
    const { adapter } = adapterFor({
      session: { user: authUser },
      rpcError: new Error(token),
    });

    const error = await expectPortalFailure(adapter.getSession(), "FORBIDDEN");
    expect(error.message).not.toContain(token);
  });

  it("fails closed on rejected Auth and RPC network calls without leaking details", async () => {
    const authToken = "auth-network-token-do-not-leak";
    const auth = adapterFor({ sessionReject: new Error(authToken) });
    const authError = await expectPortalFailure(auth.adapter.getSession(), "UNAUTHENTICATED");
    expect(authError.message).not.toContain(authToken);
    expect(auth.rpc).not.toHaveBeenCalled();

    const rpcToken = "rpc-network-token-do-not-leak";
    const rpc = adapterFor({ session: { user: authUser }, rpcReject: new Error(rpcToken) });
    const rpcError = await expectPortalFailure(rpc.adapter.getSession(), "FORBIDDEN");
    expect(rpcError.message).not.toContain(rpcToken);
  });

  it("delegates sign-out to Supabase Auth", async () => {
    const { adapter, signOut } = adapterFor();

    await expect(adapter.signOut()).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalledOnce();
  });
});
