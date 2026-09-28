'use client';

import {reportsPreviewPort} from '@/components/dev/admin-reports-fixture';
import {paymentLabels} from '@/lib/application/admin-bookings-preview';
import {summarizeReports, type ReportData, type ReportPort} from '@/lib/application/admin-reports-preview';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle,
  Clock,
  FileText,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import Link from './admin-prototype-navigation';
import {useEffect, useState} from 'react';
import s from './admin-reports-preview.module.css';

const money = (value: number) =>
  new Intl.NumberFormat('vi-VN', {style: 'currency', currency: 'VND', maximumFractionDigits: 0}).format(value);
const compactMoney = (value: number) =>
  `${new Intl.NumberFormat('vi-VN', {maximumFractionDigits: 1}).format(value / 1_000_000)} triệu`;
const number = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
const percent = (value: number) => `${value.toLocaleString('vi-VN', {maximumFractionDigits: 1})}%`;
const monthLabel = (value: string) => {
  const [year, month] = value.split('-');
  return new Intl.DateTimeFormat('vi-VN', {month: 'short'}).format(new Date(Number(year), Number(month) - 1, 1));
};
const colors = ['#00956e', '#ffbd28', '#9565e5', '#fa555e', '#3288ee'];

export function AdminReportsPreview({port = reportsPreviewPort}: {port?: ReportPort}) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [from, setFrom] = useState('2026-04-01');
  const [to, setTo] = useState('2026-09-30');
  const [kind, setKind] = useState('');
  const [all, setAll] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      setData(await port.load());
    } catch {
      setData(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [port]);

  const setPeriod = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
  };
  const invalid = Boolean(from && to && from > to);
  const report = data && !invalid ? summarizeReports(data, {from, to, kind}) : null;
  const empty = Boolean(report && !report.bookings.length && !report.requests.length);
  let angle = 0;
  const segments = report?.payments
    .map((payment, index) => {
      const start = angle;
      angle += report.bookings.length ? (payment.count / report.bookings.length) * 100 : 0;
      return `${colors[index]} ${start}% ${angle}%`;
    })
    .join(',');
  const maxMonthValue = report ? Math.max(1, ...report.months.map((month) => month.value)) : 1;
  const metrics = report
    ? [
        {icon: Wallet, label: 'Tổng giá trị đơn đặt', value: money(report.totalValue), note: 'Đơn đã xác nhận / hoàn thành', color: colors[0]},
        {icon: Receipt, label: 'Tổng giá trị thanh toán', value: money(report.paidValue), note: 'Giao dịch đã thanh toán thành công', color: colors[1]},
        {icon: FileText, label: 'Đơn đặt tour hợp lệ', value: number(report.validCount), note: 'Đã xác nhận hoặc đã hoàn thành', color: colors[2]},
        {icon: XCircle, label: 'Số lượng đơn hủy', value: number(report.cancelled), note: 'Đơn ở trạng thái Đã hủy', color: colors[3]},
        {icon: TrendingUp, label: 'Giá trị bình quân/khách', value: money(report.averageOrderValue), note: 'Tính trên đơn hợp lệ', color: colors[4]},
        {icon: ShieldCheck, label: 'Tỷ lệ thanh toán thành công', value: percent(report.paymentSuccessRate), note: `${number(report.paidValidCount)}/${number(report.validCount)} đơn hợp lệ đã thanh toán`, color: '#087b67'},
      ]
    : [];
  const typeRows = report
    ? [
        {label: 'Tour cố định', count: report.fixedCount, value: report.fixedValue, color: '#008a70'},
        {label: 'Tour cá nhân hóa', count: report.personalizedCount, value: report.personalizedValue, color: '#9565e5'},
      ]
    : [];

  return (
    <div className={s.shell}>
      <main className={s.main}>
        <div className={s.header}>
          <div>
            <div className={s.eyebrow}>TRUNG TÂM PHÂN TÍCH</div>
            <h1>Báo cáo &amp; Thống kê</h1>
            <p>Theo dõi doanh thu mô phỏng, hiệu quả đặt tour và nhu cầu tour cá nhân hóa.</p>
          </div>
          <div className={s.headerBadge}>
            <CalendarDays size={17} />
            <span>{from && to ? `${from.split('-').reverse().join('/')} – ${to.split('-').reverse().join('/')}` : 'Toàn bộ thời gian'}</span>
          </div>
        </div>

        <div className={s.filters} aria-label="Bộ lọc báo cáo">
          <div className={s.periods} aria-label="Khoảng thời gian nhanh">
            <span>Khoảng nhanh</span>
            <button type="button" onClick={() => setPeriod('2026-04-01', '2026-09-30')}>6 tháng</button>
            <button type="button" onClick={() => setPeriod('2026-07-01', '2026-09-30')}>3 tháng</button>
            <button type="button" onClick={() => setPeriod('2026-09-01', '2026-09-30')}>Tháng này</button>
          </div>
          <label>
            Từ ngày
            <input aria-label="Từ ngày" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            Đến ngày
            <input aria-label="Đến ngày" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label>
            Loại tour
            <select aria-label="Loại tour" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="">Tất cả loại tour</option>
              <option value="fixed">Tour cố định</option>
              <option value="personalized">Tour cá nhân hóa</option>
            </select>
          </label>
          <button type="button" disabled={loading} onClick={() => void load()}>
            <RefreshCw size={17} />
            {loading ? 'Đang tải…' : 'Làm mới'}
          </button>
          <button type="button" onClick={() => {setFrom(''); setTo(''); setKind('');}}>Xóa bộ lọc</button>
        </div>

        {invalid ? (
          <p className={s.error} role="alert">Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.</p>
        ) : loading ? (
          <div className={s.empty} role="status">Đang tổng hợp dữ liệu báo cáo…</div>
        ) : error ? (
          <div className={s.empty} role="alert">
            Không thể tải dữ liệu báo cáo. Vui lòng thử lại sau
            <button type="button" onClick={() => void load()}>Thử lại</button>
          </div>
        ) : empty ? (
          <div className={s.empty}>
            Không có dữ liệu phù hợp
            <button type="button" onClick={() => {setFrom(''); setTo(''); setKind('');}}>Xem tất cả dữ liệu</button>
          </div>
        ) : report ? (
          <>
            <div className={s.metrics}>
              {metrics.map(({icon: Icon, label, value, note, color}) => (
                <article key={label}>
                  <Icon size={21} style={{color, background: `${color}15`}} />
                  <div>
                    <p>{label}</p>
                    <strong>{value}</strong>
                    <small>{note}</small>
                  </div>
                </article>
              ))}
            </div>

            <div className={s.summaryStrip}>
              <div><span>Giá trị theo chuỗi tháng</span><strong>{compactMoney(report.monthValue)}</strong><small>{number(report.monthOrders)} đơn trong các tháng đang chọn</small></div>
              <div><span>Tổng số khách</span><strong>{number(report.monthGuests || report.totalGuests)}</strong><small>Khách trong dữ liệu thống kê</small></div>
              <div><span>Đơn cá nhân hóa hợp lệ</span><strong>{number(report.personalizedCount)}</strong><small>{percent(report.conversion)} yêu cầu chuyển đổi</small></div>
              <div className={report.growth === null ? s.neutral : report.growth >= 0 ? s.positive : s.negative}>
                <span>Biến động tháng gần nhất</span>
                <strong>{report.growth === null ? '—' : `${report.growth >= 0 ? '+' : ''}${percent(report.growth)}`}</strong>
                <small>{report.growth === null ? 'Chưa đủ dữ liệu so sánh' : 'So với tháng liền trước'}</small>
                {report.growth !== null && (report.growth >= 0 ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />)}
              </div>
            </div>

            <div className={s.grid}>
              <section className={`${s.card} ${s.wide}`}>
                <div className={s.title}>
                  <div><h2><BarChart3 />Xu hướng thanh toán theo tháng</h2><p className={s.muted}>Giá trị thanh toán thành công và số đơn tạo theo từng tháng.</p></div>
                  <span className={s.legend}><i /> Giá trị (triệu đồng) <b /> Số đơn</span>
                </div>
                <div className={s.chart} aria-label="Biểu đồ thanh toán theo tháng">
                  {report.months.map((month) => (
                    <div key={month.month} className={s.chartColumn}>
                      <strong>{compactMoney(month.value)}</strong>
                      <div className={s.barTrack} title={`${monthLabel(month.month)}: ${money(month.value)}`}>
                        <div className={s.bar} style={{height: `${Math.max(month.value ? 7 : 0, (month.value / maxMonthValue) * 100)}%`}} />
                      </div>
                      <span>{monthLabel(month.month)}</span>
                      <small>{number(month.count)} đơn · {number(month.validCount)} hợp lệ</small>
                    </div>
                  ))}
                </div>
                <p className={s.chartNote}>Biểu đồ, KPI và bảng chi tiết đều được tính từ dữ liệu đơn trong bộ lọc hiện tại.</p>
              </section>

              <section className={s.card}>
                <div className={s.title}><h2><Star />Tour được đặt nhiều nhất</h2><button type="button" onClick={() => setAll(!all)}>{all ? 'Thu gọn' : 'Xem tất cả'}</button></div>
                {report.top.length ? (
                  <table className={s.ranking}>
                    <thead><tr><th>#</th><th>Tour</th><th>Số lượt</th><th aria-label="Tỷ lệ so với tour đứng đầu" /></tr></thead>
                    <tbody>{report.top.slice(0, all ? undefined : 5).map(([tour, count], index) => <tr key={tour}><td><span>{index + 1}</span></td><td>{tour}</td><td><strong>{count}</strong></td><td><progress max={report.top[0][1]} value={count} aria-label={`${tour}: ${count} lượt đặt`} /></td></tr>)}</tbody>
                  </table>
                ) : <p className={s.muted}>Chưa có đơn đã xác nhận hoặc hoàn thành trong kỳ.</p>}
              </section>

              <section className={s.card}>
                <div className={s.title}><h2><Users />Mức độ sử dụng tour cá nhân hóa</h2><span>Dữ liệu mẫu tổng hợp</span></div>
                {kind === 'fixed' ? <p className={s.muted}>Chỉ số yêu cầu cá nhân hóa không áp dụng khi lọc Tour cố định.</p> : <>
                  <div className={s.requestMetrics}>{[[FileText, report.requests.length, 'Tổng yêu cầu'], [Clock, report.pending, 'Chờ duyệt'], [CheckCircle, report.approved, 'Đã duyệt'], [Receipt, report.quoted, 'Đã có báo giá'], [Wallet, report.personalizedCount, 'Đơn hợp lệ']].map(([Icon, value, label], index) => {const MetricIcon = Icon as typeof FileText; return <article key={String(label)} style={{background: `${colors[index % colors.length]}0c`}}><MetricIcon size={19} style={{color: colors[index % colors.length]}} /><strong>{String(value)}</strong><small>{String(label)}</small></article>;})}</div>
                  <div className={s.conversion}><strong>Tỷ lệ chuyển đổi thành đơn đặt</strong><span>{report.converted} / {report.requests.length} yêu cầu</span><b>{percent(report.conversion)}</b><progress max="100" value={report.conversion} aria-label="Tỷ lệ chuyển đổi thành đơn đặt" /></div>
                </>}
              </section>

              <section className={s.card}>
                <div className={s.title}><h2><TrendingUp />Hiệu quả theo loại tour</h2><span className={s.cardLink}>Trong kỳ</span></div>
                <div className={s.typeRows}>{typeRows.map((row) => <div key={row.label} className={s.typeRow}><div className={s.typeLabel}><i style={{background: row.color}} /><span>{row.label}</span><strong>{number(row.count)} đơn</strong></div><div className={s.typeTrack}><div style={{width: `${report.validCount ? (row.count / report.validCount) * 100 : 0}%`, background: row.color}} /></div><small>{money(row.value)} · {report.totalValue ? percent((row.value / report.totalValue) * 100) : '0%'}</small></div>)}</div>
              </section>

              <section className={`${s.card} ${s.wide}`}>
                <div className={s.title}><div><h2><CalendarDays />Chi tiết theo tháng</h2><p className={s.muted}>Bảng đối chiếu đơn tạo, đơn hợp lệ, thanh toán và tỷ lệ hủy.</p></div><span className={s.cardLink}>{report.months.length} tháng</span></div>
                <div className={s.tableWrap}><table className={s.monthTable}><thead><tr><th>Tháng</th><th>Đơn tạo</th><th>Đơn hợp lệ</th><th>Thanh toán</th><th>Giá trị</th><th>Tỷ lệ hủy</th></tr></thead><tbody>{report.months.map((month) => <tr key={month.month}><th>{monthLabel(month.month)} {month.month.slice(0, 4)}</th><td>{number(month.count)}</td><td>{number(month.validCount)}</td><td>{compactMoney(month.value)}</td><td><strong>{money(month.value)}</strong></td><td><span className={month.cancelled ? s.warning : s.ok}>{month.count ? percent((month.cancelled / month.count) * 100) : '0%'}</span></td></tr>)}</tbody></table></div>
              </section>

              <section className={s.card}>
                <div className={s.title}><h2><CalendarDays />Trạng thái thanh toán đơn đặt</h2><Link href="/vi/admin/bookings/">Chi tiết</Link></div>
                <p className={s.muted}>Phân bố trên toàn bộ đơn trong kỳ; KPI phía trên tính tỷ lệ thành công trên đơn hợp lệ.</p>
                <div className={s.payment}><div className={s.donut} role="img" aria-label={`Phân bố thanh toán của ${report.bookings.length} đơn, ${report.validCount} đơn hợp lệ`} style={{background: report.bookings.length ? `conic-gradient(${segments})` : '#edf2f6'}}><div><strong>{report.bookings.length}</strong><span>đơn đặt</span><small>{report.validCount} hợp lệ</small></div></div><ul>{report.payments.map((payment, index) => <li key={payment.status}><i style={{background: colors[index]}} /><span>{paymentLabels[payment.status as keyof typeof paymentLabels]}</span><strong>{payment.count}</strong><small>{percent(report.bookings.length ? (payment.count / report.bookings.length) * 100 : 0)}</small></li>)}</ul></div>
              </section>
            </div>

          </>
        ) : null}

      </main>
    </div>
  );
}
