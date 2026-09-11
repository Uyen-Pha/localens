"use client";
import { useState } from 'react';
import type { CheckoutDetails } from '@/lib/infrastructure/supabase/reviewed-bookings';
import styles from './payment-preview.module.css';

export function CheckoutFields({vi,size,contact,disabled,busy,error,onPay,onBack}:{vi:boolean;size:number;contact:{name:string;email:string;phone:string};disabled:boolean;busy:boolean;error:string;onPay:(details:CheckoutDetails)=>void;onBack:()=>void}) {
 const [declined,setDeclined]=useState(false);
 const [cardError,setCardError]=useState('');
 return <form onSubmit={e=>{e.preventDefault();if(disabled||busy)return;setCardError('');const data=new FormData(e.currentTarget);onPay({name:String(data.get('name')).trim(),email:contact.email,phone:String(data.get('phone')).trim(),passengers:data.getAll('passenger').map(v=>String(v).trim()),outcome:declined?'declined':'success'});}}>
 <fieldset disabled={disabled||busy} className={styles.fields}>
 <section className={styles.card}><h2>{vi?'1. Thông tin liên hệ':'1. Contact details'}</h2>
 <label>{vi?'Họ và tên':'Full name'}<input name="name" required maxLength={80} defaultValue={contact.name} autoComplete="name"/></label>
 <div className={styles.row}><label>Email<input type="email" value={contact.email} readOnly required/></label><label>{vi?'Số điện thoại':'Phone number'}<input name="phone" required type="tel" defaultValue={contact.phone} autoComplete="tel" pattern="[+0-9 ()-]{7,25}"/></label></div></section>
 <section className={styles.card}><h2>{vi?'2. Thông tin hành khách':'2. Traveler details'}</h2>
 {Array.from({length:size},(_,i)=><label key={i}>{vi?`Họ và tên hành khách ${i+1}`:`Traveler ${i+1} full name`}<input name="passenger" required maxLength={80} defaultValue={i===0?contact.name:''}/></label>)}</section>
 <section className={styles.card}><h2>{vi?'3. Phương thức thanh toán':'3. Payment method'}</h2>
 <p>{vi?'Thanh toán mô phỏng bằng thẻ thử. Không nhập thông tin thẻ thật.':'Simulated checkout with a test card. Do not enter real card details.'}</p>
 {(error||cardError)&&<p role="alert" className={styles.error}>{error||cardError}</p>}
 <label>{vi?'Chọn thẻ thử':'Choose a test card'}<select value={declined?'declined':'success'} onChange={e=>{setDeclined(e.target.value==='declined');setCardError('');}}><option value="success">{vi?'Thẻ thanh toán thành công':'Successful test card'}</option><option value="declined">{vi?'Thẻ bị từ chối':'Declined test card'}</option></select></label>
 <label>{vi?'Số thẻ thử':'Test card number'}<input readOnly value={declined?'4000 0000 0000 0002':'4242 4242 4242 4242'}/></label>
 <div className={styles.row}><label>{vi?'Ngày hết hạn':'Expiry'}<input readOnly value="12/30"/></label><label>CVC<input readOnly value="123"/></label></div>
 <button className={styles.button} type="submit">{busy?(vi?'Đang kiểm tra thanh toán…':'Checking payment…'):(vi?'Xác nhận thanh toán':'Confirm payment')}</button>
 <button type="button" className={styles.back} onClick={onBack}>{vi?'Quay lại đơn đặt tour':'Back to bookings'}</button>
 </section></fieldset></form>;
}
