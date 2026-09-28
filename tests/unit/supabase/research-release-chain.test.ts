// @vitest-environment node
import { describe, expect, it } from 'vitest';
// @ts-expect-error SQL inventory is an executable JavaScript tool.
import { databaseInventory, migrationFiles } from '@/scripts/check-supabase-artifacts.mjs';

describe('research release dependency chain', () => {
  it('supplies baseline tables before cancellation without relying on test fixtures', () => {
    const inventory = databaseInventory(migrationFiles(process.cwd()).filter((f: { name: string }) => f.name < '20260928230000'));
    for (const name of ['research_demo_bookings', 'research_demo_quotes', 'research_demo_requests', 'research_demo_revisions', 'research_demo_request_events', 'research_demo_revision_links', 'research_demo_stops', 'research_demo_catalog_versions', 'research_demo_places']) {
      expect(inventory.tables.has(`private.${name}`), name).toBe(true);
    }
    // Offline inventory retains parameter names from CREATE declarations;
    // the database harness verifies exact regprocedure signatures at runtime.
    for (const name of ['public.research_demo_persist', 'public.research_demo_submit', 'public.research_demo_booking', 'public.research_demo_checkout', 'public.research_demo_list']) {
      expect(inventory.functions.has(name), name).toBe(true);
    }
  });
});
