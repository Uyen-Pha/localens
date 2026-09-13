import { describe, expect, it } from 'vitest';
import { presentGuideAssignment } from '@/components/guide/guide-assignment-presentation';
import type { GuideOwnAssignment } from '@/lib/application/guide-assignment/contracts';
const row = { assignmentId:'test', bookingId:null, departureId:null, tourVersionId:'d1700000-0000-4000-8000-000000000411',title:'Original source title',startAt:'2026-08-08T08:30:00+07:00',endAt:'2026-08-08T13:00:00+07:00',partySize:4,language:'vi',meetingPoint:'original',mobilityFlags:[],dietaryFlags:[],assignmentStatus:'completed',tourStatus:'completed',isDemo:true } as GuideOwnAssignment;
describe('guide hypothetical assignment presentation',()=>{
  it('uses the same fixed tour program as the public catalog for known demo version IDs',()=>{
    const result=presentGuideAssignment(row,'vi');
    expect(result.title).toBe('Dấu ấn Sài Gòn');
    expect(result.itinerary).toHaveLength(9);
    expect(result.itinerary?.[0].time).toMatch(/^08:30/);
    expect(result.imageUrl).toBe('/images/green/ben-thanh-market.webp');
    expect(result.startAt).toBe(row.startAt);
  });
  it('preserves historical non-demo booking facts and unknown versions',()=>{
    const original={...row,isDemo:false};
    expect(presentGuideAssignment(original,'vi')).toBe(original);
    const unknown={...row,tourVersionId:'unknown'};
    expect(presentGuideAssignment(unknown,'vi')).toBe(unknown);
  });
});
