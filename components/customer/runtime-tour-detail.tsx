"use client";

import Image from 'next/image';
import Link from 'next/link';
import {useState} from 'react';
import type {PublishedTour, LiveDepartureAvailability} from '@/lib/domain/data/contracts';
import type {Locale} from '@/lib/i18n/config';
import {tourIllustration} from '@/lib/domain/data/tour-illustrations';
import {formatTourDuration} from '@/lib/application/fixed-tour/additions';

export function RuntimeTourDetail({tour, availability, locale}: {tour:PublishedTour; availability:LiveDepartureAvailability[]; locale:Locale}) {
  const vi=locale==='vi';
  const picture=tourIllustration(tour.slug);
  const departures=availability.filter(d=>d.tourVersionId===tour.versionId && d.status==='scheduled' && d.remainingCapacity>0 && Date.parse(d.startAt)>Date.now()).sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt));
  const dayOf=(startAt:string)=>new Date(Date.parse(startAt)+7*3600000).toISOString().slice(0,10);
  const [chosenDay,setChosenDay]=useState('');
  const day=chosenDay || (departures[0]?dayOf(departures[0].startAt):'');
  const selectedDepartures=departures.filter(d=>dayOf(d.startAt)===day);
  const price=new Intl.NumberFormat(vi?'vi-VN':'en-US',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(Number(tour.priceVndMinor));
  return <article className="tour-detail">
    <Link href={`/${locale}/tours/`}>{vi?'← Danh sách tour':'← All tours'}</Link>
    <header className="tour-detail__header"><p className="runtime-catalog__eyebrow">LocalLens · {vi?'Tour cố định':'Fixed tour'}</p><h1>{tour.title}</h1><p>{tour.summary}</p></header>
    <Image className="tour-detail__hero" src={picture.src} alt={picture[locale]} width={1200} height={650} priority />
    <div className="tour-detail__layout"><div className="tour-detail__content">
      <section><h2>{vi?'Thông tin chuyến đi':'Trip information'}</h2><dl><dt>{vi?'Thời lượng':'Duration'}</dt><dd>{formatTourDuration(tour.durationMinutes,locale)}</dd><dt>{vi?'Điểm hẹn':'Meeting point'}</dt><dd>{tour.meetingPoint}</dd></dl></section>
      <section><h2>{vi?'Hành trình':'Itinerary'}</h2><ol className="tour-detail__stops">{[...tour.stops].sort((a,b)=>a.position-b.position).map(stop=><li key={stop.position}>{stop.title}</li>)}</ol></section>
      <section><h2>{vi?'Bao gồm':'Included'}</h2><ul>{tour.inclusions.map((item,i)=><li key={i}>{item}</li>)}</ul><h2>{vi?'Không bao gồm':'Excluded'}</h2><ul>{tour.exclusions.map((item,i)=><li key={i}>{item}</li>)}</ul></section>
      <section><h2>{vi?'Điều kiện hủy':'Cancellation policy'}</h2><p>{tour.cancellationPolicy}</p></section>
    </div><aside className="tour-detail__booking" id="departures" aria-label={vi?'Lịch khởi hành':'Departures'}>
      <p className="runtime-tour__price">{price} <span>{vi?'/ khách':'/ person'}</span></p>
      <h2>{vi?'Chọn lịch khởi hành':'Choose a departure'}</h2>
      <p>{vi?'Ngày và giờ theo múi giờ TP.HCM (UTC+7). Số chỗ được kiểm tra lại khi đặt tour.':'Dates use HCMC time (UTC+7). Availability is checked again when booking.'}</p>
      {departures.length>0 && <label className="tour-detail__date">{vi?'Ngày khởi hành':'Departure date'}<input type="date" value={day} min={dayOf(departures[0].startAt)} max={dayOf(departures[departures.length-1].startAt)} onChange={event=>setChosenDay(event.target.value)}/></label>}
      {selectedDepartures.length===0?<p role="status">{vi?'Chưa có lịch khởi hành khả dụng.':'No available departure scheduled.'}</p>:selectedDepartures.map(d=><div className="runtime-tour__departure" key={d.id}><div><p>{new Intl.DateTimeFormat(vi?'vi-VN':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(d.startAt))}</p><p className="runtime-tour__seats">{vi?`Còn ${d.remainingCapacity} chỗ`:`${d.remainingCapacity} seats left`}</p></div><Link className="runtime-tour__book" href={`/${locale}/booking/?departure=${encodeURIComponent(d.id)}&partySize=1`}>{vi?'Đặt tour':'Book tour'}</Link></div>)}
    </aside></div>
  </article>;
}
