import type {SupabaseClient} from '@supabase/supabase-js';
import type {ResearchInput,ResearchResponse} from '@/lib/application/planner/research-planner';
export type ResearchPlannerPort = (request:ResearchInput)=>Promise<ResearchResponse>;
export function createResearchPlannerAdapter(client:SupabaseClient):ResearchPlannerPort{
 return async request=>{
  const {data:session}=await client.auth.getSession();
  if(!session.session)throw Error('AUTH_REQUIRED');
  const {data,error}=await client.functions.invoke('research-planner',{body:request});
  if(error)throw Error('SERVICE_UNAVAILABLE');
  if(!data||!['ready','no_match','invalid','ai_error'].includes(data.status))throw Error('INVALID_RESPONSE');
  return data as ResearchResponse;
 };
}
