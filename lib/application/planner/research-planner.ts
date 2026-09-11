import dataset from '@/data/planner/research-v2/planner-simulation-v1.json' with {type:'json'};
import {isPersonalizationRequest, type PersonalizationRequest} from '@/lib/application/planner/personalization-session';
import {researchAreas} from '@/lib/application/planner/research-areas';
export {researchAreas};
export type ResearchInput = PersonalizationRequest;
type Place = typeof dataset.places[number];
export type RankInput = {candidates:{id:string;tags:string[];zone:string;durationMinutes:number}[];priorityWeights:ResearchInput['priorityWeights'];pace:string};
export type ResearchRanker = (input:RankInput)=>Promise<unknown>;
export type ResearchStop = {id:string;name:string;address:string;arrival:string;departure:string;durationMinutes:number;waitMinutes:number;perPersonVnd:number};
export type ResearchLeg = {from:string;to:string;departure:string;arrival:string;minutes:number;costVnd:number};
export type ResearchPlan = {stops:ResearchStop[];legs:ResearchLeg[];totalVnd:number;visitAndFoodVnd:number;guideVnd:number;transportVnd:number;durationMinutes:number;returnTime:string};
export type PreferenceNotice = {preference:keyof ResearchInput['priorityWeights'];reason:'closed'|'constraints'};
export type ResearchResponse = {status:'ready';plan:ResearchPlan;dataMode:'internal_simulation';ranking:'ai';preferenceNotices?:PreferenceNotice[];exchangeRateVndPerUsd:number|null} | {status:'no_match'|'invalid'|'ai_error';reasons:string[]};
const mins=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const disabled=new Set(['LL-R27','LL-R28','LL-R29','LL-R30']);
const preferenceTags:Record<keyof ResearchInput['priorityWeights'],string>={street_food:'local_food',history:'history_culture',traditional_craft:'traditional_craft',traditional_market:'market_local_life'};
const getBudget=(r:ResearchInput)=>r.budget.currency==='VND'?r.budget.amountMinor:r.budget.amountMinor*260;

export function evaluateResearchRoute(r:ResearchInput, ids:string[]):{plan:ResearchPlan}|{reason:string} {
 const fail=(reason:string)=>({reason});
 if(!ids.length||new Set(ids).size!==ids.length)return fail('invalid_places');
 const places=ids.map(id=>dataset.places.find(p=>p.placeId===id));
 if(places.some(p=>!p||!p.simulationEligible||disabled.has(p.placeId)))return fail('invalid_places');
 const start=mins(r.startAt.slice(11,16)), weekday=new Date(r.startAt.slice(0,10)+'T00:00:00Z').getUTCDay()||7;
 let now=start,current='ORIGIN-CENTER',transportVnd=0,visitAndFoodVnd=0;
 const stops:ResearchStop[]=[],legs:ResearchLeg[]=[];
 const tariff=dataset.assumptions.transfer.costTiers.find(t=>r.partySize<=t.maxGuests);
 if(!tariff)return fail('capacity');
 const transfer=(to:string)=>{
  const e=dataset.transferEdges.find(e=>e.from===current&&e.to===to);if(!e)return false;
  const peak=dataset.assumptions.transfer.peakHours.some(([a,b])=>now>=a*60&&now<b*60);
  const duration=Math.ceil(e.baseMinutes*(peak?1.3:1))+e.bufferMinutes;
  const cost=tariff.baseVndPerLeg+tariff.vndPerMinute*duration;
  legs.push({from:current,to,departure:clock(now),arrival:clock(now+duration),minutes:duration,costVnd:cost});now+=duration;transportVnd+=cost;current=to;return true;
 };
 for(const p of places as Place[]){
  if(p.maximumGuests.value<r.partySize)return fail('capacity');
  if(!p.areaMembership.some(a=>a.role==='core'&&r.areas.includes(a.areaId)))return fail('area');
  if(r.dietaryRequirements.length&&p.cost.mealPerPerson.value>0)return fail('dietary');
  if(!transfer(p.placeId))return fail('travel');
  const duration=Math.ceil(p.durationMinutes.value*(r.pace==='relaxed'?1.2:1));
  const w=p.openingHours.windows.filter(w=>w.isoWeekdays.includes(weekday)).sort((a,b)=>mins(a.opens)-mins(b.opens)).find(w=>{
   const arrival=Math.max(now,mins(w.opens));const last=(w as {lastAdmission?:string}).lastAdmission;
   return arrival+duration<=mins(w.closes)&&(!last||arrival<=mins(last));
  });
  if(!w)return fail('closed');
  const arrival=Math.max(now,mins(w.opens));const perPersonVnd=p.cost.visitPerPerson.value+p.cost.mealPerPerson.value;
  stops.push({id:p.placeId,name:r.guideLanguage==='vi'?p.nameVi:p.nameEn,address:p.address.value,arrival:clock(arrival),departure:clock(arrival+duration),durationMinutes:duration,waitMinutes:arrival-now,perPersonVnd});
  now=arrival+duration;visitAndFoodVnd+=perPersonVnd*r.partySize;
 }
 if(!transfer('ORIGIN-CENTER'))return fail('travel');
 if(now>1440||now-start>r.durationMinutes)return fail('duration');
 const guideVnd=Math.max(400000,Math.ceil((now-start)/60)*200000),totalVnd=visitAndFoodVnd+transportVnd+guideVnd;
 if(totalVnd>getBudget(r))return fail('budget');
 return {plan:{stops,legs,totalVnd,visitAndFoodVnd,transportVnd,guideVnd,durationMinutes:now-start,returnTime:clock(now)}};
}

export async function researchPlan(input:unknown,rank:ResearchRanker):Promise<ResearchResponse>{
 if(!isPersonalizationRequest(input)||input.areas.some(a=>!researchAreas.some(v=>v.value===a))||input.lockedStopIds.length||input.mobilityRequirements.length)return {status:'invalid',reasons:['input']};
 const r=input;
 const failures=new Set<string>();
 const eligible=dataset.places.filter(p=>p.simulationEligible&&!disabled.has(p.placeId)&&p.areaMembership.some(a=>a.role==='core'&&r.areas.includes(a.areaId)));
 const excluded=new Map<string,string>();
 // Experience weights never remove candidates. Only operational constraints do.
 const candidates=eligible.filter(p=>{
  const result=evaluateResearchRoute(r,[p.placeId]);if('reason'in result){failures.add(result.reason);excluded.set(p.placeId,result.reason);return false;}return true;
 });
 if(!candidates.length)return {status:'no_match',reasons:failures.size?[...failures]:['area']};
 let output:unknown;
 try{output=await rank({candidates:candidates.map(p=>({id:p.placeId,tags:p.experienceTags,zone:p.simulationZone,durationMinutes:p.durationMinutes.value})),priorityWeights:r.priorityWeights,pace:r.pace});}catch{return {status:'ai_error',reasons:['ai_unavailable']};}
 if(!output||typeof output!=='object'||Object.keys(output).length!==1||!('orderedIds'in output)||!Array.isArray(output.orderedIds))return {status:'ai_error',reasons:['ai_invalid']};
 const ordered=output.orderedIds as unknown[];
 if(ordered.length!==candidates.length||new Set(ordered).size!==ordered.length||ordered.some(id=>typeof id!=='string'||!candidates.some(p=>p.placeId===id)))return {status:'ai_error',reasons:['ai_invalid']};
 let selected:string[]=[],best:ResearchPlan|undefined,bestScore=-Infinity;
 const ids=ordered as string[];
 const consider=(route:string[])=>{
  const result=evaluateResearchRoute(r,route);
  if(!('plan'in result))return;
  const utility=route.reduce((total,id)=>total+ids.length-ids.indexOf(id),0);
  if(!best||route.length>selected.length||(route.length===selected.length&&(utility>bestScore||(utility===bestScore&&result.plan.durationMinutes<best.durationMinutes)))){
   selected=route;best=result.plan;bestScore=utility;
  }
 };
 // Explore every 1–3 stop ordering: a long first AI choice must not block a
 // feasible multi-stop alternative. Three is not a required count or limit.
 for(const a of ids){consider([a]);for(const b of ids){if(b===a)continue;consider([a,b]);for(const c of ids)if(c!==a&&c!==b)consider([a,b,c]);}}
 for(const id of ids)if(!selected.includes(id))consider([...selected,id]);
 if(!best)return {status:'no_match',reasons:['duration','budget']};
 const validated=evaluateResearchRoute(r,selected);
 if(!('plan'in validated))return {status:'no_match',reasons:[validated.reason]};
 const preferenceNotices:PreferenceNotice[]=[];
 for(const preference of Object.keys(preferenceTags) as (keyof typeof preferenceTags)[]){
  if(r.priorityWeights[preference]<=0)continue;
  const tag=preferenceTags[preference];
  if(selected.some(id=>eligible.find(p=>p.placeId===id)?.experienceTags.includes(tag)))continue;
  const matching=eligible.filter(p=>p.experienceTags.includes(tag));
  preferenceNotices.push({preference,reason:matching.length>0&&matching.every(p=>excluded.get(p.placeId)==='closed')?'closed':'constraints'});
 }
 return {status:'ready',preferenceNotices,plan:validated.plan,dataMode:'internal_simulation',ranking:'ai',exchangeRateVndPerUsd:r.budget.currency==='USD'?26000:null};
}
