import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {BookingLocalPreview} from '@/components/dev/booking-local-preview';
import {bookingDepartures} from '@/components/customer/reviewed-booking-rules';
vi.mock('@/components/portals/portal-session',()=>({loadPortalSurfaceComposition:async()=>({mode:'supabase',initialized:Promise.resolve(),reviewedBookings:{availability:async()=>[{departure_id:'d1800000-0000-4000-8000-000000421018',remaining:7},{departure_id:'d1800000-0000-4000-8000-000000424013',remaining:15}]}})}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('catalog exposes daily departures already present in the backend instead of only old base dates',async()=>{
  vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-09-28T00:00:00Z'));
  render(<BookingLocalPreview locale="vi" catalog/>);
  expect(await screen.findAllByRole('link',{name:'Chọn lịch khởi hành'})).toHaveLength(2);
});
it('recognizes an existing additional tour departure across booking and payment presentation',()=>{
  const match=bookingDepartures.find(x=>x.departure.id==='d1800000-0000-4000-8000-000000424013');
  expect(match?.tour.translations.vi.title).toBe('Dạo Chợ Lớn: Chợ Bình Tây và bữa cơm địa phương');
  expect(match?.departure.startAt).toBe('2026-09-29T03:00:00.000Z');
});
