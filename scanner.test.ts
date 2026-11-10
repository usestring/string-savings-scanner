import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanInstructions, scanRepository, scanSource } from "./scanner.ts";

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

test("finds ordinary fetch, aliased HTTP clients and browser navigation without vendor names", () => {
  const findings = scanSource("read.ts", `
    import axios from "axios";
    import { chromium as engine } from "playwright";
    const read = fetch;
    await read(target);
    async function wrapper(request = fetch) { return request(target, { method: "GET" }); }
    const response = await fetch(target);
    await response.text();
    const client = axios.create({ timeout: 1000 });
    await client.get(target);
    const browser = await engine.launch();
    const page = await browser.newPage();
    await page.goto(target);
  `);
  expect(findings.map(item => item.id)).toEqual(["read.ts#native-fetch", "read.ts#http-client", "read.ts#browser"]);
  expect(findings[0].evidence.length).toBe(3);
  expect(findings.map(item => item.evidence[0].kind)).toEqual(["fetch-call", "http-call", "browser-navigation"]);
});

test("does not treat shadowed bindings, browser-shaped objects or explicit writes as retrieval", () => {
  const findings = scanSource("write.ts", `
    import axios from "axios";
    import { chromium } from "playwright";
    async function local(fetch: Function) { await fetch(target); }
    async function nested() { const window = { fetch() {} }; window.fetch(target); }
    await fetch(target, { method: "POST" });
    await fetch(new Request(target, { method: "DELETE" }));
    await axios({ url: target, method: "PATCH" });
    await axios.post(target, data);
    const page = { goto() {} };
    page.goto(target);
  `);
  expect(findings).toEqual([]);
});

test("generic retrieval reports evidence without exposing credentials or target URLs", () => {
  const findings = scanSource("read.ts", 'await globalThis.fetch("https://example.com/page?token=DO_NOT_PRINT");');
  expect(findings[0].provider).toBe("native-fetch");
  expect(JSON.stringify(findings)).not.toContain("DO_NOT_PRINT");
  expect(JSON.stringify(findings)).not.toContain("example.com");
});


test("indexes skill-only repositories without publishing instruction content or URLs", async () => {
  const root = await mkdtemp(join(tmpdir(), "string-skill-test-"));
  try {
    Bun.spawnSync(["git", "init", "-q", root]);
    await writeFile(join(root, "SKILL.md"), "---\nname: page-reader\n---\nUse WebFetch on https://example.com/?token=DO_NOT_PRINT");
    Bun.spawnSync(["git", "-C", root, "add", "SKILL.md"]);
    const report = await scanRepository(root);
    expect(report.scannedFiles).toBe(1);
    expect(report.findings[0].id).toBe("SKILL.md#skill");
    expect(report.findings[0].evidence).toEqual([{ line: 4, kind: "fetch-instruction" }]);
    expect(JSON.stringify(report)).not.toContain("DO_NOT_PRINT");
    expect(scanInstructions("SKILL.md", "Explain a topic")[0].evidence[0].kind).toBe("skill-definition");
    expect(scanInstructions("README.md", "<!-- Use WebFetch -->\nhttps://example.com/")).toEqual([]);
    expect(scanInstructions("commands/read.md", "<!--\nUse WebFetch\n-->\nUse curl to read a public page")[0].evidence).toEqual([{ line: 4, kind: "fetch-instruction" }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
