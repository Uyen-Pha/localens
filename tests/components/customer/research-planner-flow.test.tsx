import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {ResearchPlannerFlow} from '@/components/customer/research-planner-flow';
import {savePersonalizationRequest} from '@/lib/application/planner/personalization-session';
import {researchInput} from '../../fixtures/research-recovery';
beforeEach(()=>{window.sessionStorage.clear();savePersonalizationRequest(researchInput);});
afterEach(()=>{cleanup();window.sessionStorage.clear();});
it('shows processing and actionable no-match message',async()=>{
 let finish:(v:unknown)=>void=()=>{};
 const port=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
 render(<ResearchPlannerFlow locale="vi" planner={port as never} actorRole="customer" actorId="test-customer"/>);
 expect(screen.getByRole('status')).toHaveTextContent('Đang');
 finish({status:'no_match',reasons:['budget']});
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('ngân sách'));
 expect(port).toHaveBeenCalledTimes(1);
});
it('explains a closed preference while keeping the successful timeline',async()=>{
 const port=vi.fn(async()=>({status:'ready',preferenceNotices:[{preference:'traditional_market',reason:'closed'}],plan:{stops:[],legs:[],durationMinutes:100,totalVnd:500000,visitAndFoodVnd:0,guideVnd:400000,transportVnd:100000,returnTime:'20:00'}}));
 render(<ResearchPlannerFlow locale="vi" planner={port as never} actorRole="customer" actorId="test-customer"/>);
 await waitFor(()=>expect(screen.getByRole('note')).toHaveTextContent('không còn đủ thời gian tham quan trong giờ hoạt động'));
 expect(screen.getByRole('heading',{name:'Tổng kết chuyến đi'})).toBeVisible();
 expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
