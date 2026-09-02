import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SignInRouteSurface } from "@/components/portals/sign-in-route-surface";
import { isLocale } from "@/lib/i18n/config";

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "vi" }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return {
    title: locale === "vi" ? "Đăng nhập | LocalLens" : "Sign in | LocalLens",
    robots: { index: false, follow: false },
  };
}

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return <SignInRouteSurface locale={locale} />;
}
