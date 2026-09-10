import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CustomerAccount } from '@/components/portals/customer-account';
const mocks = vi.hoisted(() => ({ mode: 'supabase', load: vi.fn(), save: vi.fn(), changeEmail: vi.fn(), changePassword: vi.fn(), replace: vi.fn() }));
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
vi.mock('@/components/portals/portal-session', () => ({ loadPortalSurfaceComposition: async () => ({mode:mocks.mode,customer:{account:{getAccount:mocks.load,updateAccount:mocks.save}},initialized:Promise.resolve(),session:{getSession:async()=>({role:'customer'})},account:mocks}) }));
beforeEach(() => { vi.clearAllMocks(); mocks.mode='supabase'; mocks.load.mockResolvedValue({displayName:'Test Customer',nationality:'',phone:'',email:'test@example.test',pendingEmail:''}); mocks.save.mockResolvedValue(undefined); });
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
  render(<CustomerAccount locale="en" section="bookings"/>);
  await screen.findByRole('heading', { name: 'My booked tours' });
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

it('keeps the edited value after a server error', async () => {
  mocks.save.mockRejectedValueOnce(new Error('failed'));
  render(<CustomerAccount locale="vi"/>);
  fireEvent.click(await screen.findByRole('button',{name:'Chỉnh sửa Họ và tên'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Họ và tên'}),{target:{value:'My valid name'}});
  fireEvent.click(screen.getByRole('button',{name:'Lưu thay đổi'}));
  await screen.findByText('Lưu thay đổi thất bại. Vui lòng thử lại sau');
  expect(screen.getByRole('textbox',{name:'Họ và tên'})).toHaveValue('My valid name');
});
it('routes the two menu sections to separate pages', async () => {
  render(<CustomerAccount locale="vi"/>);
  expect(await screen.findByRole('link',{name:'Đơn đặt tour'})).toHaveAttribute('href','/vi/bookings');
  expect(screen.getByRole('link',{name:'Quản lý tài khoản'})).toHaveAttribute('href','/vi/account');
  expect(screen.queryByRole('heading',{name:'My booked tours'})).toBeNull();
});

it('uses the updated profile UI for demo sessions instead of the combined portal', async () => {
  mocks.mode='demo';
  render(<CustomerAccount locale="vi"/>);
  await screen.findByRole('heading',{name:'Thông tin cá nhân & bảo mật'});
  expect(screen.queryByRole('heading',{name:'My booked tours'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Chỉnh sửa Email'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Chỉnh sửa Họ và tên'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Họ và tên'}),{target:{value:'New Name'}});
  fireEvent.click(screen.getByRole('button',{name:'Lưu thay đổi'}));
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith({displayName:'New Name',nationality:'',phone:''}));
});
it('returns to sign-in after a successful password change', async () => {
  mocks.changePassword.mockResolvedValueOnce(undefined);
  render(<CustomerAccount locale="vi"/>);
  fireEvent.click(await screen.findByRole('button',{name:'Chỉnh sửa Mật khẩu'}));
  fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'),{target:{value:'Existing123'}});
  fireEvent.change(screen.getByLabelText('Mật khẩu mới',{exact:true}),{target:{value:'Updated123'}});
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'),{target:{value:'Updated123'}});
  fireEvent.click(screen.getByRole('button',{name:'Lưu thay đổi'}));
  await waitFor(()=>expect(mocks.replace).toHaveBeenCalledWith('/vi/sign-in/?passwordChanged=1'));
});
