import { expect, test } from "bun:test";

const root = import.meta.dir;
const run = (...args: string[]) => Bun.spawnSync([process.execPath, `${root}/cli.ts`, ...args], { cwd: root });

test("accepts manually inspected skill workflows without claiming a code scan", () => {
  const command = run("--analysis-only", "--config", "examples/skill-costs.json");
  expect(command.exitCode).toBe(0);
  const report = JSON.parse(command.stdout.toString());
  expect(report.version).toBe(3);
  expect(report.scannedFiles).toBe(0);
  expect(report.findings[0].source).toBe("supplied-workflow");
  expect(report.findings[0].analysis.savingsMonthlyUsd).toBe(2075);
  expect(run("--analysis-only", "--repo", root, "--config", "examples/skill-costs.json").exitCode).toBe(1);
  expect(run("--analysis-only").exitCode).toBe(1);
});


test("projects user usage independently of static findings and validates overrides", () => {
  const command = run("--analysis-only", "--config", "examples/skill-costs.json", "--users", "10", "--assistant", "codex", "--billing", "metered");
  expect(command.exitCode).toBe(0);
  const projection = JSON.parse(command.stdout.toString()).usageProjection;
  expect(projection.cohorts[0].assistant).toBe("codex");
  expect(projection.scenarios[1].monthlyFetches).toBe(2400);
  expect(projection.scenarios[1].analysis.savingsMonthlyUsd).toBeCloseTo(31.4);
  expect(run("--repo", root, "--users", "NaN").exitCode).toBe(1);
  expect(run("--repo", root, "--billing", "unknown").exitCode).toBe(1);
});
