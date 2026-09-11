import {render,screen,waitFor} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {ResearchPlannerFlow} from '@/components/customer/research-planner-flow';
vi.mock('@/lib/application/planner/personalization-session',()=>({readPersonalizationState:()=>({status:'ok',request:{}})}));
it('shows processing and actionable no-match message',async()=>{
 let finish:(v:unknown)=>void=()=>{};
 const port=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
 render(<ResearchPlannerFlow locale="vi" planner={port as never}/>);
 expect(screen.getByRole('status')).toHaveTextContent('Đang');
 finish({status:'no_match',reasons:['budget']});
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('ngân sách'));
 expect(port).toHaveBeenCalledTimes(1);
});
