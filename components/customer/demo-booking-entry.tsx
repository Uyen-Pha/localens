"use client";

import { BookingFlow, type BookingCopy } from "@/components/customer/booking-flow";
import { DemoCustomerBoundary } from "@/components/customer/demo-customer-boundary";
import type { Locale } from "@/lib/i18n/config";

export function DemoBookingEntry({ locale, copy, returnTo }: { locale: Locale; copy: BookingCopy; returnTo?: string | null }) {
  return (
    <DemoCustomerBoundary locale={locale} returnTo={returnTo}>
      {(composition) => <BookingFlow locale={locale} copy={copy} demoPortal={composition} />}
    </DemoCustomerBoundary>
  );
}
