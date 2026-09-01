"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";

import type { BookingCopy } from "@/components/customer/booking-flow";
import { loadPortalSurfaceComposition } from "@/components/portals/portal-session";
import type { DemoPortalComposition } from "@/lib/application/portal/composition";
import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";
import type { Locale } from "@/lib/i18n/config";
import { fixedTourRuntimeCopy } from "@/lib/i18n/fixed-tour-runtime";

type Composition = DemoPortalComposition | SupabasePortalShell;
type RouteKind = "tours" | "booking";
type Navigate = (path: string) => void;

type LoadedSurface =
  | { kind: "demo-tours"; Surface: ComponentType<{ locale: Locale }> }
  | { kind: "demo-booking"; Surface: ComponentType<{ locale: Locale; copy: BookingCopy }> }
  | { kind: "runtime-tours"; Surface: ComponentType<{ locale: Locale; fixedTour: SupabasePortalShell["fixedTour"]; initialized: Promise<void> }> }
  | { kind: "runtime-booking"; Surface: ComponentType<{ locale: Locale; composition: SupabasePortalShell; departureId: string; initialPartySize: string; navigate: Navigate }> };

interface SelectedSurface {
  composition: Composition;
  surface: LoadedSurface;
}

export interface FixedTourRouteSurfaceProps {
  locale: Locale;
  route: RouteKind;
  demoBookingCopy?: BookingCopy;
  departureId?: string;
  initialPartySize?: string;
  composition?: Composition;
  navigate?: Navigate;
}

async function loadSelectedSurface(composition: Composition, route: RouteKind): Promise<LoadedSurface> {
  void composition.initialized.catch(() => undefined);
  if (composition.mode === "demo") {
    if (route === "tours") {
      const { DemoTourCatalogEntry } = await import("@/components/customer/demo-tour-catalog-entry");
      return { kind: "demo-tours", Surface: DemoTourCatalogEntry };
    }
    const { DemoBookingEntry } = await import("@/components/customer/demo-booking-entry");
    return { kind: "demo-booking", Surface: DemoBookingEntry };
  }
  if (route === "tours") {
    const { RuntimeTourCatalog } = await import("@/components/customer/runtime-tour-catalog");
    return { kind: "runtime-tours", Surface: RuntimeTourCatalog };
  }
  const { RuntimeFixedTourBooking } = await import("@/components/customer/runtime-fixed-tour-booking");
  return { kind: "runtime-booking", Surface: RuntimeFixedTourBooking };
}

function SurfaceContent(props: FixedTourRouteSurfaceProps & { navigate: Navigate }) {
  const copy = fixedTourRuntimeCopy(props.locale);
  const [selected, setSelected] = useState<SelectedSurface | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    setSelected(null);
    setFailed(false);
    const compositionLoad = props.composition
      ? Promise.resolve(props.composition)
      : loadPortalSurfaceComposition();
    void compositionLoad
      .then((composition) => Promise.all([composition, loadSelectedSurface(composition, props.route)] as const))
      .then(([composition, surface]) => {
        if (disposed) return;
        if (surface.kind.startsWith("runtime") && composition.mode !== "supabase") throw new Error("mode mismatch");
        setSelected({ composition, surface });
      })
      .catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; };
  }, [props.composition, props.route, retryKey]);

  if (failed) {
    return <div role="alert"><p>{copy.serviceUnavailable}</p><button type="button" onClick={() => setRetryKey((value) => value + 1)}>{copy.retry}</button></div>;
  }
  if (selected === null) return <p role="status" aria-live="polite">{copy.loading}</p>;

  const { composition, surface } = selected;
  if (surface.kind === "demo-tours") return <surface.Surface locale={props.locale} />;
  if (surface.kind === "demo-booking") {
    if (!props.demoBookingCopy) return <div role="alert">{copy.serviceUnavailable}</div>;
    return <surface.Surface locale={props.locale} copy={props.demoBookingCopy} />;
  }
  if (surface.kind === "runtime-tours") {
    if (!composition || composition.mode !== "supabase") return <div role="alert">{copy.serviceUnavailable}</div>;
    return <surface.Surface locale={props.locale} fixedTour={composition.fixedTour} initialized={composition.initialized} />;
  }
  if (!composition || composition.mode !== "supabase") return <div role="alert">{copy.serviceUnavailable}</div>;
  const browserQuery = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const departureId = props.departureId ?? browserQuery?.get("departure") ?? "";
  const initialPartySize = props.initialPartySize ?? browserQuery?.get("partySize") ?? "1";
  return <surface.Surface
    locale={props.locale}
    composition={composition}
    departureId={departureId}
    initialPartySize={initialPartySize}
    navigate={props.navigate}
  />;
}

function RouterSurface(props: FixedTourRouteSurfaceProps) {
  const router = useRouter();
  return <SurfaceContent {...props} navigate={(path) => router.push(path)} />;
}

export function FixedTourRouteSurface(props: FixedTourRouteSurfaceProps) {
  if (props.navigate) return <SurfaceContent {...props} navigate={props.navigate} />;
  if (props.route === "tours") return <SurfaceContent {...props} navigate={() => undefined} />;
  return <RouterSurface {...props} />;
}
