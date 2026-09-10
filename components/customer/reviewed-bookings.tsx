'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n/config';
import type { ReviewedBookings,ReviewedBooking } from '@/lib/infrastructure/supabase/reviewed-bookings';
import { reviewedDataset } from '@/components/dev/reviewed-tours';
import { reviewedDepartures } from '@/components/dev/reviewed-departures';
import { bookingStatusLabels } from '@/lib/i18n/booking-status';
export function ReviewedBookingsList({locale,service,onLoaded}:{locale:Locale;service:ReviewedBookings;onLoaded:(count:number)=>void}) {
 const [rows,setRows]=useState<ReviewedBooking[]>([]),[error,setError]=useState(false),[loading,setLoading]=useState(true),[reload,setReload]=useState(0),[now,setNow]=useState(Date.now());
 useEffect(()=>{let active=true;const load=()=>{void service.list().then(data=>{if(active){setRows(data);onLoaded(data.length);setError(false);setLoading(false);}}).catch(()=>{if(active){setError(true);setLoading(false);}});};load();window.addEventListener('focus',load);window.addEventListener('localens-bookings-changed',load);const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('localens-bookings-changed',load);};},[service,reload,onLoaded]);
 const vi=locale==='vi';
 if(loading)return <p role="status">{vi?'Đang tải đơn đặt tour…':'Loading bookings…'}</p>;
 if(error)return <p role="alert">{vi?'Không thể tải đơn đặt tour.':'Unable to load bookings.'} <button onClick={()=>setReload(n=>n+1)}>{vi?'Thử lại':'Retry'}</button></p>;
 if(!rows.length)return null;
 return <section aria-label={vi?'Đơn đặt tour mô phỏng':'Simulated tour bookings'}>{rows.map(row=>{
 const match=reviewedDataset.tours.flatMap((tour,i)=>tour.departures.flatMap(d=>reviewedDepartures(d,i)).map(departure=>({tour,departure}))).find(x=>x.departure.id===row.departure_id);
 const status=row.status==='pending_payment'&&Date.parse(row.expires_at)<=now?'expired':row.status;
 return <article key={row.id} style={{border:'1px solid #dfe6e1',borderRadius:14,padding:24,marginBottom:20}}>
 <h3>{match?.tour.translations[locale].title??(vi?'Tour đã đặt':'Booked tour')}</h3>
 <p>{vi?'Mã đơn: ':'Booking: '}{row.id}</p>
 <dl><dt>{vi?'Trạng thái đơn':'Booking status'}</dt><dd>{bookingStatusLabels[locale][status]}</dd><dt>{vi?'Thanh toán':'Payment'}</dt><dd>{row.paid_at?(vi?'Đã thanh toán':'Paid'):(vi?'Chờ thanh toán':'Awaiting payment')}</dd><dt>{vi?'Số khách':'Travelers'}</dt><dd>{row.party_size}</dd><dt>{vi?'Khởi hành':'Departure'}</dt><dd>{match?new Intl.DateTimeFormat(vi?'vi-VN':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(match.departure.startAt)):row.departure_id}</dd><dt>{vi?'Tổng tiền':'Total'}</dt><dd>{new Intl.NumberFormat(vi?'vi-VN':'en-US',{style:'currency',currency:vi?'VND':'USD'}).format(vi?row.total_vnd:row.total_vnd/26000)}</dd></dl>
 {status==='pending_payment'&&<Link href={'/'+locale+'/payment-preview/?booking='+row.id+'&departure='+row.departure_id+'&partySize='+row.party_size}>{vi?'Tiếp tục thanh toán':'Continue payment'}</Link>}
 <p>{vi?'Thanh toán mô phỏng — không phát sinh thu tiền thật.':'Simulated payment — no real charge.'}</p>
 </article>;
 })}</section>;
}
