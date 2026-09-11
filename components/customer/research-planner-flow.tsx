"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {readPersonalizationState} from '@/lib/application/planner/personalization-session';
import type {ResearchResponse} from '@/lib/application/planner/research-planner';
import type {ResearchPlannerPort} from '@/lib/infrastructure/supabase/research-planner-adapter';
import styles from './research-planner-flow.module.css';

export function ResearchPlannerFlow({locale,planner}:{locale:'vi'|'en';planner:ResearchPlannerPort}){
 const vi=locale==='vi';
 const [result,setResult]=useState<ResearchResponse|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const pending=useRef<{key:number;promise:Promise<ResearchResponse>}|null>(null);
 useEffect(()=>{
  let disposed=false;
  setResult(null);setError('');
  const saved=readPersonalizationState();
  if(saved.status!=='ok'){setError('FORM_REQUIRED');return;}
  if(!pending.current||pending.current.key!==retry)pending.current={key:retry,promise:planner(saved.request)};
  pending.current.promise.then(value=>{if(!disposed)setResult(value);}).catch(e=>{if(!disposed)setError(e instanceof Error?e.message:'SERVICE_UNAVAILABLE');});
  return()=>{disposed=true;};
 },[planner,retry]);
 const money=(n:number)=>new Intl.NumberFormat(vi?'vi-VN':'en-US').format(n)+' VND';
 const reasonText:Record<string,string>=vi?{
  budget:'Ngân sách chưa đủ cho các điểm dừng, hướng dẫn viên và chặng đi về. Hãy tăng ngân sách hoặc chọn ít khu vực hơn.',
  duration:'Thời lượng chưa đủ, tính cả thời gian di chuyển và chặng về. Hãy tăng thời lượng hoặc chọn khu vực gần hơn.',
  capacity:'Số người vượt giới hạn nhóm của các địa điểm. Hãy giảm số khách hoặc chọn khu vực khác.',
  closed:'Các điểm phù hợp không còn đủ thời gian tham quan trong giờ hoạt động. Hãy đổi ngày hoặc bắt đầu sớm hơn.',
  dietary:'Chưa xác nhận được địa điểm ăn uống đáp ứng yêu cầu. Hãy điều chỉnh yêu cầu ăn uống hoặc trao đổi thêm với LocalLens.',
  area:'Chưa có địa điểm đủ điều kiện trong khu vực đã chọn. Hãy chọn khu vực khác.',
 }:{budget:'Increase your budget or choose fewer areas; travel and the return trip are included.',duration:'Allow more time or choose a closer area, including the return trip.',capacity:'Reduce the group size or choose another area.',closed:'Try another date or an earlier start; visits must fit opening hours.',dietary:'Dietary support is not confirmed. Adjust your request or contact LocalLens.',area:'Choose another area with eligible places.'};
 if(!result&&!error)return <section className={styles.state} role="status" aria-live="polite" aria-busy="true"><h2>{vi?'Đang tạo lịch trình phù hợp với bạn…':'Preparing your itinerary…'}</h2><p>{vi?'Đang lọc địa điểm, sắp xếp thứ tự và kiểm tra thời gian, chi phí trước khi trả kết quả.':'Filtering places, arranging stops and checking time and costs.'}</p></section>;
 if(error||!result||result.status!=='ready')return <section className={styles.state} role="alert"><h2>{vi?'Chưa thể tạo lịch trình':'Unable to create an itinerary'}</h2>
  {error==='AUTH_REQUIRED'?<><p>{vi?'Vui lòng đăng nhập để tạo tour cá nhân hóa. Thông tin đã điền vẫn được giữ lại.':'Please sign in. Your preferences have been kept.'}</p><Link className="button" href={`/${locale}/sign-in/?returnTo=/${locale}/planner/`}>{vi?'Đăng nhập':'Sign in'}</Link></>:<>
  {result?.status==='no_match'?<ul>{result.reasons.map(r=><li key={r}>{reasonText[r]??reasonText.area}</li>)}</ul>:<p>{vi?'Dịch vụ tạo lịch trình chưa sẵn sàng hoặc yêu cầu cần kiểm tra lại. Bạn có thể thử lại hoặc chỉnh thông tin phía trên.':'The planner is unavailable or your request needs checking. Retry or edit your preferences above.'}</p>}
  <button type="button" className="button button--secondary" onClick={()=>setRetry(n=>n+1)}>{vi?'Thử lại':'Try again'}</button></>}
 </section>;
 const {plan}=result;
 const preferenceNames:Record<string,string>=vi?{street_food:'ẩm thực',history:'lịch sử và văn hóa',traditional_craft:'làng nghề',traditional_market:'chợ và đời sống địa phương'}:{street_food:'food',history:'history and culture',traditional_craft:'crafts',traditional_market:'markets and local life'};
 return <section className={styles.layout} aria-label={vi?'Lịch trình gợi ý':'Suggested itinerary'}>
  <div><h2>{vi?'Tour cá nhân hóa dành cho bạn':'Your personalized itinerary'}</h2><p>{vi?'Khởi hành và trở về điểm hẹn dự kiến tại khu Nguyễn Huệ.':'Depart from and return to the proposed meeting point near Nguyen Hue.'}</p>
   {result.preferenceNotices?.map(notice=><p key={notice.preference} role="note">{vi
    ?`Các điểm ${preferenceNames[notice.preference]} bạn ưu tiên ${notice.reason==='closed'?'không còn đủ thời gian tham quan trong giờ hoạt động':'chưa phù hợp với các điều kiện của chuyến đi'}. Chúng tôi đã chọn trải nghiệm khác trong khu vực bạn chọn. Bạn có thể đổi giờ bắt đầu hoặc điều chỉnh nhu cầu để có thêm lựa chọn.`
    :`Your preferred ${preferenceNames[notice.preference]} stops ${notice.reason==='closed'?'cannot fit within opening hours':'do not fit this trip’s constraints'}. We selected other experiences within your chosen area. Try an earlier start or adjust your preferences.`}</p>)}
   <ol className={styles.timeline}>{plan.stops.map((stop,index)=>{const leg=plan.legs[index];return <li key={stop.id}>
    <p className={styles.transfer}>{leg.departure} → {leg.arrival} · {vi?'Di chuyển':'Travel'} {leg.minutes} {vi?'phút':'min'} · {money(leg.costVnd)}</p>
    <article><p>{stop.arrival} – {stop.departure}</p><h3>{stop.name}</h3><p>{stop.address}</p><p>{stop.durationMinutes} {vi?'phút tham quan':'min visit'} · {money(stop.perPersonVnd)} / {vi?'khách':'guest'}</p>{stop.waitMinutes>0&&<p>{vi?'Chờ đến giờ mở cửa':'Wait until opening'}: {stop.waitMinutes} {vi?'phút':'min'}</p>}</article>
   </li>;})}</ol>
   <p className={styles.transfer}>{plan.legs.at(-1)?.departure} → {plan.returnTime} · {vi?'Trở về điểm hẹn':'Return to meeting point'} · {plan.legs.at(-1)?.minutes} {vi?'phút':'min'} · {money(plan.legs.at(-1)?.costVnd??0)}</p>
  </div>
  <aside className={styles.summary}><h3>{vi?'Tổng kết chuyến đi':'Trip summary'}</h3><dl>
   <dt>{vi?'Số điểm dừng':'Stops'}</dt><dd>{plan.stops.length}</dd><dt>{vi?'Tổng thời gian':'Total time'}</dt><dd>{plan.durationMinutes} {vi?'phút':'min'}</dd>
   <dt>{vi?'Tham quan và ăn uống':'Visits and food'}</dt><dd>{money(plan.visitAndFoodVnd)}</dd><dt>{vi?'Di chuyển cả nhóm':'Group transport'}</dt><dd>{money(plan.transportVnd)}</dd><dt>{vi?'Hướng dẫn viên':'Guide'}</dt><dd>{money(plan.guideVnd)}</dd><dt>{vi?'Tổng chi phí dự kiến':'Estimated total'}</dt><dd><strong>{money(plan.totalVnd)}</strong></dd></dl>
   <p>{vi?'Lịch trình mẫu sử dụng ước tính nội bộ; chi phí và khả năng tiếp khách chưa phải xác nhận của cơ sở.':'Sample itinerary using internal estimates; costs and availability are not confirmed by operators.'}</p>
   {result.exchangeRateVndPerUsd&&<p>{vi?'Tỷ giá mô phỏng':'Simulation exchange rate'}: 1 USD = {money(result.exchangeRateVndPerUsd)}</p>}
   <p>{vi?'Yêu cầu đặc biệt cần được LocalLens xác nhận trước chuyến đi.':'Special requests need confirmation before travel.'}</p>
  </aside>
 </section>;
}
