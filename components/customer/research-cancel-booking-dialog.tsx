'use client';

import {useId,useRef,useState} from 'react';
import type {ResearchBooking} from '@/lib/infrastructure/supabase/research-request-adapter';
import styles from '../admin/admin-quotes.module.css';

export function canCancelResearchBooking(booking:ResearchBooking,now:number){
 if(booking.status==='pending_payment') return (booking.payment_status==='pending'||booking.payment_status==='failed')&&Date.parse(booking.expires_at)>now;
 return booking.status==='confirmed'&&booking.payment_status==='paid'&&!!booking.trip_start_at&&Date.parse(booking.trip_start_at)-now>=48*60*60*1000;
}

type Props={
 booking:ResearchBooking;vi:boolean;now:number;disabled?:boolean;
 requestKeys?:Map<string,string>;
 cancelBooking:(id:string,key:string)=>Promise<ResearchBooking>;
 reloadBooking:()=>Promise<ResearchBooking|null>;
 onBooking:(booking:ResearchBooking)=>void;
 onBlockedChange:(blocked:boolean)=>void;
};

export function ResearchCancelBookingDialog({booking,vi,now,disabled=false,requestKeys,cancelBooking,reloadBooking,onBooking,onBlockedChange}:Props){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const localKeys=useRef(new Map<string,string>()),lock=useRef(false),uncertain=useRef(false);
 const keys=requestKeys??localKeys.current;
 const heading=useId();
 async function confirm(){
  if(lock.current)return;
  lock.current=true;setBusy(true);setError('');onBlockedChange(true);
  let failure:unknown;
  let cancelled=false;
  try{
   let key=keys.get(booking.id);
   if(!key){key=crypto.randomUUID();keys.set(booking.id,key);}
   if(!cancelBooking)throw Error('CANCELLATION_UNAVAILABLE');
   await cancelBooking(booking.id,key);
  }catch(cause){failure=cause;}
  try{
   const saved=await reloadBooking();
   if(!saved||saved.id!==booking.id)throw Error('BOOKING_UNAVAILABLE');
   uncertain.current=false;
   onBooking(saved);
   cancelled=saved.status==='cancelled';
   if(cancelled)setOpen(false);
  }catch{uncertain.current=true;}
  if(!cancelled)setError(failure instanceof Error&&failure.message==='CANCELLATION_UNAVAILABLE'
   ?(vi?'Chức năng hủy đơn chưa sẵn sàng. Vui lòng thử lại sau.':'Booking cancellation is not available yet. Please try again later.')
   :(vi?'Chưa thể xác nhận hủy đơn. Vui lòng thử lại để kiểm tra trạng thái máy chủ.':'Unable to confirm cancellation. Please retry to check the server status.'));
  lock.current=false;setBusy(false);onBlockedChange(!cancelled||uncertain.current);
 }
 if(booking.status==='cancelled'||!open&&!canCancelResearchBooking(booking,now)&&!keys.has(booking.id))return null;
 return <>
  {!open?<button className={styles.secondary} disabled={disabled} onClick={()=>{setOpen(true);onBlockedChange(true);}}>{vi?'Hủy đơn':'Cancel booking'}</button>:<section role="dialog" aria-labelledby={heading} className={styles.card}>
   <h3 id={heading}>{vi?'Hủy đơn đặt tour cá nhân hóa':'Cancel personalized booking'}</h3>
   <p>{vi?'Bạn có chắc muốn hủy đơn này? Thông tin thanh toán đã ghi nhận được giữ nguyên.':'Cancel this booking? Recorded payment information will be retained.'}</p>
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <div className={styles.actions}>
    <button disabled={busy} onClick={()=>void confirm()}>{busy?(vi?'Đang kiểm tra…':'Checking…'):(vi?'Xác nhận hủy':'Confirm cancellation')}</button>
    <button className={styles.secondary} disabled={busy} onClick={()=>{setOpen(false);onBlockedChange(uncertain.current);}}>{vi?'Quay lại':'Back'}</button>
   </div>
  </section>}
 </>;
}
