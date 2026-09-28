import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {RuntimeTourCatalog} from '@/components/customer/runtime-tour-catalog';
import {additionalPublishedTours} from '@/lib/application/fixed-tour/additions';
import type {FixedTourRuntimePort} from '@/lib/application/fixed-tour/contracts';
import type {LiveDepartureAvailability} from '@/lib/domain/data/contracts';

afterEach(cleanup);
const base=additionalPublishedTours('vi').map((tour,i)=>({...tour,id:`published-${i}`,versionId:`version-${i}`,slug:`published-${i}`,title:`Tour đã xuất bản ${i+1}`}));
function mount(departures:LiveDepartureAvailability[]=[]){
  const port={listPublishedTours:vi.fn(async()=>base),listAvailability:vi.fn(async()=>departures)} as unknown as FixedTourRuntimePort;
  render(<RuntimeTourCatalog locale="vi" fixedTour={port} initialized={Promise.resolve()}/>);
}
it('shows six unique cards with accessible itinerary details even without departures',async()=>{
  mount();
  await screen.findByRole('heading',{name:'Tour đã xuất bản 1'});
  const cards=screen.getAllByRole('article');
  expect(cards).toHaveLength(6);
  expect(new Set(cards.map(card=>within(card).getByRole('heading').textContent)).size).toBe(6);
  for(const [index,card] of cards.entries()){
    const toggle=within(card).getByText('Xem thông tin tour');
    fireEvent.click(toggle);
    expect(toggle.closest('details')).toHaveAttribute('open');
    const tour=[...base,...additionalPublishedTours('vi')][index];
    for(const label of ['Điểm hẹn','Hành trình','Bao gồm','Không bao gồm','Điều kiện hủy']){
      expect(within(card).getByText(label)).toBeVisible();
    }
    expect(within(card).getByText(tour.meetingPoint)).toBeVisible();
    expect(within(card).getByText(tour.cancellationPolicy)).toBeVisible();
    for(const text of [...tour.stops.map(stop=>stop.title),...tour.inclusions,...tour.exclusions]){
      expect(within(card).getAllByText(text).some(node=>node.closest('details'))).toBe(true);
    }
    expect(within(card).getByText('Chưa có lịch khởi hành')).toBeInTheDocument();
    expect(within(card).queryByRole('link',{name:'Đặt tour'})).not.toBeInTheDocument();
  }
});
it('selects the earliest eligible matching departure from an unsorted mixed list',async()=>{
  const valid:LiveDepartureAvailability={id:'later',tourVersionId:'version-0',startAt:'2099-02-01T00:00:00Z',endAt:'2099-02-01T06:00:00Z',status:'scheduled',remainingCapacity:8};
  mount([valid,{...valid,id:'another-tour',tourVersionId:'unrelated',startAt:'2099-01-01T00:00:00Z'},{...valid,id:'cancelled',status:'cancelled',startAt:'2099-01-01T00:00:00Z'},{...valid,id:'earliest',startAt:'2099-01-02T00:00:00Z'}]);
  const link=await screen.findByRole('link',{name:'Đặt tour'});
  expect(new URL(link.getAttribute('href')!,'https://localens.test').searchParams.get('departure')).toBe('earliest');
});
it.each(['cancelled','sold-out','past'] as const)('does not expose a booking link for %s departure',async kind=>{
  mount([{id:'departure-1',tourVersionId:'version-0',startAt:kind==='past'?'2020-01-01T00:00:00Z':'2099-01-01T00:00:00Z',endAt:'2099-01-01T06:00:00Z',status:kind==='cancelled'?'cancelled':'scheduled',remainingCapacity:kind==='sold-out'?0:8}]);
  await screen.findByRole('heading',{name:'Tour đã xuất bản 1'});
  expect(screen.queryAllByRole('link').filter(link=>/\/booking(?:\/|\?)/.test(link.getAttribute('href')??''))).toHaveLength(0);
});
it('keeps the real departure identity in the available booking link',async()=>{
  mount([{id:'actual-departure',tourVersionId:'version-0',startAt:'2099-01-01T00:00:00Z',endAt:'2099-01-01T06:00:00Z',status:'scheduled',remainingCapacity:8}]);
  const href=(await screen.findByRole('link',{name:'Đặt tour'})).getAttribute('href')!;
  const url=new URL(href,'https://localens.test');
  expect(url.pathname.replace(/\/$/,'')).toBe('/vi/booking');
  expect(url.searchParams.get('departure')).toBe('actual-departure');
  expect(url.searchParams.get('partySize')).toBe('1');
});
