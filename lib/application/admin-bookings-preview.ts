export const orderLabels = {pending_payment:'Chờ thanh toán',confirmed:'Đã xác nhận',completed:'Đã hoàn thành',cancelled:'Đã hủy',expired:'Đã hết hạn'} as const;
export const paymentLabels = {pending:'Chờ thanh toán',processing:'Đang xử lý thanh toán',paid:'Đã thanh toán',failed:'Thanh toán thất bại',review:'Chưa xác nhận thanh toán'} as const;
export type BookingView = {
 id:string; customer:string; email:string; kind:'fixed'|'personalized'; tour:string; departure:string;
 people:number; total:number; status:keyof typeof orderLabels; payment:keyof typeof paymentLabels;
 createdAt:string; holdUntil:string; paidAt?:string; confirmedAt?:string; completedAt?:string;
 transaction?:string; history:{at:string; title:string; description:string}[];
};
export type BookingFilters={query:string;kind:string;status:string;payment:string;from:string;to:string};
export const emptyBookingFilters:BookingFilters={query:'',kind:'',status:'',payment:'',from:'',to:''};
export function filterBookings(rows:BookingView[], filters:BookingFilters){
 const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
 const query=normalize(filters.query.trim());
 return rows.filter(row=>(!query||normalize(`${row.id} ${row.customer} ${row.email} ${row.tour}`).includes(query))
 &&(!filters.kind||row.kind===filters.kind)&&(!filters.status||row.status===filters.status)&&(!filters.payment||row.payment===filters.payment)
 &&(!filters.from||row.createdAt.slice(0,10)>=filters.from)&&(!filters.to||row.createdAt.slice(0,10)<=filters.to));
}
export interface BookingPreviewPort{list():Promise<BookingView[]>;detail(id:string):Promise<BookingView>}
