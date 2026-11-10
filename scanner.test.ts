import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepository, scanSource } from "./scanner.ts";

test("detects supported SDK references and endpoint URLs without leaking source literals", () => {
  const source = [
    'import Firecrawl from "@mendable/firecrawl-js";',
    'const endpoint = "https://api.firecrawl.dev/v2/scrape?api_key=DO_NOT_PRINT";',
    'const bee = require("scrapingbee");',
    'const dynamic = import("@firecrawl/firecrawl-js");'
  ].join("\n");
  const findings = scanSource("client.ts", source);
  expect(findings.map((item) => item.id)).toEqual(["client.ts#firecrawl", "client.ts#scrapingbee"]);
  expect(findings[0].evidence).toEqual([
    { line: 1, kind: "sdk-import" }, { line: 2, kind: "api-url" }, { line: 4, kind: "sdk-import" }
  ]);
  expect(JSON.stringify(findings)).not.toContain("DO_NOT_PRINT");
});

test("ignores comments, type-only imports, non-scraping packages, inherited object keys and lookalike hosts", () => {
  const source = `
    // fetch("https://api.firecrawl.dev/v2/scrape")
    import type { Firecrawl } from "@mendable/firecrawl-js";
    import { type Client } from "scrapingbee";
    import { inspect } from "@firecrawl/pdf-inspector";
    const evil = "https://api.firecrawl.dev.example.com";
    import inherited from "constructor";
    const prototype = require("__proto__");
    const inheritedHost = "https://constructor";
  `;
  expect(scanSource("client.ts", source)).toEqual([]);
});

test("repository scan stays within tracked regular files and reports incomplete scans", async () => {
  const root = await mkdtemp(join(tmpdir(), "string-savings-test-"));
  try {
    Bun.spawnSync(["git", "init", "-q", root]);
    await writeFile(join(root, "tracked.ts"), 'import bee from "scrapingbee";');
    await writeFile(join(root, "untracked.ts"), 'import bee from "scrapingbee";');
    await writeFile(join(root, "broken.ts"), "const = ;");
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist", "bundle.js"), 'require("scrapingbee");');
    await symlink(join(root, "tracked.ts"), join(root, "linked.ts"));
    const staged = Bun.spawnSync(["git", "-C", root, "add", "tracked.ts", "broken.ts", "linked.ts", "dist/bundle.js"]);
    expect(staged.exitCode).toBe(0);
    const report = await scanRepository(root);
    expect(report.findings.map((item) => item.file)).toEqual(["tracked.ts"]);
    expect(report.scannedFiles).toBe(1);
    expect(report.warnings).toEqual([
      "broken.ts: could not read or parse; findings may be incomplete", "linked.ts: skipped symlink"
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
