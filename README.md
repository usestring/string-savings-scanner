# String savings scanner

Find Firecrawl and ScrapingBee references in a Git repository, then compare the cost of an equivalent String workload. Runs locally with Bun; it makes no API requests, uploads no code and changes no application files.

Requires [Bun](https://bun.sh/) 1.3.10 or newer and Git. Install from source:

```bash
git clone https://github.com/usestring/string-savings-scanner.git
cd string-savings-scanner
bun install --frozen-lockfile
```

Run from the scanner directory:

```bash
bun cli.ts --repo /absolute/path/to/repository > /tmp/string-findings.json
bun cli.ts --repo /absolute/path/to/repository --config /path/to/costs.local.json > /tmp/string-costs.json
```

`--repo` must identify a Git root. Only tracked `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts` and `.cts` files are inspected, including working-tree edits to tracked files. Untracked files, symlinks, generated directories and files over 1 MiB are excluded. Submodules are separate repositories: run the command on each one you want to inspect. Read/parse failures appear in `warnings`; a partial scan does not establish the absence of integrations.

The syntax parser finds imports (including `require` and dynamic imports) of `scrapingbee`, `@mendable/firecrawl-js` and `@firecrawl/firecrawl-js`, and literal HTTPS URLs with the exact `api.firecrawl.dev` or `app.scrapingbee.com` host. It ignores comments, type-only imports and unrelated packages such as `@firecrawl/pdf-inspector`. A URL in a string is a reference, not proof of a call. Re-exports, interpolated URLs, Python and other vendors are outside this initial version. Tests and example files can appear in the results; determine which findings carry real traffic.

Findings contain file/line evidence and compatibility checks, without copying code or URL query strings into the report. A finding is grouped by file and provider, with a stable ID such as `src/client.ts#firecrawl`. If a wrapper has several billing modes or call sites, analyze a measured combined billing mix or split the traffic before estimating it. Static reference counts are never used as request volume.

## Cost inputs

Copy [examples/costs.json](examples/costs.json) and replace the finding ID, usage, quotes and notes. Keep account-specific inputs in a `*.local.json` file outside a shared report. Every charge component is explicit, including zero. Missing or null fields produce `unknown` with missing field names; invalid numeric values, duplicate IDs and unmatched IDs fail the command. There is no default provider price or assumed traffic.

Each workload supplies:

| Field | Meaning |
| --- | --- |
| `findingId`, `label`, `notes` | Exact scan ID, workload description and evidence/limitations. |
| `monthlyResults` | Desired successfully delivered results per month, with the same quality, freshness and deadline for both providers. |
| `current`, `proposed` | Pricing and delivery assumptions for the old provider and String. |
| `retainedCurrentMonthlyUsd` | Old-provider charges still payable after switching, including unused commitments. Use zero only if avoidable. |
| `migrationHours`, `engineeringUsdPerHour` | One-time implementation effort and loaded hourly cost. |
| `compatibility` | `unverified`, `equivalent` or `incompatible`. Use `equivalent` only after validating required behavior. |

Each quote supplies an HTTPS `pricingUrl`, a `checkedAt` date (`YYYY-MM-DD`), a named billing `unit`, and these numbers:

| Field | Meaning |
| --- | --- |
| `usdPerUnit`, `unitsPerAttempt` | Price and unit conversion per attempt; include credit multipliers or a weighted measured billing mix. |
| `attemptsPerJob`, `deliveryRate` | Attempts including retries per submitted job, and fraction of jobs delivering an acceptable result. |
| `billedFraction` | Fraction of attempts billed, including billed failures. This is separate from delivery success. |
| `includedMonthlyUnits` | Available units in a paid bundle, after allowing for other workloads. |
| `minimumMonthlyUsd` | Minimum usage spend, such as a monthly fee that becomes usage balance. |
| `fixedMonthlyUsd` | Additional fixed fee that does **not** become usage balance. |
| `addonsMonthlyUsd` | Extraction, bandwidth, browser time, overages or other charges not represented by the unit rate. |

The comparison computes:

```text
attempts = monthlyResults × attemptsPerJob / deliveryRate
billableUnits = attempts × billedFraction × unitsPerAttempt
usageUsd = max(0, billableUnits − includedMonthlyUnits) × usdPerUnit
monthlyUsd = fixedMonthlyUsd + max(minimumMonthlyUsd, usageUsd) + addonsMonthlyUsd
savings = current.monthlyUsd − proposed.monthlyUsd − retainedCurrentMonthlyUsd
breakEvenMonths = migrationHours × engineeringUsdPerHour / positive monthly savings
```

Model a bundled subscription as a fixed fee plus included units and a verified overage rate; model String's fee that becomes balance as a usage minimum. Do not count the same fee twice. This is steady-state monthly planning, not a prediction of invoice timing: balance rollover, top-up denominations, tax, annual prepayments and one-time signup credits must be considered separately. Allocate shared fees once. Do not sum overlapping findings or analyses of the same shared account.

Reports show unrounded USD projections, not measured savings. Findings sort by monthly savings descending, then migration hours ascending. `candidate` requires positive savings, claimed equivalent behavior and sources checked within 90 days. `validate-first` requires compatibility or pricing validation; `incompatible` and `no-savings` should not be migrated on the strength of this analysis. Missing inputs stay `unknown`. Compatibility notes and sources remain part of each analysis.

## Reproducible migration pilot

From this repository root:

```bash
bun cli.ts --repo "$PWD" --config examples/costs.json > /tmp/string-pilot.json
```

The example uses 100,000 delivered fresh HTML pages per month. The old-provider price is deliberately **synthetic**, not a Firecrawl quote. String's $1.20/1,000 standard browser rate and $19 usage minimum are illustrative inputs based on the [published pricing](https://usestring.ai/pricing), checked 2026-11-10. Tier mix, latency, actual success rates and billing ratios require measurement. These inputs project $200/month before, $120/month after, $80/month savings and five months to recover four hours at $100/hour. Status remains `validate-first`.

[pilot_before.ts](examples/pilot_before.ts) and [pilot_after.ts](examples/pilot_after.ts) implement the same narrow `getPage` contract: HTML plus the destination status. The contract test preserves successful HTML, destination 404s, service failures and malformed-envelope rejection without network traffic. It proves adapter behavior against fixtures; it does not establish real-site rendering, freshness, latency or success-rate equivalence.

Use the before/after diff as a reviewable migration example. Keep the original adapter available for rollback. Before a live switch, measure the same target sample on both services, check the actual billing mix and retained commitments, then wire the validated adapter into the chosen application and run its own build/tests. No production wrapper is automatically rewritten by this tool.

## Development

```bash
bun run typecheck
bun test
bun run build
bun dist/scanner.js --repo /absolute/path/to/repository
```

The build bundles the parser into `dist/scanner.js`; running it requires Bun and Git. The optional `bun link` command registers the `string-savings` executable on your machine. The scanner itself needs no API key. The example adapters accept a key only when you choose to call them.

## License

[MIT](LICENSE).
