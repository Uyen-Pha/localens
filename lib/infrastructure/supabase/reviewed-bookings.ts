import type { SupabaseClient } from '@supabase/supabase-js';
import { FixedTourRuntimeError } from '@/lib/application/fixed-tour/contracts';
export interface ReviewedBooking {id:string; departure_id:string; party_size:number; total_vnd:number; status:'pending_payment'|'confirmed'|'completed'|'expired'|'cancelled'; created_at:string; expires_at:string; paid_at:string|null;rating?:number|null;review_text?:string|null;reviewed_at?:string|null}
export function createReviewedBookings(client:SupabaseClient) {
 return {
  async begin(departure:string,size:number,key:string):Promise<ReviewedBooking> {
   const {data,error}=await client.rpc('reviewed_demo_begin',{p_departure:departure,p_size:size,p_key:key});
   if(error) {if(error.message.includes('SOLD_OUT')) throw new FixedTourRuntimeError('SOLD_OUT');throw new Error(error.message);}
   return data;
  },
  async pay(id:string):Promise<ReviewedBooking> {const {data,error}=await client.rpc('reviewed_demo_pay',{p_booking:id});if(error) throw new Error(error.message);return data as ReviewedBooking;},
  async list():Promise<ReviewedBooking[]> {const {data,error}=await client.rpc('reviewed_demo_read');if(error) throw new Error(error.message);return data;},
  async get(id:string):Promise<ReviewedBooking> {const {data,error}=await client.rpc('reviewed_demo_read',{p_booking:id}).single();if(error) throw new Error(error.message);return data as ReviewedBooking;},
  async cancel(id:string):Promise<ReviewedBooking> {const {data,error}=await client.rpc('reviewed_demo_cancel',{p_booking:id});if(error)throw new Error(error.message);return data;},
  async review(id:string,rating:number,body:string):Promise<ReviewedBooking> {const {data,error}=await client.rpc('reviewed_demo_review',{p_booking:id,p_rating:rating,p_text:body});if(error)throw new Error(error.message);return data;},
  async availability():Promise<{departure_id:string;remaining:number}[]> {const {data,error}=await client.rpc('reviewed_demo_availability');if(error) throw new Error(error.message);return data;},
 };
}
export type ReviewedBookings = ReturnType<typeof createReviewedBookings>;




