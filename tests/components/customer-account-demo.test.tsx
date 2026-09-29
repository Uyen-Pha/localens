import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { CustomerAccount } from '@/components/portals/customer-account';
import { loadPortalSurfaceComposition } from '@/components/portals/portal-session';
import { createPortalComposition } from '@/lib/application/portal/composition';
import { createMemorySessionStorage } from '@/lib/infrastructure/demo/portal-repository';

vi.mock('next/navigation', () => {
  const router = { replace: vi.fn() };
  return { useRouter: () => router };
});
vi.mock('@/components/portals/portal-session', () => ({ loadPortalSurfaceComposition: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([null, '+84912345678'])('persists a demo name edit while preserving phone %s', async (phone) => {
  const composition = createPortalComposition({
    mode: 'demo',
    storage: createMemorySessionStorage(),
    now: () => '2026-08-31T12:00:00.000Z',
  });
  await composition.initialized;
  await composition.session.selectDemoIdentity('demo-user-customer');
  await composition.customer.account.updateAccount({ phone });
  vi.mocked(loadPortalSurfaceComposition).mockResolvedValue(composition);

  render(<CustomerAccount locale="en" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Full name' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Full name' }), { target: { value: 'Updated Traveler' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  expect(await screen.findByRole('heading', { name: 'Hello, Updated Traveler!' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Your information has been updated.');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await expect(composition.customer.account.getAccount()).resolves.toMatchObject({
    displayName: 'Updated Traveler',
    nationality: 'VN',
    phone,
  });
});
