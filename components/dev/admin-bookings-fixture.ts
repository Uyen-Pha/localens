import {reviewedDataset} from './reviewed-tours';
import {type BookingView,type BookingPreviewPort} from '@/lib/application/admin-bookings-preview';
const names=['Nguyễn Minh Anh','Trần Thu Hà','Lê Quốc Bảo','Phạm Thảo Vy','Hoàng Minh Khoa','Đỗ Thị Lan','Vũ Minh Khang','Nguyễn Nhật Linh','Đặng Ngọc Linh','Lê Minh Khôi'];
const states:BookingView['status'][]=['confirmed','pending_payment','pending_payment','completed','cancelled','expired','pending_payment','confirmed','confirmed','confirmed'];
const payments:BookingView['payment'][]=['paid','pending','review','paid','failed','pending','processing','paid','paid','paid'];
// Keep the demo data in two recent months so the report period filters have
// an observable effect while the seeded order scenarios remain unchanged.
const createdDays=['2026-09-15','2026-08-28','2026-09-13','2026-08-18','2026-09-11','2026-08-09','2026-08-22','2026-09-08','2026-09-18','2026-09-20'];
const rows:BookingView[]=names.map((customer,i)=>{
 const tour=reviewedDataset.tours[i%reviewedDataset.tours.length];
 const createdAt=`${createdDays[i]}T09:00:00+07:00`;
 const time=(minutes:number)=>new Date(Date.parse(createdAt)+minutes*60000).toISOString();
 const status=states[i],payment=payments[i];
 const personalized=i===1||i===5||i===8||i===9;
 const departure=status==='completed'?'2026-09-13T08:30:00+07:00':`2026-10-${String(4+i*2).padStart(2,'0')}T08:30:00+07:00`;
 const deadlineMinutes=personalized?48*60:15;
 const history:BookingView['history']=[{at:createdAt,title:'Tạo đơn đặt tour',description:'Khách gửi thông tin đặt tour.'},{at:createdAt,title:personalized?'Thời hạn báo giá':'Tạm giữ chỗ',description:personalized?'Hạn thanh toán là thời điểm sớm hơn giữa 48 giờ từ lúc phát hành và 24 giờ trước khởi hành.':'Thời hạn giữ chỗ 15 phút.'}];
 if(payment==='paid')history.push({at:time(5),title:'Thanh toán thành công',description:'Thanh toán mô phỏng được ghi nhận; đơn chuyển sang Đã xác nhận.'});
 if(payment==='review')history.push({at:time(4),title:'Chưa xác nhận thanh toán',description:'Chưa đủ căn cứ xác nhận thanh toán; quản trị viên chỉ theo dõi.'});
 if(payment==='processing')history.push({at:time(3),title:'Đang xử lý thanh toán',description:'Đang chờ kết quả từ luồng thanh toán.'});
 if(payment==='failed')history.push({at:time(4),title:'Thanh toán thất bại',description:'Không ghi nhận thanh toán thành công.'});
 if(status==='cancelled')history.push({at:time(8),title:'Đã hủy đơn',description:'Khách hủy đơn trước khi thanh toán; không phát sinh hoàn tiền.'});
 if(status==='expired')history.push({at:time(deadlineMinutes),title:'Đơn đã hết hạn',description:personalized?'Báo giá đã hết thời hạn thực tế theo mốc phát hành và giờ khởi hành.':'Hết thời hạn 15 phút, chỗ tạm giữ đã được giải phóng.'});
 if(status==='completed')history.push({at:'2026-09-14T10:00:00+07:00',title:'Đã hoàn thành',description:'Hệ thống ghi nhận hoàn thành theo thời gian kết thúc tour.'});
 return {id:`LL-OD-${String(i+1).padStart(3,'0')}`,customer,email:`khach${i+1}@example.invalid`,kind:personalized?'personalized':'fixed',tour:tour.translations.vi.title,
 departure,people:i%4+1,total:tour.priceVndPerPerson*(i%4+1),status,payment,createdAt,holdUntil:time(deadlineMinutes),paidAt:payment==='paid'?time(5):undefined,confirmedAt:payment==='paid'?time(5):undefined,completedAt:status==='completed'?'2026-09-14T10:00:00+07:00':undefined,transaction:payment!=='pending'?`DEMO-TXN-${100+i}`:undefined,history};
});
export const bookingPreviewPort:BookingPreviewPort={async list(){return structuredClone(rows);},async detail(id){const row=rows.find(r=>r.id===id);if(!row)throw Error('Not found');return structuredClone(row);}};
