import { expect, test } from "bun:test";
import { analyze, parseWorkloads, type Quote, type Workload } from "./cost.ts";

const quote: Quote = {
  pricingUrl: "https://example.com/quoted-price", checkedAt: "2026-11-10", unit: "credit",
  usdPerUnit: 0.01, unitsPerAttempt: 2, billedFraction: 0.75, attemptsPerJob: 1.5, deliveryRate: 0.5,
  includedMonthlyUnits: 100, minimumMonthlyUsd: 19, fixedMonthlyUsd: 5, addonsMonthlyUsd: 7
};
const workload: Workload = {
  findingId: "client.ts#firecrawl", label: "Synthetic workload", monthlyResults: 1000,
  current: quote, proposed: { ...quote, usdPerUnit: 0.001 }, retainedCurrentMonthlyUsd: 2,
  migrationHours: 4, engineeringUsdPerHour: 100, compatibility: "equivalent", notes: "Fixture-only equivalence."
};

test("compares equal delivered results with retries, billing fraction, bundles, minimums, add-ons and retained charges", () => {
  const result = analyze(workload, "2026-11-10");
  expect(result.current?.attempts).toBe(3000);
  expect(result.current?.billableUnits).toBe(4500);
  expect(result.current?.monthlyUsd).toBe(56);
  expect(result.proposed?.monthlyUsd).toBe(31);
  expect(result.afterMigrationMonthlyUsd).toBe(33);
  expect(result.savingsMonthlyUsd).toBe(23);
  expect(result.migrationUsd).toBe(400);
  expect(result.breakEvenMonths).toBeCloseTo(17.391304);
  expect(result.status).toBe("candidate");
});

test("keeps minimum cash requirements when included usage covers all requests", () => {
  expect(analyze({ ...workload, monthlyResults: 0 }, "2026-11-10").current?.monthlyUsd).toBe(31);
  const result = analyze({ ...workload, current: { ...quote, includedMonthlyUnits: 999999 } }, "2026-11-10");
  expect(result.current?.usageUsd).toBe(0);
  expect(result.current?.monthlyUsd).toBe(31);
});

test("never recommends negative savings or gives a payback for an incompatible workload", () => {
  const loss = analyze({ ...workload, proposed: { ...quote, usdPerUnit: 0.02 } }, "2026-11-10");
  expect(loss.status).toBe("no-savings");
  expect(loss.savingsMonthlyUsd).toBeLessThan(0);
  expect(loss.breakEvenMonths).toBeNull();
  expect(analyze({ ...workload, compatibility: "incompatible" }, "2026-11-10").status).toBe("incompatible");
  expect(analyze({ ...workload, compatibility: "incompatible" }, "2026-11-10").breakEvenMonths).toBeNull();
  expect(analyze({ ...workload, compatibility: "unverified" }, "2026-11-10").status).toBe("validate-first");
});

test("missing prices and usage remain unknown rather than becoming zero", () => {
  expect(analyze(undefined, "2026-11-10").status).toBe("unknown");
  const result = analyze({ ...workload, monthlyResults: null, proposed: { ...quote, usdPerUnit: undefined } }, "2026-11-10");
  expect(result.status).toBe("unknown");
  expect(result.missing).toEqual(["monthlyResults", "proposed.usdPerUnit"]);
  expect(result.savingsMonthlyUsd).toBeUndefined();
});

test("rejects invalid rates, impossible success rates, future prices, overflow and duplicate configs", () => {
  for (const value of [-1, NaN, Infinity, "0.01"]) {
    expect(() => analyze({ ...workload, current: { ...quote, usdPerUnit: value } }, "2026-11-10")).toThrow();
  }
  for (const deliveryRate of [0, 1.1]) {
    expect(() => analyze({ ...workload, current: { ...quote, deliveryRate } }, "2026-11-10")).toThrow();
  }
  expect(() => analyze({ ...workload, monthlyResults: Number.MAX_VALUE }, "2026-11-10")).toThrow("overflow");
  expect(() => analyze({ ...workload, current: { ...quote, checkedAt: "2026-11-11" } }, "2026-11-10")).toThrow("future");
  expect(() => parseWorkloads({ version: 1, workloads: [workload, workload] })).toThrow("Duplicate");
});

test("stale pricing blocks candidate status and invalid calendar dates remain unknown", () => {
  const stale = analyze({ ...workload, current: { ...quote, checkedAt: "2026-01-01" } }, "2026-11-10");
  expect(stale.status).toBe("validate-first");
  expect(stale.warnings.length).toBe(1);
  const invalid = analyze({ ...workload, current: { ...quote, checkedAt: "2026-02-30" } }, "2026-11-10");
  expect(invalid.status).toBe("unknown");
});
