import type {BookingView} from './admin-bookings-preview';

export type ReportRequest = {
  id: string;
  submittedAt: string;
  status: string;
  quoted: boolean;
  bookingId?: string;
};

export type ReportMonth = {
  month: string;
  value: number;
  count: number;
  validCount: number;
  cancelled: number;
  requests: number;
  converted: number;
  guests: number;
};

export type ReportData = {
  bookings: BookingView[];
  requests: ReportRequest[];
  /** A deterministic monthly snapshot used to make the demo dashboard useful beyond the current fixture window. */
  monthly?: ReportMonth[];
};

export type ReportFilter = {from: string; to: string; kind: string};
export interface ReportPort {load(): Promise<ReportData>}

const toDay = (value: string) =>
  new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 10);

const within = (value: string, filter: ReportFilter) => {
  const day = toDay(value);
  return (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to);
};

const monthKey = (value: string) => value.slice(0, 7);

const monthDate = (value: string) => {
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
};

const monthRange = (bookings: BookingView[], filter: ReportFilter) => {
  const bookingMonths = bookings.map((booking) => monthKey(toDay(booking.createdAt))).sort();
  const start = monthKey(filter.from || bookingMonths[0] || '');
  const end = monthKey(filter.to || bookingMonths.at(-1) || '');
  if (!start || !end || start > end) return [];

  const months: string[] = [];
  const cursor = monthDate(start);
  const last = monthDate(end);
  while (cursor <= last) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
};

function monthRows(bookings: BookingView[], filter: ReportFilter): ReportMonth[] {
  const months = new Map<string, ReportMonth>();
  monthRange(bookings, filter).forEach((month) => {
    months.set(month, {
      month,
      value: 0,
      count: 0,
      validCount: 0,
      cancelled: 0,
      requests: 0,
      converted: 0,
      guests: 0,
    });
  });
  bookings.forEach((booking) => {
    const month = toDay(booking.createdAt).slice(0, 7);
    const row = months.get(month) ?? {
      month,
      value: 0,
      count: 0,
      validCount: 0,
      cancelled: 0,
      requests: 0,
      converted: 0,
      guests: 0,
    };
    row.count += 1;
    row.guests += booking.people;
    if (booking.payment === 'paid') row.value += booking.total;
    if (booking.status === 'confirmed' || booking.status === 'completed') row.validCount += 1;
    if (booking.status === 'cancelled') row.cancelled += 1;
    months.set(month, row);
  });
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function summarizeReports(data: ReportData, filter: ReportFilter) {
  const bookings = data.bookings.filter(
    (booking) => within(booking.createdAt, filter) && (!filter.kind || booking.kind === filter.kind),
  );
  const valid = bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed');
  const paid = bookings.filter((booking) => booking.payment === 'paid');
  const requests = filter.kind === 'fixed'
    ? []
    : data.requests.filter((request) => within(request.submittedAt, filter));
  const converted = requests.filter((request) =>
    bookings.some(
      (booking) =>
        booking.id === request.bookingId &&
        booking.kind === 'personalized' &&
        (booking.status === 'confirmed' || booking.status === 'completed'),
    ),
  ).length;

  const rank = new Map<string, number>();
  valid.forEach((booking) => rank.set(booking.tour, (rank.get(booking.tour) ?? 0) + 1));
  // Every panel must use the same filtered bookings. The monthly fixture is kept
  // for older demo data, but it must not replace the authoritative rows here:
  // doing so made the chart show a different business period from the KPIs.
  const months = monthRows(bookings, filter);
  const fixed = valid.filter((booking) => booking.kind === 'fixed');
  const personalized = valid.filter((booking) => booking.kind === 'personalized');
  const monthValue = months.reduce((sum, month) => sum + month.value, 0);
  const monthOrders = months.reduce((sum, month) => sum + month.count, 0);
  const monthGuests = months.reduce((sum, month) => sum + month.guests, 0);
  const lastMonth = months.at(-1);
  const previousMonth = months.at(-2);
  const growth = previousMonth?.value ? ((lastMonth!.value - previousMonth.value) / previousMonth.value) * 100 : null;
  const paidValid = valid.filter((booking) => booking.payment === 'paid');

  return {
    bookings,
    requests,
    validCount: valid.length,
    personalizedCount: personalized.length,
    fixedCount: fixed.length,
    fixedValue: fixed.reduce((sum, booking) => sum + booking.total, 0),
    personalizedValue: personalized.reduce((sum, booking) => sum + booking.total, 0),
    totalValue: valid.reduce((sum, booking) => sum + booking.total, 0),
    paidValue: paid.reduce((sum, booking) => sum + booking.total, 0),
    // A booking total includes the whole party. Showing the average ticket per
    // traveller is more useful for tour planning and matches the per-person
    // prices shown in the catalogue.
    averageOrderValue: valid.length ? valid.reduce((sum, booking) => sum + booking.total / Math.max(booking.people, 1), 0) / valid.length : 0,
    totalGuests: valid.reduce((sum, booking) => sum + booking.people, 0),
    // Pending, expired and cancelled orders are not payment attempts. Measure
    // success against valid orders so an order still being held cannot make a
    // healthy payment flow look like a failure.
    paymentSuccessRate: valid.length ? (paidValid.length / valid.length) * 100 : 0,
    paidValidCount: paidValid.length,
    cancelled: bookings.filter((booking) => booking.status === 'cancelled').length,
    top: [...rank].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi')),
    months,
    usingMonthlySnapshot: false,
    monthValue,
    monthOrders,
    monthGuests,
    growth,
    converted,
    conversion: requests.length ? (converted / requests.length) * 100 : 0,
    pending: requests.filter((request) => request.status === 'pending_review').length,
    approved: requests.filter((request) => request.status === 'approved').length,
    quoted: requests.filter((request) => request.quoted).length,
    payments: ['paid', 'pending', 'processing', 'failed', 'review'].map((status) => ({
      status,
      count: bookings.filter((booking) => booking.payment === status).length,
    })),
  };
}
