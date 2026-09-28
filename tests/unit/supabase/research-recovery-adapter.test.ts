import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createResearchPlannerAdapter } from '@/lib/infrastructure/supabase/research-planner-adapter';
import { researchInput, researchReady, revisionId } from '../../fixtures/research-recovery';

function client(data: unknown, authenticated = true) {
  const invoke = vi.fn(async () => ({ data, error: null }));
  return { invoke, value: { auth: { getSession: async () => ({ data: { session: authenticated ? { user: { id: 'customer' } } : null }, error: null }) }, functions: { invoke } } as unknown as SupabaseClient };
}
describe('research planner deployed contracts', () => {
  it('accepts edit options without a status discriminator', async () => {
    const c = client({ request: researchInput, options: [{ id: 'LL-R01', name: 'Điểm A', durationMinutes: 40 }], revisionNumber: 1 });
    const planner = createResearchPlannerAdapter(c.value);
    expect(planner.options).toBeTypeOf('function');
    expect((await planner.options!(revisionId)).options[0].id).toBe('LL-R01');
    expect(c.invoke).toHaveBeenCalledWith('research-planner', { body: { action: 'edit_options', revisionId } });
  });
  it('resumes the server revision without generating another itinerary', async () => {
    const c = client(researchReady);
    const planner = createResearchPlannerAdapter(c.value);
    expect(planner.resume).toBeTypeOf('function');
    expect((await planner.resume!(revisionId)).status).toBe('ready');
    expect(c.invoke).toHaveBeenCalledWith('research-planner', { body: { action: 'resume', revisionId } });
  });
  it('rejects malformed ready data before rendering a success state', async () => {
    const c = client({ status: 'ready', plan: null });
    await expect(createResearchPlannerAdapter(c.value)(researchInput)).rejects.toThrow('INVALID_RESPONSE');
  });
  it('does not invoke the service for signed-out users', async () => {
    const c = client(researchReady, false);
    await expect(createResearchPlannerAdapter(c.value)(researchInput)).rejects.toThrow('AUTH_REQUIRED');
    expect(c.invoke).not.toHaveBeenCalled();
  });
});
