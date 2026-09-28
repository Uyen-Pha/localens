"use client";

import { useEffect, useState } from 'react';
import type { PortalIdentity, PortalSessionPort } from '@/lib/application/portal/contracts';
import type { ResearchPlannerPort } from '@/lib/infrastructure/supabase/research-planner-adapter';
import type { ResearchRequestPort } from '@/lib/infrastructure/supabase/research-request-adapter';
import { ResearchPlannerFlow } from './research-planner-flow';

export function ResearchPlannerSession({locale,planner,requests,session}:{locale:'vi'|'en';planner:ResearchPlannerPort;requests?:ResearchRequestPort;session:PortalSessionPort}) {
  const [identity,setIdentity]=useState<PortalIdentity|null|undefined>(undefined);
  const [failed,setFailed]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let disposed=false;
    setIdentity(undefined);setFailed(false);
    session.getSession().then(value=>{if(!disposed)setIdentity(value);}).catch(()=>{if(!disposed)setFailed(true);});
    return()=>{disposed=true;};
  },[session,retry]);
  if(failed)return <section role="alert"><p>{locale==='vi'?'Chưa kiểm tra được phiên đăng nhập. Vui lòng thử lại.':'Unable to check your session. Please retry.'}</p><button type="button" onClick={()=>setRetry(n=>n+1)}>{locale==='vi'?'Thử lại':'Retry'}</button></section>;
  if(identity===undefined)return <p role="status">{locale==='vi'?'Đang kiểm tra phiên đăng nhập…':'Checking your session…'}</p>;
  return <ResearchPlannerFlow key={identity?.userId??'signed-out'} locale={locale} planner={planner} requests={requests} actorRole={identity?.role??'signed-out'} actorId={identity?.userId}/>;
}
