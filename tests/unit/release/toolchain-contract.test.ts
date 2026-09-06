import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type WorkflowStep = {
  env?: Record<string, unknown>;
  id?: string;
  if?: string;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
};

type WorkflowJob = {
  environment?: string;
  env?: Record<string, unknown>;
  if?: string;
  needs?: string | string[];
  steps?: WorkflowStep[];
  "timeout-minutes"?: number;
};

type Workflow = {
  jobs?: Record<string, WorkflowJob>;
};

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  packageManager?: string;
  engines?: Record<string, string>;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const workflow = parse(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8")) as Workflow;

function runs(job: WorkflowJob | undefined) {
  return (job?.steps ?? []).flatMap((step) => step.run ? [step.run] : []);
}

function pnpmSetupVersion(job: WorkflowJob | undefined) {
  return job?.steps?.find((step) => step.uses === "pnpm/action-setup@v4")?.with?.version;
}

describe("release toolchain contract", () => {
  it("pins the supported Node and pnpm acceptance toolchain", () => {
    expect(pkg.packageManager).toBe("pnpm@10.17.1");
    expect(pkg.engines).toEqual({ node: ">=24 <25", pnpm: ">=10 <11" });
    expect(pkg.devDependencies?.["@axe-core/playwright"]).toBe("4.13.0");
    expect(pkg.scripts?.check).toBe(
      "pnpm lint && pnpm typecheck && pnpm test:run --no-file-parallelism --testTimeout=30000 && pnpm db:static && pnpm build:demo",
    );
  });

  it("models demo, runtime, and protected staging as separate CI jobs", () => {
    const jobs = workflow.jobs ?? {};
    expect(Object.keys(jobs)).toEqual(expect.arrayContaining([
      "quality-demo",
      "demo-e2e",
      "runtime-local",
      "staging-smoke",
    ]));

    for (const name of ["quality-demo", "demo-e2e", "runtime-local", "staging-smoke"]) {
      expect(pnpmSetupVersion(jobs[name]), `${name} pnpm version`).toBe("10.17.1");
    }

    expect(runs(jobs["quality-demo"])).toContain("pnpm check");
    expect(runs(jobs["demo-e2e"])).toContain("pnpm test:e2e");

    const runtimeCommands = runs(jobs["runtime-local"]).join("\n");
    expect(jobs["runtime-local"]?.["timeout-minutes"]).toBeGreaterThanOrEqual(40);
    for (const command of [
      "pnpm db:verify",
      "pnpm test:e2e:runtime-auth",
      "pnpm test:e2e:runtime-itinerary",
      "pnpm test:e2e:runtime-fixed-tour",
      "pnpm test:e2e:runtime-guide-assignment",
      "pnpm build:supabase",
    ]) {
      expect(runtimeCommands).toContain(command);
    }
    expect(runtimeCommands.indexOf("pnpm test:e2e:runtime-auth"))
      .toBeLessThan(runtimeCommands.indexOf("pnpm test:e2e:runtime-itinerary"));
    expect(runtimeCommands.indexOf("pnpm test:e2e:runtime-itinerary"))
      .toBeLessThan(runtimeCommands.indexOf("pnpm test:e2e:runtime-fixed-tour"));

    const runtimeSteps = jobs["runtime-local"]?.steps ?? [];
    const buildStep = runtimeSteps.find((step) => step.name === "Build Supabase runtime");
    expect(buildStep?.env).toEqual({
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3200",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ci_build_only",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "ci-build-only",
    });
    const redactStep = runtimeSteps.find((step) => step.name === "Prepare redacted failure artifacts");
    const uploadStep = runtimeSteps.find((step) => step.name === "Upload redacted runtime failure artifacts");
    expect(redactStep?.id).toBe("redact");
    expect(redactStep?.if).toBe("failure()");
    expect(redactStep?.run).toBe(
      "node scripts/redact-ci-artifacts.mjs ci-artifacts ci-logs playwright-report test-results",
    );
    expect(uploadStep?.if).toContain("steps.redact.outcome == 'success'");
    expect(uploadStep?.uses).toBe("actions/upload-artifact@v4");

    expect(jobs["staging-smoke"]?.environment).toBe("staging");
    expect(jobs["staging-smoke"]?.needs).toEqual([
      "quality-demo",
      "demo-e2e",
      "runtime-local",
    ]);
    expect(jobs["staging-smoke"]?.env?.LOCALLENS_STAGING_URL).toBeUndefined();
    const stagingTargetStep = jobs["staging-smoke"]?.steps?.find(
      (step) => step.name === "Validate protected HTTPS target",
    );
    expect(stagingTargetStep?.env?.LOCALLENS_STAGING_URL).toBe("${{ vars.LOCALLENS_STAGING_URL }}");
    expect(jobs["staging-smoke"]?.if).toBe(
      "${{ github.event_name == 'workflow_dispatch' && vars.LOCALLENS_STAGING_URL != '' }}",
    );

    const everyRun = Object.values(jobs).flatMap(runs).join("\n");
    expect(everyRun.split("\n").map((line) => line.trim())).not.toContain("pnpm build");
    expect(pkg.scripts?.check).toContain("pnpm build:demo");
    expect(everyRun).toContain("pnpm build:supabase");
  });
});
