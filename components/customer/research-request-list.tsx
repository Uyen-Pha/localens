"use client";

import { useEffect, useState } from 'react';
import type { ResearchRequestPort, ResearchRequestSummary } from '@/lib/infrastructure/supabase/research-request-adapter';
import { ResearchItineraryTimeline } from './research-itinerary-timeline';
import styles from './research-request-list.module.css';

export function ResearchRequestList({locale,service}:{locale:'vi'|'en';service:ResearchRequestPort}) {
  const vi=locale==='vi';
  const [rows,setRows]=useState<ResearchRequestSummary[]|null>(null);
  const [failed,setFailed]=useState(false);
  const [retry,setRetry]=useState(0);
  const [page,setPage]=useState(0);
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('all');
  const [sort,setSort]=useState('newest');
  useEffect(()=>{
    let disposed=false;setRows(null);setFailed(false);setPage(0);
    if(!service.listCustomer){setFailed(true);return;}
    service.listCustomer().then(value=>{if(!disposed)setRows(value);}).catch(()=>{if(!disposed)setFailed(true);});
    return()=>{disposed=true;};
  },[service,retry]);
  const statuses=vi?{pending_review:'Chờ duyệt',changes_requested:'Cần điều chỉnh',approved:'Đã duyệt',rejected:'Đã từ chối'}:{pending_review:'Pending review',changes_requested:'Changes requested',approved:'Approved',rejected:'Rejected'};
  const normalize=(text:string)=>text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
  const visible=(rows??[]).filter(row=>(filter==='all'||row.status===filter)&&normalize(`${row.id} ${row.plan.stops.map(stop=>stop.name).join(' ')}`).includes(normalize(query.trim()))).sort((a,b)=>(Date.parse(a.createdAt)-Date.parse(b.createdAt))*(sort==='newest'?-1:1));
  const currentPage=Math.min(page,Math.max(0,Math.ceil(visible.length/5)-1));
  const date=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(value));
  return <section id="personalized-requests" className={styles.section} aria-label={vi?'Yêu cầu tour cá nhân hóa':'Personalized tour requests'}>
    <h2>{vi?'Yêu cầu tour cá nhân hóa':'Personalized tour requests'}</h2>
    <p>{vi?'Yêu cầu gửi công ty xem xét, không phải xác nhận đặt tour hay thanh toán.':'Requests for review, not booking or payment confirmations.'}</p>
    <div className={styles.toolbar}>
      <input type="search" aria-label={vi?'Tìm yêu cầu':'Search requests'} placeholder={vi?'Mã yêu cầu, điểm đến…':'Request ID, destination…'} value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/>
      <select aria-label={vi?'Trạng thái yêu cầu':'Request status'} value={filter} onChange={event=>{setFilter(event.target.value);setPage(0);}}><option value="all">{vi?'Tất cả trạng thái':'All statuses'}</option>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
      <select aria-label={vi?'Sắp xếp yêu cầu':'Sort requests'} value={sort} onChange={event=>{setSort(event.target.value);setPage(0);}}><option value="newest">{vi?'Mới nhất':'Newest first'}</option><option value="oldest">{vi?'Cũ nhất':'Oldest first'}</option></select>
      <button type="button" aria-label={vi?'Làm mới yêu cầu':'Refresh requests'} disabled={rows===null&&!failed} onClick={()=>setRetry(n=>n+1)}>{vi?'Làm mới':'Refresh'}</button>
    </div>
    {failed?<div role="alert"><p>{vi?'Chưa tải được yêu cầu. Vui lòng thử lại.':'Unable to load requests. Please retry.'}</p><button type="button" onClick={()=>setRetry(n=>n+1)}>{vi?'Thử lại':'Retry'}</button></div>:rows===null?<p role="status">{vi?'Đang tải yêu cầu…':'Loading requests…'}</p>:<>
      {!rows.length&&<p>{vi?'Bạn chưa có yêu cầu tour cá nhân hóa.':'No personalized tour requests yet.'}</p>}
      {!!rows.length&&!visible.length&&<p role="status">{vi?'Không có yêu cầu phù hợp. Hãy thử từ khóa hoặc trạng thái khác.':'No matching requests. Try another search or status.'}</p>}
      {!!visible.length&&<div className={styles.columns} aria-hidden="true"><span>{vi?'Mã yêu cầu / Hành trình':'Request / Itinerary'}</span><span>{vi?'Thông tin chuyến đi':'Trip information'}</span><span>{vi?'Trạng thái':'Status'}</span></div>}
      {visible.slice(currentPage*5,currentPage*5+5).map(row=><article key={row.id} className={styles.card}>
        <div className={styles.overview}>
          <div><p className={styles.code}>{row.id}</p><h3>{row.plan.stops.map(stop=>stop.name).join(' → ')}</h3><small>{vi?'Ngày tạo: ':'Created: '}{date(row.createdAt)}</small></div>
          <div><p>{vi?'Khởi hành':'Departure'}: {date(row.request.startAt)} (UTC+07:00)</p><p>{row.request.partySize} {vi?'khách':'guests'} · {new Intl.NumberFormat(locale).format(row.plan.totalVnd)} VND ({vi?'ước tính':'estimate'})</p></div>
          <div><span className={styles.badge}>{statuses[row.status]}</span></div>
        </div>
        {row.notes&&<p>{row.notes}</p>}
        <details><summary>{vi?'Xem hành trình đã gửi':'View submitted itinerary'}</summary><ResearchItineraryTimeline locale={locale} plan={row.plan}/></details>
        {row.history.length>0&&<details><summary>{vi?'Lịch sử xử lý':'Processing history'}</summary><ul>{row.history.map((event,index)=><li key={index}>{statuses[event.status as keyof typeof statuses]??event.status}{event.note?` · ${event.note}`:''}</li>)}</ul></details>}
      </article>)}
      {visible.length>5&&<nav aria-label={vi?'Phân trang yêu cầu':'Request pagination'}><button type="button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>{vi?'Trang trước':'Previous page'}</button><span aria-live="polite">{currentPage+1} / {Math.ceil(visible.length/5)}</span><button type="button" disabled={(currentPage+1)*5>=visible.length} onClick={()=>setPage(currentPage+1)}>{vi?'Trang sau':'Next page'}</button></nav>}
    </>}
  </section>;
}
