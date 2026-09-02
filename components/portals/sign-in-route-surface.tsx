"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { PortalSurface } from "@/components/portals/portal-surface";
import type { Locale } from "@/lib/i18n/config";

function SignInRouteContent({ locale }: { locale: Locale }) {
  const searchParams = useSearchParams();
  return <PortalSurface locale={locale} returnTo={searchParams.get("returnTo")} />;
}

export function SignInRouteSurface({ locale }: { locale: Locale }) {
  return (
    <Suspense fallback={<PortalSurface locale={locale} returnTo={null} />}>
      <SignInRouteContent locale={locale} />
    </Suspense>
  );
}
