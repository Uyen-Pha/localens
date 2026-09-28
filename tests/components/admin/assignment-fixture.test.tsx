import {cleanup,fireEvent,render,screen,within,waitFor} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {AdminAssignmentsFixture} from '@/components/dev/admin-assignments-fixture';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('assigns a sample guide and refreshes counts without a server',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-09-26T00:00:00Z'));
 render(<AdminAssignmentsFixture/>);
 const table=await screen.findByRole('table');
 await screen.findByText('Khách sạn Windsor Plaza');
 fireEvent.click(within(table).getAllByRole('button',{name:'Xem và phân công'})[1]);
 fireEvent.click(screen.getByRole('radio',{name:/Trần Quốc Bảo/}));
 fireEvent.click(screen.getByRole('button',{name:'Xác nhận phân công'}));
 await screen.findByText('Phân công hướng dẫn viên thành công.');
 await waitFor(()=>expect(screen.getByRole('button',{name:/Chưa phân công/})).toHaveTextContent('6'));
 expect(screen.getByRole('button',{name:/Đã phân công/})).toHaveTextContent('14');
});
