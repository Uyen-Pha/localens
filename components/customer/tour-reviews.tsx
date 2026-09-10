'use client';
import { useState } from 'react';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Locale } from '@/lib/i18n/config';
import styles from './tour-reviews.module.css';

// Presentation fixtures only. Never mixed into persisted customer reviews.
const samples = [
  { name: 'Alex M.', initials: 'AM', score: 5, date: '2026-08-22', vi: 'Lịch trình dễ theo dõi, các điểm dừng được sắp xếp hợp lý. Tôi thích có thời gian tìm hiểu câu chuyện địa phương và chụp ảnh.', en: 'The itinerary was easy to follow and the stops were well paced. I enjoyed having time for local stories and photographs.' },
  { name: 'Linh N.', initials: 'LN', score: 5, date: '2026-08-18', vi: 'Một cách thú vị để khám phá Sài Gòn. Phần giới thiệu giúp tôi hiểu thêm về những địa điểm vốn chỉ từng đi ngang qua.', en: 'An enjoyable way to explore Saigon. The introduction helped me learn more about places I had only passed by before.' },
  { name: 'Jamie K.', initials: 'JK', score: 4, date: '2026-08-12', vi: 'Trải nghiệm đa dạng và có những khoảng nghỉ phù hợp. Tôi mong có thêm một chút thời gian tự do ở điểm dừng cuối.', en: 'A varied experience with useful breaks along the way. I would have liked a little more free time at the final stop.' },
  { name: 'Minh T.', initials: 'MT', score: 5, date: '2026-08-06', vi: 'Thông tin trước chuyến đi rõ ràng. Lịch trình vừa có khám phá vừa có thời gian trò chuyện, phù hợp cho một ngày trải nghiệm thành phố.', en: 'The information before the trip was clear. The itinerary balanced exploring with time to chat, making for an enjoyable day in the city.' },
];
const score = (samples.reduce((sum, review) => sum + review.score, 0) / samples.length).toFixed(1);
export function TourRating({ locale }: {locale: Locale}) {
  return <div className={styles.rating}><Star size={16} fill="currentColor" aria-hidden="true"/><strong>{score}</strong><span>({samples.length} {locale === 'vi' ? 'đánh giá mẫu' : 'sample reviews'})</span></div>;
}
export function TourReviews({ locale }: {locale: Locale}) {
  const [page, setPage] = useState(0);
  const [all, setAll] = useState(false);
  const vi = locale === 'vi';
  const shown = all ? samples : samples.slice(page * 2, page * 2 + 2);
  return <section className={styles.section} aria-labelledby="tour-reviews-heading">
    <div className={styles.heading}><h2 id="tour-reviews-heading">{vi ? 'Đánh giá' : 'Reviews'}</h2></div>
    <p className={styles.note}>{vi ? 'Đánh giá mẫu, chưa phải phản hồi khách hàng.' : 'Sample reviews, not customer feedback.'}</p>
    <div className={styles.summary}><Star size={32} fill="currentColor" aria-hidden="true"/><strong>{score}<small>/ 5</small></strong><div><b>{vi ? 'Rất hài lòng' : 'Excellent'}</b><p>{samples.length} {vi ? 'đánh giá' : 'reviews'}</p></div></div>
    <div className={styles.grid}>{shown.map(review => <article className={styles.card} key={review.name}>
      <header><span className={styles.avatar} aria-hidden="true">{review.initials}</span><div><b>{review.name}</b><time dateTime={review.date}>{new Intl.DateTimeFormat(vi ? 'vi-VN' : 'en-US',{dateStyle:'medium'}).format(new Date(review.date+'T12:00:00Z'))}</time></div><span className={styles.score}><Star size={13} fill="currentColor" aria-hidden="true"/>{review.score.toFixed(1)}</span></header>
      <p>{review[locale]}</p>
    </article>)}</div>
    {!all && <div className={styles.pagination}><button disabled={page === 0} onClick={()=>setPage(0)} aria-label={vi ? 'Đánh giá trước' : 'Previous reviews'}><ChevronLeft size={18}/></button><span>{page+1} / 2</span><button disabled={page === 1} onClick={()=>setPage(1)} aria-label={vi ? 'Đánh giá tiếp theo' : 'Next reviews'}><ChevronRight size={18}/></button></div>}
    <button className={styles.all} aria-expanded={all} onClick={()=>{setAll(!all);setPage(0);}}>{all ? (vi ? 'Thu gọn đánh giá' : 'Show fewer reviews') : (vi ? 'Xem tất cả đánh giá' : 'View all reviews')}</button>
  </section>;
}
