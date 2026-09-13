'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, UserRound, Phone, Mail, MapPin, FileText, LockKeyhole, Pencil, Check, ArrowRight } from 'lucide-react';
import type { PortalIdentity } from '@/lib/application/portal/contracts';
import type { GuideProfilePort, GuidePersonalProfile, GuideField } from '@/lib/application/portal/guide-profile';
import { validateGuideField } from '@/lib/application/portal/guide-profile';
import type { RuntimeGuideAssignmentPort } from '@/lib/application/guide-assignment/contracts';
import styles from './runtime-guide-portal.module.css';
import { GuideSchedule } from './guide-schedule';

export function RuntimeGuidePortal({ locale, session, profilePort, assignments, onSignOut }: {
  locale: 'vi' | 'en'; session: PortalIdentity; profilePort?: GuideProfilePort; assignments: RuntimeGuideAssignmentPort; onSignOut?: () => void;
}) {
  const vi = locale === 'vi';
  const t = (a: string, b: string) => vi ? a : b;
  const [tab, setTab] = useState<'profile' | 'schedule'>('schedule');
  const [profile, setProfile] = useState<GuidePersonalProfile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [items, setItems] = useState<Awaited<ReturnType<RuntimeGuideAssignmentPort['listOwnAssignments']>>>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState<GuideField | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const nextAction = useRef<(() => void) | null>(null);
  const dirty = editing !== null && profile !== null && draft !== profile[editing];
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const displayDate = (value: string) => new Intl.DateTimeFormat(vi ? 'vi-VN' : 'en-GB', { dateStyle: 'long', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));

  useEffect(() => {
    let live = true;
    setLoading(true); setScheduleError(false); setProfileError(false);
    void assignments.listOwnAssignments().then(data => { if (live) setItems(data); }).catch(() => { if (live) setScheduleError(true); }).finally(() => { if (live) setLoading(false); });
    if (profilePort) void profilePort.load().then(data => { if (live) setProfile(data); }).catch(() => { if (live) setProfileError(true); });
    else setProfileError(true);
    return () => { live = false; };
  }, [assignments, profilePort, retry]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(timer); }, [notice]);

  function leave(action: () => void) {
    if (!dirtyRef.current) { action(); return; }
    nextAction.current = action; dialog.current?.showModal();
  }
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!dirtyRef.current || !anchor || anchor.target === '_blank' || event.ctrlKey || event.metaKey || anchor.hasAttribute('download')) return;
      event.preventDefault(); event.stopPropagation();
      nextAction.current = () => { dirtyRef.current = false; window.location.assign(anchor.href); };
      dialog.current?.showModal();
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', click, true);
    // Modern browsers expose same-document back/forward navigation here. Cross-document
    // navigation remains covered by beforeunload; never insert fake history entries.
    const navigation = (window as unknown as { navigation?: EventTarget & { traverseTo(key: string): unknown; navigate(url: string): unknown } }).navigation;
    const navigate = (raw: Event) => {
      const event = raw as Event & { destination: { key: string; url: string }; navigationType: string };
      if (!dirtyRef.current || !event.cancelable || event.defaultPrevented) return;
      event.preventDefault();
      nextAction.current = () => { dirtyRef.current = false; if (event.navigationType === 'traverse') navigation?.traverseTo(event.destination.key); else navigation?.navigate(event.destination.url); };
      dialog.current?.showModal();
    };
    navigation?.addEventListener('navigate', navigate);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true); navigation?.removeEventListener('navigate', navigate); };
  }, []);

  function edit(field: GuideField) {
    leave(() => { setEditing(field); setDraft(profile?.[field] ?? ''); setError(''); });
  }
  async function save() {
    if (!editing || !profilePort || saving.current) return;
    const invalid = validateGuideField(editing, draft);
    if (invalid) {
      setError(invalid === 'phone' ? t('Nhập số điện thoại quốc tế, ví dụ +84912345678.', 'Enter an international phone number, such as +84912345678.') : invalid === 'bio' ? t('Tiểu sử cần từ 100 đến 1.000 ký tự.', 'Your biography must contain 100–1,000 characters.') : t('Nhập địa chỉ liên hệ từ 1 đến 300 ký tự.', 'Enter a contact address of 1–300 characters.')); return;
    }
    saving.current = true; setBusy(true); setError('');
    try {
      const updated = await profilePort.save(editing, draft);
      setProfile(updated); setEditing(null); dirtyRef.current = false;
      setNotice(t('Thông tin đã được cập nhật', 'Your information has been updated'));
    } catch (caught) {
      setError(caught instanceof Error && caught.message === 'duplicate' ? t('Số điện thoại này đã được sử dụng. Vui lòng nhập số khác.', 'This phone number is already in use. Please enter another number.') : t('Không thể cập nhật thông tin. Vui lòng thử lại sau', 'Unable to update your information. Please try again later.'));
    } finally { saving.current = false; setBusy(false); }
  }
  const fields = [
    { key: 'displayName', label: t('Họ và tên','Full name'), icon: UserRound },
    { key: 'email', label: 'Email', icon: Mail },
    { key: 'phone', label: t('Số điện thoại','Phone number'), icon: Phone },
    { key: 'contactAddress', label: t('Địa chỉ liên hệ','Contact address'), icon: MapPin },
    { key: 'bio', label: t('Tiểu sử ngắn','Short biography'), icon: FileText },
  ] as const;
  const initials = session.displayName.split(' ').map(word => word[0]).slice(0,2).join('');
  return <div className={`${styles.page} ${tab === 'schedule' ? styles.schedulePage : ''}`}>
    <header className={styles.hero}><div><p className={styles.eyebrow}>{t('KHÔNG GIAN LOCALLENS CỦA BẠN','YOUR LOCALLENS SPACE')}</p><h1>{t('Cổng hướng dẫn viên','Guide portal')}</h1><p>{t('Quản lý thông tin cá nhân, xem lịch phân công và chuẩn bị cho mỗi chuyến đi.','Manage your profile, view assignments and get ready for your next tour.')}</p></div></header>
    <div className={styles.container}>
      <nav className={styles.tabs} aria-label={t('Khu vực hướng dẫn viên','Guide navigation')}>
        <button type="button" aria-current={tab === 'profile' ? 'page' : undefined} onClick={() => leave(() => { setTab('profile'); setEditing(null); })}><UserRound/><span><strong>{t('Thông tin cá nhân','Personal information')}</strong><small>{t('Xem và cập nhật thông tin liên hệ','View and update your contact information')}</small></span></button>
        <button type="button" aria-current={tab === 'schedule' ? 'page' : undefined} onClick={() => leave(() => { setTab('schedule'); setEditing(null); })}><CalendarDays/><span><strong>{t('Phân công tour','Tour assignments')}</strong><small>{t('Xem lịch tour được phân công','View your assigned tours')}</small></span></button>
        {onSignOut && <button className={styles.signOut} type="button" onClick={() => leave(onSignOut)}>{t('Đăng xuất','Sign out')}</button>}
      </nav>
      {notice && <p role="status" className={styles.success}>{notice}</p>}
      {tab === 'schedule' ? <GuideSchedule locale={locale} items={items} loading={loading} error={scheduleError} onRetry={() => setRetry(value => value+1)} getDetail={assignments.getOwnAssignmentDetail}/> : <div className={styles.grid}>
        {tab === 'profile' ? <section className={styles.card} aria-labelledby="guide-profile-title">
          <div className={styles.heading}><UserRound/><div><h2 id="guide-profile-title">{t('Thông tin cá nhân','Personal information')}</h2><p>{t('Chọn “Chỉnh sửa” tại mục bạn muốn cập nhật.','Choose Edit next to the information you want to update.')}</p></div></div>
          {profileError ? <div role="alert"><p>{t('Không thể tải hồ sơ. Vui lòng thử lại.','Unable to load your profile. Please try again.')}</p><button onClick={() => setRetry(value => value+1)}>{t('Thử lại','Retry')}</button></div> : !profile ? <p role="status">{t('Đang tải hồ sơ…','Loading profile…')}</p> : fields.map(({key,label,icon: Icon}) => {
            const editable = key === 'phone' || key === 'contactAddress' || key === 'bio';
            return <div className={styles.fieldRow} key={key}><Icon/><strong>{label}</strong><div className={styles.fieldValue}>
              {editing === key ? <form onSubmit={event => { event.preventDefault(); void save(); }} noValidate>
                <label className={styles.srOnly} htmlFor={`guide-${key}`}>{label}</label>
                {key === 'bio' ? <textarea id={`guide-${key}`} autoFocus value={draft} disabled={busy} onChange={event => setDraft(event.target.value)} aria-invalid={!!error} aria-describedby={error ? 'guide-field-error' : 'guide-bio-count'}/> : <input id={`guide-${key}`} autoFocus type={key === 'phone' ? 'tel' : 'text'} autoComplete={key === 'phone' ? 'tel' : 'street-address'} value={draft} disabled={busy} onChange={event => setDraft(event.target.value)} aria-invalid={!!error} aria-describedby={error ? 'guide-field-error' : undefined}/>}
                {key === 'bio' && <small id="guide-bio-count">{Array.from(draft.trim()).length}/1.000 {t('ký tự · tối thiểu 100','characters · minimum 100')}</small>}
                {error && <p id="guide-field-error" role="alert" className={styles.error}>{error}</p>}
                <div className={styles.actions}><button className={styles.primary} disabled={busy}><Check size={17}/>{busy ? t('Đang lưu…','Saving…') : t('Lưu','Save')}</button><button type="button" disabled={busy} onClick={() => { setEditing(null); setError(''); }}>{t('Hủy','Cancel')}</button></div>
              </form> : <p className={styles.value}>{profile[key] || t('Chưa cập nhật','Not provided')}</p>}
            </div>{editing !== key && (editable ? <button disabled={busy} onClick={() => edit(key)} aria-label={`${t('Chỉnh sửa','Edit')} ${label}`}><Pencil size={16}/>{t('Chỉnh sửa','Edit')}</button> : <span className={styles.lock}><LockKeyhole size={16}/>{t('Chỉ xem','Read only')}</span>)}</div>;
          })}
        </section> : null}
        <aside className={styles.sidebar}>
          {tab === 'profile' ? <section className={styles.card}><div className={styles.heading}><UserRound/><div><h2>{t('Hồ sơ của bạn','Your profile')}</h2><p>{t('Thông tin do công ty quản lý','Company-managed information')}</p></div></div><div className={styles.summary}><div className={styles.identity}><span>{initials}</span><div><strong>{profile?.displayName ?? session.displayName}</strong><small>{profile?.email ?? session.email}</small></div></div><dl><div><dt>{t('Vai trò','Role')}</dt><dd>{t('Hướng dẫn viên','Guide')}</dd></div><div><dt>{t('Ngôn ngữ','Language')}</dt><dd>{profile?.language === 'vi' ? t('Tiếng Việt','Vietnamese') : profile?.language === 'en' ? t('Tiếng Anh','English') : '—'}</dd></div><div><dt>{t('Khu vực hoạt động','Operating area')}</dt><dd>{profile?.operatingArea || t('Chưa cập nhật','Not provided')}</dd></div><div><dt>{t('Ngày tham gia','Joined')}</dt><dd>{profile?.joinedAt ? displayDate(profile.joinedAt) : '—'}</dd></div></dl></div></section> : null}
          <section className={styles.card}><div className={styles.heading}><CalendarDays/><div><h3>{tab === 'profile' ? t('Sẵn sàng cho chuyến đi tiếp theo?','Ready for your next trip?') : t('Thông tin liên hệ đã đầy đủ?','Are your contact details up to date?')}</h3><p>{tab === 'profile' ? t('Kiểm tra thời gian và điểm đón trước khi khởi hành.','Check departure times and meeting points before you set off.') : t('Cập nhật hồ sơ để điều phối viên có thể liên hệ với bạn.','Keep your profile up to date so your coordinator can reach you.')}</p></div></div><button className={styles.wide} onClick={() => leave(() => {setTab(tab === 'profile' ? 'schedule' : 'profile');setEditing(null);})}>{tab === 'profile' ? t('Xem lịch phân công','View assignments') : t('Xem thông tin cá nhân','View personal information')}<ArrowRight size={18}/></button></section>
        </aside>
      </div>}

    </div>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="guide-unsaved-title"><h2 id="guide-unsaved-title">{t('Bạn có thay đổi chưa lưu','You have unsaved changes')}</h2><p>{t('Bạn có chắc chắn muốn rời khỏi trang này? Những thay đổi chưa lưu sẽ bị bỏ.','Are you sure you want to leave? Your unsaved changes will be discarded.')}</p><div className={styles.actions}><button onClick={() => dialog.current?.close()}>{t('Ở lại','Stay')}</button><button className={styles.primary} onClick={() => {dialog.current?.close();dirtyRef.current=false;setEditing(null);nextAction.current?.();}}>{t('Đồng ý rời đi','Leave page')}</button></div></dialog>
  </div>;
}
