import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ResearchPlannerFlow } from '@/components/customer/research-planner-flow';
import { readPersonalizationState, savePersonalizationRequest } from '@/lib/application/planner/personalization-session';
import { researchInput, researchReady, revisionId } from '../../fixtures/research-recovery';

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.sessionStorage.clear(); });

it('reconnects the pending generation when StrictMode replay crosses the cutoff', async () => {
  const cutoff = Date.parse(researchInput.startAt) - 72 * 60 * 60 * 1000;
  const now = vi.spyOn(Date, 'now').mockReturnValue(cutoff);
  savePersonalizationRequest(researchInput);
  const planner = vi.fn(async () => {
    now.mockReturnValue(cutoff + 1);
    return researchReady;
  });
  render(<StrictMode><ResearchPlannerFlow locale="vi" planner={planner} actorRole="customer" actorId="customer-a" /></StrictMode>);
  await screen.findByText('Điểm tham quan A');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(planner).toHaveBeenCalledExactlyOnceWith(researchInput);
  const saved = readPersonalizationState();
  if (saved.status !== 'ok') throw new Error('Expected saved request');
  expect(window.sessionStorage.getItem(`localens.research.revision.customer-a.${saved.handoffId}`)).toBe(revisionId);
});

it('blocks fresh generation when a saved request crosses the 72-hour cutoff', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(researchInput.startAt) - 72 * 60 * 60 * 1000 + 1);
  savePersonalizationRequest(researchInput);
  const planner = vi.fn(async () => researchReady);
  render(<ResearchPlannerFlow locale="vi" planner={planner} actorRole="customer" actorId="customer-a" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('72');
  expect(planner).not.toHaveBeenCalled();
});

it('rechecks the cutoff on retry after an AI error, allowing exactly 72 hours initially', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(researchInput.startAt) - 72 * 60 * 60 * 1000);
  savePersonalizationRequest(researchInput);
  const planner = vi.fn(async () => ({ status: 'ai_error' as const, reasons: ['ai_unavailable'] }));
  render(<ResearchPlannerFlow locale="vi" planner={planner} actorRole="customer" actorId="customer-a" />);
  await screen.findByRole('alert');
  expect(planner).toHaveBeenCalledExactlyOnceWith(researchInput);
  now.mockReturnValue(Date.parse(researchInput.startAt) - 72 * 60 * 60 * 1000 + 1);
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('72');
  expect(planner).toHaveBeenCalledTimes(1);
});

it('still resumes an existing revision inside the cutoff without generating again', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(researchInput.startAt) - 71 * 60 * 60 * 1000);
  savePersonalizationRequest(researchInput);
  const saved = readPersonalizationState();
  if (saved.status !== 'ok') throw new Error('Expected saved request');
  window.sessionStorage.setItem(`localens.research.revision.customer-a.${saved.handoffId}`, revisionId);
  const planner = Object.assign(vi.fn(async () => researchReady), { resume: vi.fn(async () => researchReady) });
  render(<ResearchPlannerFlow locale="vi" planner={planner} actorRole="customer" actorId="customer-a" />);
  await screen.findByText('Điểm tham quan A');
  expect(planner.resume).toHaveBeenCalledExactlyOnceWith(revisionId);
  expect(planner).not.toHaveBeenCalled();
});
