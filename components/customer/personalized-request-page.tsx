'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {getCountries} from 'libphonenumber-js';
import type {Locale} from '@/lib/i18n/config';
import {loadPortalSurfaceComposition} from '@/components/portals/portal-session';
import type {ResearchRequestPort,ResearchRequestSummary,ResearchQuote,ResearchBooking,PersonalizedCheckout} from '@/lib/infrastructure/supabase/research-request-adapter';
import {ResearchItineraryTimeline} from './research-itinerary-timeline';
import styles from './personalized-request-page.module.css';

type Loaded={port:ResearchRequestPort;request:ResearchRequestSummary;quote?:ResearchQuote};
export function PersonalizedRequestPage(props:{locale:Locale;payment?:boolean}){
 const params=useSearchParams(),requestId=params.get('request'),quoteId=params.get('quote');
 return <RequestContent key={`${props.locale}:${props.payment}:${requestId}:${quoteId}`} {...props} requestId={requestId} quoteId={quoteId}/>;
}
function RequestContent({locale,payment=false,requestId,quoteId}:{locale:Locale;payment?:boolean;requestId:string|null;quoteId:string|null}){
 const vi=locale==='vi',router=useRouter();
 const [data,setData]=useState<Loaded|null>(null),[booking,setBooking]=useState<ResearchBooking|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[now,setNow]=useState(Date.now());
 const [review,setReview]=useState<PersonalizedCheckout|null>(null),[outcome,setOutcome]=useState<'success'|'declined'>('success');
 const [draft,setDraft]=useState<PersonalizedCheckout|null>(null);
 const lock=useRef(false);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{
  let alive=true;
  setLoading(true);setError('');setData(null);setBooking(null);setReview(null);setUncertain(false);
  void (async()=>{
   try{
    const id=requestId;
    if(!id||payment&&!quoteId)throw Error('MISSING');
    const shell=await loadPortalSurfaceComposition();await shell.initialized;
    const identity=await shell.session.getSession();
    if(!alive)return;
    if(!identity){router.replace(`/${locale}/sign-in/?returnTo=${encodeURIComponent(window.location.pathname+window.location.search)}`);return;}
    if(identity.role!=='customer'){router.replace(`/${locale}/${identity.role}/`);return;}
    if(shell.mode!=='supabase'||!shell.researchRequests?.listCustomer)throw Error('UNAVAILABLE');
    const port=shell.researchRequests,rows=await port.listCustomer!(),request=rows.find(row=>row.id===id);
    if(!request)throw Error('NOT_FOUND');
    const quote=(request.quotes??[]).find(q=>q.id===quoteId);
    if(payment&&!quote)throw Error('NOT_FOUND');
    let saved:ResearchBooking|null=null;
    if(payment&&quote){if(!port.booking||!port.checkout)throw Error('UNAVAILABLE');saved=await port.booking(quote.id,false);}
    if(alive){setData({port,request,quote});setBooking(saved);}
   }catch{if(alive)setError(vi?'Không thể tải yêu cầu, báo giá hoặc trạng thái đơn. Vui lòng thử lại.':'Unable to load the request, quote or booking. Please retry.');}
   finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false;};
 },[locale,payment,reload,router,vi,requestId,quoteId]);
 const date=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(value));
 const money=(q:ResearchQuote)=>new Intl.NumberFormat(locale,{style:'currency',currency:q.currency}).format(q.amount);
 const quote=data?.quote;
 const unavailable=!data||!quote||data.request.status!=='approved'||quote.status==='expired'||Date.parse(quote.expiresAt)<=now||Date.parse(data.request.request.startAt)<=now||booking?.status==='expired'||!!booking&&Date.parse(booking.expires_at)<=now;
 const labels=vi?{pending_review:'Chờ duyệt',changes_requested:'Cần điều chỉnh',approved:'Đã duyệt',rejected:'Đã từ chối'}:{pending_review:'Pending review',changes_requested:'Changes requested',approved:'Approved',rejected:'Rejected'};
 async function create(){
  if(!data||!quote||!data.port.booking||unavailable||uncertain||lock.current)return;
  lock.current=true;setBusy(true);setError('');
  try{const saved=await data.port.booking(quote.id,true);if(!saved)throw Error('MISSING');setBooking(saved);}
  catch{setUncertain(true);setError(vi?'Chưa thể xác nhận tạo đơn. Hãy làm mới để kiểm tra trước khi thử lại.':'Unable to confirm booking creation. Refresh before retrying.');}
  finally{lock.current=false;setBusy(false);}
 }
 async function pay(){
  if(!data||!quote||!review||!data.port.checkout||unavailable||uncertain||booking?.status!=='pending_payment'||lock.current)return;
  lock.current=true;setBusy(true);setError('');
  try{const saved=await data.port.checkout(quote.id,{...review,outcome});setBooking(saved);setReview(null);if(saved.payment_status==='failed')setError(vi?'Thanh toán mô phỏng bị từ chối. Bạn có thể thử lại khi đơn còn hiệu lực.':'Simulated payment declined. Retry while the booking is valid.');}
  catch{setUncertain(true);setError(vi?'Chưa xác định được kết quả thanh toán. Hãy làm mới để kiểm tra đơn trước khi thử lại.':'Payment result is uncertain. Refresh the booking before retrying.');}
  finally{lock.current=false;setBusy(false);}
 }
 const countryNames=new Intl.DisplayNames([locale],{type:'region'});
 return <div className={styles.page}>
  <Link className={styles.back} href={`/${locale}/bookings/`}>← {vi?'Quay lại đơn đặt tour':'Back to bookings'}</Link>
  <h1>{payment?(vi?'Thanh toán tour cá nhân hóa':'Personalized tour payment'):(vi?'Chi tiết yêu cầu & báo giá':'Request details & quotes')}</h1>
  <button className={styles.refresh} disabled={busy||loading} onClick={()=>setReload(n=>n+1)}>{vi?'Làm mới':'Refresh'}</button>
  {loading&&<p role="status">{vi?'Đang tải thông tin…':'Loading…'}</p>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {!loading&&data&&<div className={styles.layout}>
   <section className={styles.card}>
    {!payment?<><h2>{vi?'Hành trình đã gửi':'Submitted itinerary'}</h2><p>{vi?'Mã yêu cầu: ':'Request ID: '}{data.request.id}</p><p>{labels[data.request.status]}</p><p>{date(data.request.request.startAt)} · {data.request.request.partySize} {vi?'khách':'travelers'}</p><ResearchItineraryTimeline locale={locale} plan={data.request.plan}/>{data.request.notes&&<p>{data.request.notes}</p>}<h2>{vi?'Lịch sử xử lý':'Processing history'}</h2>{data.request.history.map((event,i)=><p key={i}>{date(event.at)} · {labels[event.status as keyof typeof labels]??event.status}{event.note?` · ${event.note}`:''}</p>)}</>:<>
      <p>{vi?'Thanh toán theo hạn báo giá; không áp dụng giữ chỗ 15 phút của tour cố định.':'Payment follows the quote deadline; the fixed-tour 15-minute hold does not apply.'}</p>
      {booking&&<p>{vi?'Mã đơn: ':'Booking ID: '}{booking.id}</p>}
      {booking?.status==='confirmed'?<div role="status"><h2>{vi?'Đã xác nhận đơn đặt tour':'Booking confirmed'}</h2><p>{vi?'Đã thanh toán mô phỏng — không thu tiền thật.':'Simulated payment recorded — no real charge.'}</p></div>:unavailable?<p role="status">{vi?'Đơn, báo giá hoặc ngày khởi hành không còn đủ điều kiện thanh toán.':'The booking, quote or departure is no longer eligible for payment.'}</p>:uncertain?null:!booking?<><h2>{vi?'Xác nhận đặt tour cá nhân hóa':'Confirm personalized booking'}</h2><p>{vi?'Xác nhận sẽ tạo đơn chờ thanh toán. Chưa ghi nhận thanh toán ở bước này.':'Confirmation creates a booking awaiting payment. No payment is recorded yet.'}</p><button disabled={busy} onClick={()=>void create()}>{vi?'Xác nhận đặt tour':'Confirm booking'}</button></>:review?<section><h2>{vi?'Kiểm tra thông tin thanh toán':'Review payment details'}</h2>{review.travelers.map((t,i)=><p key={i}>{t.name} · {countryNames.of(t.country)} · {t.phone} · {t.email}</p>)}<label>{vi?'Kịch bản thanh toán mô phỏng':'Simulated payment scenario'}<select disabled={busy} value={outcome} onChange={event=>setOutcome(event.target.value as 'success'|'declined')}><option value="success">{vi?'Thành công':'Success'}</option><option value="declined">{vi?'Bị từ chối':'Declined'}</option></select></label><button disabled={busy} onClick={()=>void pay()}>{busy?(vi?'Đang ghi nhận…':'Recording…'):(vi?'Xác nhận thanh toán mô phỏng':'Confirm simulated payment')}</button><button disabled={busy} onClick={()=>setReview(null)}>{vi?'Sửa thông tin':'Edit details'}</button></section>:<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);const next:PersonalizedCheckout={outcome:'success',travelers:Array.from({length:booking.party_size},(_,i)=>({name:String(form.get(`name-${i}`)).trim(),country:String(form.get(`country-${i}`)),phone:String(form.get(`phone-${i}`)).trim(),email:String(form.get(`email-${i}`)).trim()}))};setDraft(next);setReview(next);}}>
       <h2>{vi?'Thông tin hành khách':'Traveler details'}</h2><p>{vi?'Thanh toán mô phỏng, không thu tiền thật. Nhập số điện thoại có mã quốc gia, ví dụ +84912345678.':'Simulated payment, no real charge. Use an international phone number, e.g. +84912345678.'}</p>
       {Array.from({length:booking.party_size},(_,i)=><fieldset key={i} disabled={busy}><legend>{vi?`Khách ${i+1}${i===0?' · Người liên hệ':''}`:`Traveler ${i+1}`}</legend><label>{vi?'Họ và tên':'Full name'}<input name={`name-${i}`} defaultValue={draft?.travelers[i]?.name??''} required maxLength={80}/></label><label>{vi?'Quốc gia/khu vực':'Country/region'}<select name={`country-${i}`} defaultValue={draft?.travelers[i]?.country??(vi?'VN':'US')}>{getCountries().map(code=><option key={code} value={code}>{countryNames.of(code)}</option>)}</select></label><label>{vi?'Số điện thoại':'Phone number'}<input name={`phone-${i}`} defaultValue={draft?.travelers[i]?.phone??''} type="tel" required pattern="\+[0-9]{7,15}" placeholder="+84912345678"/></label><label>Email<input name={`email-${i}`} defaultValue={draft?.travelers[i]?.email??''} type="email" required maxLength={254}/></label></fieldset>)}<button disabled={busy} type="submit">{vi?'Tiếp tục thanh toán':'Continue to payment'}</button>
      </form>}
    </>}
   </section>
   <aside className={styles.card} aria-label={vi?'Báo giá':'Quotes'}><h2>{vi?'Báo giá của yêu cầu':'Request quotes'}</h2>{!(data.request.quotes??[]).length&&<p>{vi?'Chưa có báo giá.':'No quote yet.'}</p>}{(payment?(quote?[quote]:[]):data.request.quotes??[]).map(q=><section className={styles.quote} key={q.id}><h3>{q.title}</h3><strong>{money(q)}</strong><p className={styles.conditions}>{q.conditions}</p><p>{vi?'Khởi hành: ':'Departure: '}{date(data.request.request.startAt)}</p><p>{data.request.request.partySize} {vi?'khách':'travelers'}</p><p>{vi?'Hạn báo giá: ':'Quote deadline: '}{date(q.expiresAt)}</p><p className={styles.code}>{q.id}</p>{!payment&&(q.status==='accepted'||data.request.status==='approved'&&q.status!=='expired'&&Date.parse(q.expiresAt)>now&&Date.parse(data.request.request.startAt)>now)?<Link className={styles.action} href={`/${locale}/personalized-payment/?request=${encodeURIComponent(data.request.id)}&quote=${encodeURIComponent(q.id)}`}>{q.status==='accepted'?(vi?'Xem kết quả thanh toán':'View payment result'):q.status==='checkout_pending'?(vi?'Thanh toán':'Pay now'):(vi?'Tiếp tục đặt tour':'Continue booking')}</Link>:!payment&&<p>{vi?'Báo giá không còn đủ điều kiện đặt tour.':'Quote is not available for booking.'}</p>}</section>)}</aside>
  </div>}
 </div>;
}
