import { expect, test } from "bun:test";
import { parseWorkloads } from "./cost.ts";
import { defaultUsagePlan, projectUsage } from "./usage.ts";

const asOf = "2026-11-10";

test("weights populations before applying a shared monthly minimum", () => {
  const plan = defaultUsagePlan();
  plan.cohorts = [
    { assistant: "claude-code", users: 2, sessionsPerUserPerDay: 2, activeDaysPerMonth: 10, eligibleFraction: 0.5,
      fetchesPerSession: { kind: "assumed", low: 1, base: 2, high: 3, source: "Planning assumption" } },
    { assistant: "codex", users: 3, sessionsPerUserPerDay: 1, activeDaysPerMonth: 10, eligibleFraction: 1,
      fetchesPerSession: { kind: "assumed", low: 4, base: 5, high: 6, source: "Planning assumption" } }
  ];
  const report = projectUsage(plan, asOf);
  expect(report.scenarios.map(item => item.monthlyFetches)).toEqual([140, 190, 240]);
  expect(report.cohorts.map(item => item.monthlyFetchesPerUser.base)).toEqual([20, 50]);
  expect(report.scenarios[1].analysis.proposed?.serviceMonthlyUsd).toBe(19);
  expect(report.scenarios[1].analysis.savingsMonthlyUsd).toBe(-19);
  expect(report.cohorts[0].statistics.mean).toBeUndefined();
});

test("preserves zero-fetch sessions and shows why median differs from aggregate volume", () => {
  const plan = defaultUsagePlan(100, "codex", "metered");
  plan.cohorts[0] = { assistant: "codex", users: 100, sessionsPerUserPerDay: 2, activeDaysPerMonth: 20, eligibleFraction: 0.5,
    fetchesPerSession: { kind: "sampled", counts: [0, 0, 0, 10], source: "Synthetic four-session sample, including zero sessions" } };
  const report = projectUsage(plan, asOf);
  expect(report.cohorts[0].statistics).toMatchObject({ mean: 2.5, median: 0, sampleSize: 4 });
  const base = report.scenarios[1];
  expect(base.monthlyFetches).toBe(5000);
  expect(base.tokenCapacity.saved).toBe(35_000_000);
  expect(base.analysis.savingsMonthlyUsd).toBeCloseTo(86);
  expect(report.scenarios.find(item => item.name === "median")?.monthlyFetches).toBe(0);
  expect(plan.cohorts[0].fetchesPerSession).toMatchObject({ counts: [0, 0, 0, 10] });
});

test("separates subscription capacity from avoidable metered cash cost", () => {
  const plan = defaultUsagePlan(100, "claude-code", "metered");
  const metered = projectUsage(plan, asOf).scenarios[1];
  plan.billing = "subscription";
  const subscription = projectUsage(plan, asOf).scenarios[1];
  expect(metered.analysis.savingsMonthlyUsd).toBeCloseTo(485);
  expect(subscription.analysis.savingsMonthlyUsd).toBe(-19);
  expect(subscription.tokenCapacity.saved).toBe(metered.tokenCapacity.saved);
  expect(subscription.analysis.breakEvenMonths).toBeNull();
});

test("rejects invalid or silently ignored financial projection inputs", () => {
  const plan = defaultUsagePlan();
  expect(() => parseWorkloads({ version: 2, workloads: [], usageProjection: plan })).toThrow();
  expect(parseWorkloads({ version: 3, workloads: [], usageProjection: plan }).size).toBe(0);
  plan.cohorts[0].fetchesPerSession = { kind: "sampled", counts: [], source: "Empty sample" };
  expect(() => projectUsage(plan, asOf)).toThrow();
  plan.cohorts[0].fetchesPerSession = { kind: "sampled", counts: [1, -1], source: "Invalid sample" };
  expect(() => projectUsage(plan, asOf)).toThrow();
  plan.cohorts[0].fetchesPerSession = { kind: "assumed", low: 3, base: 2, high: 1, source: "Reversed" };
  expect(() => projectUsage(plan, asOf)).toThrow();
  plan.cohorts[0].fetchesPerSession = { kind: "assumed", low: 1, base: 2, high: 3, source: "Assumed" };
  plan.cohorts[0].users = Infinity;
  expect(() => projectUsage(plan, asOf)).toThrow();
  plan.cohorts[0].users = 0;
  plan.cohorts[0].sessionsPerUserPerDay = Number.MAX_VALUE;
  expect(() => projectUsage(plan, asOf)).toThrow();
});
