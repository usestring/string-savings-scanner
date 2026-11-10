#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { analyze, parseWorkloads } from "./cost.ts";
import { scanRepository } from "./scanner.ts";

async function main() {
  const { values } = parseArgs({
    options: { repo: { type: "string" }, config: { type: "string" }, help: { type: "boolean" } },
    strict: true
  });
  if (values.help) {
    process.stdout.write("Usage: string-savings --repo /path/to/git-root [--config costs.local.json]\nPrints a JSON report of tracked JS/TS references and projected costs. No network calls or file writes.\n");
    return;
  }
  if (!values.repo) throw new Error("--repo is required; use --help");
  const workloads = values.config ? parseWorkloads(await Bun.file(values.config).json()) : new Map();
  const asOf = new Date().toISOString().slice(0, 10);
  const scan = await scanRepository(values.repo);
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
    version: 1, asOf, scope: "Tracked JavaScript/TypeScript references only; not proof of live traffic or compatibility. Submodules must be scanned separately.",
    scannedFiles: scan.scannedFiles, warnings: scan.warnings, findings
  }, null, 2) + "\n");
}

if (import.meta.main) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
