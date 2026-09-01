import type { PublicEnv } from "@/lib/env/public";
import type { BrowserRuntimeConfig } from "@/lib/env/runtime";
import {
  PortalError,
  type RuntimeSessionPort,
} from "@/lib/application/portal/contracts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { createSupabasePortalSessionAdapter } from "@/lib/infrastructure/supabase/portal-session-adapter";

type SupabaseRuntimeConfig = Extract<BrowserRuntimeConfig, { mode: "supabase" }>;

export interface SupabasePortalShell {
  readonly mode: "supabase";
  readonly session: RuntimeSessionPort;
  readonly initialized: Promise<void>;
}

export function createSupabasePortalShell(config: SupabaseRuntimeConfig): SupabasePortalShell {
  try {
    const client = createBrowserSupabaseClient({
      NEXT_PUBLIC_SUPABASE_URL: config.supabaseUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.supabasePublishableKey,
    } as PublicEnv);

    return {
      mode: "supabase",
      session: createSupabasePortalSessionAdapter(client),
      initialized: Promise.resolve(),
    };
  } catch {
    throw new PortalError(
      "PRODUCTION_CONFIGURATION",
      "The Supabase portal client could not be configured.",
    );
  }
}
