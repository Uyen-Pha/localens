import type { ResearchInput, ResearchResponse } from '@/lib/application/planner/research-planner';

export const revisionId = '11111111-1111-4111-8111-111111111111';
export const nextRevisionId = '22222222-2222-4222-8222-222222222222';
export const requestId = '33333333-3333-4333-8333-333333333333';
export const researchInput: ResearchInput = {
  startAt: '2027-10-10T09:00:00+07:00', durationMinutes: 240,
  areas: ['central'], budget: { currency: 'VND', amountMinor: 2000000 },
  partySize: 2, guideLanguage: 'vi', pace: 'relaxed',
  priorityWeights: { street_food: 3, history: 3, traditional_craft: 0, traditional_market: 0 },
  dietaryRequirements: [], mobilityRequirements: [], lockedStopIds: [], specialNeeds: '',
};
export const researchReady = {
  status: 'ready', dataMode: 'internal_simulation', ranking: 'ai', exchangeRateVndPerUsd: null,
  revisionId, revisionNumber: 1, request: researchInput, lockedStopIds: [],
  plan: {
    stops: [{ id: 'LL-R01', name: 'Điểm tham quan A', address: 'TP.HCM', arrival: '09:20', departure: '10:00', durationMinutes: 40, waitMinutes: 0, perPersonVnd: 50000 }],
    legs: [{ from: 'ORIGIN-CENTER', to: 'LL-R01', departure: '09:00', arrival: '09:20', minutes: 20, costVnd: 50000 }, { from: 'LL-R01', to: 'ORIGIN-CENTER', departure: '10:00', arrival: '10:20', minutes: 20, costVnd: 50000 }],
    totalVnd: 600000, visitAndFoodVnd: 100000, guideVnd: 400000, transportVnd: 100000, durationMinutes: 80, returnTime: '10:20',
  },
} satisfies ResearchResponse & { revisionId: string; revisionNumber: number; request: ResearchInput; lockedStopIds: string[] };
