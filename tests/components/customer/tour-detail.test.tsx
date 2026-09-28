import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, it} from 'vitest';
import {RuntimeTourCatalog} from '@/components/customer/runtime-tour-catalog';
import {additionalPublishedTours} from '@/lib/application/fixed-tour/additions';
import type {FixedTourRuntimePort} from '@/lib/application/fixed-tour/contracts';
import type {LiveDepartureAvailability} from '@/lib/domain/data/contracts';
afterEach(cleanup);
const tour=additionalPublishedTours('vi')[0];
function mount(slug:string, departures:LiveDepartureAvailability[]=[]){
  const port={listPublishedTours:async()=>[tour],listAvailability:async()=>departures} as unknown as FixedTourRuntimePort;
  render(<RuntimeTourCatalog locale="vi" fixedTour={port} initialized={Promise.resolve()} tourSlug={slug}/>);
}
it('opens a standalone detail for a tour without departures',async()=>{
  mount('ll-f04');
  expect(await screen.findByRole('heading',{level:1,name:tour.title})).toBeVisible();
  expect(screen.getByText(tour.meetingPoint)).toBeVisible();
  expect(screen.getByRole('heading',{name:'Hành trình'})).toBeVisible();
  expect(screen.getByText('Chưa có lịch khởi hành khả dụng.')).toBeVisible();
  expect(screen.queryByRole('link',{name:'Đặt tour'})).toBeNull();
});
it('does not silently select another tour for an unknown slug',async()=>{
  mount('missing');
  expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy tour');
  expect(screen.getByRole('link',{name:'← Danh sách tour'}).getAttribute('href')?.replace(/\/$/,'')).toBe('/vi/tours');
});
it('offers only matching future open departures and preserves their identities',async()=>{
  const d:LiveDepartureAvailability={id:'real-id',tourVersionId:tour.versionId,startAt:'2099-01-01T00:00:00Z',endAt:'2099-01-01T06:00:00Z',status:'scheduled',remainingCapacity:8};
  mount(tour.slug,[d,{...d,id:'full',remainingCapacity:0},{...d,id:'cancelled',status:'cancelled'},{...d,id:'past',startAt:'2020-01-01T00:00:00Z'},{...d,id:'other',tourVersionId:'other'}]);
  const link=await screen.findByRole('link',{name:'Đặt tour'});
  expect(screen.getAllByRole('link',{name:'Đặt tour'})).toHaveLength(1);
  expect(link.getAttribute('href')?.replace('/?','?')).toBe('/vi/booking?departure=real-id&partySize=1');
  expect(screen.getByText('Còn 8 chỗ')).toBeVisible();
});
it('selects a daily departure by date without inventing availability',async()=>{
  const d:LiveDepartureAvailability={id:'first',tourVersionId:tour.versionId,startAt:'2099-01-01T00:00:00Z',endAt:'2099-01-01T06:00:00Z',status:'scheduled',remainingCapacity:8};
  mount(tour.slug,[d,{...d,id:'second',startAt:'2099-01-02T00:00:00Z'}]);
  const date=await screen.findByLabelText('Ngày khởi hành');
  fireEvent.change(date,{target:{value:'2099-01-02'}});
  expect(screen.getByRole('link',{name:'Đặt tour'}).getAttribute('href')).toContain('departure=second');
  fireEvent.change(date,{target:{value:'2099-01-03'}});
  expect(screen.queryByRole('link',{name:'Đặt tour'})).toBeNull();
});
