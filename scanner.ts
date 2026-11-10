import { parse } from "@babel/parser";
import { retrievalCalls, type RetrievalKind, type RetrievalEvidence } from "./retrieval.ts";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export type Provider = "firecrawl" | "scrapingbee" | RetrievalKind;
export type Finding = {
  id: string;
  file: string;
  provider: Provider;
  evidence: { line: number; kind: "sdk-import" | "api-url" | RetrievalEvidence["kind"] }[];
  opportunities?: string[];
  replacement: string;
  compatibilityChecks: string[];
};

const modules: Record<string, Provider> = {
  "@mendable/firecrawl-js": "firecrawl",
  "@firecrawl/firecrawl-js": "firecrawl",
  scrapingbee: "scrapingbee"
};
const hosts: Record<string, Provider> = {
  "api.firecrawl.dev": "firecrawl",
  "app.scrapingbee.com": "scrapingbee"
};
const compatibilityChecks = [
  "Confirm this integration is used and measure its delivered monthly results; static references do not establish traffic.",
  "Compare fresh results, status/error handling, latency, rendering, country, headers and cookies on the same workload.",
  "Check crawl/search/extraction, screenshots and browser actions separately; /fetch is not a drop-in SDK replacement.",
  "String can choose a higher-priced browser or premium path. Use the measured billing mix and include add-ons.",
  "Check commitments, retained provider charges and rate limits before changing production code."
];

export function scanSource(file: string, source: string): Finding[] {
  const tree = parse(source, {
    sourceType: "unambiguous",
    plugins: ["decorators-legacy", ...(/\.[cm]?tsx?$/.test(file)
      ? [["typescript", { dts: /\.d\.[cm]?ts$/.test(file) }] as ["typescript", { dts: boolean }], ...(/\.tsx$/.test(file) ? ["jsx" as const] : [])]
      : ["jsx" as const])]
  });
  const findings = new Map<Provider, Finding>();
  const add = (provider: Provider, line: number, kind: "sdk-import" | "api-url") => {
    const finding = findings.get(provider) ?? {
      id: `${file}#${provider}`,
      file,
      provider,
      evidence: [],
      replacement: "Evaluate POST https://request.usestring.ai/v1/fetch for equivalent page fetching.",
      compatibilityChecks
    };
    if (!finding.evidence.some((item) => item.line === line && item.kind === kind)) finding.evidence.push({ line, kind });
    findings.set(provider, finding);
  };
  const walk = (node: any, parent?: any) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "ImportDeclaration" && node.importKind !== "type" &&
      (node.specifiers.length === 0 || node.specifiers.some((item: any) => item.importKind !== "type"))) {
      const provider = Object.hasOwn(modules, node.source.value) ? modules[node.source.value] : undefined;
      if (provider) add(provider, node.loc.start.line, "sdk-import");
    }
    if (node.type === "StringLiteral") {
      const isModule = parent?.type === "ImportExpression" ||
        (parent?.type === "CallExpression" && parent.arguments[0] === node && parent.callee?.name === "require");
      if (isModule && Object.hasOwn(modules, node.value)) add(modules[node.value], node.loc.start.line, "sdk-import");
      try {
        const url = new URL(node.value);
        if (url.protocol === "https:" && Object.hasOwn(hosts, url.hostname)) add(hosts[url.hostname], node.loc.start.line, "api-url");
      } catch {}
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((child) => walk(child, node));
      else if (value && typeof value === "object" && "type" in value) walk(value, node);
    }
  };
  walk(tree);
  for (const [provider, evidence] of retrievalCalls(tree)) {
    findings.set(provider, {
      id: `${file}#${provider}`, file, provider, evidence,
      replacement: "Evaluate String Web Access only for public web content required by this caller.",
      opportunities: [
        "Trace the response to its consumer: raw HTML, readable text, extraction or model context.",
        "Compare whole-workflow cost: retries, proxies, browser compute, HTML processing and model input tokens.",
        "A free successful fetch may already be cheaper. Preserve it when String adds cost without a measured benefit."
      ],
      compatibilityChecks: [
        "Read the caller and downstream use; a network call alone does not establish eligibility or savings.",
        "Exclude private/authenticated APIs, writes, binary downloads, local services and browser interaction requirements.",
        "For text consumers, compare String markdown with existing cleanup using the actual model tokenizer and task quality.",
        ...compatibilityChecks
      ]
    });
  }
  return [...findings.values()];
}

export async function scanRepository(input: string) {
  const root = await realpath(resolve(input));
  const command = Bun.spawn(["git", "-C", root, "ls-files", "--cached", "--full-name", "-z"], { stdout: "pipe", stderr: "pipe" });
  const [files, error, exitCode] = await Promise.all([
    new Response(command.stdout).text(), new Response(command.stderr).text(), command.exited
  ]);
  if (exitCode !== 0) throw new Error(`Cannot list tracked files: ${error.trim()}`);
  const top = Bun.spawnSync(["git", "-C", root, "rev-parse", "--show-toplevel"]);
  if (resolve(top.stdout.toString().trim()) !== root) throw new Error("Repository input must be its Git root.");
  const findings: Finding[] = [];
  const warnings: string[] = [];
  let scannedFiles = 0;
  for (const file of [...new Set(files.split("\0"))].sort()) {
    if (!/\.[cm]?[jt]sx?$/.test(file) || /(^|\/)(node_modules|dist|build|vendor|\.git)(\/|$)/.test(file)) continue;
    const path = resolve(root, file);
    if (isAbsolute(relative(root, path)) || relative(root, path).startsWith("..")) continue;
    try {
      const parts = file.split("/");
      let directory = root;
      let symlink = false;
      for (const part of parts) {
        directory = join(directory, part);
        if ((await lstat(directory)).isSymbolicLink()) { symlink = true; break; }
      }
      if (symlink) { warnings.push(`${file}: skipped symlink`); continue; }
      if ((await lstat(path)).size > 1024 * 1024) { warnings.push(`${file}: exceeds 1 MiB limit`); continue; }
      const source = await readFile(path, "utf8");
      findings.push(...scanSource(file, source));
      scannedFiles++;
    } catch {
      warnings.push(`${file}: could not read or parse; findings may be incomplete`);
    }
  }
  return { scannedFiles, findings, warnings };
}
