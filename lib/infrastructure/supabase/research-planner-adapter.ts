import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResearchInput, ResearchResponse } from '@/lib/application/planner/research-planner';
import { researchResponseSchema, researchOptionsSchema, refinementSchema, revisionSchema, type ResearchOptions, type ResearchEditSubmission, type RefinementInput, type RefinementSubmission, type RefinementResponse } from '@/lib/application/planner/research-workflow-contracts';

export type ResearchPlannerPort = ((request:ResearchInput)=>Promise<ResearchResponse>) & {
  resume?: (revisionId:string)=>Promise<ResearchResponse>;
  suggest?: (input:RefinementInput)=>Promise<RefinementResponse>;
  refine?: (input:RefinementSubmission)=>Promise<ResearchResponse>;
  options?: (revisionId:string)=>Promise<ResearchOptions>;
  edit?: (input:ResearchEditSubmission)=>Promise<ResearchResponse>;
};
export function createResearchPlannerAdapter(client:SupabaseClient):ResearchPlannerPort {
  async function invoke(body:unknown):Promise<unknown> {
    const {data:session,error:sessionError}=await client.auth.getSession();
    if(sessionError || !session.session) throw Error('AUTH_REQUIRED');
    const {data,error}=await client.functions.invoke('research-planner',{body:body as Record<string,unknown>});
    if(error) throw Error('SERVICE_UNAVAILABLE');
    return data;
  }
  function parse<T>(schema:{safeParse:(data:unknown)=>{success:boolean;data?:T}},data:unknown):T {
    const parsed=schema.safeParse(data);
    if(!parsed.success) throw Error('INVALID_RESPONSE');
    return parsed.data as T;
  }
  function revision(value:string) {
    if(!revisionSchema.safeParse(value).success) throw Error('INVALID_REVISION');
  }
  async function ready(body:unknown):Promise<ResearchResponse> {
    return parse(researchResponseSchema,await invoke(body)) as ResearchResponse;
  }
  const planner:ResearchPlannerPort=(request)=>ready(request);
  planner.resume=(revisionId)=>{revision(revisionId);return ready({action:'resume',revisionId});};
  planner.options=async(revisionId)=>{revision(revisionId);return parse(researchOptionsSchema,await invoke({action:'edit_options',revisionId})) as ResearchOptions;};
  planner.suggest=async(input)=>{revision(input.revisionId);return parse(refinementSchema,await invoke({...input,action:'suggest'}));};
  planner.refine=(input)=>{revision(input.revisionId);return ready({...input,action:'refine'});};
  planner.edit=(input)=>{revision(input.revisionId);return ready({...input,action:'edit'});};
  return planner;
}
