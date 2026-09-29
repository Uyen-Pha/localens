// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error Executable JavaScript artifact boundaries are covered by focused tests.
import { databaseInventory } from "@/scripts/check-supabase-artifacts.mjs";

const unsafe = `CREATE OR REPLACE FUNCTION public.example(p_id uuid, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN RETURN; END $$;`;
const safe = unsafe.replace("SET search_path", "SET statement_timeout = '5s' SET search_path");
const pin = "ALTER FUNCTION public.example(uuid, text) SET statement_timeout = '5s';";

function inventory(...sources: string[]) {
  const root = mkdtempSync(join(tmpdir(), "final-definer-"));
  try {
    const files = sources.map((source, index) => {
      const timestamp = `2026092900000${index}`;
      const name = `${timestamp}_fixture.sql`;
      const path = join(root, name);
      writeFileSync(path, source);
      return { name, path, timestamp };
    });
    return databaseInventory(files);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function failures(...sources: string[]) { return inventory(...sources).unsafeLaterDefinerReplacements; }

describe("final SECURITY DEFINER timeout state", () => {
  it("does not obtain safe ownership from a comment", () => {
    expect(inventory(`${safe}\n-- ALTER FUNCTION public.example(uuid,text) OWNER TO localens_identity_rpc_owner;`).functionOwners.get('public.example(uuid,text)')).toBe('postgres');
  });
  it("tracks quoted owner changes in order", () => {
    expect(inventory(`${safe}
ALTER FUNCTION public.example(uuid,text) OWNER TO localens_identity_rpc_owner;
ALTER FUNCTION public.example(uuid,text) OWNER TO "postgres";`).functionOwners.get('public.example(uuid,text)')).toBe('postgres');
  });
  it("retains a live overload when only another overload is dropped", () => {
    const result = inventory(`${safe}\n${safe.replace('p_id uuid', 'p_id text')}`, 'DROP FUNCTION public.example(text,text);');
    expect([...result.functionSignatures]).toEqual(['public.example(uuid,text)']);
    expect([...result.functions]).toEqual(['public.example']);
  });
  it("records exact signatures and security mode without requiring an owner alteration", () => {
    const root = mkdtempSync(join(tmpdir(), "function-inventory-"));
    const path = join(root, 'fixture.sql');
    writeFileSync(path, `BEGIN; SET LOCAL ROLE localens_test_owner; ${safe}
CREATE FUNCTION private.trigger_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
SET LOCAL ROLE postgres; COMMIT;`);
    try {
      const result = databaseInventory([{ name: 'fixture.sql', path, timestamp: '20260929000000' }]);
      expect([...result.functionSignatures].sort()).toEqual(['private.trigger_guard()', 'public.example(uuid,text)']);
      expect(result.functionOwners.get('public.example(uuid,text)')).toBe('localens_test_owner');
      expect(result.functionSecurity.get('private.trigger_guard()')).toBe('invoker');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("credits a later exact ALTER across migrations", () => {
    expect(failures(unsafe, pin)).toEqual([]);
  });
  it("credits a later exact ALTER in the same migration", () => {
    expect(failures(`${unsafe}\n${pin}`)).toEqual([]);
  });
  it("credits a safe replacement of an unsafe definition", () => {
    expect(failures(unsafe, safe)).toEqual([]);
  });
  it("recognizes a compact inline timeout setting", () => {
    expect(failures(safe.replace("statement_timeout = '5s'", "statement_timeout='5s'"))).toEqual([]);
  });
  it("does not inherit an earlier ALTER through an unsafe replacement", () => {
    expect(failures(`${safe}\n${pin}\n${unsafe}`)).toHaveLength(1);
  });
  it("keeps an unsafe overload when the other overload is pinned", () => {
    expect(failures(unsafe, unsafe.replace("p_id uuid", "p_id text"), pin)).toEqual([
      { file: "20260929000001_fixture.sql", signature: "public.example(text,text)" },
    ]);
  });
  it("ignores fake declarations in comments and bodies", () => {
    expect(failures(`-- ${unsafe.replaceAll("\n", " ")}\nDO $outer$ BEGIN ${unsafe} END $outer$;`)).toEqual([]);
  });
  it.each([
    unsafe,
    "ALTER FUNCTION public.example(uuid, text) RESET statement_timeout;",
    "ALTER FUNCTION public.example(uuid, text) RESET ALL;",
    "ALTER FUNCTION public.example(uuid, text) SET statement_timeout = '0';",
    "ALTER FUNCTION public.example(uuid, text) SET statement_timeout FROM CURRENT;",
  ])("rejects later unsafe replacement or config change: %s", (later) => {
    expect(failures(safe, pin, later)).toEqual([
      { file: "20260929000002_fixture.sql", signature: "public.example(uuid,text)" },
    ]);
  });
  it.each([
    "ALTER FUNCTION public.example(text, text) SET statement_timeout = '5s';",
    "ALTER FUNCTION private.example(uuid, text) SET statement_timeout = '5s';",
    `-- ${pin}`,
    `DO $$ BEGIN EXECUTE '${pin.replaceAll("'", "''")}'; END $$;`,
    `SELECT '${pin.replaceAll("'", "''")}';`,
  ])("does not credit another signature or quoted SQL: %s", (later) => {
    expect(failures(unsafe, later)).toHaveLength(1);
  });
  it("does not credit timeout text inside the function body", () => {
    expect(failures(unsafe.replace("RETURN;", `RAISE NOTICE 'statement_timeout = ''5s'''; RETURN;`))).toHaveLength(1);
  });
  it("removes a dropped exact function", () => {
    expect(failures(unsafe, "DROP FUNCTION public.example(uuid, text);")).toEqual([]);
  });
  it("removes a replacement that is now SECURITY INVOKER", () => {
    expect(failures(unsafe, unsafe.replace("SECURITY DEFINER", "SECURITY INVOKER"))).toEqual([]);
  });
});
