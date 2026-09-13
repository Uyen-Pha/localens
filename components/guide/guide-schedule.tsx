'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown, Clock3, Users, Languages, MapPin, FileText, List, ImageOff } from 'lucide-react';
import type { GuideOwnAssignment } from '@/lib/application/guide-assignment/contracts';
import s from './guide-schedule.module.css';
import { presentGuideAssignment } from './guide-assignment-presentation';

type TourStatus = 'upcoming' | 'completed' | 'cancelled';
const zone = 'Asia/Ho_Chi_Minh';
export const guideDayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const monthKey = (date: Date) => guideDayKey(date).slice(0,7);
function shiftMonth(month:string, delta:number) {
  const [year,index] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year,index-1+delta,1));
  return date.toISOString().slice(0,7);
}
function statusOf(item:GuideOwnAssignment):TourStatus {
  return item.tourStatus ?? (item.assignmentStatus === 'completed' ? 'completed' : 'upcoming');
}

export function GuideSchedule({locale,items,loading,error,onRetry,getDetail}: {
  locale:'vi'|'en'; items:GuideOwnAssignment[]; loading:boolean; error:boolean; onRetry:()=>void;
  getDetail?:(id:string)=>Promise<GuideOwnAssignment>;
}) {
  const vi=locale==='vi';
  const t=(a:string,b:string)=>vi?a:b;
  const [month,setMonth]=useState(()=>monthKey(new Date()));
  const [filter,setFilter]=useState<TourStatus>('upcoming');
  const [picker,setPicker]=useState(false);
  const [draftMonth,setDraftMonth]=useState('');
  const [draftYear,setDraftYear]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const [detail,setDetail]=useState<GuideOwnAssignment|null>(null);
  const [detailState,setDetailState]=useState<'idle'|'loading'|'ready'|'error'>('idle');
  const request=useRef(0);
  const pickerButton=useRef<HTMLButtonElement>(null);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;};},[]);
  // A refreshed/failed schedule invalidates details that belonged to the previous response.
  useEffect(()=>{request.current++;setSelected(null);setDetail(null);setDetailState('idle');},[items,loading,error]);
  const [year,monthNumber]=month.split('-').map(Number);
  const label=vi?`Tháng ${monthNumber}, ${year}`:new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${month}-01T00:00:00Z`));
  const monthly=items.filter(item=>monthKey(new Date(item.startAt))===month).map(item=>presentGuideAssignment(item,locale));
  const visible=monthly.filter(item=>statusOf(item)===filter).sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt));
  const counts={upcoming:0,completed:0,cancelled:0};
  monthly.forEach(item=>counts[statusOf(item)]++);
  const statusLabel=(status:TourStatus)=>({upcoming:t('Sắp tới','Upcoming'),completed:t('Đã hoàn thành','Completed'),cancelled:t('Đã hủy','Cancelled')})[status];
  const time=(date:string)=>new Intl.DateTimeFormat(vi?'vi-VN':'en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(date));
  const dateLabel=(date:string)=>new Intl.DateTimeFormat(vi?'vi-VN':'en-GB',{timeZone:zone,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(date));
  const first=new Date(Date.UTC(year,monthNumber-1,1));
  const offset=(first.getUTCDay()+6)%7;
  const days=Array.from({length:42},(_,index)=>new Date(Date.UTC(year,monthNumber-1,index-offset+1)).toISOString().slice(0,10));
  function resetSelection() {request.current++;setSelected(null);setDetail(null);setDetailState('idle');}
  function changeMonth(value:string) {resetSelection();setMonth(value);setPicker(false);}
  async function select(item:GuideOwnAssignment) {
    const token=++request.current;
    setSelected(item.assignmentId);setDetail(null);setDetailState('loading');
    try {
      const result=getDetail?await getDetail(item.assignmentId):item;
      if(!alive.current||token!==request.current)return;
      if(result.assignmentId!==item.assignmentId)throw Error('Invalid detail response');
      setDetail(presentGuideAssignment(result,locale));setDetailState('ready');
    } catch {if(alive.current&&token===request.current)setDetailState('error');}
  }
  const active=visible.find(item=>item.assignmentId===selected);
  const shown=!loading&&!error&&active&&detailState==='ready'?detail:null;
  return <div className={s.layout}>
    <section className={s.card} aria-labelledby="guide-schedule-title">
      <div className={s.heading}><CalendarDays/><h2 id="guide-schedule-title">{t('Lịch phân công tour','Tour assignment calendar')}</h2></div>
      {items.some(item=>item.isDemo)&&<p className={s.demoNote}>{t('Có lịch phân công giả định dựa trên 3 tour cố định LocalLens · Tháng 8–10/2026','Includes illustrative assignments based on the 3 LocalLens fixed tours · Aug–Oct 2026')}</p>}
      <div className={s.filters} aria-label={t('Lọc trạng thái tour','Filter tour status')}>
        <strong>{t('Trạng thái tour:','Tour status:')}</strong>
        {(['upcoming','completed','cancelled'] as const).map(status=><button key={status} type="button" aria-pressed={status===filter} onClick={()=>{resetSelection();setFilter(status);}}>{statusLabel(status)}{' '}{!loading&&!error&&<span>{counts[status]}</span>}</button>)}
      </div>
      <div className={s.monthBar}>
        <button type="button" aria-label={t('Tháng trước','Previous month')} disabled={year<=1900&&monthNumber===1} onClick={()=>changeMonth(shiftMonth(month,-1))}><ChevronLeft/></button>
        <div className={s.monthControl}>
          <button ref={pickerButton} type="button" className={s.monthTitle} aria-label={t('Chọn tháng và năm','Choose month and year')} aria-expanded={picker} aria-controls="guide-month-picker" onClick={()=>{setDraftMonth(String(monthNumber));setDraftYear(String(year));setPicker(!picker);}}>{label}<ChevronDown size={16}/></button>
          {picker&&<form id="guide-month-picker" className={s.picker} onKeyDown={event=>{if(event.key==='Escape'){setPicker(false);pickerButton.current?.focus();}}} onSubmit={event=>{event.preventDefault();const chosenYear=Number(draftYear);if(!Number.isInteger(chosenYear)||chosenYear<1900||chosenYear>2100)return;changeMonth(`${chosenYear}-${draftMonth.padStart(2,'0')}`);pickerButton.current?.focus();}}>
            <label>{t('Tháng','Month')}<select autoFocus value={draftMonth} onChange={event=>setDraftMonth(event.target.value)}>{Array.from({length:12},(_,i)=><option value={i+1} key={i}>{t(`Tháng ${i+1}`,new Intl.DateTimeFormat('en',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,i,1))))}</option>)}</select></label>
            <label>{t('Năm','Year')}<input type="number" min="1900" max="2100" required value={draftYear} onChange={event=>setDraftYear(event.target.value)}/></label>
            <button type="submit">{t('Xem lịch','Show calendar')}</button><button type="button" onClick={()=>{setPicker(false);pickerButton.current?.focus();}}>{t('Đóng','Close')}</button>
          </form>}
        </div>
        <button type="button" aria-label={t('Tháng sau','Next month')} disabled={year>=2100&&monthNumber===12} onClick={()=>changeMonth(shiftMonth(month,1))}><ChevronRight/></button>
        <button className={s.today} type="button" onClick={()=>changeMonth(monthKey(new Date()))}>{t('Hôm nay','Today')}</button>
      </div>
      {loading?<p className={s.message} role="status">{t('Đang tải lịch phân công…','Loading assignments…')}</p>:error?<div className={s.message} role="alert"><p>{t('Không thể tải lịch phân công. Vui lòng thử lại sau','Unable to load assignments. Please try again later')}</p><button type="button" onClick={onRetry}>{t('Thử lại','Retry')}</button></div>:<>
        {items.length===0?<p role="status" className={s.message}>{t('Bạn chưa có tour nào được phân công','You have no assigned tours')}</p>:visible.length===0?<p role="status" className={s.empty}>{t('Không có tour phù hợp với trạng thái và thời gian đã chọn','No tours match the selected status and period')}</p>:null}
        <div className={s.calendar} role="table" aria-label={label}>
          <div className={s.week} role="row">{(vi?['Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ Nhật']:['Mon','Tue','Wed','Thu','Fri','Sat','Sun']).map(day=><div role="columnheader" key={day}>{day}</div>)}</div>
          {Array.from({length:6},(_,week)=><div role="row" className={s.week} key={week}>{days.slice(week*7,week*7+7).map(day=><div role="cell" key={day} className={`${s.day} ${day.slice(0,7)!==month?s.outside:''} ${active&&guideDayKey(new Date(active.startAt))===day?s.selectedDay:''}`}><span className={day===guideDayKey(new Date())?s.currentDay:s.dayNumber}>{Number(day.slice(8))}</span>{day.slice(0,7)===month&&visible.filter(item=>guideDayKey(new Date(item.startAt))===day).map(item=><button type="button" key={item.assignmentId} className={`${s.event} ${s[filter]}`} aria-pressed={selected===item.assignmentId} aria-label={`${time(item.startAt)} ${item.title}`} onClick={()=>void select(item)}><span className={s.dot}/><span><time>{time(item.startAt)}</time><span>{item.title}</span></span></button>)}</div>)}</div>)}
        </div>
      </>}
    </section>
    <aside className={`${s.card} ${s.detail}`} aria-labelledby="guide-detail-title" aria-busy={detailState==='loading'}>
      <div className={s.heading}><CalendarDays/><h2 id="guide-detail-title">{t('Chi tiết tour','Tour details')}</h2></div>
      {!active||loading||error?<div className={s.detailEmpty}><CalendarDays/><p>{t('Chọn một tour trên lịch để xem thông tin chi tiết','Select a tour on the calendar to view its details')}</p></div>:detailState==='loading'?<p role="status">{t('Đang tải thông tin tour…','Loading tour details…')}</p>:detailState==='error'?<div role="alert"><p>{t('Không thể tải thông tin tour. Vui lòng thử lại sau','Unable to load tour details. Please try again later')}</p><button type="button" onClick={()=>void select(active)}>{t('Thử lại chi tiết','Retry details')}</button></div>:shown&&<article className={s.detailBody}>
        <div className={s.coverRow}>{shown.imageUrl?<img src={shown.imageUrl} alt="" className={s.cover}/>:<div className={s.noCover}><ImageOff/><span>{t('Chưa có ảnh tour','Tour image unavailable')}</span></div>}<span className={`${s.badge} ${s[statusOf(shown)]}`}>{statusLabel(statusOf(shown))}</span></div>
        {shown.isDemo&&<p className={s.demoTag}>{t('Phân công giả định','Illustrative assignment')}</p>}<h3>{shown.title}</h3><p className={s.location}><MapPin size={17}/>{shown.meetingPoint}</p>
        <dl className={s.facts}>
          <div><dt><CalendarDays/>{t('Ngày khởi hành','Departure date')}</dt><dd>{dateLabel(shown.startAt)}</dd></div>
          <div><dt><Clock3/>{t('Thời gian','Time')}</dt><dd>{time(shown.startAt)}{shown.endAt?` – ${time(shown.endAt)} (${Number(((Date.parse(shown.endAt)-Date.parse(shown.startAt))/3600000).toFixed(1))} ${t('giờ','hours')})`:t(' · Chưa có giờ kết thúc',' · End time unavailable')}</dd></div>
          <div><dt><Users/>{t('Số khách','Guests')}</dt><dd>{shown.partySize} {t('khách','guests')}</dd></div>
          <div><dt><Languages/>{t('Ngôn ngữ','Language')}</dt><dd>{shown.language==='vi'?t('Tiếng Việt','Vietnamese'):t('Tiếng Anh','English')}</dd></div>
          <div><dt><MapPin/>{t('Điểm đón','Meeting point')}</dt><dd>{shown.meetingPoint}</dd></div>
          <div><dt><FileText/>{t('Yêu cầu đặc biệt','Special requirements')}</dt><dd>{[...shown.dietaryFlags,...shown.mobilityFlags].map(flag=>flag==='halal'?'Halal':flag==='vegetarian'?t('Ăn chay','Vegetarian'):t('Lối đi không bậc','Step-free access')).join(', ')||t('Không có yêu cầu đặc biệt','No special requirements')}</dd></div>
        </dl>
        <div className={s.itinerary}><h4><List/>{t('Lịch trình tóm tắt','Itinerary summary')}</h4>{shown.itinerary?.length?<ol>{shown.itinerary.map((stop,index)=><li key={index}>{stop.time&&<time>{stop.time}</time>}<span>{stop.title}</span></li>)}</ol>:<p>{t('Chưa có lịch trình tóm tắt. Vui lòng liên hệ điều phối viên.','Itinerary unavailable. Please contact your coordinator.')}</p>}</div>
      </article>}
    </aside>
  </div>;
}
