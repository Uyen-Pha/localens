'use client';
import {useEffect,useState} from 'react';
import {Star} from 'lucide-react';
import type {Locale} from '@/lib/i18n/config';
import type {PublicTourReviews} from '@/lib/infrastructure/supabase/reviewed-bookings';
import {loadPortalSurfaceComposition} from '@/components/portals/portal-session';
import styles from './tour-reviews.module.css';
function useReviews(departure?:string){
 const [data,setData]=useState<PublicTourReviews|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{let alive=true;setData(null);setError(false);if(!departure)return;
 const load=async()=>{try{const shell=await loadPortalSurfaceComposition();await shell.initialized;if(shell.mode!=='supabase'||!shell.reviewedBookings)throw Error('unavailable');const result=await shell.reviewedBookings.publicReviews(departure);if(alive){setData(result);setError(false);}}catch{if(alive)setError(true);}};
 void load();window.addEventListener('focus',load);window.addEventListener('localens-reviews-changed',load);return()=>{alive=false;window.removeEventListener('focus',load);window.removeEventListener('localens-reviews-changed',load);};},[departure,retry]);
 return {data,error,retry:()=>setRetry(n=>n+1)};
}
export function TourRating({locale,departure}:{locale:Locale;departure?:string}){const {data}=useReviews(departure);if(!data?.count)return null;return <div className={styles.rating}><Star size={16} fill="currentColor"/><strong>{Number(data.average).toFixed(1)}</strong><span>({data.count} {locale==='vi'?'đánh giá':'reviews'})</span></div>;}
export function TourReviews({locale,departure}:{locale:Locale;departure?:string}){
 const {data,error,retry}=useReviews(departure),[all,setAll]=useState(false);const vi=locale==='vi';
 return <section className={styles.section} id="reviews" aria-labelledby="tour-reviews-heading"><div className={styles.heading}><h2 id="tour-reviews-heading">{vi?'Đánh giá từ khách hàng':'Customer reviews'}</h2></div>
 {error?<p role="alert">{vi?'Chưa thể tải đánh giá. Vui lòng thử lại.':'Unable to load reviews. Please try again.'} <button onClick={retry}>{vi?'Thử lại':'Retry'}</button></p>:!data?<p role="status">{vi?'Đang tải đánh giá…':'Loading reviews…'}</p>:data.count===0?<p>{vi?'Tour này chưa có đánh giá. Khách có thể chia sẻ trải nghiệm sau khi hoàn thành chuyến đi.':'No reviews yet. Travelers can share their experience after completing the tour.'}</p>:<>
 <div className={styles.summary}><Star size={32} fill="currentColor"/><strong>{Number(data.average).toFixed(1)}<small>/ 5</small></strong><p>{data.count} {vi?'đánh giá':'reviews'}</p></div>
 <div className={styles.grid}>{(all?data.reviews:data.reviews.slice(0,4)).map((review,i)=><article className={styles.card} key={review.reviewed_at+i}><header><span className={styles.avatar}>LL</span><div><b>{vi?'Khách LocalLens':'LocalLens traveler'}</b><time dateTime={review.reviewed_at}>{new Intl.DateTimeFormat(vi?'vi-VN':'en-GB',{dateStyle:'medium'}).format(new Date(review.reviewed_at))}</time></div><span className={styles.score}><Star size={13} fill="currentColor"/>{review.rating} / 5</span></header><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{review.review_text}</p></article>)}</div>
 {data.reviews.length>4&&<button className={styles.all} aria-expanded={all} onClick={()=>setAll(!all)}>{all?(vi?'Thu gọn':'Show fewer'):(vi?'Xem thêm đánh giá':'Show more reviews')}</button>}</>}
 </section>;
}
