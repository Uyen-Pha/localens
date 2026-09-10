import type { Locale } from '@/lib/i18n/config';

export function BookingStatusGuide({locale}: {locale: Locale}) {
  const vi = locale === 'vi';
  const rows = vi ? [
    ['Đơn đặt tour','Chờ thanh toán · Đã xác nhận · Đã hoàn thành · Đã hủy · Đã hết hạn'],
    ['Thanh toán','Chờ thanh toán · Đang xử lý thanh toán · Đã thanh toán · Thanh toán thất bại · Đang rà soát thanh toán'],
    ['Yêu cầu cá nhân hóa','Bản nháp · Chờ duyệt · Yêu cầu chỉnh sửa · Đã duyệt · Từ chối · Hết hạn'],
    ['Báo giá','Đang hiệu lực · Đã chấp nhận · Hết hạn · Đã thu hồi'],
  ] : [
    ['Booking','Awaiting payment · Confirmed · Completed · Cancelled · Expired'],
    ['Payment','Awaiting payment · Payment processing · Paid · Payment failed · Payment under review'],
    ['Personalized request','Draft · Pending review · Changes requested · Approved · Rejected · Expired'],
    ['Quote','Active · Accepted · Expired · Revoked'],
  ];
  return <details style={{marginTop:28,borderTop:'1px solid #dfe6e1',paddingTop:20}}>
    <summary style={{cursor:'pointer',fontWeight:600}}>{vi ? 'Tìm hiểu trạng thái của bạn' : 'Understand your statuses'}</summary>
    <dl>{rows.map(([title,description])=><div key={title} style={{marginTop:18}}><dt style={{fontWeight:600}}>{title}</dt><dd style={{margin:'6px 0',lineHeight:1.7,color:'#64776e'}}>{description}</dd></div>)}</dl>
    <p>{vi ? 'Tour cố định: Đặt tour → Thanh toán hợp lệ → Xác nhận đơn → Hoàn thành tour.' : 'Fixed tour: Book → Valid payment → Booking confirmed → Tour completed.'}</p>
    <p>{vi ? 'Tour cá nhân hóa: Gửi yêu cầu → Duyệt và lập báo giá → Chấp nhận báo giá → Đặt tour và thanh toán.' : 'Personalized tour: Submit request → Review and quote → Accept quote → Book and pay.'}</p>
    <p>{vi ? 'Thanh toán thất bại không đồng nghĩa đơn đã hủy. Trạng thái đơn và thời hạn giữ chỗ được theo dõi riêng. Đơn đã hủy không đồng nghĩa đã hoàn tiền.' : 'A failed payment does not mean your booking is cancelled. Booking status and the reservation deadline are tracked separately. A cancelled booking does not mean a refund has been issued.'}</p>
  </details>;
}
