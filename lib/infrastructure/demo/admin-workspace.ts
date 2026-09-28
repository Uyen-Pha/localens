import {createDemoAdminToursPort} from './admin-tours';
import {createDeparture,cancelDeparture,type Departure} from '@/lib/application/admin-departures';
import {type AdminToursPort} from '@/lib/application/admin-tours';

/** Isolated in-memory prototype; never calls the runtime or persists data. */
export function createAdminPrototypeWorkspace(changed:()=>void=()=>{}){
 const base=createDemoAdminToursPort(id=>rows.some(d=>d.tourId===id&&['scheduled','sold_out'].includes(d.status)));
 let rows:Departure[]=[];
 const ready=base.list().then(tours=>{
  rows=tours.filter(t=>t.status==='published').flatMap((t,i)=>Array.from({length:12},(_,n)=>{
   const cycle=n%4,status=cycle===1?'sold_out':cycle===2?'cancelled':n<4?'completed':'scheduled';
   return {id:`sample-${t.id}-${n}`,tourId:t.id,version:`v${t.published!.version}.0`,date:`2026-${String(8+Math.floor(n/4)).padStart(2,'0')}-${String(3+n%4*7).padStart(2,'0')}`,start:'08:00',end:i===1?'17:00':'13:30',capacity:15,held:status==='scheduled'?2:0,booked:status==='sold_out'?15:status==='completed'?12:status==='scheduled'?10:0,status} as Departure;
  }));
 });
 const tours:AdminToursPort={
  async list(){await ready;return (await base.list()).map(t=>{const departures=rows.filter(d=>d.tourId===t.id).map(d=>({id:d.id,date:`${d.date} ${d.start}`,status:d.status}));return {...t,departures,calendarDepartures:departures};});},
  async save(data,id){await base.save(data,id);changed();},
  async publish(id){await base.publish(id);changed();},
  async archive(id){
   await ready;
   if(rows.some(d=>d.tourId===id&&['scheduled','sold_out'].includes(d.status)))throw Error('Tour còn lịch khởi hành đang hoạt động');
   // The base fixture owns versions; departure eligibility belongs to this shared store.
   const tour=(await base.list()).find(t=>t.id===id);
   if(!tour||tour.status!=='published')throw Error('Chỉ tour đã xuất bản mới có thể lưu trữ');
   await base.archive(id);changed();
  }
 };
 return {tours,ready,departures:()=>structuredClone(rows),
  async create(input:Departure){
   await ready;
   const t=(await base.list()).find(t=>t.id===input.tourId);
   if(!t||t.status!=='published'||!t.published)throw Error('Chỉ tạo lịch cho tour đã xuất bản');
   const next=createDeparture({...input,version:`v${t.published.version}.0`});
   if(rows.some(d=>d.tourId===next.tourId&&d.date===next.date&&d.start===next.start&&d.status!=='cancelled'))throw Error('Tour đã có lịch khởi hành vào thời điểm này');
   rows=[next,...rows];changed();
  },
  cancel(id:string){const current=rows.find(d=>d.id===id);if(!current)throw Error('Không tìm thấy lịch');const next=cancelDeparture(current);rows=rows.map(d=>d.id===id?next:d);changed();}
 };
}
export type AdminPrototypeWorkspace=ReturnType<typeof createAdminPrototypeWorkspace>;
