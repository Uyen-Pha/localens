"use client";

import { CustomRequestFlow } from "@/components/customer/custom-request-flow";
import { DemoCustomerBoundary } from "@/components/customer/demo-customer-boundary";
import type { Locale } from "@/lib/i18n/config";
import type { CustomRequestCopy } from "@/lib/i18n/dictionaries";

export function DemoCustomRequestEntry({ locale, copy }: { locale: Locale; copy: CustomRequestCopy }) {
  return (
    <DemoCustomerBoundary locale={locale}>
      {(composition) => <CustomRequestFlow locale={locale} copy={copy} demoPortal={composition} />}
    </DemoCustomerBoundary>
  );
}
