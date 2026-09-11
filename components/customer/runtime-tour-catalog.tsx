"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock3, MapPin, Route } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { FixedTourRuntimePort } from "@/lib/application/fixed-tour/contracts";
import type { LiveDepartureAvailability, PublishedTour } from "@/lib/domain/data/contracts";
import type { Locale } from "@/lib/i18n/config";
import { tourIllustration } from "@/lib/domain/data/tour-illustrations";
import { fixedTourRuntimeCopy } from "@/lib/i18n/fixed-tour-runtime";
import { emptyTourSearch, filterTours, type TourSearch } from '@/lib/application/fixed-tour/search';
import searchStyles from './tour-search.module.css';
import { TourRating } from './tour-reviews';

type LoadState = "loading" | "ready" | "error";

function formatVnd(value: string, locale: Locale): string {
  const amount = Number(value);
  return Number.isSafeInteger(amount)
    ? new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount)
    : value;
}

export function RuntimeTourCatalog({ locale, fixedTour, initialized, activityTimeline = false }: {
  activityTimeline?: boolean;
  locale: Locale;
  fixedTour: FixedTourRuntimePort;
  initialized: Promise<void>;
}) {
  const copy = fixedTourRuntimeCopy(locale);
  const visual = locale === "vi" ? {
    eyebrow: "Sài Gòn qua góc nhìn bản địa", image: "Ảnh minh họa", minutes: "phút",
    details: "Điểm hẹn & hành trình", book: "Đặt tour", departures: "Chọn lịch khởi hành",
    count: "hành trình để khám phá", perPerson: "/ khách", stops: activityTimeline ? "hoạt động" : "điểm dừng",
  } : {
    eyebrow: "Saigon through local eyes", image: "Illustrative image", minutes: "min",
    details: "Meeting point & itinerary", book: "Book tour", departures: "Choose a departure",
    count: "journeys to discover", perPerson: "/ person", stops: activityTimeline ? "activities" : "stops",
  };
  const [state, setState] = useState<LoadState>("loading");
  const [tours, setTours] = useState<PublishedTour[]>([]);
  const [availability, setAvailability] = useState<LiveDepartureAvailability[]>([]);
  const [retryKey, setRetryKey] = useState(0);
  const [draft, setDraft] = useState<TourSearch>({...emptyTourSearch});
  const [criteria, setCriteria] = useState<TourSearch>({...emptyTourSearch});
  const vi = locale === 'vi';
  const [language, setLanguage] = useState<Locale>(locale);
  const requestId = useRef(0);
  const searchedLanguage = useRef<Locale>(locale);
  const results = filterTours(tours, criteria);

  const load = useCallback(async (contentLocale: Locale = locale) => {
    const request = ++requestId.current;
    searchedLanguage.current = contentLocale;
    setState("loading");
    try {
      await initialized;
      const [published, departures] = await Promise.all([
        fixedTour.listPublishedTours(contentLocale), fixedTour.listAvailability(),
      ]);
      if (request !== requestId.current) return;
      setTours(published);
      setAvailability(departures);
      setState("ready");
    } catch {
      if (request !== requestId.current) return;
      setTours([]);
      setAvailability([]);
      setState("error");
    }
  }, [fixedTour, initialized, locale]);

  useEffect(() => { void load(searchedLanguage.current); return () => { requestId.current++; }; }, [load, retryKey]);


  return (
    <div className="runtime-catalog">
      <section aria-labelledby="runtime-fixed-tours-title">
        <div className="runtime-catalog__heading">
          <p className="runtime-catalog__eyebrow"><MapPin size={15} aria-hidden="true" />{visual.eyebrow}</p>
          <h1 id="runtime-fixed-tours-title">{copy.catalogHeading}</h1>
          <p>{copy.catalogIntro}</p>
        </div>
        <form className={searchStyles.form} role="search" aria-label={vi ? 'Tìm kiếm tour' : 'Search tours'} onSubmit={e => { e.preventDefault(); setCriteria({...draft}); void load(language); }}>
          <label htmlFor="tour-keyword">{vi ? 'Bạn muốn khám phá điều gì?' : 'What would you like to explore?'}</label>
          <div className={searchStyles.keyword}><input id="tour-keyword" type="search" maxLength={160} placeholder={vi ? 'Tên tour, địa điểm, trải nghiệm…' : 'Tour name, place, experience…'} value={draft.keyword} onChange={e=>setDraft({...draft,keyword:e.target.value})}/><button disabled={state === 'loading'}>{state === 'loading' ? (vi ? 'Đang tìm…' : 'Searching…') : (vi ? 'Tìm kiếm' : 'Search')}</button></div>
          <div className={searchStyles.filters}>
            <label>{vi ? 'Ngôn ngữ nội dung' : 'Content language'}<select value={language} onChange={e=>setLanguage(e.target.value as Locale)}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label>
            <label>{vi ? 'Loại trải nghiệm' : 'Experience'}<select value={draft.experience} onChange={e=>setDraft({...draft,experience:e.target.value})}><option value="">{vi ? 'Tất cả trải nghiệm' : 'All experiences'}</option><option value="heritage">{vi ? 'Văn hóa & di sản' : 'Culture & heritage'}</option><option value="craft">{vi ? 'Thủ công & sáng tạo' : 'Arts & crafts'}</option><option value="river">{vi ? 'Du ngoạn sông' : 'River cruises'}</option><option value="food">{vi ? 'Ẩm thực' : 'Food experiences'}</option></select></label>
            <label>{vi ? 'Ngân sách / khách (VND)' : 'Budget / person (VND)'}<select value={draft.budget} onChange={e=>setDraft({...draft,budget:e.target.value})}><option value="">{vi ? 'Tất cả mức giá' : 'Any budget'}</option><option value="under1m">{vi ? 'Dưới 1.000.000' : 'Under 1,000,000'}</option><option value="1to2m">{vi ? '1.000.000 – 2.000.000' : '1,000,000 – 2,000,000'}</option><option value="over2m">{vi ? 'Trên 2.000.000' : 'Over 2,000,000'}</option></select></label>
            <label>{vi ? 'Thời lượng' : 'Duration'}<select value={draft.duration} onChange={e=>setDraft({...draft,duration:e.target.value})}><option value="">{vi ? 'Tất cả thời lượng' : 'Any duration'}</option><option value="half">{vi ? 'Tối đa 6 giờ' : 'Up to 6 hours'}</option><option value="full">{vi ? 'Trên 6 giờ' : 'Over 6 hours'}</option></select></label>
          </div>
          <button type="button" className={searchStyles.reset} onClick={()=>{setDraft({...emptyTourSearch});setCriteria({...emptyTourSearch});setLanguage(locale);void load();}}>{vi ? 'Xóa bộ lọc' : 'Clear filters'}</button>
        </form>
        {state === 'loading' && <p role="status">{copy.loading}</p>}
        {state === 'error' && <div role="alert"><p>{vi ? 'Đã có lỗi xảy ra trong quá trình lấy dữ liệu. Vui lòng thử lại sau.' : 'An error occurred while loading tours. Please try again later.'}</p><button onClick={()=>setRetryKey(n=>n+1)}>{copy.retry}</button></div>}
        {state === 'ready' && <>
        <div className="runtime-catalog__toolbar">
          <p role="status"><strong>{results.length.toString().padStart(2, "0")}</strong> {visual.count}</p>
          <p className="runtime-catalog__disclosure" role="note">{copy.runtimeDisclosure}</p>
        </div>
        {results.length === 0 ? <div className={searchStyles.empty}><h2>{vi ? 'Không có kết quả phù hợp' : 'No matching results'}</h2><p>{vi ? 'Thử từ khóa khác hoặc xóa bớt bộ lọc để khám phá thêm tour.' : 'Try another keyword or remove filters to discover more tours.'}</p></div> : (
          <div className="runtime-catalog__grid">
            {results.map((tour, index) => {
              const departures = availability.filter((item) => item.tourVersionId === tour.versionId);
              const departure = departures.find(item => item.status === 'scheduled' && item.remainingCapacity > 0) ?? departures[0];
              const detailHref = departure ? '/' + tour.locale + '/booking/?departure=' + departure.id + '&partySize=1' : null;
              const picture = tourIllustration(tour.slug);
              return (
                <article className="runtime-tour" key={`${tour.id}:${tour.versionId}`}>
                  <figure className="runtime-tour__media">
                    {detailHref ? <Link href={detailHref} aria-label={tour.title}><Image src={picture.src} alt={picture[locale]} width={800} height={500} loading={index === 0 ? "eager" : "lazy"} /></Link> : <Image src={picture.src} alt={picture[locale]} width={800} height={500} />}
                  </figure>
                  <div className="runtime-tour__body">
                    <div className="runtime-tour__meta">
                      <span><Clock3 size={15} aria-hidden="true" />{tour.durationMinutes} {visual.minutes}</span>
                      <span><Route size={15} aria-hidden="true" />{tour.stops.length} {visual.stops}</span>
                    </div>
                    <h2>{detailHref ? <Link href={detailHref}>{tour.title}</Link> : tour.title}</h2>
                    <p className="runtime-tour__summary">{tour.summary}</p>
                    <TourRating locale={locale} departure={departure?.id}/>
                    <p className="runtime-tour__price">{formatVnd(tour.priceVndMinor, locale)} <span>{visual.perPerson}</span></p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        </>}
      </section>
    </div>
  );
}
