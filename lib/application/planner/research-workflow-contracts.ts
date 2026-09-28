import { z } from 'zod';
import type { ResearchPlan, ResearchResponse, ResearchSavedInput } from './research-planner';

const number = z.number().finite().nonnegative();
const id = z.string().min(1);
const weight = z.union([z.literal(0),z.literal(1),z.literal(2),z.literal(3),z.literal(4),z.literal(5)]);
export const revisionSchema = z.uuid();
const stop = z.object({ id, name: id, address: z.string(), arrival: id, departure: id, durationMinutes: number, waitMinutes: number, perPersonVnd: number });
const leg = z.object({ from: id, to: id, departure: id, arrival: id, minutes: number, costVnd: number });
export const researchPlanSchema = z.object({
  stops: z.array(stop).min(1), legs: z.array(leg).min(2), totalVnd: number, visitAndFoodVnd: number,
  guideVnd: number, transportVnd: number, durationMinutes: number, returnTime: id,
}).refine(p => p.legs.length === p.stops.length + 1);
export const savedInputSchema = z.object({
  startAt: z.string().datetime({ offset: true }), durationMinutes: number, areas: z.array(z.string()),
  budget: z.object({ currency: z.enum(['VND', 'USD']), amountMinor: number }), partySize: z.number().int().positive(),
  guideLanguage: z.enum(['en', 'vi']), pace: z.enum(['relaxed', 'active', 'balanced']),
  priorityWeights: z.object({ street_food: weight, history: weight, traditional_craft: weight, traditional_market: weight }),
  dietaryRequirements: z.array(z.string()), mobilityRequirements: z.array(z.string()), lockedStopIds: z.array(z.string()), specialNeeds: z.string(),
});
export const researchResponseSchema = z.union([
  z.object({
    status: z.literal('ready'), plan: researchPlanSchema, dataMode: z.literal('internal_simulation'),
    ranking: z.enum(['ai', 'customer']), exchangeRateVndPerUsd: number.nullable(),
    revisionId: revisionSchema.optional(), revisionNumber: z.number().int().positive().optional(),
    request: savedInputSchema.optional(), lockedStopIds: z.array(id).optional(), submittedRequestId: revisionSchema.optional(),
    catalogVersion: z.string().optional(),
    preferenceNotices: z.array(z.object({ preference: z.enum(['street_food','history','traditional_craft','traditional_market']), reason: z.enum(['closed','constraints']) })).optional(),
  }),
  z.object({ status: z.enum(['no_match', 'invalid', 'ai_error']), reasons: z.array(z.string()) }),
]);
export type RefinementIntent = 'replace'|'add'|'remove'|'less_travel'|'cheaper'|'more_food'|'more_history'|'relaxed'|'earlier'|'locks';
export type RefinementInput = { revisionId: string; intent: RefinementIntent; targetId?: string; lockedStopIds: string[] };
export type RefinementSubmission = RefinementInput & { suggestionId: string; editKey: string };
export type RefinementSuggestion = { id: string; label: string; stopIds: string[]; plan: ResearchPlan; delta: {costVnd:number;travelMinutes:number;durationMinutes:number}; pace: ResearchSavedInput['pace'] };
export type RefinementResponse = {status:'suggestions';suggestions:RefinementSuggestion[]} | Extract<ResearchResponse,{reasons:string[]}>;
export type ResearchEditSubmission = {revisionId:string;editKey:string;stopIds:string[];startAt:string;durationMinutes:number;budget:ResearchSavedInput['budget']};
export type ResearchOptions = {request:ResearchSavedInput;options:{id:string;name:string;durationMinutes:number}[];revisionNumber?:number};
export const researchOptionsSchema = z.object({ request:savedInputSchema, options:z.array(z.object({id,name:id,durationMinutes:number})), revisionNumber:z.number().int().positive().optional() });
export const refinementSchema = z.union([
  z.object({status:z.literal('suggestions'),suggestions:z.array(z.object({id,label:z.string(),stopIds:z.array(id),plan:researchPlanSchema,delta:z.object({costVnd:z.number().finite(),travelMinutes:z.number().finite(),durationMinutes:z.number().finite()}),pace:z.enum(['relaxed','active','balanced'])}))}),
  z.object({status:z.enum(['no_match','invalid','ai_error']),reasons:z.array(z.string())}),
]);
