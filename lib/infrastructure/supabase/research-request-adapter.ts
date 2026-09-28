import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ResearchSavedInput } from '@/lib/application/planner/research-planner';
import { researchPlanSchema, savedInputSchema, revisionSchema } from '@/lib/application/planner/research-workflow-contracts';

const quoteSchema=z.object({id:revisionSchema,title:z.string(),amount:z.number().positive(),currency:z.enum(['VND','USD']),conditions:z.string(),status:z.enum(['active','expired','checkout_pending','accepted']),createdAt:z.string(),expiresAt:z.string()});
export const researchBookingSchema=z.object({id:revisionSchema,quote_id:revisionSchema,status:z.enum(['pending_payment','confirmed','expired','cancelled']),payment_status:z.enum(['pending','failed','paid']),party_size:z.number().int().positive(),expires_at:z.string(),amount:z.number(),currency:z.string(),cancelled_at:z.string().nullable().optional(),trip_start_at:z.string().nullable().optional()});
const bookingSchema=researchBookingSchema;
export type ResearchQuote=z.infer<typeof quoteSchema>;
export type ResearchBooking=z.infer<typeof bookingSchema>;
export type PersonalizedCheckout={travelers:{name:string;country:string;phone:string;email:string}[];outcome:'success'|'declined'};
const summarySchema = z.object({
  id: revisionSchema, ownerId: revisionSchema, status:z.enum(['pending_review','changes_requested','approved','rejected']),
  revisionId:revisionSchema, request:savedInputSchema, plan:researchPlanSchema,
  createdAt:z.string(), submittedAt:z.string().nullable(), notes:z.string().nullable(),
  history:z.array(z.object({status:z.string(),note:z.string().nullable(),at:z.string()})),
  quotes:z.array(quoteSchema).optional(),processingDueAt:z.string().nullable().optional(),processingCompletedAt:z.string().nullable().optional(),
});
export type ResearchRequestSummary = Omit<z.infer<typeof summarySchema>, 'request'> & {request: ResearchSavedInput};
export type ResearchRequestPort = {
  cancelBooking(bookingId:string,idempotencyKey:string):Promise<ResearchBooking>;
  submit(revisionId:string):Promise<string>;
  listCustomer?():Promise<ResearchRequestSummary[]>;
  booking?(quoteId:string,create:boolean):Promise<ResearchBooking|null>;
  checkout?(quoteId:string,details:PersonalizedCheckout):Promise<ResearchBooking>;
};
export function createResearchRequestAdapter(client:SupabaseClient):ResearchRequestPort {
  async function requireSession() {
    const {data,error}=await client.auth.getSession();
    if(error || !data.session) throw Error('AUTH_REQUIRED');
  }
  return {
    async cancelBooking(bookingId,idempotencyKey){
      if(!revisionSchema.safeParse(bookingId).success||!idempotencyKey.trim()) throw Error('INVALID_CANCELLATION');
      await requireSession();
      const {data,error}=await client.rpc('research_demo_cancel_booking',{p_booking:bookingId,p_idempotency_key:idempotencyKey});
      if(error) throw Error(error.code==='PGRST202'||error.code==='42883'?'CANCELLATION_UNAVAILABLE':'CANCELLATION_FAILED');
      const saved=bookingSchema.parse(data);
      if(saved.id!==bookingId||saved.status!=='cancelled') throw Error('INVALID_RESPONSE');
      return saved;
    },
    async booking(quoteId,create){
      if(!revisionSchema.safeParse(quoteId).success) throw Error('INVALID_QUOTE');
      await requireSession();
      const {data,error}=await client.rpc('research_demo_booking',{p_quote:quoteId,p_create:create});
      if(error) throw Error('BOOKING_UNAVAILABLE');
      return bookingSchema.nullable().parse(data);
    },
    async checkout(quoteId,details){
      if(!revisionSchema.safeParse(quoteId).success) throw Error('INVALID_QUOTE');
      await requireSession();
      const {data,error}=await client.rpc('research_demo_checkout',{p_quote:quoteId,p_details:details});
      if(error) throw Error('CHECKOUT_UNAVAILABLE');
      return bookingSchema.parse(data);
    },
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
