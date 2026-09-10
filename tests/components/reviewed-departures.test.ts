import {it,expect} from 'vitest';
import {reviewedDepartures} from '@/components/dev/reviewed-departures';
it.each([[421,'2026-09-12T01:30:00Z',270],[422,'2026-09-19T02:00:00Z',540],[423,'2026-09-26T08:00:00Z',330]] as const)('fills nearby days for tour %s without changing existing IDs', (id,startAt,minutes)=>{
 const base={id:`d1700000-0000-4000-8000-${String(id).padStart(12,'0')}`,startAt,endAt:new Date(Date.parse(startAt)+minutes*60000).toISOString()};
 const days=reviewedDepartures(base,id-421);
 expect(days[0].startAt.slice(0,10)).toBe('2026-09-10');
 expect(days.some(d=>d.startAt.startsWith('2026-09-11'))).toBe(true);
 expect(days.find(d=>d.id===base.id)?.startAt).toBe(new Date(startAt).toISOString());
 expect(days.find(d=>d.id===`d1800000-0000-4000-8000-${String(id*1000+1).padStart(12,'0')}`)?.startAt).toBe(new Date(Date.parse(startAt)+86400000).toISOString());
 expect(new Set(days.map(d=>d.id)).size).toBe(days.length);
 expect(days.every((d,i)=>Date.parse(d.endAt)-Date.parse(d.startAt)===minutes*60000&&(!i||Date.parse(d.startAt)-Date.parse(days[i-1].startAt)===86400000))).toBe(true);
});
