import {describe,it,expect} from 'vitest';
import {createDemoAdminToursPort} from '@/lib/infrastructure/demo/admin-tours';
describe('Admin fixed tour versions',()=>{
 it('preserves published version while updating one draft, then publishes an immutable snapshot',async()=>{
 const p=createDemoAdminToursPort(); const t=(await p.list())[0]; const original=structuredClone(t.published);
 await p.save({...t.published!,name:'Tên nháp'},t.id); let r=(await p.list())[0];
 expect(r.published).toEqual(original); expect(r.draft?.name).toBe('Tên nháp'); const v=r.draft?.version;
 await p.save({...r.draft!,name:'Tên nháp mới'},t.id); r=(await p.list())[0]; expect(r.draft?.version).toBe(v);
 await p.publish(t.id); r=(await p.list())[0]; expect(r.published?.name).toBe('Tên nháp mới'); expect(r.draft).toBeNull(); expect(r.history).toContainEqual(original);
 });
 it('blocks archiving active departures without mutation',async()=>{
 const p=createDemoAdminToursPort(); const t=(await p.list())[0]; await expect(p.archive(t.id)).rejects.toThrow('lịch khởi hành'); expect((await p.list())[0]).toEqual(t);
 });
 it('archives and republishes complete tours with no active departures',async()=>{
 const p=createDemoAdminToursPort(); const t=(await p.list())[2]; await p.archive(t.id); expect((await p.list())[2].status).toBe('archived'); await p.publish(t.id); expect((await p.list())[2].status).toBe('published');
 });
 it('blocks incomplete English content on publish but allows a named draft',async()=>{
 const p=createDemoAdminToursPort(); const t=(await p.list())[0]; await p.save({...t.published!,name:'Tour mới',descriptionEn:''}); const n=(await p.list()).at(-1)!;
 expect(n.status).toBe('draft'); await expect(p.publish(n.id)).rejects.toMatchObject({field:'descriptionEn'}); expect((await p.list()).at(-1)?.status).toBe('draft');
 });
 it('rejects invalid price without changing a draft',async()=>{
 const p=createDemoAdminToursPort(); const t=(await p.list())[1]; await expect(p.save({...t.draft!,price:-1},t.id)).rejects.toMatchObject({field:'price'}); expect((await p.list())[1]).toEqual(t);
 });
});
