// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error Executable JavaScript artifact boundaries are covered by focused tests.
import { databaseInventory } from "@/scripts/check-supabase-artifacts.mjs";

describe("automatic cancellation access-artifact inventory", () => {
  it("removes superseded policies and views from the final ordered migration state", () => {
    const root = mkdtempSync(join(tmpdir(), "localens-cancellation-inventory-"));
    const first = join(root, "20260902120000_legacy.sql");
    const second = join(root, "20260904100000_automatic.sql");
    try {
      writeFileSync(first, `
        CREATE TABLE private.legacy_cancellations (id uuid);
        CREATE POLICY legacy_customer_select ON private.legacy_cancellations FOR SELECT TO authenticated USING (true);
        CREATE VIEW public.legacy_cancellations_v WITH (security_invoker = false, security_barrier = true) AS SELECT id FROM private.legacy_cancellations;
      `);
      writeFileSync(second, `
        DROP POLICY IF EXISTS legacy_customer_select ON private.legacy_cancellations;
        DROP VIEW IF EXISTS public.legacy_cancellations_v;
        CREATE POLICY archive_guard_select ON private.legacy_cancellations FOR SELECT TO postgres USING (true);
      `);

      const inventory = databaseInventory([
        { name: "20260902120000_legacy.sql", path: first, timestamp: "20260902120000" },
        { name: "20260904100000_automatic.sql", path: second, timestamp: "20260904100000" },
      ]);

      expect(inventory.views).not.toContain("public.legacy_cancellations_v");
      expect(inventory.policies).not.toContain("private.legacy_cancellations:legacy_customer_select");
      expect(inventory.policies).toContain("private.legacy_cancellations:archive_guard_select");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
