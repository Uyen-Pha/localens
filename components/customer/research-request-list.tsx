"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ResearchRequestPort, ResearchRequestSummary } from '@/lib/infrastructure/supabase/research-request-adapter';
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
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
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
    <h2>{vi?'Yêu cầu tour cá nhân hóa & báo giá':'Personalized requests & quotes'}</h2>
    <p>{vi?'Lịch trình sử dụng dữ liệu mô phỏng. Chi phí đề xuất chưa phải báo giá chính thức.':'Itineraries use simulation data. Estimates are not final quotes.'}</p>
    <div className={styles.toolbar}>
      <input type="search" aria-label={vi?'Tìm yêu cầu':'Search requests'} placeholder={vi?'Mã yêu cầu, điểm đến…':'Request ID, destination…'} value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/>
      <select aria-label={vi?'Trạng thái yêu cầu':'Request status'} value={filter} onChange={event=>{setFilter(event.target.value);setPage(0);}}><option value="all">{vi?'Tất cả trạng thái':'All statuses'}</option>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
      <select aria-label={vi?'Sắp xếp yêu cầu':'Sort requests'} value={sort} onChange={event=>{setSort(event.target.value);setPage(0);}}><option value="newest">{vi?'Mới nhất':'Newest first'}</option><option value="oldest">{vi?'Cũ nhất':'Oldest first'}</option></select>
      <button type="button" aria-label={vi?'Làm mới yêu cầu':'Refresh requests'} disabled={rows===null&&!failed} onClick={()=>setRetry(n=>n+1)}>{vi?'Làm mới':'Refresh'}</button>
    </div>
    {failed?<div role="alert"><p>{vi?'Chưa tải được yêu cầu. Vui lòng thử lại.':'Unable to load requests. Please retry.'}</p><button type="button" onClick={()=>setRetry(n=>n+1)}>{vi?'Thử lại':'Retry'}</button></div>:rows===null?<p role="status">{vi?'Đang tải yêu cầu…':'Loading requests…'}</p>:<>
      {!rows.length&&<p>{vi?'Bạn chưa có yêu cầu tour cá nhân hóa.':'No personalized tour requests yet.'}</p>}
      {!!rows.length&&!visible.length&&<p role="status">{vi?'Không có yêu cầu phù hợp. Hãy thử từ khóa hoặc trạng thái khác.':'No matching requests. Try another search or status.'}</p>}
      {!!visible.length&&<table className={styles.table}><thead><tr><th>{vi?'Mã yêu cầu':'Request ID'}</th><th>{vi?'Hành trình':'Itinerary'}</th><th>{vi?'Lần gửi gần nhất / Hạn xử lý':'Last submitted / Processing deadline'}</th><th>{vi?'Trạng thái':'Status'}</th><th><span className={styles.srOnly}>{vi?'Thao tác':'Actions'}</span></th></tr></thead><tbody>
      {visible.slice(currentPage*5,currentPage*5+5).map(row=>{
        const quote=row.status==='approved'?(row.quotes??[]).find(q=>q.status==='accepted'||q.status!=='expired'&&Date.parse(q.expiresAt)>now&&Date.parse(row.request.startAt)>now):undefined;
        const detailPath=`/${locale}/personalized-request/?request=${encodeURIComponent(row.id)}`;
        return <tr key={row.id}>
          <td className={styles.code} data-label={vi?'Mã yêu cầu':'Request ID'}><span title={row.id}>{row.id.length>20?row.id.slice(0,8):row.id}</span></td>
          <td data-label={vi?'Hành trình':'Itinerary'}>{row.plan.stops.map(stop=>stop.name).join(' → ')}</td>
          <td data-label={vi?'Lần gửi / Hạn xử lý':'Submitted / Deadline'}>{date(row.submittedAt??row.createdAt)}{row.processingCompletedAt?<small>{vi?'Đã trả kết quả: ':'Processed: '}{date(row.processingCompletedAt)}</small>:row.processingDueAt&&<small className={Date.parse(row.processingDueAt)<=now?styles.warning:undefined}>{vi?'Hạn xử lý: ':'Due: '}{date(row.processingDueAt)}</small>}</td>
          <td data-label={vi?'Trạng thái':'Status'}><span className={styles.badge}>{statuses[row.status]}</span>{quote&&<small>{quote.status==='checkout_pending'?(vi?'Đơn chờ thanh toán':'Awaiting payment'):quote.status==='accepted'?(vi?'Xem trạng thái thanh toán':'View payment status'):(vi?'Báo giá đã phát hành':'Quote issued')}</small>}{Date.parse(row.request.startAt)<=now&&<small className={styles.warning}>{vi?'Ngày khởi hành đã qua':'Departure has passed'}</small>}</td>
          <td><div className={styles.rowActions}>{quote&&<Link href={quote.status==='active'?`${detailPath}&quote=${encodeURIComponent(quote.id)}`:`/${locale}/personalized-payment/?request=${encodeURIComponent(row.id)}&quote=${encodeURIComponent(quote.id)}`}>{quote.status==='active'?(vi?'Xem báo giá':'View quote'):quote.status==='checkout_pending'?(vi?'Thanh toán':'Pay now'):(vi?'Xem kết quả':'View result')}</Link>}<Link href={detailPath}>{vi?'Xem chi tiết':'View details'}</Link></div></td>
        </tr>;
      })}</tbody></table>}
      {visible.length>5&&<nav aria-label={vi?'Phân trang yêu cầu':'Request pagination'}><button type="button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>{vi?'Trang trước':'Previous page'}</button><span aria-live="polite">{currentPage+1} / {Math.ceil(visible.length/5)}</span><button type="button" disabled={(currentPage+1)*5>=visible.length} onClick={()=>setPage(currentPage+1)}>{vi?'Trang sau':'Next page'}</button></nav>}
    </>}
  </section>;
}
