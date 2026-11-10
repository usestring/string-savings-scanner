# String savings scanner

Find web retrieval workflows in a codebase or agent skill, then compare the total cost of delivering the same result with String. Plain HTTP can be free while the browser, conversion pipeline or model context downstream is expensive. Runs locally with Bun; it makes no API requests, uploads no code and changes no application files.

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

`--repo` must identify a Git root. Tracked Markdown (`.md`) skill/instruction files and `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts` and `.cts` code files are inspected, including working-tree edits to tracked files. Untracked files, symlinks, generated directories and files over 1 MiB are excluded. Submodules are separate repositories: run the command on each one you want to inspect. Read/parse failures appear in `warnings`; a partial scan does not establish the absence of integrations.

## Start with the audit skill

Give your coding agent [skills/find-string-savings/SKILL.md](skills/find-string-savings/SKILL.md) and ask it to audit your repository for String savings. The skill traces retrieval through callers and consumers, measures the relevant costs, compares alternatives and implements worthwhile changes when requested. It covers source code, existing fetch skills, prompts and scripts, including Python and curl workflows outside the automatic scanner's scope.

The CLI is a local index and calculator for that analysis. It discovers:

- `SKILL.md` inventory and Markdown instructions mentioning page reads, WebFetch, curl/wget or fetch/navigation tools. Skill definitions without a fetch mention are inventory leads that need inspection.
- Native `fetch` calls, including simple aliases and `globalThis.fetch`/`window.fetch`.
- Calls through `node-fetch`, `cross-fetch`, `undici`, Axios, Got and Node HTTP/HTTPS, including imported aliases and simple client factories.
- Playwright/Puppeteer navigation through locally traceable browser/page bindings.
- Firecrawl and ScrapingBee SDK imports and exact literal API-host references.

Comments, type-only imports, shadowed local `fetch` bindings, unrelated `.goto` methods and explicit non-read HTTP methods are excluded from generic retrieval discovery. Variable methods and targets still need inspection. Dynamic dispatch, cross-file alias/data-flow resolution, optional calls and non-JS/TS syntax are outside automatic discovery. A file/line lead does not prove a page fetch is live, eligible or expensive; tests and examples also appear. The skill reads the caller and follows the result into its consumer before recommending anything.

A plain fetch that passes raw HTML to a model may benefit from readable Markdown and fewer paid input tokens. A browser used only to read a page may have avoidable runtime cost. A successful free fetch used for raw HTML may already be the cheapest option. Authenticated APIs, writes, binary assets and interactive browser sessions require separate compatibility analysis.

Findings contain file/line evidence without copying source or target URLs into reports. Findings group by file and retrieval kind/provider, with stable IDs such as `src/read.ts#native-fetch` or `src/client.ts#firecrawl`. Multiple kinds in one file can describe the same pipeline: do not sum them. If a wrapper has several billing modes or callers, analyze a measured combined mix or split the traffic. Static reference counts are never request volume.

## Project Claude Code and Codex usage

Every report includes one separate `usageProjection`, even for a skill-only repository or one with no indexed fetch calls. It estimates the selected active user population, independent of the number of skills, users inferred from Git, or code references. Default inputs are **illustrative planning assumptions**, not a published median/average: one active user, four sessions/day, 20 active days/month, and low/base/high of 1/3/10 eligible page reads/session. That projects **80/240/800 page reads per user/month**. The same assumptions apply to Claude Code and Codex; no measured difference is claimed.

```bash
bun cli.ts --repo /path/to/skills-repository --users 10 --assistant claude-code
bun cli.ts --repo /path/to/repository --users 10 --assistant codex --billing metered
bun cli.ts --analysis-only --config examples/usage-projection.json
bun cli.ts --analysis-only --config examples/sampled-usage.json
```

`--assistant` is `claude-code`, `codex` or `mixed` (default); `--users` is an active-user count (default 1). Repository popularity or installing a skill does not establish activity. Defaults use `--billing subscription`: freed token capacity does **not** reduce an unchanged Claude Code/Codex subscription invoice. The cash comparison includes the added String bill and other explicitly supplied avoidable costs. `--billing metered` illustrates genuinely avoidable token charges. The default $3/million rate and 8,000 → 1,000 input tokens per page are synthetic, independent of assistant or model choice. They are not observed WebFetch payloads or model price quotes.

Use a version-3 config's `usageProjection` to replace all assumptions. Projection flags and a configured plan cannot be combined. The two example files show the full schema. Each cohort supplies `assistant`, `users`, `sessionsPerUserPerDay`, `activeDaysPerMonth`, `eligibleFraction` and `fetchesPerSession`. Distinct cohorts can have different activity patterns; do not count the same users' same sessions under both assistants. Each rate includes a `source` explaining evidence or assumptions:

- `kind: "assumed"`, with ordered `low`, `base`, `high`: a sensitivity range. Base is not labeled a measured mean or median.
- `kind: "sampled"`, with `counts: [0, 0, 1, 3, 6]`: one count for **every** session in a representative window, including zero-fetch sessions. The calculator reports sample arithmetic mean (2), median (1) and sample size. Base uses the mean to project total volume; an additional median scenario shows typical-session volume. Low/high use observed extrema, not statistical confidence bounds. A sample describes its selected users/window, not all assistant users.

```text
monthly eligible reads = users × sessions/user/day × active days/month
                         × reads/session × eligible fraction
```

Reports expose per-user monthly counts, each cohort's statistics and combined scenario volume. `context` supplies `currentTokensPerFetch`, `proposedTokensPerFetch`, `usdPerMillion` and `source`. Measure the actual billable context consumed, including cached rates, existing cleanup/truncation, repeated use and quality; do not assume a built-in fetch tool sends raw HTML. Context tokens are added to both quotes automatically. Other `workload.resources` must exclude those same tokens.

The `workload` follows the cost schema below, without `monthlyResults` or `findingId`: volume is derived from the cohorts. Quotes describe one combined account/workload, so the monthly minimum is charged once. The low/base/high and median cases are alternatives. Do not add their savings, or add this population estimate to finding-level estimates of the same traffic. If different routes/prices cannot be represented by a justified combined quote, analyze them separately and allocate shared fees explicitly. `billing: "subscription"` assigns zero marginal cash cost to the projected context tokens while still reporting token capacity; supply real metered overages only when avoidable.

For ten active users under the default **metered illustration**:

| Case | Monthly reads | Current cost | With String | Net savings |
| --- | --- | --- | --- | --- |
| Low | 800 | $19.20 | $21.40 | −$2.20 |
| Base | 2,400 | $57.60 | $26.20 | $31.40 |
| High | 8,000 | $192.00 | $43.00 | $149.00 |

This uses the synthetic token assumptions above, free direct HTTP, String's standard request-based rate and one $19 minimum. Four migration hours at $100/hour yield about 12.74 months of payback in the base case. Under an unchanged subscription, the same base case frees a hypothetical 16.8 million input tokens/month but adds $19/month in cash spend. Real routing, task quality and marginal billing can change either outcome.

In the synthetic sample `[0, 0, 1, 3, 6]`, ten users project 1,600 reads/month using the mean versus 800 using the median: $14.60 versus −$2.20 in the metered illustration. This is why the tool keeps both statistics rather than treating a median as total expected traffic.

We did not find a population fetch median/mean in the official documentation checked on 2026-11-10. [Claude Code monitoring](https://code.claude.com/docs/en/monitoring-usage) documents session counters and tool-result events for obtaining your own measurements. [Codex web search](https://developers.openai.com/codex/web-search) describes cached-index and live modes; a cached-index lookup or search is not automatically a replaceable live page fetch. Normalize eligible page-read counts locally, deduplicate retries and retain zero sessions. The scanner accepts counts, does not collect transcripts and never exports them.

## Cost inputs

Copy [examples/costs.json](examples/costs.json) and replace the finding ID, usage, quotes and notes. Keep account-specific inputs in a `*.local.json` file outside a shared report. Every charge component is explicit, including zero. Missing or null fields produce `unknown` with missing field names; invalid numeric values, duplicate IDs and unmatched IDs fail the command. Finding-specific costs require supplied workload inputs. A separate user-population projection provides editable illustrative assumptions; it never derives traffic from reference counts.

Reports use version 3 for skill discovery and user-population projections. A `usageProjection` input requires config `version: 3` with `workloads: []` or existing workload entries; older scanners reject it. Config versions 1 and 2 remain supported. Resource inputs require config `version: 2`; older scanners reject it rather than silently dropping downstream costs. Legacy `version: 1` inputs without resources remain supported.

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
| `addonsMonthlyUsd` | Other service charges not represented by the unit rate or itemized resources. |
| `resources` (optional) | Itemized downstream cash costs: compute, browser runtime, bandwidth, model tokens or other resources. Omitted means already included elsewhere in this quote, for compatibility with older inputs. |

Each resource has `label`, `basis` (`attempt`, `result` or `month`), `quantity`, `unit`, `usdPerUnit` and `source`. Quantity is units per attempt, per delivered result or per month. For example, 8,000 model input tokens per result at $3/million can be expressed as `quantity: 0.008`, `unit: "million input tokens"`, `usdPerUnit: 3`, `basis: "result"`. Cite the actual model price and tokenizer measurement in `source`; this number is synthetic. Use per-attempt costs for work repeated on failures, and include wasted model calls if relevant. Do not count a resource again in add-ons.

Reports break out `serviceMonthlyUsd`, `resources`, `resourceMonthlyUsd` and total `monthlyUsd` for each path. A resource saving counts only if avoidable; fixed provisioned capacity that will remain billed belongs in the post-migration cost too. Report maintenance time or freed engineering capacity separately from cash savings.

The comparison computes:

```text
attempts = monthlyResults × attemptsPerJob / deliveryRate
billableUnits = attempts × billedFraction × unitsPerAttempt
usageUsd = max(0, billableUnits − includedMonthlyUnits) × usdPerUnit
serviceMonthlyUsd = fixedMonthlyUsd + max(minimumMonthlyUsd, usageUsd) + addonsMonthlyUsd
resourceMonthlyUsd = sum(basisCount × quantity × usdPerUnit)
monthlyUsd = serviceMonthlyUsd + resourceMonthlyUsd
savings = current.monthlyUsd − proposed.monthlyUsd − retainedCurrentMonthlyUsd
breakEvenMonths = migrationHours × engineeringUsdPerHour / positive monthly savings
```

Model a bundled subscription as a fixed fee plus included units and a verified overage rate; model String's fee that becomes balance as a usage minimum. Do not count the same fee twice. This is steady-state monthly planning, not a prediction of invoice timing: balance rollover, top-up denominations, tax, annual prepayments and one-time signup credits must be considered separately. Allocate shared fees once. Do not sum overlapping findings or analyses of the same shared account.

Reports show unrounded USD projections, not measured savings. Findings sort by monthly savings descending, then migration hours ascending. `candidate` requires positive savings, claimed equivalent behavior and sources checked within 90 days. `validate-first` requires compatibility or pricing validation; `incompatible` and `no-savings` should not be migrated on the strength of this analysis. Missing inputs stay `unknown`. Compatibility notes and sources remain part of each analysis.

## Plain-fetch workflow example

After installation, run from this repository root:

```bash
bun cli.ts --repo "$PWD" --config examples/context-costs.json
bun cli.ts --repo "$PWD" --config examples/free-fetch-costs.json
```

The first example starts with ordinary fetch, with no scraping SDK. [context_before.ts](examples/context_before.ts) returns HTML for a model's reading context; [context_after.ts](examples/context_after.ts) requests readable Markdown from String. The consumer must need the page's meaning rather than exact HTML. The fixture checks the readable-content and failure contracts; it does not measure token reduction or real-site quality.

Both scenarios use 100,000 delivered results/month. Token counts (8,000 before, 1,000 after) and model price ($3/million input tokens) are **synthetic**, not a benchmark. String's $0.25/1,000 standard request-based rate and $19 usage minimum come from [published pricing](https://usestring.ai/pricing), checked 2026-11-10. Actual browser/premium routing, retries, cached-token pricing and quality can change the result.

| Synthetic scenario | Before service + resources | After service + resources | Monthly savings | Decision |
| --- | --- | --- | --- | --- |
| Fetch HTML into model context | $0 + $2,400 | $25 + $300 | $2,075 | Validate token reduction and quality first |
| Free fetch with no avoidable downstream cost | $0 + $0 | $25 + $0 | −$25 | Keep direct fetch |

Four migration hours at $100/hour cost $400; the first scenario's projected payback is about 0.19 months. This is a demonstration of the calculation, not a savings claim. Use a representative paired sample, the actual consumer tokenizer and task evaluation before changing a real workflow. Keep the original adapter available for rollback.

For a manually inspected skill, Python or shell workflow, calculate the same economics without claiming an automatic code scan:

```bash
bun cli.ts --analysis-only --config examples/skill-costs.json
```

The [before](examples/page-reading.before.md) and [after](examples/page-reading.after.md) skill excerpts show a page-reading instruction change from raw HTTP context to the available String fetch tool. The example config cites those files; its cost inputs are synthetic. For your own workflow, use a real `path#workflow` ID and file/line evidence in `notes`. This mode accepts supplied workflows without verifying their code; it cannot be combined with `--repo`. All the same validation and unknown-input rules apply.

## Vendor adapter example

```bash
bun cli.ts --repo "$PWD" --config examples/costs.json
```

[pilot_before.ts](examples/pilot_before.ts) and [pilot_after.ts](examples/pilot_after.ts) implement the same narrow HTML-plus-origin-status contract using Firecrawl and String. Tests preserve destination 404s, service failures and malformed-envelope rejection. The **synthetic** old-provider rate is not a Firecrawl quote; the example projects $200/month to $120/month with String's published standard-browser rate, subject to actual routing and equivalence. This remains `validate-first`.

No application files are automatically rewritten. The audit skill prepares a focused patch, tests affected callers and records the before/after inputs and rollback path. Live measurements and rollout follow the repository owner's authorization.

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
