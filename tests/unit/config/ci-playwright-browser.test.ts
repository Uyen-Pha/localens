// @vitest-environment node

import { readFileSync } from "node:fs";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

type WorkflowStep = {
  name?: string;
  env?: Record<string, string>;
  run?: string;
};

type Workflow = {
  jobs: Record<string, { steps: WorkflowStep[] }>;
};

const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as Workflow;

function step(jobName: string, stepName: string): WorkflowStep {
  const result = workflow.jobs[jobName]?.steps.find((candidate) => candidate.name === stepName);
  if (!result) throw new Error(`Missing ${stepName} in ${jobName}`);
  return result;
}

describe("CI Playwright browser contract", () => {
  it.each(["demo-e2e", "runtime-local"])(
    "installs the approved Google Chrome channel in %s",
    (jobName) => {
      expect(step(jobName, "Install Playwright Google Chrome").run)
        .toBe("pnpm exec playwright install --with-deps chrome");
    },
  );

  it("runs demo acceptance through Google Chrome", () => {
    expect(step("demo-e2e", "Run demo browser acceptance").env).toMatchObject({
      LOCALENS_RUNTIME_BROWSER: "chrome",
      PLAYWRIGHT_STATIC: "1",
    });
  });

  it.each([
    "Verify runtime authentication",
    "Verify authenticated AI itinerary runtime",
    "Verify runtime fixed-tour booking and payment",
    "Verify runtime guide assignment",
  ])("runs %s through Google Chrome", (stepName) => {
    expect(step("runtime-local", stepName).env).toMatchObject({
      LOCALENS_RUNTIME_BROWSER: "chrome",
    });
  });
});
