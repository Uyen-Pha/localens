'use client';
import { useEffect,useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Search, CalendarDays, UsersRound, CreditCard, ArrowRight, MapPin, Info, Copy, Check, Ticket } from 'lucide-react';
import type { Locale } from '@/lib/i18n/config';
import type { ReviewedBookings,ReviewedBooking } from '@/lib/infrastructure/supabase/reviewed-bookings';
import { reviewedDataset } from '@/components/dev/reviewed-tours';
import { reviewedDepartures } from '@/components/dev/reviewed-departures';
import { bookingStatusLabels } from '@/lib/i18n/booking-status';
import { tourIllustration } from '@/lib/domain/data/tour-illustrations';
import styles from './reviewed-bookings.module.css';
const departures=reviewedDataset.tours.flatMap((tour,i)=>tour.departures.flatMap(d=>reviewedDepartures(d,i)).map(departure=>({tour,departure})));
const filters=['all','pending_payment','confirmed','completed','cancelled','expired'] as const;
export function ReviewedBookingsList({locale,service,onLoaded}:{locale:Locale;service:ReviewedBookings;onLoaded:(count:number)=>void}) {
 const [rows,setRows]=useState<ReviewedBooking[]>([]),[error,setError]=useState(false),[loading,setLoading]=useState(true),[reload,setReload]=useState(0),[now,setNow]=useState(Date.now());
 const [filter,setFilter]=useState<string>('all'),[query,setQuery]=useState(''),[sort,setSort]=useState('newest'),[expanded,setExpanded]=useState<string|null>(null),[copied,setCopied]=useState<string|null>(null);
 useEffect(()=>{let active=true;const load=()=>{void service.list().then(data=>{if(active){setRows(data);onLoaded(data.length);setError(false);setLoading(false);}}).catch(()=>{if(active){setError(true);setLoading(false);}});};load();window.addEventListener('focus',load);window.addEventListener('localens-bookings-changed',load);const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('localens-bookings-changed',load);};},[service,reload,onLoaded]);
 useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(null),2000);return()=>clearTimeout(timer);},[copied]);
 const vi=locale==='vi';
 const statusOf=(row:ReviewedBooking)=>row.status==='pending_payment'&&Date.parse(row.expires_at)<=now?'expired':row.status;
 const date=(value:string,time=false)=>new Intl.DateTimeFormat(vi?'vi-VN':'en-GB',{dateStyle:'medium',...(time?{timeStyle:'short' as const}:{}),timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(value));
 const money=(value:number)=>new Intl.NumberFormat(vi?'vi-VN':'en-US',{style:'currency',currency:vi?'VND':'USD'}).format(vi?value:value/26000);
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
 const visible=rows.filter(row=>{const match=departures.find(d=>d.departure.id===row.departure_id);return(filter==='all'||statusOf(row)===filter)&&normalize((match?.tour.translations[locale].title??'')+' '+row.id).includes(normalize(query.trim()));}).sort((a,b)=>(Date.parse(a.created_at)-Date.parse(b.created_at))*(sort==='newest'?-1:1));
 if(loading)return <p role="status">{vi?'Đang tải đơn đặt tour…':'Loading bookings…'}</p>;
 if(error)return <p role="alert">{vi?'Không thể tải đơn đặt tour.':'Unable to load bookings.'} <button onClick={()=>setReload(n=>n+1)}>{vi?'Thử lại':'Retry'}</button></p>;
 if(!rows.length)return null;
 return <section className={styles.bookings} aria-label={vi?'Đơn đặt tour mô phỏng':'Simulated tour bookings'}>
 <div className={styles.toolbar}><div className={styles.filters} aria-label={vi?'Lọc trạng thái đơn':'Filter booking status'}>{filters.map(key=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{key==='all'?(vi?'Tất cả':'All'):bookingStatusLabels[locale][key]} <span>({rows.filter(r=>key==='all'||statusOf(r)===key).length})</span></button>)}</div>
 <div className={styles.tools}><label className={styles.search}><Search size={20}/><input aria-label={vi?'Tìm đơn đặt tour':'Search bookings'} placeholder={vi?'Tìm theo tên tour, mã đơn…':'Search by tour or booking ID…'} value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label={vi?'Sắp xếp đơn':'Sort bookings'} value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">{vi?'Mới nhất':'Newest first'}</option><option value="oldest">{vi?'Cũ nhất':'Oldest first'}</option></select></div></div>
 {!visible.length&&<div className={styles.empty}><Ticket size={32}/><h3>{vi?'Không có đơn phù hợp':'No matching bookings'}</h3><p>{vi?'Thử tên tour khác hoặc thay đổi bộ lọc.':'Try another tour name or change your filters.'}</p><button onClick={()=>{setQuery('');setFilter('all');}}>{vi?'Xóa bộ lọc':'Clear filters'}</button></div>}
 {visible.map(row=>{
 const match=departures.find(x=>x.departure.id===row.departure_id),status=statusOf(row),title=match?.tour.translations[locale].title??(vi?'Tour đã đặt':'Booked tour');
 const picture=tourIllustration(match?.tour.slug??'');
 return <article key={row.id} className={styles.card}>
 <div className={styles.photo}><Image src={picture.src} alt={picture[locale]} width={600} height={420}/><span><MapPin size={15}/>{vi?'TP. Hồ Chí Minh':'Ho Chi Minh City'}</span></div>
 <div className={styles.body}><div className={styles.cardHeader}><div><h3>{title}</h3><div className={styles.code}>{vi?'Mã đơn: ':'Booking ID: '}<span>{row.id}</span><button aria-label={vi?'Sao chép mã đơn':'Copy booking ID'} onClick={()=>{void navigator.clipboard.writeText(row.id).then(()=>setCopied(row.id)).catch(()=>setCopied(null));}}>{copied===row.id?<Check size={16}/>:<Copy size={16}/>}</button></div></div><div className={styles.created}><span className={`${styles.badge} ${styles[status]}`}>{bookingStatusLabels[locale][status]}</span><small><CalendarDays size={15}/>{vi?'Đặt ngày ':'Booked '}{date(row.created_at)}</small></div></div>
 <div className={styles.details}><dl><div><dt><CreditCard size={19}/>{vi?'Thanh toán':'Payment'}</dt><dd><span className={`${styles.badge} ${row.paid_at?styles.confirmed:styles.pending_payment}`}>{row.paid_at?(vi?'Đã thanh toán':'Paid'):(vi?'Chờ thanh toán':'Awaiting payment')}</span></dd></div><div><dt><UsersRound size={19}/>{vi?'Số khách':'Travelers'}</dt><dd>{row.party_size}</dd></div><div><dt><CalendarDays size={19}/>{vi?'Khởi hành':'Departure'}</dt><dd>{match?date(match.departure.startAt,true):'—'}</dd></div></dl><div className={styles.total}><span>{vi?'Tổng tiền':'Total'}</span><strong>{money(row.total_vnd)}</strong></div></div>
 <footer className={styles.footer}><p><Info size={17}/>{vi?'Thanh toán mô phỏng — không phát sinh thu tiền thật.':'Simulated payment — no real charge.'}</p><div>{status==='pending_payment'&&<Link className={styles.primary} href={'/'+locale+'/payment-preview/?booking='+row.id+'&departure='+row.departure_id+'&partySize='+row.party_size}>{vi?'Tiếp tục thanh toán':'Continue payment'}<ArrowRight size={18}/></Link>}<button className={status==='pending_payment'?styles.secondary:styles.primary} aria-expanded={expanded===row.id} onClick={()=>setExpanded(expanded===row.id?null:row.id)}>{expanded===row.id?(vi?'Thu gọn':'Show less'):(vi?'Xem chi tiết':'View details')}<ArrowRight size={18}/></button></div></footer>
 {expanded===row.id&&<div className={styles.expanded}><h4>{vi?'Thông tin đơn đặt tour':'Booking details'}</h4><p>{vi?'Trạng thái đơn: ':'Booking status: '}{bookingStatusLabels[locale][status]}</p><p>{vi?'Giá mỗi khách: ':'Price per traveler: '}{money(row.total_vnd/row.party_size)}</p>{row.paid_at&&<p>{vi?'Thanh toán lúc: ':'Paid on: '}{date(row.paid_at,true)}</p>}{status==='pending_payment'&&<p>{vi?'Giữ chỗ đến: ':'Reserved until: '}{date(row.expires_at,true)}</p>}<Link href={`/${locale}/booking/?departure=${row.departure_id}&partySize=${row.party_size}`}>{vi?'Xem thông tin tour':'View tour information'}</Link></div>}
 </div></article>;
 })}</section>;
}
