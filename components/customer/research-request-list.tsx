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
  useEffect(()=>{
    let disposed=false;setRows(null);setFailed(false);setPage(0);
    if(!service.listCustomer){setFailed(true);return;}
    service.listCustomer().then(value=>{if(!disposed)setRows(value);}).catch(()=>{if(!disposed)setFailed(true);});
    return()=>{disposed=true;};
  },[service,retry]);
  const statuses=vi?{pending_review:'Chờ duyệt',changes_requested:'Cần điều chỉnh',approved:'Đã duyệt',rejected:'Đã từ chối'}:{pending_review:'Pending review',changes_requested:'Changes requested',approved:'Approved',rejected:'Rejected'};
  return <section id="personalized-requests" className={styles.section} aria-label={vi?'Yêu cầu tour cá nhân hóa':'Personalized tour requests'}>
    <h2>{vi?'Yêu cầu tour cá nhân hóa':'Personalized tour requests'}</h2>
    <p>{vi?'Yêu cầu gửi công ty xem xét, không phải xác nhận đặt tour hay thanh toán.':'Requests for review, not booking or payment confirmations.'}</p>
    {failed?<div role="alert"><p>{vi?'Chưa tải được yêu cầu. Vui lòng thử lại.':'Unable to load requests. Please retry.'}</p><button type="button" onClick={()=>setRetry(n=>n+1)}>{vi?'Thử lại':'Retry'}</button></div>:rows===null?<p role="status">{vi?'Đang tải yêu cầu…':'Loading requests…'}</p>:<>
      {!rows.length&&<p>{vi?'Bạn chưa có yêu cầu tour cá nhân hóa.':'No personalized tour requests yet.'}</p>}
      {rows.slice(page*5,page*5+5).map(row=><article key={row.id} className={styles.card}>
        <h3>{statuses[row.status]}</h3><p>{row.id}</p>
        <p>{vi?'Khởi hành':'Departure'}: {new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(row.request.startAt))} (UTC+07:00)</p>
        <p>{row.request.partySize} {vi?'khách':'guests'} · {new Intl.NumberFormat(locale).format(row.plan.totalVnd)} VND ({vi?'ước tính':'estimate'})</p>
        {row.notes&&<p>{row.notes}</p>}
        <details><summary>{vi?'Xem hành trình đã gửi':'View submitted itinerary'}</summary><ResearchItineraryTimeline locale={locale} plan={row.plan}/></details>
        {row.history.length>0&&<details><summary>{vi?'Lịch sử xử lý':'Processing history'}</summary><ul>{row.history.map((event,index)=><li key={index}>{statuses[event.status as keyof typeof statuses]??event.status}{event.note?` · ${event.note}`:''}</li>)}</ul></details>}
      </article>)}
      {rows.length>5&&<nav aria-label={vi?'Phân trang yêu cầu':'Request pagination'}><button type="button" disabled={page===0} onClick={()=>setPage(n=>n-1)}>{vi?'Trang trước':'Previous page'}</button><span>{page+1} / {Math.ceil(rows.length/5)}</span><button type="button" disabled={(page+1)*5>=rows.length} onClick={()=>setPage(n=>n+1)}>{vi?'Trang sau':'Next page'}</button></nav>}
    </>}
  </section>;
}
