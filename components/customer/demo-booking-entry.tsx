"use client";

import { BookingFlow, type BookingCopy } from "@/components/customer/booking-flow";
import { DemoCustomerBoundary } from "@/components/customer/demo-customer-boundary";
import type { Locale } from "@/lib/i18n/config";

export function DemoBookingEntry({ locale, copy }: { locale: Locale; copy: BookingCopy }) {
  return (
    <DemoCustomerBoundary locale={locale}>
      {(composition) => <BookingFlow locale={locale} copy={copy} demoPortal={composition} />}
    </DemoCustomerBoundary>
  );
}
