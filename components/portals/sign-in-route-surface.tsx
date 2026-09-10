"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

import { PortalSurface } from "@/components/portals/portal-surface";
import type { Locale } from "@/lib/i18n/config";

function SignInRouteContent({ locale }: { locale: Locale }) {
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");
  return <>
    {searchParams.get('passwordChanged') === '1' && <p role="status" style={{ textAlign: 'center', padding: 16 }}>{locale === 'vi' ? 'Đổi mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.' : 'Password changed successfully. Please sign in with your new password.'}</p>}
    {registered === "1" && <p role="status">{locale === "vi" ? "Đăng ký tài khoản thành công. Vui lòng đăng nhập." : "Account created successfully. Please sign in."}</p>}
    {registered === "verify" && <p role="status">{locale === "vi" ? "Vui lòng kiểm tra email để xác nhận tài khoản trước khi đăng nhập." : "Check your email to confirm your account before signing in."}</p>}
    <PortalSurface locale={locale} returnTo={searchParams.get("returnTo")} />
    <p style={{ textAlign: "center", margin: "24px 0" }}>{locale === "vi" ? "Chưa có tài khoản? " : "New to LocalLens? "}<Link href={`/${locale}/register/`} style={{ textDecoration: "underline" }}>{locale === "vi" ? "Đăng ký tài khoản" : "Create an account"}</Link></p>
  </>;
}

export function SignInRouteSurface({ locale }: { locale: Locale }) {
  return (
    <Suspense fallback={<PortalSurface locale={locale} returnTo={null} />}>
      <SignInRouteContent locale={locale} />
    </Suspense>
  );
}
