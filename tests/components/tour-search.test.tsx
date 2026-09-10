import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RuntimeTourCatalog } from '@/components/customer/runtime-tour-catalog';
import type { FixedTourRuntimePort } from '@/lib/application/fixed-tour/contracts';
import type { PublishedTour } from '@/lib/domain/data/contracts';
import { filterTours, emptyTourSearch } from '@/lib/application/fixed-tour/search';
afterEach(cleanup);
const tours = [{id:'1',versionId:'v1',slug:'heritage',locale:'vi',title:'Dấu ấn Sài Gòn',summary:'Di sản và cơm tấm',meetingPoint:'Bưu điện',durationMinutes:270,priceVndMinor:'790000',stops:[]},{id:'2',versionId:'v2',slug:'lantern',locale:'vi',title:'Chợ Lớn làm đèn',summary:'Lantern workshop',meetingPoint:'Chợ Lớn',durationMinutes:540,priceVndMinor:'1990000',stops:[]}] as unknown as PublishedTour[];
it('combines accent-insensitive keywords, price, duration and experience',()=>{
 expect(filterTours(tours,{...emptyTourSearch,keyword:'cho lon',experience:'craft',budget:'1to2m',duration:'full'})).toHaveLength(1);
 expect(filterTours(tours,{...emptyTourSearch,keyword:'cho lon',budget:'under1m'})).toHaveLength(0);
 expect(filterTours(tours,emptyTourSearch)).toHaveLength(2);
});
it('searches on submit, retains filters for empty results and clears them',async()=>{
 const port = {listPublishedTours:vi.fn().mockResolvedValue(tours),listAvailability:vi.fn().mockResolvedValue([])} as unknown as FixedTourRuntimePort;
 render(<RuntimeTourCatalog locale="vi" fixedTour={port} initialized={Promise.resolve()}/>);
 await screen.findByRole('heading',{name:'Dấu ấn Sài Gòn'});
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'không tồn tại'}});
 expect(screen.getByRole('heading',{name:'Dấu ấn Sài Gòn'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Tìm kiếm'}));
 await screen.findByRole('heading',{name:'Không có kết quả phù hợp'});
 expect(screen.getByRole('searchbox')).toHaveValue('không tồn tại');
 fireEvent.click(screen.getByRole('button',{name:'Xóa bộ lọc'}));
 await screen.findByRole('heading',{name:'Dấu ấn Sài Gòn'});
 fireEvent.change(screen.getByLabelText('Ngôn ngữ nội dung'),{target:{value:'en'}});
 fireEvent.click(screen.getByRole('button',{name:'Tìm kiếm'}));
 await screen.findByRole('heading',{name:'Dấu ấn Sài Gòn'});
 expect(port.listPublishedTours).toHaveBeenLastCalledWith('en');
});
it('keeps search controls visible after a service failure',async()=>{
 const port = {listPublishedTours:vi.fn().mockRejectedValue(new Error('offline')),listAvailability:vi.fn().mockResolvedValue([])} as unknown as FixedTourRuntimePort;
 render(<RuntimeTourCatalog locale="vi" fixedTour={port} initialized={Promise.resolve()}/>);
 await screen.findByRole('alert');
 expect(screen.getByRole('searchbox')).toBeInTheDocument();
});
