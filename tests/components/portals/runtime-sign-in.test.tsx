import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {RuntimeSignIn} from '@/components/portals/runtime-sign-in';
import {PortalError} from '@/lib/application/portal/contracts';
afterEach(cleanup);
function setup(signIn=vi.fn(),role='customer'){
 const navigate=vi.fn();
 render(<RuntimeSignIn locale="vi" session={{signInWithPassword:signIn} as never} navigate={navigate} onSession={()=>{}} returnTo="/vi/bookings/"/>);
 return {signIn,navigate,role};
}
it('validates empty fields without sending credentials and toggles password visibility',()=>{
 const {signIn}=setup();fireEvent.click(screen.getByRole('button',{name:'Đăng nhập'}));
 expect(screen.getByText('Vui lòng nhập email.')).toBeVisible();expect(signIn).not.toHaveBeenCalled();
 const input=screen.getByLabelText('Mật khẩu',{exact:true});expect(input).toHaveAttribute('type','password');
 fireEvent.click(screen.getByRole('button',{name:'Hiện mật khẩu'}));expect(input).toHaveAttribute('type','text');
 fireEvent.click(screen.getByRole('button',{name:'Ẩn mật khẩu'}));expect(input).toHaveAttribute('type','password');
});
for(const role of ['customer','guide','admin'] as const)it('routes server role '+role,async()=>{
 const {navigate}=setup(vi.fn().mockResolvedValue({role}));
 fireEvent.change(screen.getByLabelText('Email'),{target:{value:'guest@example.test'}});
 fireEvent.change(screen.getByLabelText('Mật khẩu',{exact:true}),{target:{value:'test-password'}});
 fireEvent.click(screen.getByRole('button',{name:'Đăng nhập'}));
 await waitFor(()=>expect(navigate).toHaveBeenCalledWith(role==='customer'?'/vi/bookings/':`/vi/${role}/`));
 expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});
it('keeps email and shows a safe authentication error',async()=>{
 setup(vi.fn().mockRejectedValue(new PortalError('UNAUTHENTICATED','secret upstream detail')));
 fireEvent.change(screen.getByLabelText('Email'),{target:{value:'guest@example.test'}});
 fireEvent.change(screen.getByLabelText('Mật khẩu',{exact:true}),{target:{value:'bad'}});
 fireEvent.click(screen.getByRole('button',{name:'Đăng nhập'}));
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không chính xác'));
 expect(screen.getByLabelText('Email')).toHaveValue('guest@example.test');
 expect(screen.getByLabelText('Mật khẩu',{exact:true})).toHaveValue('');
});
