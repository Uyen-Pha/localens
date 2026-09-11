import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {PersonalizationForm} from '@/components/customer/personalization-form';
import {researchAreas} from '@/lib/application/planner/research-areas';
import {getDictionary} from '@/lib/i18n/dictionaries';
import {readPersonalizationState} from '@/lib/application/planner/personalization-session';
vi.mock('@/components/portals/portal-session',()=>({loadPortalSurfaceComposition:async()=>({mode:'supabase',initialized:Promise.resolve()})}));
afterEach(()=>{cleanup();sessionStorage.clear();});
for(const area of researchAreas)it('submits current research area '+area.value,async()=>{
 const prepared=vi.fn();
 render(<PersonalizationForm locale="vi" copy={getDictionary('vi').home.personalizationForm} areaOptionsOverride={researchAreas} onPrepared={prepared}/>);
 const submit=screen.getByRole('button',{name:'Tạo lịch trình gợi ý'});
 await waitFor(()=>expect(submit).toBeEnabled());
 fireEvent.click(screen.getByRole('checkbox',{name:area.label}));
 fireEvent.click(submit);
 expect(prepared).toHaveBeenCalledOnce();
 const saved=readPersonalizationState();expect(saved.status).toBe('ok');
 if(saved.status==='ok')expect(saved.request.areas).toEqual([area.value]);
});
