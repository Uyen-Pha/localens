import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingSelectors } from '@/components/customer/booking-selectors';
import { DepartureCalendar } from '@/components/customer/departure-calendar';
import type { LiveDepartureAvailability } from '@/lib/domain/data/contracts';

const departure: LiveDepartureAvailability = {
  id: '11111111-1111-4111-8111-111111111111',
  tourVersionId: '22222222-2222-4222-8222-222222222222',
  startAt: '2026-10-02T09:00:00+07:00',
  endAt: '2026-10-02T13:00:00+07:00',
  status: 'scheduled', remainingCapacity: 30,
};
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('booking selection boundaries', () => {
  it('does not let the traveler selector exceed the 15-person booking limit', () => {
    const changed = vi.fn();
    render(<BookingSelectors locale="vi" departures={[departure]} selected={departure}
      price="790.000 VND" disabled={false} partySize="15" onPartyChange={changed} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name:'Số người 15'}));
    expect(screen.getByRole('button', {name:'Tăng số khách'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name:'Áp dụng'}));
    expect(changed).toHaveBeenCalledWith('15');
  });

  it('cannot apply a traveler count when refreshed availability has no seats', () => {
    const changed = vi.fn();
    const full = {...departure, remainingCapacity:0};
    render(<BookingSelectors locale="vi" departures={[full]} selected={full}
      price="790.000 VND" disabled={false} partySize="1" onPartyChange={changed} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name:'Số người 1'}));
    expect(screen.getByRole('button', {name:'Áp dụng'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name:'Áp dụng'}));
    expect(changed).not.toHaveBeenCalled();
  });

  it('lets a malformed initial traveler count recover to a valid selection', () => {
    const changed = vi.fn();
    render(<BookingSelectors locale="vi" departures={[departure]} selected={departure}
      price="790.000 VND" disabled={false} partySize="1.5" onPartyChange={changed} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name:'Số người 1.5'}));
    expect(screen.getByRole('button', {name:'Giảm số khách'})).toBeDisabled();
    expect(screen.getByRole('button', {name:'Áp dụng'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button', {name:'Áp dụng'}));
    expect(changed).toHaveBeenCalledWith('1');
  });

  it('blocks a stale draft after capacity drops and permits correcting it', () => {
    const changed = vi.fn();
    const props = {locale:'vi' as const, departures:[departure], selected:departure,
      price:'790.000 VND', disabled:false, partySize:'3', onPartyChange:changed, onSelect:vi.fn()};
    const {rerender} = render(<BookingSelectors {...props} />);
    fireEvent.click(screen.getByRole('button', {name:'Số người 3'}));
    rerender(<BookingSelectors {...props} selected={{...departure,remainingCapacity:2}} />);
    expect(screen.getByRole('button', {name:'Áp dụng'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name:'Giảm số khách'}));
    expect(screen.getByRole('button', {name:'Tăng số khách'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name:'Áp dụng'}));
    expect(changed).toHaveBeenCalledWith('2');
  });

  it('locks an already-open traveler panel while a booking is submitting', () => {
    const changed = vi.fn();
    const props = {locale:'vi' as const, departures:[departure], selected:departure,
      price:'790.000 VND', disabled:false, partySize:'2', onPartyChange:changed, onSelect:vi.fn()};
    const {rerender} = render(<BookingSelectors {...props} />);
    fireEvent.click(screen.getByRole('button', {name:'Số người 2'}));
    rerender(<BookingSelectors {...props} disabled />);
    for (const name of ['Áp dụng','Giảm số khách','Tăng số khách']) expect(screen.getByRole('button',{name})).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name:'Áp dụng'}));
    expect(changed).not.toHaveBeenCalled();
  });

  it('treats an offset timestamp as an instant, not a sortable string', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T02:30:00Z'));
    render(<DepartureCalendar locale="vi" departures={[departure]} selected={departure}
      price="790.000 VND" disabled={false} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', {name:/^2026-10-02,/})).toBeDisabled();
  });

  it('rechecks the departure time when an already-open calendar is clicked', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T01:59:59Z'));
    const selected = vi.fn();
    const utc = {...departure, startAt:'2026-10-02T02:00:00Z'};
    render(<DepartureCalendar locale="vi" departures={[utc]} selected={utc}
      price="790.000 VND" disabled={false} onSelect={selected} />);
    const day = screen.getByRole('button', {name:/^2026-10-02,/});
    expect(day).toBeEnabled();
    vi.setSystemTime(new Date('2026-10-02T02:00:00Z'));
    fireEvent.click(day);
    expect(selected).not.toHaveBeenCalled();
  });
});
