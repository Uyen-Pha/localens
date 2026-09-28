import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {AdminAccounts} from '@/components/admin/admin-accounts';
const row={id:'1',name:'Nguyễn Minh Anh',email:'anh@example.test',phone:'0901234567',role:'guide' as const,status:'active' as const,createdAt:'2026-09-10T00:00:00Z',history:[]};
describe('Admin accounts',()=>{
 it('filters and shows empty state without the removed role card',async()=>{
 render(<AdminAccounts port={{list:async()=>[row],createGuide:vi.fn(),setLocked:vi.fn()}}/>);
 expect(await screen.findByText('anh@example.test')).toBeInTheDocument();
 expect(screen.queryByText('Vai trò trong hệ thống')).not.toBeInTheDocument();
 fireEvent.change(screen.getByPlaceholderText('Tìm tên hoặc email...'),{target:{value:'nobody'}});
 expect(screen.getByText('Không có tài khoản phù hợp')).toBeInTheDocument();
 });
 it('requires a lock reason and cancel never mutates',async()=>{
 const lock=vi.fn();render(<AdminAccounts port={{list:async()=>[row],createGuide:vi.fn(),setLocked:lock}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Khóa Nguyễn Minh Anh'}));
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận khóa'}));
 expect(lock).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Lý do khóa'),{target:{value:'Kiểm tra tài khoản'}});
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận khóa'}));
 await waitFor(()=>expect(lock).toHaveBeenCalledWith('1',true,'Kiểm tra tài khoản'));
 });
});
