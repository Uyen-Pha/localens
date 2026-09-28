import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {RuntimeTourCatalog} from '@/components/customer/runtime-tour-catalog';
import {additionalPublishedTours} from '@/lib/application/fixed-tour/additions';
import type {FixedTourRuntimePort} from '@/lib/application/fixed-tour/contracts';
import type {LiveDepartureAvailability} from '@/lib/domain/data/contracts';
import {emptyTourSearch, filterTours} from '@/lib/application/fixed-tour/search';

afterEach(cleanup);
it.each([
  ['under300k',['299999']],
  ['300to600k',['300000','599999']],
  ['600to1m',['600000','999999']],
  ['from1m',['1000000','1990000']],
] as const)('respects recovered budget boundaries for %s',(budget,expected)=>{
  const priced=['299999','300000','599999','600000','999999','1000000','1990000'].map(priceVndMinor=>({...additionalPublishedTours('vi')[0],priceVndMinor}));
  expect(filterTours(priced,{...emptyTourSearch,budget}).map(t=>t.priceVndMinor)).toEqual(expected);
});
const base=additionalPublishedTours('vi').map((tour,i)=>({...tour,id:`published-${i}`,versionId:`version-${i}`,slug:`published-${i}`,title:`Tour đã xuất bản ${i+1}`}));
function mount(departures:LiveDepartureAvailability[]=[]){
  const port={listPublishedTours:vi.fn(async()=>base),listAvailability:vi.fn(async()=>departures)} as unknown as FixedTourRuntimePort;
  render(<RuntimeTourCatalog locale="vi" fixedTour={port} initialized={Promise.resolve()}/>);
}
it('renders recovered tour-specific artwork and readable hours and minutes',async()=>{
  mount();
  await screen.findByRole('heading',{name:'Tour đã xuất bản 1'});
  const expectations=[['ll-f04-binh-tay-market.png','2 giờ'],['ll-f05-vot-coffee-tan-dinh.png','3 giờ 30 phút'],['ll-f06-ben-dinh.png','7 giờ 30 phút']];
  for(const [i,[filename,duration]] of expectations.entries()){
    const card=screen.getAllByRole('article')[i+3];
    expect(within(card).getByRole('img').getAttribute('src')).toContain(filename);
    expect(within(card).getByText(duration)).toBeInTheDocument();
  }
});
it('applies the restored budget choice to the visible catalog',async()=>{
  mount();
  await screen.findByRole('heading',{name:'Tour đã xuất bản 1'});
  fireEvent.change(screen.getByLabelText('Ngân sách / khách (VND)'),{target:{value:'under300k'}});
  fireEvent.click(screen.getByRole('button',{name:'Tìm kiếm'}));
  await screen.findByRole('button',{name:'Tìm kiếm'});
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(screen.queryByRole('heading',{name:'Sài Gòn đời thường: Cà phê vợt và Tân Định'})).not.toBeInTheDocument();
});
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
    expect(within(card).getAllByRole('link',{name:tour.title})).toHaveLength(2);
    expect(within(card).getAllByRole('link',{name:tour.title})[0].getAttribute('href')?.replace('/?','?')).toBe(`/vi/tours/detail?tour=${tour.slug}`);
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
  const link=await screen.findByRole('link',{name:'Chọn lịch khởi hành'});
  expect(link.getAttribute('href')?.replace('/?','?')).toBe('/vi/booking?departure=earliest&partySize=1');
});
it.each(['cancelled','sold-out','past'] as const)('does not expose a booking link for %s departure',async kind=>{
  mount([{id:'departure-1',tourVersionId:'version-0',startAt:kind==='past'?'2020-01-01T00:00:00Z':'2099-01-01T00:00:00Z',endAt:'2099-01-01T06:00:00Z',status:kind==='cancelled'?'cancelled':'scheduled',remainingCapacity:kind==='sold-out'?0:8}]);
  await screen.findByRole('heading',{name:'Tour đã xuất bản 1'});
  expect(screen.queryAllByRole('link').filter(link=>/\/booking(?:\/|\?)/.test(link.getAttribute('href')??''))).toHaveLength(0);
});
it('opens the existing combined detail and booking page directly from title image and CTA',async()=>{
  mount([{id:'actual-departure',tourVersionId:'version-0',startAt:'2099-01-01T00:00:00Z',endAt:'2099-01-01T06:00:00Z',status:'scheduled',remainingCapacity:8}]);
  const href=(await screen.findByRole('link',{name:'Chọn lịch khởi hành'})).getAttribute('href')!;
  const url=new URL(href,'https://localens.test');
  expect(url.pathname.replace(/\/$/,'')).toBe('/vi/booking');
  expect(url.searchParams.get('departure')).toBe('actual-departure');
  expect(url.searchParams.get('partySize')).toBe('1');
  for(const link of screen.getAllByRole('link',{name:'Tour đã xuất bản 1'})) expect(link.getAttribute('href')).toBe(href);
});
