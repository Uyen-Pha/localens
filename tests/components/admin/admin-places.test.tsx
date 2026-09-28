import {render,screen,fireEvent} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {AdminPlaces} from '@/components/admin/admin-places';
describe('Admin places',()=>{
 it('has draft creation and no category explanation card',async()=>{
 render(<AdminPlaces port={{list:async()=>[],save:vi.fn(),setStatus:vi.fn()}}/>);
 expect(await screen.findByText('Không có địa điểm phù hợp')).toBeInTheDocument();
 expect(screen.queryByRole('heading',{name:'Loại trải nghiệm'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Thêm địa điểm mới'}));
 expect(screen.getByText('Địa điểm mới được lưu ở trạng thái Bản nháp.')).toBeInTheDocument();
 expect(screen.getByRole('textbox',{name:'Nguồn thông tin'})).toBeInTheDocument();
 });
});
