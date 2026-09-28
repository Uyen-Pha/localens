import {render,screen,within} from '@testing-library/react';
import {expect,it} from 'vitest';
import {AdminDepartures} from '@/components/admin/admin-departures';
import {createAdminPrototypeWorkspace} from '@/lib/infrastructure/demo/admin-workspace';
it('keeps archived tour history visible but disallows creating departures',async()=>{
 const workspace=createAdminPrototypeWorkspace();
 const tour=(await workspace.tours.list())[0];
 for(const d of workspace.departures().filter(d=>d.tourId===tour.id&&['scheduled','sold_out'].includes(d.status)))workspace.cancel(d.id);
 await workspace.tours.archive(tour.id);
 render(<AdminDepartures workspace={workspace}/>);
 const selector=await screen.findByRole('combobox',{name:'Thay đổi tour'});
 expect(within(selector).getByRole('option',{name:tour.published!.name})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Thêm lịch khởi hành'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Xem chi tiết 2026-08-03'})).toBeEnabled();
});
