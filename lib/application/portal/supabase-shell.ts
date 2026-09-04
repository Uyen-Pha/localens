import type { PublicEnv } from "@/lib/env/public";
import type { BrowserRuntimeConfig } from "@/lib/env/runtime";
import {
  createFixedTourRuntimeComposition,
  type FixedTourRuntimeComposition,
} from "@/lib/application/fixed-tour/composition";
import {
  PortalError,
  type RuntimeSessionPort,
} from "@/lib/application/portal/contracts";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { createSupabasePortalSessionAdapter } from "@/lib/infrastructure/supabase/portal-session-adapter";
import { createSupabaseFixedTourRuntimeAdapter } from "@/lib/infrastructure/supabase/fixed-tour-runtime-adapter";
import {
  createSupabaseRuntimeGuideAssignmentAdapter,
} from "@/lib/infrastructure/supabase/runtime-guide-assignment-adapter";
import {
  createSupabaseBookingCancellationAdapter,
  type SupabaseBookingCancellationHistoryAdapter,
} from "@/lib/infrastructure/supabase/booking-cancellation-adapter";
import type { RuntimeGuideAssignmentPort } from "@/lib/application/guide-assignment/contracts";

type SupabaseRuntimeConfig = Extract<BrowserRuntimeConfig, { mode: "supabase" }>;

export interface SupabasePortalShell extends FixedTourRuntimeComposition {
  readonly mode: "supabase";
  readonly session: RuntimeSessionPort;
  readonly bookingCancellations: SupabaseBookingCancellationHistoryAdapter;
  readonly guideAssignments: RuntimeGuideAssignmentPort;
  readonly initialized: Promise<void>;
}

export function createSupabasePortalShell(
  config: SupabaseRuntimeConfig,
): SupabasePortalShell {
  try {
    const client = createBrowserSupabaseClient({
      NEXT_PUBLIC_SUPABASE_URL: config.supabaseUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.supabasePublishableKey,
    } as PublicEnv);

    return {
      mode: "supabase",
      session: createSupabasePortalSessionAdapter(client),
      bookingCancellations: createSupabaseBookingCancellationAdapter(client),
      ...createFixedTourRuntimeComposition(createSupabaseFixedTourRuntimeAdapter(client)),
      guideAssignments: createSupabaseRuntimeGuideAssignmentAdapter(client),
      initialized: Promise.resolve(),
    };
  } catch {
    throw new PortalError(
      "PRODUCTION_CONFIGURATION",
      "The Supabase portal client could not be configured.",
    );
  }
}
