import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { reviewedDataset } from '@/components/dev/reviewed-tours';
import { reviewedDepartures } from '@/components/dev/reviewed-departures';
import type { ReviewedBooking } from '@/lib/infrastructure/supabase/reviewed-bookings';
import { forwardReviewedHttp } from './helpers/reviewed-http-guard.mjs';

type Locale = 'en' | 'vi';
type PersistedBooking = ReviewedBooking & { user_id: string; request_key: string };
const ownerEmail = 'customer.runtime@localens.test';
const otherEmail = 'customer-b.runtime-fixed-tour@localens.test';
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Reviewed local acceptance requires ${name}`);
  return value;
}
function client() {
  const url = new URL(required('NEXT_PUBLIC_SUPABASE_URL'));
  if (url.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname)
    || !url.port || url.port === '54321'
    || !/^localens-itinerary-[0-9a-f]{16}$/.test(required('LOCALENS_RUNTIME_ISOLATED_PROJECT_ID'))) {
    throw new Error('Reviewed acceptance requires an isolated loopback Supabase');
  }
  return createClient(url.origin, required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => {
      const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (target.origin !== url.origin || target.username || target.password) {
        throw new Error('Reviewed SDK request must stay on its owned loopback origin');
      }
      return fetch(input, { ...init, redirect: 'error' });
    } },
  });
}
async function fillSignIn(page: Page, locale: Locale, email: string, password: string) {
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel(locale === 'vi' ? 'Mật khẩu' : 'Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: locale === 'vi' ? 'Đăng nhập' : 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in\//);
}
function rpcResponse(page: Page, name: string) {
  return page.waitForResponse(response => new URL(response.url()).pathname === `/rest/v1/rpc/${name}`
    && response.request().method() === 'POST');
}

for (const locale of ['en', 'vi'] as const) {
  test(`${locale} approved reviewed booking: hold, declined retry, persisted own booking and second-user isolation`, async ({ page, browser, baseURL }) => {
    const vi = locale === 'vi';
    const tour = reviewedDataset.tours[0];
    const departure = reviewedDepartures(tour.departures[0], 0).find(row =>
      Date.parse(row.startAt) > Date.now() + 7 * 86400000 && row.startAt < '2027-01-01');
    expect(departure, 'Approved Sep–Dec 2026 fixture window exhausted; refresh fixtures explicitly, never fake the clock').toBeDefined();
    if (!departure) throw new Error('No future approved departure');
    const owner = client();
    const other = client();
    const otherContext = await browser.newContext({ baseURL, serviceWorkers: 'block' });
    const localOrigins = new Set([new URL(baseURL!).origin, new URL(required('NEXT_PUBLIC_SUPABASE_URL')).origin]);
    const blocked: string[] = [];
    const loadingErrors: string[] = [];
    page.on('pageerror', error => loadingErrors.push(error.message.slice(0, 300)));
    page.on('console', message => {
      if (message.type() === 'error' && /Content Security Policy|MIME type|ERR_|Refused to/i.test(message.text())) {
        loadingErrors.push(message.text().slice(0, 300));
      }
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      loadingErrors.push(`${url.origin}${url.pathname}: ${request.failure()?.errorText}`);
    });
    for (const context of [page.context(), otherContext]) {
      // Fulfilled documents lack a network address-space classification in Chrome.
      // Grant only this app origin access; HTTP/WS still enforce the two-origin list.
      await context.grantPermissions(['local-network-access'], { origin: new URL(baseURL!).origin });
      await context.routeWebSocket('**/*', socket => {
        const url = new URL(socket.url());
        const httpOrigin = `${url.protocol === 'wss:' ? 'https:' : 'http:'}//${url.host}`;
        if (localOrigins.has(httpOrigin)) socket.connectToServer();
        else { blocked.push(url.origin); socket.close(); }
      });
      await context.route('**/*', route => forwardReviewedHttp(route, localOrigins, blocked));
    }
    try {
      const auth = await owner.auth.signInWithPassword({ email: ownerEmail, password: required('LOCALENS_RUNTIME_CUSTOMER_PASSWORD') });
      expect(auth.error).toBeNull();
      const ownerId = auth.data.user!.id;
      const availability = await owner.rpc('reviewed_demo_availability');
      expect(availability.error).toBeNull();
      const before = availability.data.find((row: {departure_id: string}) => row.departure_id === departure.id);
      expect(before?.remaining).toBeGreaterThanOrEqual(2);

      await page.goto(`/${locale}/tours/`);
      try {
        await expect(page.getByRole('link', { name: tour.translations[locale].title, exact: true }).first()).toBeVisible();
      } catch (error) {
        console.error('Reviewed catalog loading diagnostics:', JSON.stringify({ blocked, loadingErrors }));
        throw error;
      }
      // Explicit approved departure intent must survive password sign-in.
      const bookingPath = `/${locale}/booking/?departure=${departure.id}&partySize=2`;
      await page.goto(bookingPath);
      await expect(page.getByRole('heading', { name: tour.translations[locale].title, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: vi ? 'Số người 2' : 'Travelers 2', exact: true })).toBeVisible();
      await page.getByRole('button', { name: vi ? 'Đặt tour' : 'Book tour', exact: true }).click();
      await expect(page).toHaveURL(/\/sign-in\/\?returnTo=/);
      expect(new URL(page.url()).searchParams.get('returnTo')).toBe(bookingPath);
      await fillSignIn(page, locale, ownerEmail, required('LOCALENS_RUNTIME_CUSTOMER_PASSWORD'));
      await expect(page).toHaveURL(new URL(bookingPath, baseURL).href);
      await expect(page.getByRole('button', { name: vi ? 'Số người 2' : 'Travelers 2', exact: true })).toBeVisible();
      await expect(page.locator(`time[datetime="${departure.startAt}"]`)).toBeVisible();
      await expect(page.getByLabel(vi ? 'Tổng tiền' : 'Total', { exact: true })).toContainText(vi ? '1.580.000' : '60.77');
      // The app hard-navigates immediately after begin. Buffer the real local RPC
      // body before forwarding it, so Chromium cannot discard it on navigation.
      const beginURL = `${required('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/rpc/reviewed_demo_begin`;
      let captureHold!: (value: { ok: boolean; request: unknown; booking: PersistedBooking }) => void;
      let rejectHold!: (error: unknown) => void;
      const holdResponse = new Promise<{ ok: boolean; request: unknown; booking: PersistedBooking }>((resolve, reject) => {
        captureHold = resolve; rejectHold = reject;
      });
      await page.route(beginURL, async route => {
        try {
          await forwardReviewedHttp(route, localOrigins, blocked, async response => {
            const booking = await response.json();
            captureHold({ ok: response.ok(), request: route.request().postDataJSON(), booking });
          });
          if (blocked.length) rejectHold(new Error(blocked.join('; ')));
        } catch (error) { rejectHold(error); await route.abort(); }
      });
      await page.getByRole('button', { name: vi ? 'Đặt tour' : 'Book tour', exact: true }).click();
      const held = await holdResponse;
      expect(held.ok).toBe(true);
      expect(held.request).toEqual({ p_departure: departure.id, p_size: 2, p_key: expect.any(String) });
      const booking = held.booking;
      expect(booking).toMatchObject({ user_id: ownerId, departure_id: departure.id, party_size: 2, total_vnd: 1580000, status: 'pending_payment', paid_at: null });
      expect(Date.parse(booking.expires_at) - Date.parse(booking.created_at)).toBe(15 * 60000);
      await expect(page).toHaveURL(new RegExp(`/payment-preview/\\?booking=${booking.id}`));
      const paymentURL = page.url();
      const readResponse = rpcResponse(page, 'reviewed_demo_read');
      await page.reload();
      const read = await readResponse;
      expect(read.ok()).toBe(true);
      expect(read.request().postDataJSON()).toEqual({ p_booking: booking.id });
      expect(await read.json()).toMatchObject({ id: booking.id, status: 'pending_payment', party_size: 2, total_vnd: 1580000 });
      await expect(page.getByRole('heading', { name: vi ? 'Hoàn tất chuyến đi của bạn' : 'Complete your trip' })).toBeVisible();
      const persistedHold = await owner.rpc('reviewed_demo_read', { p_booking: booking.id });
      expect(persistedHold.error).toBeNull();
      expect(persistedHold.data).toHaveLength(1);
      expect(persistedHold.data[0]).toMatchObject({ id: booking.id, user_id: ownerId, status: 'pending_payment', total_vnd: 1580000 });

      await page.getByLabel(vi ? 'Họ và tên' : 'Full name', { exact: true }).fill('Local Reviewed Traveler');
      await page.getByLabel(vi ? 'Số điện thoại' : 'Phone number', { exact: true }).fill('0901234567');
      for (const index of [1, 2]) await page.getByLabel(vi ? `Họ và tên hành khách ${index}` : `Traveler ${index} full name`, { exact: true }).fill(`Local Traveler ${index}`);
      await page.getByLabel(vi ? 'Chọn thẻ thử' : 'Choose a test card').selectOption('declined');
      const declinedResponse = rpcResponse(page, 'reviewed_demo_checkout');
      await page.getByRole('button', { name: vi ? 'Xác nhận thanh toán' : 'Confirm payment', exact: true }).click();
      const declined = await declinedResponse;
      expect(declined.ok()).toBe(true);
      expect(await declined.json()).toMatchObject({ id: booking.id, status: 'pending_payment', payment_status: 'failed', paid_at: null });
      await expect(page.getByRole('alert').filter({ hasText: vi ? 'Thẻ thử bị từ chối' : 'Test card declined' })).toBeVisible();
      await page.getByLabel(vi ? 'Chọn thẻ thử' : 'Choose a test card').selectOption('success');
      const paidResponse = rpcResponse(page, 'reviewed_demo_checkout');
      await page.getByRole('button', { name: vi ? 'Xác nhận thanh toán' : 'Confirm payment', exact: true }).click();
      const paid = await paidResponse;
      expect(paid.ok()).toBe(true);
      const payload = paid.request().postDataJSON();
      expect(payload).toEqual({ p_booking: booking.id, p_details: { name: 'Local Reviewed Traveler', email: ownerEmail, phone: '0901234567', passengers: ['Local Traveler 1', 'Local Traveler 2'], outcome: 'success' } });
      const confirmed = await paid.json();
      expect(confirmed).toMatchObject({ id: booking.id, status: 'confirmed', payment_status: 'paid', paid_at: expect.any(String) });
      await page.reload();
      await expect(page.getByRole('heading', { name: vi ? 'Thanh toán mô phỏng thành công' : 'Simulated payment successful' })).toBeVisible();
      await page.getByRole('link', { name: vi ? 'Xem đơn đặt tour' : 'View bookings', exact: true }).click();
      await expect(page.getByText(booking.id, { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText(booking.id, { exact: true })).toBeVisible();
      const saved = await owner.rpc('reviewed_demo_read');
      expect(saved.error).toBeNull();
      expect(saved.data.filter((row: {request_key: string}) => row.request_key === booking.request_key)).toHaveLength(1);
      expect(saved.data.find((row: {id: string}) => row.id === booking.id)).toMatchObject({ status: 'confirmed', payment_status: 'paid', paid_at: confirmed.paid_at, user_id: ownerId });
      const after = await owner.rpc('reviewed_demo_availability');
      expect(after.error).toBeNull();
      expect(after.data.find((row: {departure_id: string}) => row.departure_id === departure.id).remaining).toBe(before.remaining - 2);

      const otherAuth = await other.auth.signInWithPassword({ email: otherEmail, password: required('LOCALENS_RUNTIME_FIXED_TOUR_CUSTOMER_PASSWORD') });
      expect(otherAuth.error).toBeNull();
      expect(otherAuth.data.user!.id).not.toBe(ownerId);
      const deniedRead = await other.rpc('reviewed_demo_read', { p_booking: booking.id });
      expect(deniedRead.error).toBeNull();
      expect(deniedRead.data).toEqual([]);
      const deniedPay = await other.rpc('reviewed_demo_checkout', { p_booking: booking.id, p_details: payload.p_details });
      expect(deniedPay.error?.message).toContain('NOT_FOUND');
      const otherPage = await otherContext.newPage();
      await otherPage.goto(`/${locale}/sign-in/`);
      await fillSignIn(otherPage, locale, otherEmail, required('LOCALENS_RUNTIME_FIXED_TOUR_CUSTOMER_PASSWORD'));
      await otherPage.goto(paymentURL);
      await expect(otherPage.getByRole('alert').filter({ hasText: vi ? 'Không thể tải đơn đặt tour' : 'Unable to load your booking' })).toBeVisible();
      await expect(otherPage.getByRole('button', { name: vi ? 'Xác nhận thanh toán' : 'Confirm payment', exact: true })).toHaveCount(0);
      await otherPage.goto(`/${locale}/bookings/`);
      await expect(otherPage.getByRole('heading', { name: vi ? 'Bạn chưa có đơn đặt tour nào' : 'You have no bookings yet' })).toBeVisible();
      await expect(otherPage.getByText(booking.id, { exact: true })).toHaveCount(0);

      // Fresh browser storage forces password sign-in again; persistence is server-side.
      await page.context().clearCookies();
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      await page.goto(paymentURL);
      await expect(page).toHaveURL(/\/sign-in\//);
      await fillSignIn(page, locale, ownerEmail, required('LOCALENS_RUNTIME_CUSTOMER_PASSWORD'));
      // Payment-preview is not a safe automatic return target; revisit explicitly.
      await page.goto(paymentURL);
      await expect(page.getByRole('heading', { name: vi ? 'Thanh toán mô phỏng thành công' : 'Simulated payment successful' })).toBeVisible();
      const final = await owner.rpc('reviewed_demo_read', { p_booking: booking.id });
      expect(final.error).toBeNull();
      expect(final.data).toHaveLength(1);
      expect(final.data[0]).toMatchObject({ id: booking.id, user_id: ownerId, status: 'confirmed', paid_at: confirmed.paid_at, total_vnd: 1580000 });
      expect(blocked, 'No browser request may leave the owned loopback app/Supabase').toEqual([]);
    } finally {
      await Promise.allSettled([owner.auth.signOut(), other.auth.signOut()]);
      await otherContext.close();
    }
  });
}
