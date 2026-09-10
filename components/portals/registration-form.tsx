"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Locale } from "@/lib/i18n/config";
import { RegistrationError, validateRegistration, type RegistrationField, type RegistrationInput, type RegistrationPort } from "@/lib/application/portal/registration";
import styles from "./registration.module.css";

export function RegistrationForm({ locale, port, navigate }: { locale: Locale; port: RegistrationPort; navigate: (url: string) => void }) {
  const vi = locale === "vi";
  const [input, setInput] = useState<RegistrationInput>({ displayName: "", email: "", password: "", passwordConfirmation: "", locale });
  const [errors, setErrors] = useState<ReturnType<typeof validateRegistration>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!busy && errors.email === "EMAIL_EXISTS") form.current?.querySelector<HTMLInputElement>('[name="email"]')?.focus();
  }, [busy, errors.email]);
  const text = {
    REQUIRED: vi ? "Vui lòng điền thông tin này." : "This field is required.",
    NAME: vi ? "Họ tên tối đa 80 ký tự và không chứa ký tự điều khiển." : "Use a name of up to 80 characters without control characters.",
    EMAIL: vi ? "Vui lòng nhập địa chỉ email hợp lệ." : "Enter a valid email address.",
    PASSWORD: vi ? "Mật khẩu cần 8–128 ký tự, gồm chữ hoa, chữ thường và chữ số." : "Use 8–128 characters, including an uppercase letter, a lowercase letter and a number.",
    MISMATCH: vi ? "Mật khẩu xác nhận không khớp." : "Passwords do not match.",
    EMAIL_EXISTS: vi ? "Email này đã được đăng ký. Vui lòng nhập email khác hoặc đăng nhập." : "This email is already registered. Use another email or sign in.",
    UNAVAILABLE: vi ? "Đăng ký tài khoản hiện chưa khả dụng. Vui lòng thử lại sau." : "Registration is currently unavailable. Please try again later.",
    FAILED: vi ? "Đăng ký tài khoản thất bại. Vui lòng thử lại." : "Registration failed. Please try again.",
    SIGNED_IN: vi ? "Bạn đã đăng nhập. Vui lòng đăng xuất trước khi tạo tài khoản khác." : "You are already signed in. Sign out before creating another account.",
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    setMessage("");
    const validation = validateRegistration(input);
    setErrors(validation);
    const first = Object.keys(validation)[0];
    if (first) { form.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus(); return; }
    lock.current = true; setBusy(true);
    try {
      const result = await port.register(input);
      setInput({ displayName: "", email: "", password: "", passwordConfirmation: "", locale });
      navigate(`/${locale}/sign-in/?registered=${result.emailConfirmationRequired ? "verify" : "1"}`);
    } catch (error) {
      const code = error instanceof RegistrationError ? error.code : "FAILED";
      if (code === "EMAIL_EXISTS") { setErrors({ email: code }); form.current?.querySelector<HTMLInputElement>('[name="email"]')?.focus(); }
      else setMessage(text[code]);
    } finally { lock.current = false; setBusy(false); }
  }
  const fields: { name: RegistrationField; label: string; type: string; autoComplete: string }[] = [
    { name: "displayName", label: vi ? "Họ và tên" : "Full name", type: "text", autoComplete: "name" },
    { name: "email", label: "Email", type: "email", autoComplete: "email" },
    { name: "password", label: vi ? "Mật khẩu" : "Password", type: "password", autoComplete: "new-password" },
    { name: "passwordConfirmation", label: vi ? "Xác nhận mật khẩu" : "Confirm password", type: "password", autoComplete: "new-password" },
  ];
  return <section className={styles.page}>
    <div className={styles.intro}><p>LOCALLENS</p><h1>{vi ? "Bắt đầu hành trình của bạn" : "Your journey starts here"}</h1><p>{vi ? "Tạo tài khoản để đặt tour, lên hành trình theo sở thích và quản lý chuyến đi của bạn." : "Create an account to book tours, plan a trip around your interests and manage your bookings."}</p></div>
    <form ref={form} className={styles.form} noValidate onSubmit={e => void submit(e)}>
      <h2>{vi ? "Đăng ký tài khoản" : "Create an account"}</h2>
      <p>{vi ? "Đã có tài khoản?" : "Already have an account?"} <Link href={`/${locale}/sign-in/`}>{vi ? "Đăng nhập" : "Sign in"}</Link></p>
      {fields.map(field => <div className={styles.field} key={field.name}>
        <label htmlFor={`register-${field.name}`}>{field.label}</label>
        <input id={`register-${field.name}`} name={field.name} type={field.type} autoComplete={field.autoComplete} required disabled={busy} maxLength={field.name === "displayName" ? 80 : field.name === "email" ? 254 : 128} value={input[field.name]} aria-invalid={!!errors[field.name]} aria-describedby={errors[field.name] ? `error-${field.name}` : field.name === "password" ? "password-requirements" : undefined} onChange={e => { setInput({ ...input, [field.name]: e.target.value }); setErrors({ ...errors, [field.name]: undefined }); }} />
        {field.name === "password" && <small id="password-requirements">{text.PASSWORD}</small>}
        {errors[field.name] && <p className={styles.error} role="alert" id={`error-${field.name}`}>{text[errors[field.name]!]}</p>}
      </div>)}
      {message && <p className={styles.error} role="alert">{message}</p>}
      <button className={styles.submit} type="submit" disabled={busy}>{busy ? (vi ? "Đang tạo tài khoản…" : "Creating account…") : vi ? "Đăng ký" : "Create account"}</button>
      <button className={styles.cancel} type="button" disabled={busy} onClick={() => { setInput({ displayName: "", email: "", password: "", passwordConfirmation: "", locale }); navigate(`/${locale}/`); }}>{vi ? "Hủy" : "Cancel"}</button>
    </form>
  </section>;
}
