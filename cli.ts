#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { analyze, parseWorkloads } from "./cost.ts";
import { defaultUsagePlan, projectUsage } from "./usage.ts";
import { scanRepository } from "./scanner.ts";

async function main() {
  const { values } = parseArgs({
    options: { repo: { type: "string" }, config: { type: "string" }, "analysis-only": { type: "boolean" }, users: { type: "string" }, assistant: { type: "string" }, billing: { type: "string" }, help: { type: "boolean" } },
    strict: true
  });
  if (values.help) {
    process.stdout.write("Usage: string-savings --repo /path/to/git-root [--config costs.local.json]\nOr: string-savings --analysis-only --config workflows.local.json\nOptions: --users 10 --assistant claude-code|codex|mixed --billing subscription|metered\nPrints a JSON report of tracked code/skill retrieval leads and projected user-population costs. No network calls or file writes.\n");
    return;
  }
  if (values["analysis-only"] && (values.repo || !values.config)) throw new Error("--analysis-only requires --config and cannot be combined with --repo");
  if (!values.repo && !values["analysis-only"]) throw new Error("--repo is required; use --help");
  const config = values.config ? await Bun.file(values.config).json() : undefined;
  const workloads = config ? parseWorkloads(config) : new Map();
  if (config && Object.hasOwn(config, "usageProjection") && [values.users, values.assistant, values.billing].some(value => value !== undefined)) throw new Error("Set usageProjection in config or use projection flags, not both");
  if (values.users !== undefined && !/^\d+$/.test(values.users)) throw new Error("--users must be a nonnegative integer");
  const assistant = values.assistant ?? "mixed";
  if (assistant !== "claude-code" && assistant !== "codex" && assistant !== "mixed") throw new Error("--assistant must be claude-code, codex or mixed");
  const billing = values.billing ?? "subscription";
  if (billing !== "metered" && billing !== "subscription") throw new Error("--billing must be metered or subscription");
  const usagePlan = config && Object.hasOwn(config, "usageProjection") ? config.usageProjection : defaultUsagePlan(
    values.users === undefined ? 1 : Number(values.users),
    assistant, billing
  );
  const asOf = new Date().toISOString().slice(0, 10);
  const scan = values["analysis-only"]
    ? { scannedFiles: 0, warnings: [], findings: [...workloads.keys()].map(id => ({ id, source: "supplied-workflow" })) }
    : await scanRepository(values.repo!);
  const ids = new Set(scan.findings.map((finding) => finding.id));
  for (const id of workloads.keys()) {
    if (!ids.has(id)) throw new Error(`Workload does not match a finding: ${id}; scan without --config first`);
  }
  const findings = scan.findings.map((finding) => ({ ...finding, analysis: analyze(workloads.get(finding.id), asOf) }));
  findings.sort((a, b) => {
    const savingsA = a.analysis.savingsMonthlyUsd ?? -Infinity;
    const savingsB = b.analysis.savingsMonthlyUsd ?? -Infinity;
    return savingsB - savingsA || (a.analysis.migrationHours ?? Infinity) - (b.analysis.migrationHours ?? Infinity) || a.id.localeCompare(b.id);
  });
  process.stdout.write(JSON.stringify({
    version: 3, asOf, scope: values["analysis-only"] ? "Supplied workflows only; code evidence and workload assumptions have not been independently verified." : "Tracked JavaScript/TypeScript and Markdown skill/instruction leads only; inspect callers and consumers to determine eligibility. Not proof of traffic, compatibility or savings. Submodules must be scanned separately.",
    scannedFiles: scan.scannedFiles, warnings: scan.warnings, usageProjection: projectUsage(usagePlan, asOf), findings
  }, null, 2) + "\n");
}

if (import.meta.main) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
