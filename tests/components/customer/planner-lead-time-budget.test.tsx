import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {PersonalizationForm,defaultHcmcPlannerStart} from '@/components/customer/personalization-form';
import {getDictionary} from '@/lib/i18n/dictionaries';
vi.mock('@/components/portals/portal-session',()=>({loadPortalSurfaceComposition:async()=>({mode:'supabase',initialized:Promise.resolve()})}));
afterEach(()=>{cleanup();vi.restoreAllMocks();window.sessionStorage.clear();});
const copy=getDictionary('vi').home.personalizationForm;
const areas=[{value:'central',label:'Trung tâm'}];
it('defaults beyond 72 hours even after the 09:00 departure time',()=>{
 expect(defaultHcmcPlannerStart(Date.parse('2026-09-28T03:00:00Z'))).toEqual({date:'2026-10-02',time:'09:00'});
});
it('shows and applies a budget estimate without selecting an area',async()=>{
 render(<PersonalizationForm copy={copy} locale="vi" compact areaOptionsOverride={areas}/>);
 const use=await screen.findByRole('button',{name:/Dùng mức/});
 expect(screen.getByLabelText('Trung tâm')).not.toBeChecked();
 fireEvent.click(use);
 expect(screen.getByRole('textbox',{name:copy.budgetLabel})).toHaveValue('600.000');
});
it.each([['08:59',false],['09:00',true],['09:01',true]] as const)('checks the exact 72-hour boundary at %s',async(time,valid)=>{
 vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-09-28T02:00:00Z'));
 const prepared=vi.fn();
 render(<PersonalizationForm copy={copy} locale="vi" compact areaOptionsOverride={areas} onPrepared={prepared}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Tạo lịch trình gợi ý'})).toBeEnabled());
 fireEvent.change(screen.getByLabelText(copy.startDateLabel),{target:{value:'2026-10-01'}});
 const form=screen.getByRole('form',{name:copy.formLabel}) as HTMLFormElement;
 const start=form.elements.namedItem('startTime') as HTMLInputElement;
 fireEvent.click(screen.getByLabelText('Trung tâm'));
 start.value=time;
 fireEvent.submit(form);
 if(valid) expect(prepared).toHaveBeenCalledOnce();
 else {expect(prepared).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toHaveTextContent('72');}
});
