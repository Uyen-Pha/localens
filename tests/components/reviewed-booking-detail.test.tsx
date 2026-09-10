import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {ReviewedBookingDetail} from '@/components/customer/reviewed-booking-detail';
const mocks=vi.hoisted(()=>({get:vi.fn(),cancel:vi.fn(),review:vi.fn(),router:{replace:vi.fn()}}));
vi.mock('next/navigation',()=>({useRouter:()=>mocks.router}));
vi.mock('@/components/portals/portal-session',()=>({loadPortalSurfaceComposition:async()=>({mode:'supabase',initialized:Promise.resolve(),session:{getSession:async()=>({userId:'owner'})},reviewedBookings:mocks})}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const row={id:'owned',departure_id:'d1700000-0000-4000-8000-000000000423',party_size:1,total_vnd:1590000,status:'pending_payment',created_at:'2026-09-01T00:00:00Z',expires_at:'2020-01-01T00:00:00Z',paid_at:null};
it('renders expired detail without payment action',async()=>{history.replaceState({},'', '/vi/booking-details/?booking=owned');mocks.get.mockResolvedValue(row);render(<ReviewedBookingDetail locale="vi"/>);await screen.findByText('Đã hết hạn');expect(screen.queryByRole('link',{name:'Tiếp tục thanh toán'})).not.toBeInTheDocument();expect(mocks.get).toHaveBeenCalledWith('owned');});
it('shows exact missing detail error on lookup failure',async()=>{history.replaceState({},'', '/vi/booking-details/?booking=other');mocks.get.mockRejectedValue(Error('not found'));render(<ReviewedBookingDetail locale="vi"/>);expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy thông tin chi tiết đơn hàng');});
it('saves a completed booking review and removes the review action',async()=>{history.replaceState({},'', '/vi/booking-details/?booking=owned');mocks.get.mockResolvedValue({...row,status:'completed',paid_at:row.created_at});mocks.review.mockResolvedValue({...row,status:'completed',reviewed_at:row.created_at,rating:5,review_text:'Wonderful trip'});render(<ReviewedBookingDetail locale="en"/>);fireEvent.click(await screen.findByRole('button',{name:'Review tour'}));fireEvent.change(screen.getByLabelText('Your review'),{target:{value:'Wonderful trip'}});fireEvent.click(screen.getByRole('button',{name:'Confirm'}));await screen.findByText('Thank you for sharing your experience!');expect(mocks.review).toHaveBeenCalledWith('owned',5,'Wonderful trip');expect(screen.queryByRole('button',{name:'Review tour'})).not.toBeInTheDocument();});

