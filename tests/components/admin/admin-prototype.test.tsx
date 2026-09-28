import {fireEvent, render, screen, within} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import {AdminPrototype} from '@/components/admin/admin-prototype';

it('navigates to departures without persistence banners or network writes', async()=>{
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Prototype must not call a server'));
 render(<AdminPrototype/>);
 expect(screen.queryByRole('note')).not.toBeInTheDocument();
 fireEvent.click(within(screen.getByRole('navigation')).getByRole('button',{name:'Lịch khởi hành'}));
 expect(await screen.findByRole('heading',{name:'Quản lý lịch khởi hành'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:/Thêm lịch khởi hành/})).toBeEnabled();
 expect(screen.queryByRole('button',{name:/Cập nhật lịch|Sửa lịch/})).not.toBeInTheDocument();
 expect(network).not.toHaveBeenCalled();network.mockRestore();
});
