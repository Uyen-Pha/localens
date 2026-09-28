import data from '@/data/demo/fixed-tour-additions.v1.json';
import type { PublishedTour } from '@/lib/domain/data/contracts';
import type { Locale } from '@/lib/i18n/config';

export const additionalFixedTours = data.tours;
export function additionalPublishedTours(locale: Locale): PublishedTour[] {
  return additionalFixedTours.map(t=>({
    id:t.code, versionId:`${t.code}-v1`, slug:t.code.toLowerCase(), locale,
    title:t.name, summary:t.summary, meetingPoint:t.meeting ?? (locale==='vi'?'Điểm hẹn tại trung tâm TP.HCM chưa được chốt.':'The central HCMC meeting point is not yet confirmed.'),
    durationMinutes:t.duration, priceVndMinor:String(t.price), inclusions:t.includes, exclusions:t.excludes,
    cancellationPolicy:locale==='vi'?'Điều kiện hủy sẽ được công bố cùng lịch khởi hành.':'Cancellation terms will be published with departures.',
    sourceUrl:'', verifiedAt:'', attribution:data.source, license:'Owner-provided proposal',
    stops:t.stops.map((title,i)=>({position:i+1,placeId:`${t.code}-milestone-${i+1}`,placeSlug:`${t.code.toLowerCase()}-${i+1}`,title})),
  }));
}
export function formatTourDuration(minutes:number,locale:Locale) {
  const hours=Math.floor(minutes/60), rest=minutes%60;
  return locale==='vi'?`${hours} giờ${rest?` ${rest} phút`:''}`:`${hours}h${rest?` ${rest}m`:''}`;
}
