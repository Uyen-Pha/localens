import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {TourFAQs,TourGallery} from '@/components/customer/tour-detail-extras';
afterEach(cleanup);
it('shows travel advice without inventing a refund policy or live payment',()=>{render(<TourFAQs locale="vi"/>);expect(screen.getByText(/không thu tiền thật/)).toBeInTheDocument();fireEvent.click(screen.getByText('Tôi nên chuẩn bị gì?'));expect(screen.getByText('Tôi nên chuẩn bị gì?').closest('details')).toHaveAttribute('open');});
it('copies the current tour URL when sharing',async()=>{const writeText=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});render(<TourGallery locale="en" slug="heritage" src="/images/green/ben-thanh-market.webp" alt="Market"/>);fireEvent.click(screen.getByRole('button',{name:'Share'}));await screen.findByRole('button',{name:'Link copied'});expect(writeText).toHaveBeenCalledWith(window.location.href);});
