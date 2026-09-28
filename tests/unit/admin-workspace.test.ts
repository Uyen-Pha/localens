import {expect,it} from 'vitest';
import {createAdminPrototypeWorkspace} from '@/lib/infrastructure/demo/admin-workspace';
it('shares publication, immutable departures and archive eligibility without a server',async()=>{
 const workspace=createAdminPrototypeWorkspace();
 const original=(await workspace.tours.list())[0];
 await workspace.tours.save({...original.published!,name:'Tour mẫu mới'});
 const added=(await workspace.tours.list()).at(-1)!;
 const input={id:'new-departure',tourId:added.id,version:'v1.0',date:'2099-10-10',start:'08:00',end:'12:00',capacity:15,held:0,booked:0,status:'scheduled' as const};
 await expect(workspace.create(input)).rejects.toThrow('xuất bản');
 await workspace.tours.publish(added.id);
 await workspace.create(input);
 await expect(workspace.tours.archive(added.id)).rejects.toThrow('lịch khởi hành');
 expect((await workspace.tours.list()).at(-1)?.departures).toHaveLength(1);
 workspace.cancel(input.id);
 expect((await workspace.tours.list()).at(-1)?.calendarDepartures?.[0].status).toBe('cancelled');
 await workspace.tours.archive(added.id);
 expect((await workspace.tours.list()).at(-1)?.status).toBe('archived');
 expect(workspace.departures().find(d=>d.id===input.id)).toMatchObject({capacity:15,start:'08:00',end:'12:00',status:'cancelled'});
});
