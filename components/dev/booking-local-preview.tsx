"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RuntimeTourCatalog } from "@/components/customer/runtime-tour-catalog";
import { RuntimeFixedTourBooking } from "@/components/customer/runtime-fixed-tour-booking";
import type { FixedTourRuntimePort } from "@/lib/application/fixed-tour/contracts";
import type { RuntimeSessionPort } from "@/lib/application/portal/contracts";
import type { PublishedTour, LiveDepartureAvailability } from "@/lib/domain/data/contracts";
import type { Locale } from "@/lib/i18n/config";
import { reviewedDepartures } from "./reviewed-departures";
import { reviewedDataset as dataset } from "./reviewed-tours";
import { loadPortalSurfaceComposition } from "@/components/portals/portal-session";


export function BookingLocalPreview({ locale, catalog = false }: { locale: Locale; catalog?: boolean }) {
  const [departureId, setDepartureId] = useState(dataset.tours[0].departures[0].id);
  const [showPreviewTools, setShowPreviewTools] = useState(false);
  const [initialPartySize, setInitialPartySize] = useState("1");
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("departure");
    setShowPreviewTools(new URLSearchParams(window.location.search).get("previewTools") === "1");
    setInitialPartySize(new URLSearchParams(window.location.search).get("partySize") ?? "1");
    if (requested && dataset.tours.some((t, i) => t.departures.some(d => reviewedDepartures(d, i).some(item => item.id === requested)))) setDepartureId(requested);
  }, []);
  const checkoutPath = useRef("");
  const [scenario, setScenario] = useState("customer");
  const composition = useMemo(() => {
    const getTours = (locale: Locale): PublishedTour[] => dataset.tours.map((tour) => ({
      id: tour.id, versionId: tour.versionId, slug: tour.slug, locale,
      ...tour.translations[locale], durationMinutes: tour.durationMinutes,
      priceVndMinor: String(tour.priceVndPerPerson), inclusions: locale === "en" ? tour.englishInclusions : tour.inclusions, exclusions: locale === "en" ? tour.englishExclusions : tour.exclusions,
      cancellationPolicy: locale === "en" ? tour.englishCancellationPolicy : tour.cancellationPolicy, sourceUrl: tour.source.url, verifiedAt: tour.source.verifiedAt,
      attribution: tour.source.attribution, license: tour.source.license,
      stops: tour.stopPlaceIds.map((id, index) => {
        const place = dataset.places.find((item) => item.id === id)!;
        return { position: index + 1, placeId: id, placeSlug: place.slug, title: place.translations[locale].title };
      }),
    }));
    const departures: LiveDepartureAvailability[] = dataset.tours.flatMap((tour, tourIndex) => (catalog ? tour.departures : tour.departures.flatMap(departure => reviewedDepartures(departure, tourIndex))).map((departure) => ({
      id: departure.id, tourVersionId: tour.versionId, startAt: departure.startAt, endAt: departure.endAt,
      status: "scheduled" as const, remainingCapacity: scenario === "soldout" ? 0 : departure.capacity,
    })));
    const session: RuntimeSessionPort = {
      getSession: async () => { if (scenario === "guest") return null; const shell = await loadPortalSurfaceComposition(); await shell.initialized; const identity = await shell.session.getSession(); return identity ? { userId: identity.userId, role: identity.role, locale: identity.locale, displayName: identity.displayName, email: identity.email } : null; },
      signInWithPassword: async () => { throw new Error("Local UI preview only"); },
      signOut: async () => undefined,
    };
    const fixedTour: FixedTourRuntimePort = {
      listPublishedTours: async (requestedLocale) => { if (scenario === "error") throw new Error("Preview error"); return getTours(requestedLocale); },
      listAvailability: async () => {
        const shell = await loadPortalSurfaceComposition(); await shell.initialized;
        if(shell.mode !== 'supabase' || !shell.reviewedBookings) return departures;
        const availability = await shell.reviewedBookings.availability();
        const remaining = new Map(availability.map(row=>[row.departure_id,row.remaining]));
        return departures.map(d=>({...d,remainingCapacity:remaining.get(d.id) ?? 0}));
      },
      beginBooking: async (input) => {
        const shell = await loadPortalSurfaceComposition(); await shell.initialized;
        if(shell.mode !== 'supabase' || !shell.reviewedBookings) throw new Error('Please sign in with a registered account.');
        const storageKey = 'reviewed-attempt:'+input.departureId+':'+input.partySize;
        let key = sessionStorage.getItem(storageKey) || crypto.randomUUID();
        sessionStorage.setItem(storageKey,key);
        let booking;
        try { booking=await shell.reviewedBookings.begin(input.departureId,input.partySize,key); }
        catch(error) {
          if(!(error instanceof Error) || !error.message.includes('EXPIRED')) throw error;
          key=crypto.randomUUID(); sessionStorage.setItem(storageKey,key);
          booking=await shell.reviewedBookings.begin(input.departureId,input.partySize,key);
        }
        checkoutPath.current = '/'+locale+'/payment-preview/?booking='+booking.id+'&departure='+encodeURIComponent(input.departureId)+'&partySize='+input.partySize;
        return {bookingId:booking.id,holdExpiresAt:booking.expires_at,state:'created'};
      },
      listOwnBookings: async () => [], listOwnPaymentStatuses: async () => [],
      completeSimulatedPayment: async () => { throw new Error("Local UI preview only"); },
    };
    return { initialized: Promise.resolve(), session, fixedTour };
  }, [locale, scenario, catalog]);


  return <>
    {process.env.NODE_ENV === "development" && showPreviewTools && <div className="booking-preview-bar">
      <p>{locale === "vi" ? "3 lịch trình đề xuất · Ngày khởi hành minh họa, chưa xác nhận dịch vụ." : "3 proposed itineraries · Illustrative departure dates; services are not confirmed."}</p>
      {!catalog && <label>{locale === "vi" ? "Chọn tour để xem" : "Choose a tour to preview"}
        <select value={departureId} onChange={event => { setDepartureId(event.target.value); checkoutPath.current = ""; }}>
          {dataset.tours.map(t => <option key={t.id} value={t.departures[0].id}>{t.translations[locale].title}</option>)}
        </select>
      </label>}
      <p>{locale === "vi" ? "Xem trước giao diện trên localhost · Dữ liệu mô phỏng, không tạo đặt chỗ thật." : "Localhost UI preview · Fixture data, no real booking is created."}</p>
      <label>{locale === "vi" ? "Trạng thái xem thử" : "Preview state"}
        <select value={scenario} onChange={(event) => { setScenario(event.target.value); checkoutPath.current = ""; }}>
          <option value="customer">{locale === "vi" ? "Khách hàng" : "Customer"}</option>
          <option value="guest">{locale === "vi" ? "Chưa đăng nhập" : "Signed out"}</option>
          <option value="soldout">{locale === "vi" ? "Hết chỗ" : "Sold out"}</option>
          <option value="error">{locale === "vi" ? "Lỗi tải dữ liệu" : "Service error"}</option>
        </select>
      </label>
    </div>}
    {catalog ? <RuntimeTourCatalog locale={locale} fixedTour={composition.fixedTour} initialized={composition.initialized} activityTimeline /> :
    <RuntimeFixedTourBooking key={`${locale}:${scenario}:${departureId}:${initialPartySize}`} locale={locale} composition={composition}
      departureId={departureId} initialPartySize={initialPartySize} localCalendar
      overview={dataset.tours.find((t, i) => t.departures.some(d => reviewedDepartures(d, i).some(item => item.id === departureId)))?.overview[locale]}
      returnTo={`/${locale}/booking-preview/`} navigate={() => { if (checkoutPath.current) window.location.assign(checkoutPath.current); }} />}
  </>;
}
