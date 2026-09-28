export type DepartureStatus='scheduled'|'sold_out'|'cancelled'|'completed';
export type Departure={id:string;tourId:string;version:string;date:string;start:string;end:string;capacity:number;held:number;booked:number;status:DepartureStatus};
export const departureLabels:Record<DepartureStatus,string>={scheduled:'Đã lên lịch',sold_out:'Hết chỗ',cancelled:'Đã hủy',completed:'Đã hoàn thành'};
export const remaining=(d:Departure)=>Math.max(0,d.capacity-d.held-d.booked);
export function createDeparture(input:Departure,now=Date.now()):Departure{
 if(!input.date||!/^\d{2}:\d{2}$/.test(input.start)||!/^\d{2}:\d{2}$/.test(input.end))throw Error('Vui lòng nhập đầy đủ ngày và giờ khởi hành');
 if(!Number.isFinite(Date.parse(`${input.date}T${input.start}:00+07:00`))||Date.parse(`${input.date}T${input.start}:00+07:00`)<=now)throw Error('Ngày giờ khởi hành phải ở tương lai');
 if(input.end<=input.start)throw Error('Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày');
 if(!Number.isInteger(input.capacity)||input.capacity<1||input.capacity>1000)throw Error('Tổng số chỗ phải là số nguyên từ 1 đến 1.000');
 return {...input,held:0,booked:0,status:'scheduled'};
}
export function cancelDeparture(d:Departure):Departure{
 if(d.status==='cancelled'||d.status==='completed')throw Error('Không thể hủy lịch đã hủy hoặc đã hoàn thành');
 return {...d,status:'cancelled',held:0};
}
