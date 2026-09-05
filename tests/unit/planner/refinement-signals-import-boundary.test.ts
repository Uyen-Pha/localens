import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("application refinement signal import boundary", () => {
  it("keeps the pure helper independent from Edge/server modules", async () => {
    const path = resolve(process.cwd(), "lib/application/planner/refinement-signals.ts");
    const source = await readFile(path, "utf8");
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false);
    const imports = sourceFile.statements.flatMap((statement) => {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
      return [{ specifier: statement.moduleSpecifier.text, typeOnly: statement.importClause?.isTypeOnly === true }];
    });

    expect(imports).toEqual([
      { specifier: "@/lib/domain/itinerary/contracts", typeOnly: true },
    ]);
    expect(imports.some(({ specifier }) => specifier.includes("supabase/functions"))).toBe(false);
  });
});
