"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/config";
import { RegistrationError, type RegistrationInput } from "@/lib/application/portal/registration";
import { createRegistrationAdapter } from "@/lib/infrastructure/supabase/registration-adapter";
import { loadPortalSurfaceComposition } from "./portal-session";
import { RegistrationForm } from "./registration-form";
import { destinationAfterSignIn } from "@/lib/navigation/safe-return-to";

async function register(input: RegistrationInput) {
  if (process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME !== "supabase") throw new RegistrationError("UNAVAILABLE");
  const shell = await loadPortalSurfaceComposition();
  await shell.initialized;
  if (await shell.session.getSession()) throw new RegistrationError("SIGNED_IN");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new RegistrationError("UNAVAILABLE");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "localens-registration-transient" } });
  return createRegistrationAdapter(client).register(input);
}

export function RegistrationRouteSurface({ locale }: { locale: Locale }) {
  const router = useRouter();
  useEffect(() => {
    let disposed = false;
    if (process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME === "supabase") {
      void loadPortalSurfaceComposition().then(async shell => {
        await shell.initialized;
        const identity = await shell.session.getSession();
        if (!disposed && identity) router.replace(destinationAfterSignIn({ locale, role: identity.role, returnTo: null }));
      }).catch(() => undefined);
    }
    return () => { disposed = true; };
  }, [locale, router]);
  return <RegistrationForm locale={locale} port={{ register }} navigate={url => router.replace(url)} />;
}
