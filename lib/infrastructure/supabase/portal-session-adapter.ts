import type { SupabaseClient, User } from "@supabase/supabase-js";

import {
  LOCALE_VALUES,
  ROLE_VALUES,
  type Locale,
  type Role,
} from "@/lib/domain/data/contracts";
import {
  PortalError,
  type PortalIdentity,
  type RuntimeSessionPort,
} from "@/lib/application/portal/contracts";
import type { Database } from "@/lib/infrastructure/supabase/database.types";

type PortalSupabaseClient = Pick<SupabaseClient<Database>, "auth" | "rpc">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUTHENTICATION_FAILURE = "The portal session could not be authenticated.";
const IDENTITY_FAILURE = "The authenticated portal identity is unavailable.";

function unauthenticated(): PortalError {
  return new PortalError("UNAUTHENTICATED", AUTHENTICATION_FAILURE);
}

function forbidden(): PortalError {
  return new PortalError("FORBIDDEN", IDENTITY_FAILURE);
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLE_VALUES as readonly string[]).includes(value);
}

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALE_VALUES as readonly string[]).includes(value);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function mapIdentity(user: User, rows: unknown): PortalIdentity {
  if (!UUID.test(user.id) || !nonEmptyText(user.email)) throw forbidden();
  if (!Array.isArray(rows) || rows.length !== 1) throw forbidden();

  const row: unknown = rows[0];
  if (typeof row !== "object" || row === null || Array.isArray(row)) throw forbidden();

  const identity = row as Record<string, unknown>;
  if (
    !nonEmptyText(identity.user_id) ||
    !UUID.test(identity.user_id) ||
    identity.user_id !== user.id ||
    !nonEmptyText(identity.display_name) ||
    !isRole(identity.role) ||
    !isLocale(identity.language)
  ) {
    throw forbidden();
  }

  return {
    userId: user.id,
    email: user.email,
    displayName: identity.display_name,
    role: identity.role,
    locale: identity.language,
  };
}

export function createSupabasePortalSessionAdapter(
  client: PortalSupabaseClient,
): RuntimeSessionPort {
  async function resolveIdentity(user: User): Promise<PortalIdentity> {
    try {
      const response = await client.rpc("get_portal_identity");
      if (response.error !== null) throw forbidden();
      return mapIdentity(user, response.data);
    } catch {
      throw forbidden();
    }
  }

  return {
    async getSession(): Promise<PortalIdentity | null> {
      let response: Awaited<ReturnType<PortalSupabaseClient["auth"]["getSession"]>>;
      try {
        response = await client.auth.getSession();
      } catch {
        throw unauthenticated();
      }

      if (response.error !== null) throw unauthenticated();
      if (response.data.session === null) return null;
      return resolveIdentity(response.data.session.user);
    },

    async signInWithPassword(input): Promise<PortalIdentity> {
      let response: Awaited<ReturnType<PortalSupabaseClient["auth"]["signInWithPassword"]>>;
      try {
        response = await client.auth.signInWithPassword({
          email: input.email,
          password: input.password,
        });
      } catch {
        throw unauthenticated();
      }

      if (response.error !== null || response.data.user === null) throw unauthenticated();
      return resolveIdentity(response.data.user);
    },

    async signOut(): Promise<void> {
      let response: Awaited<ReturnType<PortalSupabaseClient["auth"]["signOut"]>>;
      try {
        response = await client.auth.signOut();
      } catch {
        throw unauthenticated();
      }

      if (response.error !== null) throw unauthenticated();
    },
  };
}
