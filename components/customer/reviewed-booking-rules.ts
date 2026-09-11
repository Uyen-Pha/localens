import type {ReviewedBooking} from '@/lib/infrastructure/supabase/reviewed-bookings';
import {reviewedDataset} from '@/components/dev/reviewed-tours';
import {reviewedDepartures} from '@/components/dev/reviewed-departures';
export const bookingDepartures=reviewedDataset.tours.flatMap((tour,i)=>tour.departures.flatMap(d=>reviewedDepartures(d,i)).map(departure=>({tour,departure})));
export const effectiveBookingStatus=(row:ReviewedBooking,now:number)=>row.status==='pending_payment'&&Date.parse(row.expires_at)<=now?'expired':row.status;
export function canCancelBooking(row:ReviewedBooking,now:number){const match=bookingDepartures.find(x=>x.departure.id===row.departure_id);return (row.status==='pending_payment'&&Date.parse(row.expires_at)>now&&(!row.payment_status||['pending','failed'].includes(row.payment_status)))||row.status==='confirmed'&&!!match&&Date.parse(match.departure.startAt)-now>=48*60*60*1000;}
export const canReviewBooking=(row:ReviewedBooking)=>row.status==='completed'&&!row.reviewed_at;

