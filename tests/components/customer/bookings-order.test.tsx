import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {CustomerAccount} from '@/components/portals/customer-account';
const router={replace:vi.fn()};
vi.mock('next/navigation',()=>({useRouter:()=>router}));
vi.mock('@/components/customer/research-request-list',()=>({ResearchRequestList:()=> <h2>Personalized requests</h2>}));
vi.mock('@/components/customer/reviewed-bookings',()=>({ReviewedBookingsList:()=> <h2>Fixed bookings</h2>}));
vi.mock('@/components/customer/runtime-fixed-tour-account',()=>({RuntimeFixedTourAccount:()=>null}));
vi.mock('@/components/portals/portal-session',()=>({loadPortalSurfaceComposition:async()=>({mode:'supabase',initialized:Promise.resolve(),session:{getSession:async()=>({role:'customer'})},account:{load:async()=>({displayName:'Test',nationality:'VN',phone:'',email:'test@example.test'})},researchRequests:{},reviewedBookings:{}})}));
afterEach(cleanup);
it('places personalized requests before fixed bookings in the actual account page',async()=>{
 render(<CustomerAccount locale="vi" section="bookings"/>);
 const personalized=await screen.findByRole('heading',{name:'Personalized requests'});
 const fixed=screen.getByRole('heading',{name:'Fixed bookings'});
 expect(personalized.compareDocumentPosition(fixed)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
