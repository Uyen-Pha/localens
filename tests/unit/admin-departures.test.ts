import {expect,it} from 'vitest';
import {createDeparture,cancelDeparture,remaining,type Departure} from '@/lib/application/admin-departures';
const row:Departure={id:'a',tourId:'t',version:'v1.0',date:'2026-10-01',start:'08:00',end:'13:00',capacity:20,held:2,booked:18,status:'sold_out'};
it('counts booked and held capacity',()=>expect(remaining(row)).toBe(0));
it('creates a future empty scheduled departure',()=>expect(createDeparture(row,Date.parse('2026-09-01'))).toMatchObject({status:'scheduled',held:0,booked:0}));
it('rejects past dates, reversed hours and fractional capacity',()=>{expect(()=>createDeparture(row,Date.parse('2026-11-01'))).toThrow();expect(()=>createDeparture({...row,end:'07:00'},0)).toThrow();expect(()=>createDeparture({...row,capacity:1.5},0)).toThrow();});
it('cancels a full departure while preserving history',()=>{expect(cancelDeparture(row)).toMatchObject({id:'a',booked:18,held:0,status:'cancelled'});expect(row.status).toBe('sold_out');});
it('cannot cancel a terminal departure',()=>{for(const status of ['cancelled','completed'] as const)expect(()=>cancelDeparture({...row,status})).toThrow();});
