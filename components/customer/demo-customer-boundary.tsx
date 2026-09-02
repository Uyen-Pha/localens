"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import type { DemoPortalComposition } from "@/lib/application/portal/composition";
import type { DemoPortalIdentity } from "@/lib/application/portal/contracts";
import type { Locale } from "@/lib/i18n/config";
import { signInPath } from "@/lib/navigation/safe-return-to";
import { getDemoPortalComposition } from "@/components/portals/portal-session";
import { portalCopy, portalPath, signedInRoleText } from "@/components/portals/portal-copy";

type BoundaryState = "loading" | "ready" | "error";

export function DemoCustomerBoundary({
  locale,
  returnTo,
  children,
}: {
  locale: Locale;
  returnTo?: string | null;
  children: (composition: DemoPortalComposition) => ReactNode;
}) {
  const copy = portalCopy(locale);
  const [composition, setComposition] = useState<DemoPortalComposition | null>(null);
  const [session, setSession] = useState<DemoPortalIdentity | null | undefined>(undefined);
  const [state, setState] = useState<BoundaryState>("loading");

  useEffect(() => {
    let disposed = false;
    let activeComposition: DemoPortalComposition;
    try {
      activeComposition = getDemoPortalComposition();
      setComposition(activeComposition);
    } catch {
      setState("error");
      return () => undefined;
    }

    void activeComposition.initialized
      .then(() => activeComposition.session.getSession())
      .then((nextSession) => {
        if (disposed) return;
        setSession(nextSession);
        setState("ready");
      })
      .catch(() => {
        if (disposed) return;
        setState("error");
      });

    return () => {
      disposed = true;
    };
  }, []);

  if (state === "error") {
    return (
      <section className="customer-section" aria-labelledby="customer-demo-boundary-heading">
        <p className="eyebrow">{copy.demoOnly}</p>
        <h1 id="customer-demo-boundary-heading">{copy.errorTitle}</h1>
        <p role="alert">{copy.errorMessage}</p>
        <Link className="button button--secondary" href={signInPath(locale, returnTo)}>{copy.chooseIdentity}</Link>
      </section>
    );
  }

  if (state === "loading" || composition === null || session === undefined) {
    return (
      <section className="customer-section" aria-labelledby="customer-demo-boundary-heading">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 id="customer-demo-boundary-heading">{copy.customerHeading}</h1>
        <p role="status" aria-live="polite">{copy.loading}</p>
      </section>
    );
  }

  if (session === null || session.role !== "customer") {
    return (
      <section className="customer-section" aria-labelledby="customer-demo-boundary-heading">
        <p className="eyebrow">{copy.demoOnly}</p>
        <h1 id="customer-demo-boundary-heading">{copy.accessDeniedTitle}</h1>
        <p>{copy.accessDeniedMessage}</p>
        {session === null ? (
          <Link className="button button--secondary" href={signInPath(locale, returnTo)}>{copy.chooseIdentity}</Link>
        ) : (
          <>
            <p>{signedInRoleText(locale, session.role)}</p>
            <Link className="button button--secondary" href={portalPath(locale, session.role)}>{copy.openYourPortal}</Link>
          </>
        )}
      </section>
    );
  }

  return <>{children(composition)}</>;
}
