export const HOUR_MS=3_600_000;
export const REQUEST_LEAD_MS=72*HOUR_MS;
export function canSubmitPersonalized(startAt:string,now=Date.now()):boolean{
 const start=Date.parse(startAt);
 return Number.isFinite(start)&&start-now>=REQUEST_LEAD_MS;
}
export function quoteDeadline(startAt:string,issuedAt=Date.now()):number{
 return Math.min(issuedAt+48*HOUR_MS,Date.parse(startAt)-24*HOUR_MS);
}
export function requestTimeMessage(vi:boolean):string{
 return vi?'Yêu cầu tour cá nhân hóa phải được gửi trước giờ khởi hành ít nhất 72 giờ. Vui lòng chọn ngày giờ khác':'Personalized requests must be submitted at least 72 hours before departure. Please choose another date and time.';
}
