import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ResearchSavedInput } from '@/lib/application/planner/research-planner';
import { researchPlanSchema, savedInputSchema, revisionSchema } from '@/lib/application/planner/research-workflow-contracts';

const summarySchema = z.object({
  id: revisionSchema, ownerId: revisionSchema, status:z.enum(['pending_review','changes_requested','approved','rejected']),
  revisionId:revisionSchema, request:savedInputSchema, plan:researchPlanSchema,
  createdAt:z.string(), submittedAt:z.string().nullable(), notes:z.string().nullable(),
  history:z.array(z.object({status:z.string(),note:z.string().nullable(),at:z.string()})),
});
export type ResearchRequestSummary = Omit<z.infer<typeof summarySchema>, 'request'> & {request: ResearchSavedInput};
export type ResearchRequestPort = {
  submit(revisionId:string):Promise<string>;
  listCustomer?():Promise<ResearchRequestSummary[]>;
};
export function createResearchRequestAdapter(client:SupabaseClient):ResearchRequestPort {
  async function requireSession() {
    const {data,error}=await client.auth.getSession();
    if(error || !data.session) throw Error('AUTH_REQUIRED');
  }
  return {
    async submit(revisionId) {
      if(!revisionSchema.safeParse(revisionId).success) throw Error('INVALID_REVISION');
      await requireSession();
      const {data,error}=await client.rpc('research_demo_submit',{p_revision_id:revisionId});
      if(error) {
        if(/latest|revision|itinerary/i.test(error.message)) throw Error('REVISION_CONFLICT');
        if(/permission|authentication|customer/i.test(error.message)) throw Error('AUTH_REQUIRED');
        throw Error('REQUEST_SUBMIT_FAILED');
      }
      if(!revisionSchema.safeParse(data).success) throw Error('INVALID_RESPONSE');
      return data as string;
    },
    async listCustomer() {
      await requireSession();
      const {data,error}=await client.rpc('research_demo_list',{p_admin:false});
      if(error) throw Error('REQUESTS_UNAVAILABLE');
      const parsed=z.array(summarySchema).safeParse(data);
      if(!parsed.success) throw Error('INVALID_RESPONSE');
      return parsed.data;
    },
  };
}
