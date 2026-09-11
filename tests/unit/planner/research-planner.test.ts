import { describe, it, expect } from 'vitest';
import { researchPlan, researchAreas, type ResearchInput } from '@/lib/application/planner/research-planner';
const base: ResearchInput = { startAt:'2026-09-15T09:00:00+07:00', durationMinutes:720, areas:['saigon-center'], budget:{currency:'VND',amountMinor:10000000}, partySize:2, guideLanguage:'vi', priorityWeights:{street_food:1,history:3,traditional_craft:1,traditional_market:2},pace:'active',dietaryRequirements:[],mobilityRequirements:[],lockedStopIds:[],specialNeeds:'' };
const rank = async (input: { candidates: {id:string}[] }) => ({orderedIds:input.candidates.map(p=>p.id)});
describe('research planner',()=>{
 for(const [duration,count] of [[180,2],[210,3]]) it(`finds ${count} stops despite a long first AI choice`,async()=>{
  const r=await researchPlan({...base,durationMinutes:duration},rank);
  expect(r.status).toBe('ready');
  if(r.status==='ready')expect(r.plan.stops.length).toBeGreaterThanOrEqual(count);
 });
 it('keeps nonpreferred evening candidates and explains closed preferences',async()=>{
  const r=await researchPlan({...base,startAt:'2026-09-15T18:00:00+07:00',durationMinutes:180,priorityWeights:{street_food:0,history:0,traditional_craft:0,traditional_market:3}},async i=>{
   expect(i.candidates.map(p=>p.id)).toContain('LL-R26');return rank(i);
  });
  expect(r.status).toBe('ready');
  if(r.status==='ready')expect(r.preferenceNotices).toContainEqual({preference:'traditional_market',reason:'closed'});
 });
 for(const area of researchAreas) it('respects evening hours for '+area.value,async()=>{
  const r=await researchPlan({...base,areas:[area.value],startAt:'2026-09-15T18:00:00+07:00',durationMinutes:240},rank);
  if(area.value==='saigon-center')expect(r.status).toBe('ready');
  else {expect(r.status).toBe('no_match');if(r.status==='no_match')expect(r.reasons).toContain('closed');}
 });
 for(const area of researchAreas) it('creates valid route for '+area.value,async()=>{
  const r=await researchPlan({...base,areas:[area.value]},rank);
  expect(r.status).toBe('ready');
  if(r.status==='ready'){expect(r.plan.totalVnd).toBeLessThanOrEqual(10000000);expect(r.plan.durationMinutes).toBeLessThanOrEqual(720);expect(r.plan.stops.length).toBeGreaterThan(0);expect(r.plan.legs.at(-1)?.to).toBe('ORIGIN-CENTER');}
 });
 it('filters disabled places before AI',async()=>{await researchPlan(base,async input=>{expect(input.candidates.some(p=>['LL-R27','LL-R28','LL-R29','LL-R30'].includes(p.id))).toBe(false);return rank(input);});});
 it('rejects invented IDs from AI',async()=>{expect((await researchPlan(base,async()=>({orderedIds:['invented']}))).status).toBe('ai_error');});
 it('does not call AI on impossible budget',async()=>{let called=false;const r=await researchPlan({...base,budget:{currency:'VND',amountMinor:1}},async i=>{called=true;return rank(i);});expect(called).toBe(false);expect(r.status).toBe('no_match');});
 it('rejects short Cu Chi and excessive party',async()=>{expect((await researchPlan({...base,areas:['cu-chi'],durationMinutes:60},rank)).status).toBe('no_match');expect((await researchPlan({...base,partySize:20},rank)).status).toBe('no_match');});
 it('excludes closed museums on Monday and outside opening hours',async()=>{await researchPlan({...base,startAt:'2026-09-14T09:00:00+07:00'},async i=>{expect(i.candidates.map(p=>p.id)).not.toContain('LL-R04');expect(i.candidates.map(p=>p.id)).not.toContain('LL-R08');return rank(i);});expect((await researchPlan({...base,startAt:'2026-09-15T22:00:00+07:00',durationMinutes:60},rank)).status).toBe('no_match');});
 it('ignores AI facts by rejecting over-shaped output',async()=>{expect((await researchPlan(base,async i=>({...await rank(i),price:0}))).status).toBe('ai_error');});
});
