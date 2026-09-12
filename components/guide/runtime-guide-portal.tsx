'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, UserRound, Phone, Mail, MapPin, FileText, LockKeyhole, Pencil, Check, ChevronRight, Clock3, Users, Languages, Lightbulb, ArrowRight } from 'lucide-react';
import type { PortalIdentity } from '@/lib/application/portal/contracts';
import type { GuideProfilePort, GuidePersonalProfile, GuideField } from '@/lib/application/portal/guide-profile';
import { validateGuideField } from '@/lib/application/portal/guide-profile';
import type { RuntimeGuideAssignmentPort, GuideOwnAssignment } from '@/lib/application/guide-assignment/contracts';
import styles from './runtime-guide-portal.module.css';

const dateKey = (value: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
export function RuntimeGuidePortal({ locale, session, profilePort, assignments, onSignOut }: {
  locale: 'vi' | 'en'; session: PortalIdentity; profilePort?: GuideProfilePort; assignments: RuntimeGuideAssignmentPort; onSignOut?: () => void;
}) {
  const vi = locale === 'vi';
  const t = (a: string, b: string) => vi ? a : b;
  const [tab, setTab] = useState<'profile' | 'schedule'>('schedule');
  const [profile, setProfile] = useState<GuidePersonalProfile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [items, setItems] = useState<GuideOwnAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState<GuideField | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [filter, setFilter] = useState<'today' | 'week' | 'upcoming'>('upcoming');
  const [day, setDay] = useState(() => dateKey(new Date()));
  const [selected, setSelected] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const nextAction = useRef<(() => void) | null>(null);
  const dirty = editing !== null && profile !== null && draft !== profile[editing];
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const displayDate = (value: string) => new Intl.DateTimeFormat(vi ? 'vi-VN' : 'en-GB', { dateStyle: 'long', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
  const displayTime = (value: string) => new Intl.DateTimeFormat(vi ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));

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
  const base = new Date(`${day}T00:00:00+07:00`).getTime();
  const weekDay = new Date(`${day}T12:00:00+07:00`).getUTCDay();
  const weekStart = base - ((weekDay + 6) % 7) * 86400000;
  const visible = items.filter(item => {
    const start = Date.parse(item.startAt);
    if (filter === 'today') return dateKey(new Date(item.startAt)) === day;
    if (filter === 'week') return start >= weekStart && start < weekStart + 7 * 86400000;
    return start >= Date.now();
  }).sort((a,b) => Date.parse(a.startAt)-Date.parse(b.startAt));
  const active = visible.find(item => item.assignmentId === selected) ?? visible[0];
  const fields = [
    { key: 'displayName', label: t('Họ và tên','Full name'), icon: UserRound },
    { key: 'phone', label: t('Số điện thoại','Phone number'), icon: Phone },
    { key: 'email', label: 'Email', icon: Mail },
    { key: 'contactAddress', label: t('Địa chỉ liên hệ','Contact address'), icon: MapPin },
    { key: 'bio', label: t('Tiểu sử ngắn','Short biography'), icon: FileText },
  ] as const;
  const initials = session.displayName.split(' ').map(word => word[0]).slice(0,2).join('');
  return <div className={styles.page}>
    <header className={styles.hero}><div><p className={styles.eyebrow}>{t('KHÔNG GIAN LOCALLENS CỦA BẠN','YOUR LOCALLENS SPACE')}</p><h1>{t('Cổng hướng dẫn viên','Guide portal')}</h1><p>{t('Quản lý thông tin cá nhân, xem lịch phân công và chuẩn bị cho mỗi chuyến đi.','Manage your profile, view assignments and get ready for your next tour.')}</p></div></header>
    <div className={styles.container}>
      <nav className={styles.tabs} aria-label={t('Khu vực hướng dẫn viên','Guide navigation')}>
        <button type="button" aria-current={tab === 'profile' ? 'page' : undefined} onClick={() => leave(() => { setTab('profile'); setEditing(null); })}><UserRound/><span><strong>{t('Thông tin cá nhân','Personal information')}</strong><small>{t('Xem và cập nhật thông tin liên hệ','View and update your contact information')}</small></span></button>
        <button type="button" aria-current={tab === 'schedule' ? 'page' : undefined} onClick={() => leave(() => { setTab('schedule'); setEditing(null); })}><CalendarDays/><span><strong>{t('Phân công tour','Tour assignments')}</strong><small>{t('Xem lịch tour được phân công','View your assigned tours')}</small></span></button>
        {onSignOut && <button type="button" onClick={() => leave(onSignOut)}>{t('Đăng xuất','Sign out')}</button>}
      </nav>
      {notice && <p role="status" className={styles.success}>{notice}</p>}
      <div className={styles.grid}>
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
        </section> : <section className={styles.card} aria-labelledby="guide-schedule-title">
          <div className={styles.heading}><CalendarDays/><div><h2 id="guide-schedule-title">{t('Lịch phân công','Assignment schedule')}</h2><p>{t('Chọn tour để xem thông tin chuyến đi.','Select a tour to view the trip details.')}</p></div></div>
          <div className={styles.toolbar}><div className={styles.filters}>{(['today','week','upcoming'] as const).map((value,index) => <button aria-pressed={filter === value} key={value} onClick={() => { setFilter(value); if(value==='today') setDay(dateKey(new Date())); }}>{[t('Hôm nay','Today'),t('Tuần này','This week'),t('Sắp khởi hành','Upcoming')][index]}</button>)}</div><input aria-label={t('Ngày xem lịch','Schedule date')} type="date" value={day} onChange={event => { if(event.target.value) {setDay(event.target.value);setFilter('today');} }}/></div>
          {loading ? <p role="status">{t('Đang tải lịch phân công…','Loading assignments…')}</p> : scheduleError ? <div role="alert"><p>{t('Không thể tải lịch phân công. Vui lòng thử lại.','Unable to load assignments. Please try again.')}</p><button onClick={() => setRetry(value => value+1)}>{t('Thử lại','Retry')}</button></div> : visible.length === 0 ? <p className={styles.empty}>{t('Bạn chưa có tour được phân công trong khoảng thời gian này.','You have no assigned tours in this period.')}</p> : <div className={styles.assignmentList}>{visible.map(item => <button className={styles.assignment} aria-pressed={active?.assignmentId === item.assignmentId} key={item.assignmentId} onClick={() => setSelected(item.assignmentId)}><CalendarDays/><span><strong>{displayTime(item.startAt)}</strong><small>{displayDate(item.startAt)}</small></span><span className={styles.tourTitle}><strong>{item.title}</strong><small><MapPin size={14}/>{item.meetingPoint}</small></span><span className={styles.badge}>{item.assignmentStatus === 'accepted' ? t('Đã tiếp nhận','Accepted') : t('Đã phân công','Assigned')}</span><span><Users size={16}/> {item.partySize}</span><ChevronRight size={18}/></button>)}</div>}
        </section>}
        <aside className={styles.sidebar}>
          {tab === 'profile' ? <section className={styles.card}><div className={styles.heading}><UserRound/><div><h2>{t('Hồ sơ của bạn','Your profile')}</h2><p>{t('Thông tin do công ty quản lý','Company-managed information')}</p></div></div><div className={styles.summary}><div className={styles.identity}><span>{initials}</span><div><strong>{profile?.displayName ?? session.displayName}</strong><small>{profile?.email ?? session.email}</small></div></div><dl><div><dt>{t('Vai trò','Role')}</dt><dd>{t('Hướng dẫn viên','Guide')}</dd></div><div><dt>{t('Ngôn ngữ','Language')}</dt><dd>{profile?.language === 'vi' ? t('Tiếng Việt','Vietnamese') : profile?.language === 'en' ? t('Tiếng Anh','English') : '—'}</dd></div><div><dt>{t('Khu vực hoạt động','Operating area')}</dt><dd>{profile?.operatingArea || t('Chưa cập nhật','Not provided')}</dd></div><div><dt>{t('Ngày tham gia','Joined')}</dt><dd>{profile?.joinedAt ? displayDate(profile.joinedAt) : '—'}</dd></div></dl></div></section> : null}
          <section className={styles.card}><div className={styles.heading}>{tab === 'profile' ? <CalendarDays/> : <Lightbulb/>}<div><h3>{tab === 'profile' ? t('Sẵn sàng cho chuyến đi tiếp theo?','Ready for your next trip?') : t('Thông tin liên hệ đã đầy đủ?','Are your contact details up to date?')}</h3><p>{tab === 'profile' ? t('Kiểm tra thời gian và điểm đón trước khi khởi hành.','Check departure times and meeting points before you set off.') : t('Cập nhật hồ sơ để điều phối viên có thể liên hệ với bạn.','Keep your profile up to date so your coordinator can reach you.')}</p></div></div><button className={styles.wide} onClick={() => leave(() => {setTab(tab === 'profile' ? 'schedule' : 'profile');setEditing(null);})}>{tab === 'profile' ? t('Xem lịch phân công','View assignments') : t('Xem thông tin cá nhân','View personal information')}<ArrowRight size={18}/></button></section>
          {tab === 'schedule' && <section className={styles.card}><h3>{t('Chuẩn bị trước chuyến đi','Before your tour')}</h3><p>{t('Kiểm tra lịch, điểm đón và yêu cầu của khách. Nếu cần thay đổi phân công, hãy liên hệ điều phối viên.','Check the schedule, meeting point and guest requirements. Contact your coordinator if your assignment needs to change.')}</p></section>}
        </aside>
      </div>
      {tab === 'schedule' && !loading && !scheduleError && active && <section className={`${styles.card} ${styles.detail}`} aria-labelledby="guide-detail-title"><div><div className={styles.heading}><Users/><div><h2 id="guide-detail-title">{t('Chi tiết tour được phân công','Assigned tour details')}</h2><p>{t('Thông tin dành cho chuyến đi bạn đang chọn.','Details for the tour you selected.')}</p></div></div><h3>{active.title}</h3><dl className={styles.facts}><div><dt><CalendarDays/>{t('Ngày khởi hành','Departure')}</dt><dd>{displayDate(active.startAt)}</dd></div><div><dt><Languages/>{t('Ngôn ngữ tour','Tour language')}</dt><dd>{active.language === 'vi' ? t('Tiếng Việt','Vietnamese') : t('Tiếng Anh','English')}</dd></div><div><dt><MapPin/>{t('Điểm đón','Meeting point')}</dt><dd>{active.meetingPoint}</dd></div><div><dt><Users/>{t('Số khách','Guests')}</dt><dd>{active.partySize}</dd></div><div><dt><Clock3/>{t('Thời gian','Time')}</dt><dd>{displayTime(active.startAt)}{active.endAt ? ` – ${displayTime(active.endAt)}` : ''}</dd></div><div><dt><FileText/>{t('Yêu cầu đặc biệt','Guest requirements')}</dt><dd>{[...active.dietaryFlags,...active.mobilityFlags].map(flag => flag === 'halal' ? 'Halal' : flag === 'vegetarian' ? t('Ăn chay','Vegetarian') : t('Lối đi không bậc','Step-free access')).join(', ') || t('Chưa ghi nhận yêu cầu đặc biệt','No special requirements recorded')}</dd></div></dl></div><div className={styles.timeline}><h3>{t('Mốc thời gian chuyến đi','Trip schedule')}</h3><p><strong>{displayTime(active.startAt)}</strong><span>{t('Đón khách tại điểm hẹn','Meet your guests')}<small>{active.meetingPoint}</small></span></p>{active.endAt && <p><strong>{displayTime(active.endAt)}</strong><span>{t('Kết thúc tour','Tour ends')}<small>{displayDate(active.endAt)}</small></span></p>}</div></section>}
    </div>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="guide-unsaved-title"><h2 id="guide-unsaved-title">{t('Bạn có thay đổi chưa lưu','You have unsaved changes')}</h2><p>{t('Bạn có chắc chắn muốn rời khỏi trang này? Những thay đổi chưa lưu sẽ bị bỏ.','Are you sure you want to leave? Your unsaved changes will be discarded.')}</p><div className={styles.actions}><button onClick={() => dialog.current?.close()}>{t('Ở lại','Stay')}</button><button className={styles.primary} onClick={() => {dialog.current?.close();dirtyRef.current=false;setEditing(null);nextAction.current?.();}}>{t('Đồng ý rời đi','Leave page')}</button></div></dialog>
  </div>;
}
