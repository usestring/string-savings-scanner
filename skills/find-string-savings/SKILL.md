---
name: find-string-savings
description: Audit web retrieval code and agent skills for String savings, estimate workflow costs, and implement worthwhile changes.
---

# Find String savings

Use when asked to reduce the cost of fetching or consuming web content in a codebase or agent workflow. Start by identifying the repository and requested consumer outcome. A paid scraping SDK is one lead; ordinary fetch, curl and browser tools can have larger downstream costs.

## Discover the workflow

If the scanner is available, run `bun <scanner-root>/cli.ts --repo <target-git-root>` for JS/TS call-site and Markdown skill/instruction leads, plus an illustrative user-population projection. It is local and read-only. Treat its output as an index, not recommendations. The scanner root is the checkout containing this skill, two directories above this folder. For installation and the cost schema, read that checkout's [README](../../README.md).

Inspect the repository beyond those leads. Search tracked source, `SKILL.md` files, tool definitions, prompts and scripts for HTTP clients, curl/wget, Python requests/httpx, browser navigation, page-to-text conversion and content passed into models. Follow aliases, wrappers, callers, fallback chains and the response into its actual consumer. Read the existing fetch skill even when no vendor is named. Count workflows, not imports; combine duplicate callers and allocate shared fees once.

For each plausible workflow, record file/line evidence and distinguish observed facts from unknowns:

- What is fetched and why: public pages, authenticated APIs, binary assets, original markup, readable text or structured facts?
- Which stages cost money: paid retrieval, proxies, browser seconds, retries, parsing/extraction, model input tokens, repeated agent calls or maintenance?
- What can actually change: use String markdown for a text consumer, remove redundant browser/conversion steps, or retain direct HTTP? Compare existing cleanup/caching/truncation as well. Raw HTML is not inherently wasteful when it is needed.

Discard ineligible leads with a reason. Private APIs, writes, browser state/actions, embedded scripts and exact-byte consumers need separate compatibility analysis. Do not proxy them merely because a fetch call exists. Do not send secrets, source code or private target content to String to perform this audit.

## Measure economics

Use the same delivered outcome, freshness, latency and quality target for both paths. From available logs/bills and an authorized paired sample, obtain delivered monthly results, retry attempts, success and billing rates, String route/tier mix, and avoidable resource use. Fetch current public pricing or use supplied contractual prices; record source and date. Actual usage stays unknown when unmeasured; continue with explicit planning estimates when requested. Static occurrences are never request volume.

For Claude Code/Codex users, including skill-only repositories, project eligible page reads from active users × sessions/user/day × active days/month × reads/session × eligible fraction. Use the CLI's `--users`, `--assistant` and `--billing` defaults for an explicitly illustrative starting point, or a version-3 `usageProjection` config with separate cohorts. The default 1/3/10 reads/session, four sessions/day and 20 days/month are assumptions, not an observed population average. Replace them with a justified source or representative session counts including zeros. Report sample mean and median separately: mean estimates aggregate volume, median represents a typical session. Do not infer usage from skill installations, stars or repository references. Read the README's projection schema and examples.

Combine populations before applying a shared account minimum. Do not add alternative scenarios or overlap population estimates with the same finding-level traffic. For unchanged subscriptions, report reduced tokens as capacity, with zero marginal token cash savings; use metered rates only for genuinely avoidable charges. Existing fetch tools may already summarize or cache content. Exclude searches, cached-index lookups, private APIs and duplicate retries from eligible page reads.

For model context, tokenize the actual before/after payload with the consumer model's tokenizer; account for cached-input rates, truncation, output tokens, extra model calls and task accuracy. Smaller text does not prove better results. For browsers, measure billable runtime and distinguish removable capacity from a fixed provisioned bill. Maintenance time is capacity value unless spend can actually be avoided; report it separately from cash savings.

Prepare version-2 workload inputs (version 3 when including usage projections) using the README schema. `current.resources` and `proposed.resources` itemize compute, bandwidth, tokens or other cash costs by attempt, delivered result or month, with quantities, rates and sources. Do not repeat them in add-ons. Include retained commitments and migration effort. Break out service spend and downstream costs. Compare low/base/high estimates when routing, retries or token reduction are uncertain.

For code found by the scanner, attach exact finding IDs and rerun with `--repo ... --config ...`. For Python, shell, skill or other manually traced workflows, use `bun <scanner-root>/cli.ts --analysis-only --config <workflows.local.json>`; use `path#workflow` IDs and put real file/line evidence and limitations in `notes`. This mode calculates supplied inputs without claiming to verify code. Keep account-specific inputs local. The bundled examples are synthetic and must not become customer forecasts.

Return a ranked decision table with workflow/evidence, eligibility, before/after service and resource spend, net monthly savings, migration cost/payback, source dates, unknowns and the next concrete validation step. Explicitly retain cheap successful fetches when no avoidable cost exceeds String's fee. Do not claim measured savings from a projection.

## Implement the worthwhile change

When implementation is requested and a candidate is supported, patch the smallest complete workflow, including its code or skill instructions and actual callers. Use [String's public fetch skill](https://github.com/usestring/skills/blob/main/skills/string-fetch/SKILL.md) for supported options. Prefer its available fetch tool for agent reading; for application code, validate the current API contract. Readable Markdown is appropriate for reading, raw content for exact markup, and a JSON envelope when destination status/headers are required.

Preserve error/status handling, cancellation, freshness, attribution and required content. Keep a rollback path. Run affected builds and meaningful contract checks, then use an authorized representative sample to compare delivered task quality and actual billed costs. Never present fixture equivalence as real-site validation. Work within existing authorization for live calls, deployments and publication; continue local implementation and reviewable patches independently of missing live inputs.

Deliver the patch, reproducible cost inputs, validation evidence, unresolved measurements and rollback instructions. When economics or compatibility fails, deliver that finding and keep the current implementation.
