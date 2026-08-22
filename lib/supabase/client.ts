import { createClient } from "@supabase/supabase-js";

import type { PublicEnv } from "@/lib/env/public";

export function createBrowserSupabaseClient(env: PublicEnv) {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
}
