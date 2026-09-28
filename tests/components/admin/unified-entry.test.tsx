import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {useEffect} from 'react';
import {afterEach, expect, it, vi} from 'vitest';
import {AdminPrototype} from '@/components/admin/admin-prototype';

afterEach(cleanup);
it('omits technical persistence notes while preserving action errors',()=>{
 render(<AdminPrototype actionError="Không thể thực hiện thao tác"/>);
 expect(screen.queryByText(/Thao tác mẫu chỉ lưu tạm/)).not.toBeInTheDocument();
 expect(screen.getByRole('alert')).toHaveTextContent('Không thể thực hiện thao tác');
});
it('overview contains eight shortcuts that open the selected management screen',()=>{
 render(<AdminPrototype connectedScreens={{operations:<h1>Personalized runtime</h1>}}/>);
 expect(screen.getByRole('heading',{name:'Tổng quan quản trị'})).toBeVisible();
 expect(screen.queryByRole('table')).not.toBeInTheDocument();
 const shortcut=screen.getByRole('button',{name:'Tour cá nhân hóa Mở trang quản lý'});
 fireEvent.click(shortcut);
 expect(screen.getByRole('heading',{name:'Personalized runtime'})).toBeVisible();
 fireEvent.click(within(screen.getByRole('navigation')).getByRole('button',{name:'Tổng quan'}));
 expect(screen.getAllByRole('button',{name:/Mở trang quản lý/})).toHaveLength(8);
});
it('opens sample orders with full customer and payment details without a runtime port',async()=>{
 render(<AdminPrototype/>);
 fireEvent.click(within(screen.getByRole('navigation')).getByRole('button',{name:'Đơn đặt tour'}));
 expect(await screen.findByRole('button',{name:'Xem chi tiết LL-OD-001'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Xem chi tiết LL-OD-001'}));
 expect(await screen.findByRole('region',{name:'Chi tiết đơn đang chọn'})).toHaveTextContent('LL-OD-001');
});
it('reloads connected screens on returning while keeping logout errors visible',()=>{
 let mounts=0;
 function Connected(){useEffect(()=>{mounts++;},[]);return <h1>Runtime</h1>;}
 render(<AdminPrototype actionError="Logout failed" connectedScreens={{assignments:<Connected/>}}/>);
 const nav=within(screen.getByRole('navigation'));
 fireEvent.click(nav.getByRole('button',{name:'Phân công hướng dẫn viên'}));
 fireEvent.click(nav.getByRole('button',{name:'Lịch khởi hành'}));
 fireEvent.click(nav.getByRole('button',{name:'Phân công hướng dẫn viên'}));
 expect(mounts).toBe(2);
 expect(screen.getByRole('alert')).toHaveTextContent('Logout failed');
 expect(screen.queryByText('Không kết nối dữ liệu thật')).not.toBeInTheDocument();
});
it('places assignment and personalized navigation in the approved management sequence',()=>{
 render(<AdminPrototype connectedScreens={{assignments:<p>Assignments</p>,operations:<p>Requests</p>}}/>);
 expect(within(screen.getByRole('navigation')).getAllByRole('button').map(b=>b.textContent)).toEqual(['Tổng quan','Đơn đặt tour','Phân công hướng dẫn viên','Lịch khởi hành','Quản lý tài khoản','Quản lý địa điểm','Quản lý tour cố định','Tour cá nhân hóa','Báo cáo & Thống kê']);
});
it('keeps connected screens reachable and uses the authenticated identity and logout',()=>{
 const logout=vi.fn();
 render(<AdminPrototype identity={{displayName:'Verified administrator',email:'admin@example.test'}} onSignOut={logout} connectedScreens={{bookings:<h1>Connected orders</h1>,assignments:<h1>Connected assignments</h1>}}/>);
 expect(screen.getByText('Verified administrator')).toBeVisible();
 const nav=within(screen.getByRole('navigation'));
 fireEvent.click(nav.getByRole('button',{name:'Đơn đặt tour'}));
 expect(screen.getByRole('heading',{name:'Connected orders'})).toBeVisible();
 fireEvent.click(nav.getByRole('button',{name:'Phân công hướng dẫn viên'}));
 expect(screen.getByRole('heading',{name:'Connected assignments'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Đăng xuất'}));
 expect(logout).toHaveBeenCalledOnce();
});
