import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RegistrationRouteSurface } from "@/components/portals/registration-route-surface";
import { isLocale } from "@/lib/i18n/config";

export const dynamicParams = false;
export function generateStaticParams() { return [{ locale: "en" }, { locale: "vi" }]; }
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "vi" ? "Đăng ký tài khoản | LocalLens" : "Create an account | LocalLens", robots: { index: false, follow: false } };
}
export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <RegistrationRouteSurface locale={locale} />;
}
