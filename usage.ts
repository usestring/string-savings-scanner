import { analyze, type Quote, type Workload } from "./cost.ts";

export type Cohort = {
  assistant: "claude-code" | "codex" | "mixed";
  users: number;
  sessionsPerUserPerDay: number;
  activeDaysPerMonth: number;
  eligibleFraction: number;
  fetchesPerSession: { source: string } & (
    { kind: "assumed"; low: number; base: number; high: number } |
    { kind: "sampled"; counts: number[] }
  );
};
export type UsagePlan = {
  cohorts: Cohort[];
  billing: "metered" | "subscription";
  context: { currentTokensPerFetch: number; proposedTokensPerFetch: number; usdPerMillion: number; source: string };
  workload: Omit<Workload, "findingId" | "monthlyResults">;
};

function number(value: unknown, name: string, maximum = Infinity, integer = false): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum || (integer && !Number.isSafeInteger(value))) {
    throw new Error(`${name} must be a finite nonnegative ${integer ? "integer" : "number"} no greater than ${maximum}`);
  }
}
function source(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} requires an evidence or assumption description`);
}

export function projectUsage(plan: UsagePlan, asOf: string) {
  if (!plan || !Array.isArray(plan.cohorts) || !plan.cohorts.length) throw new Error("usageProjection requires nonempty cohorts");
  if (!["metered", "subscription"].includes(plan.billing)) throw new Error("usageProjection.billing must be metered or subscription");
  if (!plan.context) throw new Error("usageProjection.context is required");
  for (const key of ["currentTokensPerFetch", "proposedTokensPerFetch", "usdPerMillion"] as const) number(plan.context[key], `context.${key}`);
  source(plan.context.source, "context.source");
  const cohorts = plan.cohorts.map((cohort, index) => {
    const prefix = `cohorts[${index}]`;
    if (!cohort || !["claude-code", "codex", "mixed"].includes(cohort.assistant)) throw new Error(`${prefix}.assistant is invalid`);
    number(cohort.users, `${prefix}.users`, Infinity, true);
    number(cohort.sessionsPerUserPerDay, `${prefix}.sessionsPerUserPerDay`);
    number(cohort.activeDaysPerMonth, `${prefix}.activeDaysPerMonth`, 31);
    number(cohort.eligibleFraction, `${prefix}.eligibleFraction`, 1);
    const rate = cohort.fetchesPerSession;
    if (!rate) throw new Error(`${prefix}.fetchesPerSession is required`);
    source(rate.source, `${prefix}.fetchesPerSession.source`);
    let low: number, base: number, high: number, median: number | undefined;
    if (rate.kind === "sampled") {
      if (!Array.isArray(rate.counts) || !rate.counts.length) throw new Error(`${prefix} needs nonempty session counts, including zero-fetch sessions`);
      rate.counts.forEach(value => number(value, `${prefix}.session count`, Infinity, true));
      const sorted = [...rate.counts].sort((a, b) => a - b);
      low = sorted[0];
      high = sorted[sorted.length - 1];
      base = sorted.reduce((sum, value) => sum + value / sorted.length, 0);
      const middle = Math.floor(sorted.length / 2);
      median = sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
    } else if (rate.kind === "assumed") {
      for (const key of ["low", "base", "high"] as const) number(rate[key], `${prefix}.${key}`);
      ({ low, base, high } = rate);
      if (low > base || base > high) throw new Error(`${prefix} requires low <= base <= high`);
    } else throw new Error(`${prefix}.fetchesPerSession.kind must be assumed or sampled`);
    const sessionsPerUserPerMonth = cohort.sessionsPerUserPerDay * cohort.activeDaysPerMonth;
    const eligibleSessions = cohort.users * sessionsPerUserPerMonth * cohort.eligibleFraction;
    const monthlyFetchesPerUser = Object.fromEntries(Object.entries({ low, base, high, ...(median === undefined ? {} : { median }) })
      .map(([name, rate]) => [name, sessionsPerUserPerMonth * cohort.eligibleFraction * rate]));
    if (![sessionsPerUserPerMonth, eligibleSessions, ...Object.values(monthlyFetchesPerUser)].every(Number.isFinite)) throw new Error("Usage projection overflow");
    return {
      ...cohort, eligibleSessions,
      monthlyFetchesPerUser,
      statistics: { low, base, high, ...(median === undefined ? {} : { mean: base, median, sampleSize: rate.kind === "sampled" ? rate.counts.length : 0 }) },
      baseMeaning: rate.kind === "sampled" ? "sample arithmetic mean" : "illustrative assumption; not an observed mean or median"
    };
  });
  if (!plan.workload || typeof plan.workload !== "object") throw new Error("usageProjection.workload is required");
  if (Object.hasOwn(plan.workload, "monthlyResults") || Object.hasOwn(plan.workload, "findingId")) throw new Error("Projection workload volume is derived; omit monthlyResults and findingId");
  const names: ("low" | "base" | "high" | "median")[] = ["low", "base", "high"];
  if (cohorts.every(item => item.fetchesPerSession.kind === "sampled")) names.push("median");
  const scenarios = names.map(name => {
    const monthlyFetches = cohorts.reduce((sum, cohort) => {
      const rate = cohort.statistics[name];
      if (rate === undefined) throw new Error("Median projection requires sampled cohorts");
      return sum + cohort.eligibleSessions * rate;
    }, 0);
    const currentTokens = monthlyFetches * plan.context.currentTokensPerFetch;
    const proposedTokens = monthlyFetches * plan.context.proposedTokensPerFetch;
    if (![monthlyFetches, currentTokens, proposedTokens].every(Number.isFinite)) throw new Error("Usage projection overflow");
    const withContext = (quote: Quote, tokens: number): Quote => ({
      ...quote, resources: [...(quote?.resources ?? []), {
        label: "Projected model input", basis: "result", quantity: tokens / 1_000_000,
        unit: "million input tokens", usdPerUnit: plan.billing === "metered" ? plan.context.usdPerMillion : 0,
        source: plan.context.source
      }]
    });
    const analysis = analyze({
      ...plan.workload, findingId: "projected-web-reading", monthlyResults: monthlyFetches,
      current: withContext(plan.workload.current, plan.context.currentTokensPerFetch),
      proposed: withContext(plan.workload.proposed, plan.context.proposedTokensPerFetch)
    }, asOf);
    return { name, monthlyFetches, tokenCapacity: { current: currentTokens, proposed: proposedTokens, saved: currentTokens - proposedTokens }, analysis };
  });
  return {
    basis: "planning-projection", billing: plan.billing, cohorts,
    scope: "One combined user population, independent of static finding counts. Scenarios are alternatives, not additive. Allocate shared fees once across this population.",
    limitations: [
      "No published population mean or median is assumed. Defaults are editable planning assumptions for both assistants, not measured adoption or usage.",
      "Sample means estimate total volume; medians describe a typical session and can understate aggregate traffic. Low/high sample extrema are sensitivity cases, not confidence bounds. The median scenario combines cohort-specific medians, not a pooled population median.",
      "Count eligible public page reads, including sessions with zero. Exclude searches, cached index lookups, private APIs and retries already represented in the delivery assumptions.",
      plan.billing === "subscription" ? "Token reduction is capacity only. The existing subscription remains payable; no token cash saving is credited." : "Token cash savings require genuinely avoidable metered spend at the supplied marginal rate.",
      "Compare actual consumed context and task quality. Existing fetch tools may already summarize, cache or truncate content. No real workload equivalence is established."
    ],
    assumptions: plan, scenarios
  };
}

export function defaultUsagePlan(users = 1, assistant: Cohort["assistant"] = "mixed", billing: UsagePlan["billing"] = "subscription"): UsagePlan {
  const quote: Quote = {
    pricingUrl: "https://example.com/synthetic-workflow-costs", checkedAt: "2026-11-10", unit: "request",
    usdPerUnit: 0, unitsPerAttempt: 1, billedFraction: 1, attemptsPerJob: 1, deliveryRate: 1,
    includedMonthlyUnits: 0, minimumMonthlyUsd: 0, fixedMonthlyUsd: 0, addonsMonthlyUsd: 0
  };
  return {
    cohorts: [{ assistant, users, sessionsPerUserPerDay: 4, activeDaysPerMonth: 20, eligibleFraction: 1,
      fetchesPerSession: { kind: "assumed", low: 1, base: 3, high: 10, source: "Illustrative sensitivity inputs, not a Claude Code or Codex usage benchmark. Replace with representative session counts, including zeros." } }],
    billing,
    context: { currentTokensPerFetch: 8000, proposedTokensPerFetch: 1000, usdPerMillion: 3, source: "Synthetic token counts and $3/million rate, not a model price quote. Replace with paired payload tokenization and marginal billing rates; do not duplicate these tokens in workload resources." },
    workload: {
      label: "Illustrative public-page reading population", current: quote,
      proposed: { ...quote, pricingUrl: "https://usestring.ai/pricing", usdPerUnit: 0.00025, minimumMonthlyUsd: 19 },
      retainedCurrentMonthlyUsd: 0, migrationHours: 4, engineeringUsdPerHour: 100, compatibility: "unverified",
      notes: "Planning only. Standard request-based String price and usage minimum checked 2026-11-10; browser/premium routing can cost more. Direct fetch is assumed free. Token reduction, rates, user activity and zero other costs are synthetic assumptions. Subscription fees are unchanged and cancel from the incremental comparison."
    }
  };
}
