'use client';
import {useEffect,useState} from 'react';
import type {ResearchDemoRequest} from '@/lib/infrastructure/supabase/research-demo-adapter';
export function RequestProcessingTime({request,vi=true,compact=false}:{request:ResearchDemoRequest;vi?:boolean;compact?:boolean}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
 if(!request.processingDueAt)return null;
 const completed=Boolean(request.processingCompletedAt),overdue=!completed&&Date.parse(request.processingDueAt)<now;
 const format=(v:string)=>new Date(v).toLocaleString(vi?'vi-VN':'en-GB',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'});
 return <div style={{marginTop:8,padding:compact?'4px 0':'12px 16px',borderRadius:8,border:overdue?'1px solid #f0b8c0':undefined,background:compact?'transparent':overdue?'#fff1f2':'#edf7f4',color:overdue?'#b4233b':'#075749',fontSize:compact?14:16,fontWeight:overdue?600:undefined}}>
 {!compact&&request.submittedAt&&<p>{vi?'Lần gửi gần nhất':'Last submitted'}: {format(request.submittedAt)}</p>}
 <p>{completed?(vi?'Đã trả kết quả':'Result returned'):overdue?(vi?'Quá hạn xử lý':'Processing overdue'):(vi?'Dự kiến trả kết quả trước':'Response due by')}: {format(completed?request.processingCompletedAt!:request.processingDueAt)}</p>
 {!compact&&!completed&&<p>{vi?'Thời hạn xử lý: 12 giờ liên tục từ lần gửi hợp lệ gần nhất.':'Processing time: 12 continuous hours from the latest valid submission.'}</p>}
 </div>;
}
