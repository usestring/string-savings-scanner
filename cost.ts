export type ResourceCost = {
  label: string;
  basis: "attempt" | "result" | "month";
  quantity: number;
  unit: string;
  usdPerUnit: number;
  source: string;
};
export type Quote = {
  resources?: ResourceCost[];
  pricingUrl: string;
  checkedAt: string;
  unit: string;
  usdPerUnit: number;
  unitsPerAttempt: number;
  billedFraction: number;
  attemptsPerJob: number;
  deliveryRate: number;
  includedMonthlyUnits: number;
  minimumMonthlyUsd: number;
  fixedMonthlyUsd: number;
  addonsMonthlyUsd: number;
};
export type Workload = {
  findingId: string;
  label: string;
  monthlyResults: number;
  current: Quote;
  proposed: Quote;
  retainedCurrentMonthlyUsd: number;
  migrationHours: number;
  engineeringUsdPerHour: number;
  compatibility: "equivalent" | "unverified" | "incompatible";
  notes: string;
};

function requiredNumber(value: unknown, name: string, missing: string[], minimum = 0, maximum = Infinity) {
  if (value === undefined || value === null) { missing.push(name); return; }
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a finite number from ${minimum} to ${maximum}`);
  }
}

function validateQuote(quote: any, name: string, missing: string[], warnings: string[], asOf: string) {
  if (!quote || typeof quote !== "object") { missing.push(name); return; }
  for (const field of ["usdPerUnit", "includedMonthlyUnits", "minimumMonthlyUsd", "fixedMonthlyUsd", "addonsMonthlyUsd"]) {
    requiredNumber(quote[field], `${name}.${field}`, missing);
  }
  requiredNumber(quote.unitsPerAttempt, `${name}.unitsPerAttempt`, missing, Number.MIN_VALUE);
  requiredNumber(quote.attemptsPerJob, `${name}.attemptsPerJob`, missing, 1);
  requiredNumber(quote.deliveryRate, `${name}.deliveryRate`, missing, Number.MIN_VALUE, 1);
  requiredNumber(quote.billedFraction, `${name}.billedFraction`, missing, 0, 1);
  if (quote.resources !== undefined) {
    if (!Array.isArray(quote.resources)) throw new Error(`${name}.resources must be an array`);
    for (const [index, item] of quote.resources.entries()) {
      const prefix = `${name}.resources[${index}]`;
      if (!item || typeof item !== "object") { missing.push(prefix); continue; }
      for (const field of ["label", "unit", "source"]) {
        if (typeof item[field] !== "string" || !item[field].trim()) missing.push(`${prefix}.${field}`);
      }
      if (!["attempt", "result", "month"].includes(item.basis)) missing.push(`${prefix}.basis`);
      requiredNumber(item.quantity, `${prefix}.quantity`, missing);
      requiredNumber(item.usdPerUnit, `${prefix}.usdPerUnit`, missing);
    }
  }
  if (typeof quote.unit !== "string" || !quote.unit.trim()) missing.push(`${name}.unit`);
  if (typeof quote.pricingUrl !== "string" || !/^https:\/\/[^\s]+$/.test(quote.pricingUrl)) missing.push(`${name}.pricingUrl`);
  const date = typeof quote.checkedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(quote.checkedAt)
    ? Date.parse(`${quote.checkedAt}T00:00:00Z`) : NaN;
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== quote.checkedAt) missing.push(`${name}.checkedAt`);
  else {
    const age = (Date.parse(asOf) - date) / 86400000;
    if (age < 0) throw new Error(`${name}.checkedAt cannot be in the future`);
    if (age > 90) warnings.push(`${name}: pricing source is over 90 days old; refresh before relying on it`);
  }
}

export function quoteCost(monthlyResults: number, quote: Quote) {
  const attempts = monthlyResults * quote.attemptsPerJob / quote.deliveryRate;
  const billableUnits = attempts * quote.billedFraction * quote.unitsPerAttempt;
  const usageUsd = Math.max(0, billableUnits - quote.includedMonthlyUnits) * quote.usdPerUnit;
  const resources = (quote.resources ?? []).map(item => ({
    ...item,
    monthlyUsd: (item.basis === "attempt" ? attempts : item.basis === "result" ? monthlyResults : 1) * item.quantity * item.usdPerUnit
  }));
  const resourceMonthlyUsd = resources.reduce((sum, item) => sum + item.monthlyUsd, 0);
  const serviceMonthlyUsd = quote.fixedMonthlyUsd + Math.max(quote.minimumMonthlyUsd, usageUsd) + quote.addonsMonthlyUsd;
  const monthlyUsd = serviceMonthlyUsd + resourceMonthlyUsd;
  if (![attempts, billableUnits, usageUsd, monthlyUsd].every(Number.isFinite)) throw new Error("Cost calculation overflow");
  return { attempts, billableUnits, usageUsd, serviceMonthlyUsd, resources, resourceMonthlyUsd, monthlyUsd };
}

export function analyze(workload: any, asOf: string) {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!workload) return { status: "unknown", missing: ["workload and pricing inputs"], warnings };
  for (const field of ["monthlyResults", "retainedCurrentMonthlyUsd", "migrationHours", "engineeringUsdPerHour"]) {
    requiredNumber(workload[field], field, missing);
  }
  if (typeof workload.label !== "string" || !workload.label.trim()) missing.push("label");
  if (typeof workload.notes !== "string" || !workload.notes.trim()) missing.push("notes");
  if (!["equivalent", "unverified", "incompatible"].includes(workload.compatibility)) missing.push("compatibility");
  validateQuote(workload.current, "current", missing, warnings, asOf);
  validateQuote(workload.proposed, "proposed", missing, warnings, asOf);
  if (missing.length) return { status: "unknown", missing, warnings };
  const current = quoteCost(workload.monthlyResults, workload.current);
  const proposed = quoteCost(workload.monthlyResults, workload.proposed);
  const afterMigrationMonthlyUsd = proposed.monthlyUsd + workload.retainedCurrentMonthlyUsd;
  const savingsMonthlyUsd = current.monthlyUsd - afterMigrationMonthlyUsd;
  const migrationUsd = workload.migrationHours * workload.engineeringUsdPerHour;
  const breakEvenMonths = savingsMonthlyUsd > 0 && workload.compatibility !== "incompatible" ? migrationUsd / savingsMonthlyUsd : null;
  if (![afterMigrationMonthlyUsd, savingsMonthlyUsd, migrationUsd].every(Number.isFinite) ||
    (breakEvenMonths !== null && !Number.isFinite(breakEvenMonths))) throw new Error("Cost calculation overflow");
  const status = workload.compatibility === "incompatible" ? "incompatible"
    : savingsMonthlyUsd <= 0 ? "no-savings"
    : workload.compatibility === "unverified" || warnings.length ? "validate-first" : "candidate";
  return {
    status, basis: "projection", current, proposed, afterMigrationMonthlyUsd, savingsMonthlyUsd,
    migrationUsd, migrationHours: workload.migrationHours, breakEvenMonths,
    assumptions: workload, missing, warnings
  };
}

export function parseWorkloads(input: any): Map<string, Workload> {
  if (![1, 2, 3].includes(input?.version) || !Array.isArray(input.workloads)) throw new Error("Config requires version: 1, 2 or 3 and workloads: []");
  if (input.version !== 3 && input.usageProjection !== undefined) throw new Error("Usage projection inputs require config version: 3");
  const workloads = new Map<string, Workload>();
  for (const workload of input.workloads) {
    if (typeof workload?.findingId !== "string" || !workload.findingId) throw new Error("Each workload needs a findingId");
    if (workloads.has(workload.findingId)) throw new Error(`Duplicate workload: ${workload.findingId}`);
    if (input.version === 1 && (workload.current?.resources !== undefined || workload.proposed?.resources !== undefined)) {
      throw new Error("Itemized resources require config version: 2 so older scanners cannot silently ignore them");
    }
    workloads.set(workload.findingId, workload);
  }
  return workloads;
}
