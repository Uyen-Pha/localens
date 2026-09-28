'use client';

import Link from './admin-prototype-navigation';
import {
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  History,
  Info,
  Map,
  Megaphone,
  Plus,
  Archive,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {MoneyInput} from '@/components/ui/money-input';
import {
  activeDepartures,
  AdminTourError,
  calendarDepartures,
  currentTour,
  type AdminTour,
  type AdminToursPort,
  type TourContent,
  type TourVersion,
} from '@/lib/application/admin-tours';
import {blankTour} from '@/lib/infrastructure/demo/admin-tours';
import b from './admin-accounts.module.css';
import s from './admin-tours.module.css';

const labels = {draft: 'Bản nháp', published: 'Đã xuất bản', archived: 'Đã lưu trữ'} as const;
const categories = ['Ẩm thực', 'Lịch sử & văn hóa', 'Chợ & đời sống', 'Làng nghề'];
const departureLabels = {scheduled: 'Đã lên lịch', sold_out: 'Hết chỗ', completed: 'Đã hoàn tất', cancelled: 'Đã hủy'} as const;
const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ';
const textFields: Array<[keyof TourContent, string]> = [
  ['name', 'Tên tour'], ['nameEn', 'Tên tour (tiếng Anh)'], ['pickup', 'Điểm đón'],
  ['pickupEn', 'Điểm đón (tiếng Anh)'], ['languages', 'Ngôn ngữ hướng dẫn'], ['imageUrl', 'Đường dẫn hình ảnh'], ['sourceUrl', 'Nguồn thông tin'],
];
const areaFields: Array<[keyof TourContent, string]> = [
  ['description', 'Mô tả ngắn'], ['descriptionEn', 'Mô tả ngắn (tiếng Anh)'], ['itinerary', 'Lịch trình'], ['itineraryEn', 'Lịch trình (tiếng Anh)'],
  ['included', 'Dịch vụ bao gồm'], ['includedEn', 'Dịch vụ bao gồm (tiếng Anh)'], ['excluded', 'Không bao gồm'], ['excludedEn', 'Không bao gồm (tiếng Anh)'],
  ['cancellation', 'Chính sách hủy'], ['cancellationEn', 'Chính sách hủy (tiếng Anh)'],
];

function Dialog({title, close, children}: {title: string; close: () => void; children: ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog) {
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    return () => dialog?.close?.();
  }, []);
  return <dialog ref={ref} aria-label={title} className={`${b.dialog} ${s.dialog}`} onCancel={(event) => { event.preventDefault(); close(); }}>
    <div className={b.dialogHead}><h2>{title}</h2><button aria-label="Đóng hộp thoại" onClick={close}><X size={20} /></button></div>{children}
  </dialog>;
}

function Photo({tour, compact = false}: {tour: TourContent; compact?: boolean}) {
  return tour.imageUrl ? <img className={compact ? s.cardPhoto : s.heroPhoto} src={tour.imageUrl} alt={`Ảnh minh họa ${tour.name}`} /> : <span className={compact ? s.cardPhotoPlaceholder : s.heroPhotoPlaceholder}><Map size={compact ? 22 : 30} /></span>;
}

function TourFields({draft, setDraft, fieldError, inline = false}: {draft: TourContent; setDraft: (next: TourContent) => void; fieldError: string; inline?: boolean}) {
  const update = (field: keyof TourContent, value: string | number) => setDraft({...draft, [field]: value});
  const error = (field: keyof TourContent) => fieldError === field ? <span className={b.fieldError} role="alert">Nội dung này cần được bổ sung hoặc kiểm tra lại.</span> : null;
  return <>
    <SectionNumber number="1" title="Thông tin cơ bản" subtitle="Tên, loại trải nghiệm, thời lượng và giá hiển thị cho khách." />
    <div className={s.fieldGrid}>
      {textFields.slice(0, 2).map(([field, label]) => <label key={field}>{label} <b>*</b><input aria-label={label} aria-invalid={fieldError === field} value={String(draft[field])} onChange={(event) => update(field, event.target.value)} />{error(field)}</label>)}
      <label>Loại trải nghiệm <b>*</b><select aria-label="Loại trải nghiệm của tour" value={draft.category} onChange={(event) => update('category', event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label>Thời lượng (phút) <b>*</b><input aria-label="Thời lượng (phút)" aria-invalid={fieldError === 'duration'} type="number" min={1} value={Number.isFinite(draft.duration) ? draft.duration : ''} onChange={(event) => update('duration', event.target.value === '' ? NaN : Number(event.target.value))} />{error('duration')}</label>
      <label>Giá (đồng) <b>*</b><MoneyInput aria-label="Giá (đồng)" aria-invalid={fieldError === 'price'} min={0} value={Number.isFinite(draft.price) ? draft.price : ''} onValueChange={(raw) => update('price', raw === '' ? NaN : Number(raw))} />{error('price')}</label>
      {textFields.slice(2).map(([field, label]) => <label key={field} className={field === 'imageUrl' ? s.full : undefined}>{label} {field !== 'sourceUrl' && <b>*</b>}<input aria-label={label} aria-invalid={fieldError === field} value={String(draft[field])} onChange={(event) => update(field, event.target.value)} />{error(field)}</label>)}
    </div>
    <SectionNumber number="2" title="Mô tả song ngữ" subtitle="Giới thiệu ngắn gọn để khách hiểu rõ trải nghiệm trước khi đặt tour." />
    <div className={s.fieldGrid}>
      {areaFields.slice(0, 2).map(([field, label]) => <label key={field}>{label} <b>*</b><textarea aria-label={label} aria-invalid={fieldError === field} value={String(draft[field])} onChange={(event) => update(field, event.target.value)} />{error(field)}</label>)}
      {textFields.slice(2, 4).map(([field, label]) => <label key={field}>{label} <b>*</b><input aria-label={label} aria-invalid={fieldError === field} value={String(draft[field])} onChange={(event) => update(field, event.target.value)} />{error(field)}</label>)}
    </div>
    <SectionNumber number="3" title="Lịch trình & dịch vụ" subtitle="Mỗi dòng là một mốc trong hành trình hoặc một điều kiện dịch vụ." />
    <div className={s.fieldGrid}>
      {areaFields.slice(2).map(([field, label]) => <label key={field} className={field === 'itinerary' || field === 'itineraryEn' ? s.full : undefined}>{label} <b>*</b><textarea aria-label={label} aria-invalid={fieldError === field} value={String(draft[field])} onChange={(event) => update(field, event.target.value)} />{error(field)}</label>)}
    </div>
    {!inline && <p className={s.formHint}>Tour mới được lưu ở trạng thái Bản nháp. Chỉ tour đã đủ nội dung Việt/Anh mới có thể xuất bản.</p>}
  </>;
}

function SectionNumber({number, title, subtitle}: {number: string; title: string; subtitle: string}) {
  return <div className={s.sectionTitle}><span className={s.sectionNumber}>{number}</span><div><h3>{title}</h3><p>{subtitle}</p></div></div>;
}

type Tab = 'info' | 'preview' | 'history';
type Modal = {kind: 'create'} | {kind: 'edit' | 'publish' | 'archive' | 'departures'; tour: AdminTour} | null;

export function AdminTours({port,revision=0}: {port: AdminToursPort;revision?:number}) {
  const [rows, setRows] = useState<AdminTour[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [tab, setTab] = useState<Tab>('info');
  const [modal, setModal] = useState<Modal>(null);
  const [modalDraft, setModalDraft] = useState<TourContent>({...blankTour});
  const [draft, setDraft] = useState<TourContent>({...blankTour});
  const [formError, setFormError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    port.list().then((items) => { if (!live) return; setRows(items); setSelectedId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id ?? ''); }).catch(() => { if (live) setError('Không thể tải danh sách tour. Vui lòng thử lại sau'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [port,revision]);

  const selected = rows.find((tour) => tour.id === selectedId) ?? null;
  const selectedContent = selected ? currentTour(selected) : null;
  useEffect(() => { if (selected) setDraft({...currentTour(selected)}); }, [selectedId]);
  const needsAttention = (tour: AdminTour) => Boolean(tour.draft) || activeDepartures(tour).some((departure) => departure.status === 'sold_out');
  const attention = rows.filter(needsAttention);
  const filtered = rows.filter((tour) => { const content = currentTour(tour); const haystack = [content.name, content.nameEn, content.pickup].join(' ').toLocaleLowerCase('vi'); return (!attentionOnly || needsAttention(tour)) && (!status || tour.status === status) && (!category || content.category === category) && haystack.includes(query.trim().toLocaleLowerCase('vi')); });

  async function refresh(preferredId = selectedId) {
    setLoading(true); setError('');
    try { const items = await port.list(); setRows(items); setSelectedId(items.some((item) => item.id === preferredId) ? preferredId : items[0]?.id ?? ''); }
    catch { setError('Không thể tải danh sách tour. Vui lòng thử lại sau'); }
    finally { setLoading(false); }
  }
  function resetFilters() { setQuery(''); setCategory(''); setStatus(''); setAttentionOnly(false); }
  function selectTour(tour: AdminTour) { setSelectedId(tour.id); setTab('info'); setFormError(''); setFieldError(''); setModal(null); }
  function openModal(next: Modal) { setModal(next); setModalDraft(next && 'tour' in next ? {...currentTour(next.tour)} : {...blankTour}); setFormError(''); setFieldError(''); }

  async function saveSelected() {
    if (!selected) { openModal({kind: 'create'}); return; }
    setBusy(true); setFormError(''); setFieldError('');
    try { await port.save(draft, selected.id); setNotice('Đã lưu phiên bản nháp. Phiên bản đang xuất bản trước đó vẫn được giữ nguyên.'); await refresh(selected.id); }
    catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Không thể lưu tour. Vui lòng thử lại sau'); if (reason instanceof AdminTourError) setFieldError(reason.field ?? ''); }
    finally { setBusy(false); }
  }
  async function submitModal(event: React.FormEvent) {
    event.preventDefault(); if (!modal || modal.kind === 'departures') return;
    setBusy(true); setFormError(''); setFieldError('');
    try {
      if (modal.kind === 'create' || modal.kind === 'edit') await port.save(modalDraft, modal.kind === 'edit' ? modal.tour.id : undefined);
      else if (modal.kind === 'publish') await port.publish(modal.tour.id);
      else await port.archive(modal.tour.id);
      setNotice(modal.kind === 'create' ? 'Đã tạo tour ở trạng thái Bản nháp.' : modal.kind === 'edit' ? 'Đã lưu phiên bản nháp.' : modal.kind === 'publish' ? 'Đã xuất bản phiên bản tour.' : 'Đã lưu trữ tour.');
      const preferred = modal.kind === 'create' ? selectedId : modal.tour.id; setModal(null); await refresh(preferred);
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Cập nhật tour thất bại. Vui lòng thử lại sau'); if (reason instanceof AdminTourError) setFieldError(reason.field ?? ''); }
    finally { setBusy(false); }
  }

  const versions: TourVersion[] = selected ? [selected.draft, selected.published, ...selected.history].filter(Boolean) as TourVersion[] : [];
  return <div className={s.shell}><main className={s.page}>
    <div className={s.breadcrumb}><Link href="/vi/admin/">Trang chủ</Link><ChevronRight size={15} /><span>Quản lý tour cố định</span>{selected && <><ChevronRight size={15} /><span className={s.breadcrumbCurrent}>Chỉnh sửa tour</span></>}</div>
     <header className={s.pageHeader}><div><h1>Quản lý tour cố định</h1><p>Tạo, xem, cập nhật, xuất bản hoặc lưu trữ tour.</p></div><div className={s.headerActions}><button className={s.secondaryButton} onClick={() => openModal({kind: 'create'})}><Plus size={18} />Tạo tour mới</button><button className={s.secondaryButton} disabled={!selected || busy} onClick={() => void saveSelected()}><FileText size={18} />Lưu nháp</button><button className={s.primaryButton} disabled={!selected || busy} onClick={() => void saveSelected()}><Check size={18} />Cập nhật</button>{selected && selected.status !== 'published' && <button className={s.publishButton} aria-label={`Xuất bản ${selectedContent?.name ?? ''}`} onClick={() => openModal({kind: 'publish', tour: selected})}><Megaphone size={18} />Xuất bản</button>}{selected?.status === 'published' && <button className={s.stopButton} aria-label={`Lưu trữ ${selectedContent?.name ?? ''}`} onClick={() => openModal({kind: 'archive', tour: selected})}><Archive size={18} />Lưu trữ</button>}</div></header>
    {notice && <div className={s.notice} role="status"><span>{notice}</span><button aria-label="Đóng thông báo" onClick={() => setNotice('')}><X size={16} /></button></div>}
    {formError && !modal && <div className={s.errorNotice} role="alert"><Info size={18} /><span>{fieldError ? `${fieldError}: ` : ''}{formError}</span></div>}
    <div className={s.summaryStrip}><span><strong>{rows.length}</strong> tour</span><span><i className={`${s.statusDot} ${s.greenDot}`} />{rows.filter((tour) => tour.status === 'published').length} đã xuất bản</span><span><i className={`${s.statusDot} ${s.blueDot}`} />{rows.filter((tour) => tour.status === 'draft').length} bản nháp</span><span><i className={`${s.statusDot} ${s.grayDot}`} />{rows.filter((tour) => tour.status === 'archived').length} đã lưu trữ</span></div>
    <div className={s.editorLayout}>
      <aside className={s.libraryPanel} aria-label="Danh sách tour cố định"><div className={s.libraryHeading}><div><h2>Danh sách tour</h2><span>{filtered.length} tour phù hợp</span></div><button className={s.iconButton} aria-label="Làm mới danh sách" onClick={() => void refresh()}><RotateCcw size={17} /></button></div><label className={s.searchBox}><Search size={18} /><input aria-label="Tìm kiếm tour" placeholder="Tìm kiếm tên tour, điểm đến..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className={s.filterRow}><select aria-label="Loại trải nghiệm" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Tất cả loại trải nghiệm</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Trạng thái tour" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></div><div className={s.filterTools}><button className={attentionOnly ? s.attentionActive : ''} onClick={() => setAttentionOnly((value) => !value)}><Bell size={15} />Cần chú ý {attention.length}</button>{(query || category || status || attentionOnly) && <button onClick={resetFilters}>Đặt lại</button>}</div>
        <div className={s.tourList}>{loading && <p className={s.emptyState}>Đang tải danh sách tour...</p>}{error && <div className={s.emptyState} role="alert"><p>{error}</p><button onClick={() => void refresh()}>Thử lại</button></div>}{!loading && !error && !filtered.length && <div className={s.emptyState}><p>Không có tour phù hợp</p><button onClick={resetFilters}>Đặt lại bộ lọc</button></div>}{!loading && !error && filtered.map((tour) => { const content = currentTour(tour); const count = calendarDepartures(tour).filter((departure) => departure.status === 'scheduled' || departure.status === 'sold_out').length; return <article className={`${s.tourCard} ${tour.id === selectedId ? s.tourCardSelected : ''}`} key={tour.id}><button className={s.tourCardMain} aria-label={`Xem ${content.name}`} aria-pressed={tour.id === selectedId} onClick={() => selectTour(tour)}><Photo tour={content} compact /><span className={s.tourCardCopy}><strong>{content.name}</strong><small><Map size={13} />{content.pickup || 'Chưa có điểm đón'}</small><small><CalendarDays size={13} />{Math.round(content.duration / 60)} giờ <em>·</em> {money(content.price)}</small></span></button><div className={s.tourCardFoot}><span className={`${s.statusChip} ${tour.status === 'draft' ? s.statusBlue : tour.status === 'archived' ? s.statusGray : s.statusGreen}`}><i />{labels[tour.status]}</span><button className={s.scheduleLink} onClick={() => openModal({kind: 'departures', tour})}>{count} lịch hoạt động</button></div></article>; })}</div><div className={s.listFooter}><span>Hiển thị {filtered.length} tour</span><span className={s.listPager}><button aria-label="Trang trước" disabled><ChevronLeft size={15} /></button><b>1</b><button aria-label="Trang sau" disabled><ChevronRight size={15} /></button></span></div>
      </aside>
      <section className={s.editorPanel} aria-label="Thông tin tour đang chọn">{!selected || !selectedContent ? <div className={s.emptyEditor}><Map size={44} /><h2>Chọn một tour để bắt đầu</h2><p>Thông tin chi tiết và các phiên bản của tour sẽ hiển thị tại đây.</p></div> : <><div className={s.editorHero}><Photo tour={selectedContent} /><div className={s.editorHeroCopy}><div className={s.editorTitleLine}><h2>{selectedContent.name}</h2><span className={`${s.statusChip} ${selected.status === 'draft' ? s.statusBlue : selected.status === 'archived' ? s.statusGray : s.statusGreen}`}><i />{labels[selected.status]}</span></div><p><Map size={15} />{selectedContent.pickup || 'Chưa có điểm đón'} <span>•</span><CalendarDays size={15} />{selectedContent.duration} phút <span>•</span><strong>{money(selectedContent.price)}</strong></p><small>Cập nhật {new Date(selected.updatedAt).toLocaleDateString('vi-VN')}</small></div><button className={s.previewIcon} title="Xem tour theo giao diện khách" onClick={() => setTab('preview')}><Eye size={18} />Xem trước</button></div><div className={s.tabs} role="tablist" aria-label="Các phần của tour"><button role="tab" aria-selected={tab === 'info'} className={tab === 'info' ? s.tabActive : ''} onClick={() => setTab('info')}><FileText size={17} />Thông tin chung</button><button role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? s.tabActive : ''} onClick={() => setTab('preview')}><Eye size={17} />Xem trước</button><button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? s.tabActive : ''} onClick={() => setTab('history')}><History size={17} />Lịch sử thay đổi</button></div>{tab === 'info' && <form className={s.editorForm} onSubmit={(event) => { event.preventDefault(); void saveSelected(); }} noValidate><TourFields draft={draft} setDraft={setDraft} fieldError={fieldError} inline /><div className={s.editorFooter}><span><Info size={16} />Lưu nháp để giữ nội dung; chỉ xuất bản sau khi kiểm tra đủ song ngữ.</span><div><button type="button" className={s.secondaryButton} disabled={busy} onClick={() => setDraft({...selectedContent})}>Hoàn tác</button><button type="submit" className={s.primaryButton} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</button></div></div></form>}{tab === 'preview' && <div className={s.previewPanel}><div className={s.previewCover}><Photo tour={selectedContent} /><div><span className={s.previewLabel}>BẢN XEM TRƯỚC CHO KHÁCH</span><h3>{selectedContent.name}</h3><p>{selectedContent.description}</p><span className={s.previewPrice}>{money(selectedContent.price)} <small>/ người</small></span></div></div><div className={s.previewGrid}><div><h4>Lịch trình</h4><p>{selectedContent.itinerary || 'Chưa bổ sung lịch trình.'}</p></div><div><h4>Điểm đón</h4><p>{selectedContent.pickup || 'Chưa bổ sung điểm đón.'}</p><h4>Ngôn ngữ</h4><p>{selectedContent.languages}</p></div></div><div className={s.previewNotice}><Info size={18} />Đây là bản xem trước nội dung đang chọn. Dữ liệu chỉ hiển thị cho khách sau khi tour được xuất bản.</div></div>}{tab === 'history' && <div className={s.historyPanel}><div className={s.historyIntro}><History size={22} /><div><h3>Lịch sử phiên bản</h3><p>Các phiên bản cũ được giữ lại để đối chiếu và truy vết thay đổi.</p></div></div>{versions.length ? versions.map((version, index) => <div className={s.historyItem} key={`${version.version}-${index}`}><span className={s.versionBadge}>v{version.version}.0</span><div><strong>{index === 0 && selected.draft ? 'Bản nháp hiện tại' : index === 0 && selected.published ? 'Phiên bản đang xuất bản' : 'Phiên bản lịch sử'}</strong><p>{version.name} · {money(version.price)}</p></div><button onClick={() => { setDraft({...version}); setTab('info'); }}>Mở để xem</button></div>) : <p className={s.emptyState}>Chưa có phiên bản lịch sử cho tour này.</p>}</div>}</>}</section>
    </div>
  </main>
  {modal && <Dialog title={modal.kind === 'create' ? 'Tạo tour mới' : modal.kind === 'edit' ? 'Chỉnh sửa phiên bản nháp' : modal.kind === 'publish' ? 'Xuất bản tour' : modal.kind === 'archive' ? 'Lưu trữ tour' : 'Lịch khởi hành của tour'} close={() => { if (!busy) setModal(null); }}>{modal.kind === 'departures' ? <div className={b.detail}><h3>{currentTour(modal.tour).name}</h3>{calendarDepartures(modal.tour).length ? <><p className={s.modalHint}><strong>{calendarDepartures(modal.tour).filter((departure) => departure.status === 'scheduled' || departure.status === 'sold_out').length} lịch đang nhận đặt</strong> · Hiển thị 14 lịch gần nhất</p>{calendarDepartures(modal.tour).slice(0, 14).map((departure) => <div key={departure.id} className={s.departureRow}><CalendarDays size={18} /><span>{departure.date}</span><strong>{departureLabels[departure.status]}</strong></div>)}{calendarDepartures(modal.tour).length > 14 && <p className={s.modalHint}>Còn {calendarDepartures(modal.tour).length - 14} lịch tiếp theo.</p>}</> : <p>Tour chưa có lịch khởi hành.</p>}<p className={s.modalHint}>Lịch hiển thị từ dữ liệu mẫu quản trị; các lịch đã hết chỗ vẫn được giữ để theo dõi.</p></div> : modal.kind === 'publish' || modal.kind === 'archive' ? <form className={b.form} onSubmit={submitModal} noValidate>{modal.kind === 'archive' && activeDepartures(modal.tour).length ? <><p className={b.formError} role="alert">Không thể lưu trữ. Tour còn {activeDepartures(modal.tour).length} lịch khởi hành ở trạng thái Đã lên lịch hoặc Đã hết chỗ. Vui lòng xử lý các lịch này trước.</p><button type="button" onClick={() => openModal({kind: 'departures', tour: modal.tour})}>Xem lịch khởi hành</button></> : <><p>Bạn muốn <strong>{modal.kind === 'publish' ? 'xuất bản' : 'lưu trữ'}</strong> tour <strong>{currentTour(modal.tour).name}</strong>?</p><p>{modal.kind === 'publish' ? 'Hệ thống sẽ kiểm tra nội dung Việt/Anh trước khi hiển thị tour cho khách.' : 'Tour sẽ không hiển thị cho khách và không nhận đơn mới. Dữ liệu liên quan vẫn được giữ nguyên.'}</p></>}{formError && <p className={b.formError} role="alert">{formError}</p>}<div className={b.dialogActions}><button type="button" disabled={busy} onClick={() => setModal(null)}>Hủy</button>{!(modal.kind === 'archive' && activeDepartures(modal.tour).length > 0) && <button className={b.create} disabled={busy} type="submit">{busy ? 'Đang xử lý...' : modal.kind === 'publish' ? 'Xác nhận xuất bản' : 'Xác nhận lưu trữ'}</button>}</div></form> : <form className={b.form} onSubmit={submitModal} noValidate><p>{modal.kind === 'create' ? 'Tour mới được lưu ở trạng thái Bản nháp. Bổ sung đầy đủ nội dung Việt/Anh trước khi xuất bản.' : 'Lưu nội dung vào bản nháp; phiên bản đang xuất bản trước đó vẫn được giữ nguyên.'}</p><TourFields draft={modalDraft} setDraft={setModalDraft} fieldError={fieldError} /><div className={b.dialogActions}><button type="button" disabled={busy} onClick={() => setModal(null)}>Hủy</button><button className={b.create} disabled={busy} type="submit">{busy ? 'Đang lưu...' : modal.kind === 'create' ? 'Lưu bản nháp' : 'Lưu thay đổi'}</button></div>{formError && <p className={b.formError} role="alert">{formError}</p>}</form>}</Dialog>}
  </div>;
}
