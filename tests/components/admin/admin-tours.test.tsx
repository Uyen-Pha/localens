import {render,screen,fireEvent,within,cleanup,waitFor} from '@testing-library/react';
import {describe,it,expect,afterEach} from 'vitest';
import {AdminTours} from '@/components/admin/admin-tours';
import {createDemoAdminToursPort} from '@/lib/infrastructure/demo/admin-tours';
describe('Fixed tour demo UI',()=>{
afterEach(cleanup);
 it('keeps editor values when opening and cancelling another dialog',async()=>{
 render(<AdminTours port={createDemoAdminToursPort()}/>);
 await screen.findByRole('button',{name:'Xem Dấu ấn Sài Gòn'});
 const input=screen.getByRole('textbox',{name:'Tên tour'});
 await waitFor(()=>expect(input).toHaveValue('Dấu ấn Sài Gòn'));
 fireEvent.change(input,{target:{value:'Nội dung đang sửa'}});
 expect(input).toHaveValue('Nội dung đang sửa');
 fireEvent.click(screen.getByRole('button',{name:'Tạo tour mới'}));
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Hủy'}));
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 expect(screen.getByRole('textbox',{name:'Tên tour'})).toHaveValue('Nội dung đang sửa');
 });
 it('blocks archiving active departures and omits management-rule card',async()=>{
 render(<AdminTours port={createDemoAdminToursPort()}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Lưu trữ Dấu ấn Sài Gòn'}));
 const d=screen.getByRole('dialog'); expect(within(d).getByRole('alert')).toHaveTextContent('Tour còn 2 lịch khởi hành');expect(within(d).queryByRole('button',{name:'Xác nhận lưu trữ'})).not.toBeInTheDocument();expect(screen.queryByRole('heading',{name:'Quy tắc quản lý'})).not.toBeInTheDocument();
 });
 it('searches and resets without removing tour data',async()=>{
 render(<AdminTours port={createDemoAdminToursPort()}/>);await screen.findByRole('button',{name:'Xem Dấu ấn Sài Gòn'});fireEvent.change(screen.getByRole('textbox',{name:'Tìm kiếm tour'}),{target:{value:'không-tồn-tại'}});expect(screen.getByText('Không có tour phù hợp')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Đặt lại'}));expect(screen.getByRole('button',{name:'Xem Dấu ấn Sài Gòn'})).toBeInTheDocument();
 });
});
