export type DepartureStatus='scheduled'|'sold_out'|'cancelled'|'completed';
export type Departure={id:string;tourId:string;version:string;date:string;start:string;end:string;capacity:number;held:number;booked:number;status:DepartureStatus};
export const departureLabels:Record<DepartureStatus,string>={scheduled:'Đã lên lịch',sold_out:'Hết chỗ',cancelled:'Đã hủy',completed:'Đã hoàn thành'};
export const remaining=(d:Departure)=>Math.max(0,d.capacity-d.held-d.booked);
export function createDeparture(input:Departure,now=Date.now()):Departure{
 const validTime=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!validTime.test(input.start)||!validTime.test(input.end))throw Error('Vui lòng nhập ngày và giờ khởi hành hợp lệ');
 const calendarDay=Date.parse(`${input.date}T00:00:00Z`);
 if(!Number.isFinite(calendarDay)||new Date(calendarDay).toISOString().slice(0,10)!==input.date)throw Error('Ngày khởi hành không hợp lệ');
 if(Date.parse(`${input.date}T${input.start}:00+07:00`)<=now)throw Error('Ngày giờ khởi hành phải ở tương lai');
 if(input.end<=input.start)throw Error('Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày');
 if(!Number.isInteger(input.capacity)||input.capacity<1||input.capacity>1000)throw Error('Tổng số chỗ phải là số nguyên từ 1 đến 1.000');
 return {...input,held:0,booked:0,status:'scheduled'};
}
export function canCancelDeparture(d:Departure,now=Date.now()):boolean{
 return ['scheduled','sold_out'].includes(d.status)&&Date.parse(`${d.date}T${d.start}:00+07:00`)>now;
}
export function cancelDeparture(d:Departure,now=Date.now()):Departure{
 if(d.status==='cancelled'||d.status==='completed')throw Error('Không thể hủy lịch đã hủy hoặc đã hoàn thành');
 if(!canCancelDeparture(d,now))throw Error('Không thể hủy lịch đã đến giờ khởi hành');
 return {...d,status:'cancelled',held:0};
}
