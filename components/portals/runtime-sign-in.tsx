"use client";

import {useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {Eye,EyeOff,Mail,LockKeyhole,Map,Sparkles,LoaderCircle} from 'lucide-react';
import {PortalError,type PortalIdentity,type RuntimeSessionPort} from '@/lib/application/portal/contracts';
import {destinationAfterSignIn,parseSafeReturnTo} from '@/lib/navigation/safe-return-to';
import type {Locale} from '@/lib/i18n/config';
import styles from './runtime-sign-in.module.css';

export function RuntimeSignIn({locale,session,returnTo,navigate,onSession}:{locale:Locale;session:RuntimeSessionPort;returnTo?:string|null;navigate:(path:string)=>void;onSession:(identity:PortalIdentity)=>void}){
 const vi=locale==='vi';
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[fields,setFields]=useState<{email?:string;password?:string}>({});
 const submitting=useRef(false),emailInput=useRef<HTMLInputElement>(null),passwordInput=useRef<HTMLInputElement>(null);
 const safeReturn=parseSafeReturnTo(locale,returnTo??null);
 const register=`/${locale}/register/${safeReturn?`?returnTo=${encodeURIComponent(safeReturn)}`:''}`;
 async function submit(event:FormEvent){
  event.preventDefault();if(submitting.current)return;
  const errors:{email?:string;password?:string}={};const normalized=email.trim();
  if(!normalized)errors.email=vi?'Vui lòng nhập email.':'Enter your email.';
  else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))errors.email=vi?'Vui lòng nhập email đúng định dạng.':'Enter a valid email address.';
  if(!password)errors.password=vi?'Vui lòng nhập mật khẩu.':'Enter your password.';
  setFields(errors);setError('');
  if(errors.email||errors.password){(errors.email?emailInput:passwordInput).current?.focus();return;}
  submitting.current=true;setBusy(true);
  try{
   const identity=await session.signInWithPassword({email:normalized,password});
   onSession(identity);navigate(destinationAfterSignIn({locale,role:identity.role,returnTo}));
  }catch(cause){
   const code=cause instanceof PortalError?cause.code:'AUTH_UNAVAILABLE';
   setError(code==='UNAUTHENTICATED'?(vi?'Email hoặc mật khẩu không chính xác':'Email or password is incorrect'):
    code==='ACCOUNT_LOCKED'?(vi?'Tài khoản hiện đang bị khóa. Vui lòng liên hệ bộ phận hỗ trợ':'Your account is locked. Please contact support.'):
    code==='AUTH_RATE_LIMITED'?(vi?'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ một lúc rồi thử lại.':'Too many sign-in attempts. Please wait and try again.'):
    code==='EMAIL_UNCONFIRMED'?(vi?'Vui lòng xác nhận địa chỉ email trước khi đăng nhập.':'Please confirm your email before signing in.'):
    vi?'Không thể đăng nhập lúc này. Vui lòng thử lại sau':'Unable to sign in right now. Please try again later');
  }finally{setPassword('');setVisible(false);setBusy(false);submitting.current=false;}
 }
 return <div className={styles.page} data-portal-mode="supabase"><div className={styles.layout}>
  <section className={styles.intro} aria-labelledby="login-intro">
   <p className={styles.eyebrow}>{vi?'KHÁM PHÁ TP.HCM CÙNG LOCALLENS':'DISCOVER HO CHI MINH CITY WITH LOCALLENS'}</p>
   <h1 id="login-intro">{vi?'Đăng nhập để bắt đầu hành trình của bạn':'Your next local experience starts here'}</h1>
   <p className={styles.description}>{vi?'Đặt tour, tạo tour cá nhân hóa và khám phá những góc quen mà lạ của TP.HCM cùng LocalLens.':'Book a tour, plan your own trip and discover a different side of Ho Chi Minh City with LocalLens.'}</p>
   <div className={styles.features}><span><Map aria-hidden="true"/>{vi?'Đặt tour dễ dàng':'Easy tour booking'}</span><span><Sparkles aria-hidden="true"/>{vi?'Tour theo sở thích của bạn':'Trips shaped around you'}</span></div>
   <div className={styles.photos} aria-hidden="true">
    <figure><Image src="/images/green/ben-thanh-market.webp" alt="" width={270} height={320}/><figcaption>{vi?'Văn hóa bản địa':'Local culture'}</figcaption></figure>
    <figure><Image src="/images/green/saigon-skyline.webp" alt="" width={270} height={360}/><figcaption>{vi?'Thành phố năng động':'A city full of life'}</figcaption></figure>
    <figure><Image src="/images/editorial/saigon-post-office-inset.webp" alt="" width={270} height={320}/><figcaption>{vi?'Những câu chuyện riêng':'Stories around every corner'}</figcaption></figure>
   </div>
  </section>
  <section className={styles.card} aria-labelledby="runtime-sign-in-heading">
   <h2 id="runtime-sign-in-heading">{vi?'Đăng nhập LocalLens':'Sign in to LocalLens'}</h2>
   <p>{vi?'Chào mừng bạn trở lại! Đăng nhập để tiếp tục khám phá TP.HCM theo cách của riêng bạn.':'Welcome back! Sign in to continue exploring Ho Chi Minh City your way.'}</p>
   <form noValidate onSubmit={submit} aria-busy={busy}>
    <label htmlFor="login-email">Email</label>
    <div className={styles.input}><Mail aria-hidden="true"/><input ref={emailInput} id="login-email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} disabled={busy} maxLength={254} onChange={e=>setEmail(e.target.value)} aria-invalid={!!fields.email} aria-describedby={fields.email?'login-email-error':undefined} placeholder="example@email.com" required/></div>
    {fields.email&&<p className={styles.error} id="login-email-error">{fields.email}</p>}
    <label htmlFor="login-password">{vi?'Mật khẩu':'Password'}</label>
    <div className={styles.input}><LockKeyhole aria-hidden="true"/><input ref={passwordInput} id="login-password" type={visible?'text':'password'} autoComplete="current-password" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)} aria-invalid={!!fields.password} aria-describedby={fields.password?'login-password-error':undefined} placeholder={vi?'Nhập mật khẩu':'Enter your password'} required/><button type="button" disabled={busy} onClick={()=>setVisible(v=>!v)} aria-label={visible?(vi?'Ẩn mật khẩu':'Hide password'):(vi?'Hiện mật khẩu':'Show password')} aria-pressed={visible}>{visible?<EyeOff aria-hidden="true"/>:<Eye aria-hidden="true"/>}</button></div>
    {fields.password&&<p className={styles.error} id="login-password-error">{fields.password}</p>}
    {error&&<p className={styles.error} role="alert">{error}</p>}
    <button className={styles.submit} type="submit" disabled={busy}>{busy&&<LoaderCircle className={styles.spinner} aria-hidden="true"/>}{busy?(vi?'Đang đăng nhập…':'Signing in…'):(vi?'Đăng nhập':'Sign in')}</button>
    {busy&&<span className={styles.srOnly} role="status">{vi?'Đang xác thực tài khoản':'Verifying your account'}</span>}
   </form>
   <p className={styles.register}>{vi?'Chưa có tài khoản? ':'New to LocalLens? '}<Link href={register}>{vi?'Đăng ký tài khoản':'Create an account'}</Link></p>
  </section>
 </div></div>;
}
