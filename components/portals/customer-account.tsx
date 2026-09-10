'use client';
import Link from 'next/link';
import { ReviewedBookingsList } from '@/components/customer/reviewed-bookings';
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserRound, ArrowLeft, Check, LockKeyhole, Tickets } from 'lucide-react';
import type { Locale } from '@/lib/i18n/config';
import type { AccountAdapter } from '@/lib/infrastructure/supabase/account-adapter';
import { validatePasswordChange } from '@/lib/application/portal/account';
import { loadPortalSurfaceComposition } from './portal-session';
import { CustomerPortal } from './customer-portal';
import type { DemoPortalComposition } from '@/lib/application/portal/composition';
import type { DemoPortalIdentity } from '@/lib/application/portal/contracts';
import { validateProfile } from '@/lib/application/portal/account';
import { RuntimeFixedTourAccount } from '@/components/customer/runtime-fixed-tour-account';
import type { SupabasePortalShell } from '@/lib/application/portal/supabase-shell';
import styles from './customer-account.module.css';

export const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).map(s => Array.from(s)[0]).filter(Boolean).slice(-2).join('').toUpperCase() || 'LL';
type Profile = Awaited<ReturnType<AccountAdapter['load']>>;
type Field = 'displayName' | 'nationality' | 'phone' | 'email' | 'password';
const countries = 'AF AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW'.split(' ');

export function CustomerAccount({ locale, section = 'personal' }: { locale: Locale; section?: 'personal' | 'bookings' }) {
  const vi = locale === 'vi';
  const router = useRouter();
  const [account, setAccount] = useState<AccountAdapter | null>(null);
  const [bookingServices, setBookingServices] = useState<SupabasePortalShell | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [demo, setDemo] = useState<{ shell: DemoPortalComposition; identity: DemoPortalIdentity } | null>(null);
  const [editing, setEditing] = useState<Field | null>(null);
  const [value, setValue] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>('VN');
  const [current, setCurrent] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [reload, setReload] = useState(0);
  const labels = { displayName: vi ? 'Họ và tên' : 'Full name', nationality: vi ? 'Quốc tịch' : 'Nationality', email: 'Email', phone: vi ? 'Số điện thoại' : 'Phone number', password: vi ? 'Mật khẩu' : 'Password' };
  const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
  useEffect(() => {
    if (window.location.hash === '#bookings') router.replace(`/${locale}/bookings/`);
  }, [locale, router]);
  useEffect(() => {
    let alive = true;
    void loadPortalSurfaceComposition().then(async shell => {
      await shell.initialized;
      const identity = await shell.session.getSession();
      if (!identity) { router.replace(`/${locale}/sign-in/?returnTo=/${locale}/${section === 'bookings' ? 'bookings' : 'account'}/`); return; }
      if (identity.role !== 'customer') { router.replace(`/${locale}/${identity.role}/`); return; }
      if (shell.mode === 'demo') {
        const adapter: AccountAdapter = {
          async load() {
            const p = await shell.customer.account.getAccount();
            const nationality = countries.includes(p.nationality) ? p.nationality : p.nationality === 'Vietnamese' ? 'VN' : '';
            return { ...p, nationality, phone: p.phone ?? '', pendingEmail: '' };
          },
          async save(p) {
            const invalid = validateProfile(p);
            if (invalid) throw new Error(invalid);
            await shell.customer.account.updateAccount({displayName:p.displayName.trim(), nationality:p.nationality, phone:p.phone});
          },
          async changePassword() { throw new Error('demoPassword'); },
        };
        const data = await adapter.load();
        if (alive) { setDemo({shell, identity: identity as DemoPortalIdentity}); setAccount(adapter); setProfile(data); setError(''); }
        return;
      }
      if (!shell.account) throw new Error('Account service unavailable');
      const data = await shell.account.load();
      if (alive) { setAccount(shell.account); setBookingServices(shell); setProfile(data); setError(''); }
    }).catch(() => { if (alive) setError(vi ? 'Không thể tải tài khoản. Vui lòng thử lại.' : 'Unable to load your account. Please try again.'); });
    return () => { alive = false; };
  }, [locale, router, vi, reload, section]);
  function close() { setEditing(null); setValue(''); setCurrent(''); setConfirmation(''); setError(''); }
  function edit(field: Field) {
    close(); setNotice(''); setEditing(field);
    if (field === 'phone') {
      const parsed = parsePhoneNumberFromString(profile?.phone ?? '');
      const fallback = getCountries().includes(profile?.nationality as CountryCode) ? profile!.nationality as CountryCode : 'VN';
      setPhoneCountry(parsed?.country ?? fallback);
      setValue(parsed?.nationalNumber ?? profile?.phone ?? '');
    } else setValue(field === 'password' ? '' : profile?.[field] ?? '');
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!account || !profile || !editing || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (editing === 'password') {
        const invalid = validatePasswordChange(current, value, confirmation);
        if (invalid) throw new Error(invalid);
        await account.changePassword(current, value, confirmation);
        close(); window.dispatchEvent(new Event('localens-account-changed'));
        router.replace(`/${locale}/sign-in/?passwordChanged=1`); return;
      }
      if (editing === 'email') return;
      if (!value.trim()) throw new Error(editing === 'displayName' ? 'name' : editing);
      let savedValue = value;
      if (editing === 'phone' && value.trim()) {
        const parsed = parsePhoneNumberFromString(value, {defaultCountry: phoneCountry, extract: false});
        if (!parsed?.isPossible() || parsed.countryCallingCode !== getCountryCallingCode(phoneCountry)) throw new Error('phone');
        savedValue = parsed.number;
      }
      await account.save({ ...profile, [editing]: savedValue });
      setProfile(await account.load()); close();
      setNotice(vi ? 'Thông tin đã được cập nhật.' : 'Your information has been updated.');
      window.dispatchEvent(new Event('localens-account-changed'));
    } catch (e) {
      const code = e instanceof Error ? e.message : 'failed';
      const messages: Record<string, string> = {
        nationality: vi ? 'Vui lòng chọn quốc tịch.' : 'Please select your nationality.',
        demoPassword: vi ? 'Tài khoản trải nghiệm không có mật khẩu. Vui lòng đăng nhập bằng tài khoản đã đăng ký để sử dụng chức năng này.' : 'This sample account has no password. Sign in with a registered account to use this feature.',
        name: vi ? 'Nhập họ tên từ 1 đến 80 ký tự.' : 'Enter your full name (1–80 characters).',
        phone: vi ? 'Vui lòng kiểm tra số điện thoại và mã quốc gia đã chọn.' : 'Please check your phone number and selected country code.',
        email: vi ? 'Địa chỉ email chưa hợp lệ.' : 'Enter a valid email address.',
        duplicate: vi ? 'Email này đã được đăng ký. Vui lòng sử dụng email khác.' : 'This email is already registered. Please use a different email.',
        current: vi ? 'Mật khẩu hiện tại không đúng.' : 'Your current password is incorrect.',
        weak: vi ? 'Mật khẩu cần 8–128 ký tự, gồm chữ hoa, chữ thường và số.' : 'Use 8–128 characters with uppercase, lowercase and a number.',
        confirmation: vi ? 'Mật khẩu xác nhận không khớp.' : 'Passwords do not match.',
        same: vi ? 'Mật khẩu mới phải khác mật khẩu hiện tại.' : 'Choose a password different from your current password.',
        signout: vi ? 'Mật khẩu đã đổi. Vui lòng đăng xuất và đăng nhập lại.' : 'Password changed. Please sign out and sign in again.',
      };
      setError(messages[code] ?? (vi ? 'Lưu thay đổi thất bại. Vui lòng thử lại sau' : 'Unable to save your changes. Please try again.'));
    } finally { lock.current = false; setBusy(false); }
  }
  if (!profile) return <div className={`${styles.page} ${section === 'bookings' ? styles.bookingsPage : ''}`}><p role={error ? 'alert' : 'status'}>{error || (vi ? 'Đang tải tài khoản…' : 'Loading your account…')}</p>{error && <button onClick={() => setReload(n => n + 1)}>{vi ? 'Thử lại' : 'Retry'}</button>}</div>;
  const fields: Field[] = ['displayName', 'nationality', 'email', 'phone', 'password'];
  return <div className={`${styles.page} ${section === 'bookings' ? styles.bookingsPage : ''}`}>
    <Link className={styles.back} href={`/${locale}/tours/`}><ArrowLeft size={17}/>{vi ? 'Khám phá tour' : 'Explore tours'}</Link>
    <div className={styles.greeting}><span className={styles.avatar} aria-hidden="true">{initials(profile.displayName)}</span><div><p>{vi ? 'TÀI KHOẢN CỦA BẠN' : 'YOUR ACCOUNT'}</p><h1>{section === 'bookings' ? (vi ? 'Đơn đặt tour' : 'Your bookings') : <>{vi ? 'Xin chào' : 'Hello'}, {profile.displayName}!</>}</h1></div></div>
    <div className={styles.layout}>
      <nav className={styles.sidebar} aria-label={vi ? 'Cài đặt tài khoản' : 'Account settings'}>
        <Link aria-current={section === 'personal' ? 'page' : undefined} href={`/${locale}/account/`}><UserRound size={22}/>{vi ? 'Quản lý tài khoản' : 'My account'}</Link>
        <Link aria-current={section === 'bookings' ? 'page' : undefined} href={`/${locale}/bookings/`}><Tickets size={22}/>{vi ? 'Đơn đặt tour' : 'Bookings'}</Link>
        <p><LockKeyhole size={18}/>{vi ? 'Thông tin của bạn được sử dụng để quản lý tài khoản và hỗ trợ chuyến đi.' : 'Your information helps us manage your account and support your trips.'}</p>
      </nav>
      {section === 'bookings' ? <div className={styles.content}>
        <h2 className={styles.bookingTitle}>{vi ? 'Đơn đặt tour' : 'Bookings'}</h2>
        <p className={styles.intro}>{vi ? 'Xem các tour đã đặt, theo dõi thanh toán và quản lý chuyến đi của bạn.' : 'View your booked tours, track payments and manage your trips.'}</p>
        {demo && <CustomerPortal locale={locale} composition={demo.shell} session={demo.identity} onSignOut={() => router.replace(`/${locale}/sign-in/`)} bookingsOnly />}
        {bookingServices?.reviewedBookings && <ReviewedBookingsList locale={locale} service={bookingServices.reviewedBookings} onLoaded={setReviewedCount}/>}
        {bookingServices && <RuntimeFixedTourAccount hideEmpty={Boolean(bookingServices.reviewedBookings) || reviewedCount > 0} locale={locale} fixedTour={bookingServices.fixedTour} bookingCancellations={bookingServices.bookingCancellations} />}
      </div> : <section className={styles.content} aria-labelledby="account-section">
        <h2 id="account-section">{vi ? 'Thông tin cá nhân & bảo mật' : 'Personal information & security'}</h2>
        <p className={styles.intro}>{vi ? 'Quản lý thông tin cá nhân và mật khẩu của bạn tại đây.' : 'Manage your personal details and password in one place.'}</p>
        {notice && <p className={styles.success} role="status"><Check size={18}/>{notice}</p>}
        {fields.map(field => <div className={styles.row} key={field}>
          <div className={styles.rowTop}><h3>{labels[field]}</h3>{field !== 'email' && editing !== field && <button className={styles.edit} disabled={busy} aria-label={`${vi ? 'Chỉnh sửa' : 'Edit'} ${labels[field]}`} onClick={() => edit(field)}>{field !== 'password' && !profile[field] ? (vi ? 'Thêm' : 'Add') : (vi ? 'Chỉnh sửa' : 'Edit')}</button>}</div>
          {field === 'email' && <p className={styles.intro}>{vi ? 'Email đăng nhập không thể thay đổi.' : 'Your sign-in email cannot be changed.'}</p>}
          {editing !== field ? <p className={styles.value}>{field === 'password' ? '••••••••••••' : field === 'nationality' && profile.nationality ? displayNames.of(profile.nationality) : profile[field] || (vi ? 'Chưa cung cấp' : 'Not provided')}</p> :
            <form className={styles.form} onSubmit={save}>
              {field === 'password' || field === 'email' ? <label>{vi ? 'Mật khẩu hiện tại' : 'Current password'}<input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} required disabled={busy}/></label> : null}
              {field === 'phone' ? <div className={styles.phoneFields}>
                <label>{vi ? 'Mã quốc gia' : 'Country code'}<select aria-label={vi ? 'Mã quốc gia' : 'Country code'} value={phoneCountry} disabled={busy} onChange={e => setPhoneCountry(e.target.value as CountryCode)}>{getCountries().map(code => ({code, name:displayNames.of(code) ?? code})).sort((a,b) => a.name.localeCompare(b.name,locale)).map(c => <option key={c.code} value={c.code}>{c.name} (+{getCountryCallingCode(c.code)})</option>)}</select></label>
                <label>{labels.phone}<input autoFocus type="tel" inputMode="tel" autoComplete="tel-national" value={value} onChange={e => setValue(e.target.value)} disabled={busy} maxLength={25} placeholder={phoneCountry === 'VN' ? '0912 345 678' : (vi ? 'Nhập số điện thoại' : 'Phone number')}/></label>
              </div> : <label>{field === 'password' ? (vi ? 'Mật khẩu mới' : 'New password') : labels[field]}
                {field === 'nationality' ? <select autoFocus value={value} onChange={e => setValue(e.target.value)} disabled={busy}><option value="">{vi ? 'Chọn quốc tịch' : 'Select nationality'}</option>{countries.map(code => ({ code, name: displayNames.of(code) ?? code })).sort((a,b) => a.name.localeCompare(b.name, locale)).map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select> : <input autoFocus type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'} autoComplete={field === 'password' ? 'new-password' : field === 'email' ? 'email' : 'name'} value={value} onChange={e => setValue(e.target.value)} required maxLength={field === 'displayName' ? 80 : field === 'password' ? 128 : 254} disabled={busy}/>}
              </label>}
              {field === 'phone' && <p>{vi ? 'Chọn mã quốc gia và nhập số điện thoại của bạn, không cần nhập lại mã quốc gia.' : 'Select your country code, then enter your phone number without repeating the country code.'}</p>}
              {field === 'email' && <p>{vi ? 'Email mới dùng để đăng nhập và nhận thông tin chuyến đi. Bạn có thể cần xác nhận qua email trước khi thay đổi có hiệu lực.' : 'Your new email will be used for sign-in and trip updates. Email confirmation may be required before the change takes effect.'}</p>}
              {field === 'password' && <><p>{vi ? '8–128 ký tự, gồm ít nhất một chữ hoa, một chữ thường và một số. Sau khi đổi, bạn sẽ đăng nhập lại.' : '8–128 characters, including uppercase, lowercase and a number. You will sign in again after changing your password.'}</p><label>{vi ? 'Xác nhận mật khẩu mới' : 'Confirm new password'}<input type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} required disabled={busy}/></label></>}
              {error && <p className={styles.error} role="alert">{error}</p>}
              <div className={styles.actions}><button className={styles.primary} disabled={busy}>{busy ? (vi ? 'Đang lưu…' : 'Saving…') : (vi ? 'Lưu thay đổi' : 'Save changes')}</button><button type="button" disabled={busy} onClick={close}>{vi ? 'Hủy' : 'Cancel'}</button></div>
            </form>}
        </div>)}
      </section>}
    </div>
  </div>;
}


