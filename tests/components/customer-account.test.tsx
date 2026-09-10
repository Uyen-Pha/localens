import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CustomerAccount } from '@/components/portals/customer-account';
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), changeEmail: vi.fn(), changePassword: vi.fn(), replace: vi.fn() }));
afterEach(cleanup);
it('combines selected calling code with the local phone number', async () => {
  render(<CustomerAccount locale="vi"/>);
  fireEvent.click(await screen.findByRole('button',{name:'Chỉnh sửa Số điện thoại'}));
  expect(screen.getByRole('combobox',{name:'Mã quốc gia'})).toHaveValue('VN');
  fireEvent.change(screen.getByRole('textbox',{name:'Số điện thoại'}),{target:{value:'0912 345 678'}});
  fireEvent.click(screen.getByRole('button',{name:'Lưu thay đổi'}));
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({phone:'+84912345678'})));
});
it('rejects reuse of the current password before submitting', async () => {
  render(<CustomerAccount locale="vi"/>);
  fireEvent.click(await screen.findByRole('button',{name:'Chỉnh sửa Mật khẩu'}));
  expect(screen.getByRole('heading',{name:'Họ và tên'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Đăng nhập & bảo mật'})).toBeNull();
  fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'),{target:{value:'Existing123'}});
  fireEvent.change(screen.getByLabelText('Mật khẩu mới',{exact:true}),{target:{value:'Existing123'}});
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'),{target:{value:'Existing123'}});
  fireEvent.click(screen.getByRole('button',{name:'Lưu thay đổi'}));
  await screen.findByText('Mật khẩu mới phải khác mật khẩu hiện tại.');
  expect(mocks.changePassword).not.toHaveBeenCalled();
});
vi.mock('next/navigation', () => { const router = {replace:mocks.replace}; return { useRouter: () => router }; });
vi.mock('@/components/portals/portal-surface', () => ({ PortalSurface: () => <div>Bookings</div> }));
vi.mock('@/components/customer/runtime-fixed-tour-account', () => ({ RuntimeFixedTourAccount: () => <h2>My booked tours</h2> }));
vi.mock('@/components/portals/portal-session', () => ({ loadPortalSurfaceComposition: async () => ({mode:'supabase',initialized:Promise.resolve(),session:{getSession:async()=>({role:'customer'})},account:mocks}) }));
beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue({displayName:'Test Customer',nationality:'',phone:'',email:'test@example.test',pendingEmail:''}); mocks.save.mockResolvedValue(undefined); });
it('shows profile and saves a name edit', async () => {
  render(<CustomerAccount locale="vi"/>);
  await screen.findByText('Xin chào, Test Customer!');
  fireEvent.click(screen.getByRole('button',{name:'Chỉnh sửa Họ và tên'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Họ và tên'}),{target:{value:'Updated Customer'}});
  mocks.load.mockResolvedValue({displayName:'Updated Customer',nationality:'',phone:'',email:'test@example.test',pendingEmail:''});
  fireEvent.click(screen.getByRole('button',{name:'Lưu thay đổi'}));
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({displayName:'Updated Customer'})));
  await screen.findByText('Thông tin đã được cập nhật.');
  expect(screen.getByRole('heading', {name:'Xin chào, Updated Customer!'})).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText('Thông tin đã được cập nhật.')).toBeNull(), {timeout:4500});
});
it('cancels without saving and renders English labels', async () => {
  render(<CustomerAccount locale="en"/>);
  await screen.findByText('Hello, Test Customer!');
  fireEvent.click(screen.getByRole('button',{name:'Edit Full name'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Full name'}),{target:{value:'Discard'}});
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).toBeNull();
});
it('shows booking content separately without nesting the account portal', async () => {
  render(<CustomerAccount locale="en"/>);
  fireEvent.click(await screen.findByRole('button', { name: 'Bookings' }));
  expect(screen.getByRole('heading', { name: 'My booked tours' })).toBeInTheDocument();
  expect(screen.queryByText('Bookings', { selector: 'div' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Full name' })).toBeNull();
});
it('keeps email read-only', async () => {
  render(<CustomerAccount locale="en"/>);
  await screen.findByText('test@example.test');
  expect(screen.queryByRole('button',{name:'Edit Email'})).toBeNull();
  expect(screen.getByText('Your sign-in email cannot be changed.')).toBeInTheDocument();
});
