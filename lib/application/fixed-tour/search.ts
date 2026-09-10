import type { PublishedTour } from '@/lib/domain/data/contracts';
export interface TourSearch { keyword: string; experience: string; budget: string; duration: string }
export const emptyTourSearch: TourSearch = {keyword:'',experience:'',budget:'',duration:''};
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
export function filterTours(tours: PublishedTour[], filters: TourSearch) {
  return tours.filter(tour => {
    const text = normalize([tour.title,tour.summary,tour.meetingPoint,...tour.stops.map(s=>s.title)].join(' '));
    if (!normalize(filters.keyword.trim()).split(/\s+/).every(word=>text.includes(word))) return false;
    const experiences: Record<string, RegExp> = { heritage:/di san|heritage|lich su|history|dinh doc lap|independence|van hoa|culture/, craft:/lam den|lantern|thu cong|workshop/, river:/du ngoan|cruise|bach dang|song sai gon|saigon river/, food:/am thuc|food|com tam|lunch|an trua|an toi|dinner/ };
    if (filters.experience && !experiences[filters.experience]?.test(text)) return false;
    const price = Number(tour.priceVndMinor);
    if (filters.budget === 'under1m' && price >= 1000000) return false;
    if (filters.budget === '1to2m' && (price < 1000000 || price > 2000000)) return false;
    if (filters.budget === 'over2m' && price <= 2000000) return false;
    if (filters.duration === 'half' && tour.durationMinutes > 360) return false;
    if (filters.duration === 'full' && tour.durationMinutes <= 360) return false;
    return true;
  });
}
