import type { SupabaseClient } from '@supabase/supabase-js';
import { FixedTourRuntimeError } from '@/lib/application/fixed-tour/contracts';
export type ReviewedPaymentStatus = 'pending'|'processing'|'paid'|'failed'|'reviewing'|'cancelled'|'refunding'|'refunded';
export interface CheckoutDetails {name:string;email:string;phone:string;passengers:string[];outcome:'success'|'declined'}
export interface PublicTourReviews {count:number;average:number|null;reviews:{rating:number;review_text:string;reviewed_at:string}[]}
export interface ReviewedBooking {payment_status?:ReviewedPaymentStatus;refund_due_at?:string|null;refunded_at?:string|null;id:string; departure_id:string; party_size:number; total_vnd:number; status:'pending_payment'|'confirmed'|'completed'|'expired'|'cancelled'; created_at:string; expires_at:string; paid_at:string|null;rating?:number|null;review_text?:string|null;reviewed_at?:string|null}
export function createReviewedBookings(client:SupabaseClient) {
 return {
  async begin(departure:string,size:number,key:string):Promise<ReviewedBooking> {
   const {data,error}=await client.rpc('reviewed_demo_begin',{p_departure:departure,p_size:size,p_key:key});
   if(error) {if(error.message.includes('SOLD_OUT')) throw new FixedTourRuntimeError('SOLD_OUT');throw new Error(error.message);}
   return data;
  },
  async pay(id:string):Promise<ReviewedBooking> {const {data,error}=await client.rpc('reviewed_demo_pay',{p_booking:id});if(error) throw new Error(error.message);return data as ReviewedBooking;},
  async checkout(id:string,details:CheckoutDetails):Promise<ReviewedBooking> {const {data,error}=await client.rpc('reviewed_demo_checkout',{p_booking:id,p_details:details});if(error)throw new Error(error.message);return data as ReviewedBooking;},
  async list():Promise<ReviewedBooking[]> {const {data,error}=await client.rpc('reviewed_demo_read');if(error) throw new Error(error.message);return data;},
  async get(id:string):Promise<ReviewedBooking> {const {data,error}=await client.rpc('reviewed_demo_read',{p_booking:id}).single();if(error) throw new Error(error.message);return data as ReviewedBooking;},
  async cancel(id:string):Promise<ReviewedBooking> {const {data,error}=await client.rpc('reviewed_demo_cancel',{p_booking:id});if(error)throw new Error(error.message);return data;},
  async review(id:string,rating:number,body:string):Promise<ReviewedBooking> {const {data,error}=await client.rpc('reviewed_demo_review',{p_booking:id,p_rating:rating,p_text:body});if(error)throw new Error(error.message);return data;},
  async publicReviews(departure:string):Promise<PublicTourReviews> {const {data,error}=await client.rpc('reviewed_demo_public_reviews',{p_departure:departure});if(error)throw new Error(error.message);return data;},
  async availability():Promise<{departure_id:string;remaining:number}[]> {const {data,error}=await client.rpc('reviewed_demo_availability');if(error) throw new Error(error.message);return data;},
 };
}
export type ReviewedBookings = ReturnType<typeof createReviewedBookings>;





