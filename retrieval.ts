import traverse, { type NodePath } from "@babel/traverse";

export type RetrievalKind = "native-fetch" | "http-client" | "browser";
export type RetrievalEvidence = { line: number; kind: "fetch-call" | "http-call" | "browser-navigation" };
const clients = new Set(["node-fetch", "cross-fetch", "undici", "axios", "got", "node:http", "node:https", "http", "https"]);
const browsers = new Set(["playwright", "playwright-core", "@playwright/test", "puppeteer", "puppeteer-core"]);

function member(node: any): string | undefined {
  if (!node?.computed && node?.property?.type === "Identifier") return node.property.name;
  if (node?.computed && node?.property?.type === "StringLiteral") return node.property.value;
}

function moduleOrigin(node: any, path: NodePath, seen = new Set<object>()): string | undefined {
  if (!node || seen.has(node)) return;
  seen.add(node);
  if (node.type === "AwaitExpression") return moduleOrigin(node.argument, path, seen);
  if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") return moduleOrigin(node.object, path, seen);
  if (node.type === "CallExpression") {
    if (node.callee?.name === "require" && !path.scope.getBinding("require") && node.arguments[0]?.type === "StringLiteral") return node.arguments[0].value;
    return moduleOrigin(node.callee, path, seen);
  }
  if (node.type !== "Identifier") return;
  const binding = path.scope.getBinding(node.name);
  if (!binding && node.name === "fetch") return "native-fetch";
  if (!binding || !binding.constant) return;
  const declaration = binding.path;
  if (declaration.isImportSpecifier() || declaration.isImportDefaultSpecifier() || declaration.isImportNamespaceSpecifier()) {
    if (declaration.parent.importKind !== "type" && (declaration.node as any).importKind !== "type") return (declaration.parent as any).source.value;
  }
  if (declaration.isAssignmentPattern()) return moduleOrigin(declaration.node.right, declaration, seen);
  if (declaration.isVariableDeclarator()) return moduleOrigin(declaration.node.init, declaration, seen);
}

function isRead(node: any): boolean {
  const options = node.arguments[1] ?? (node.arguments[0]?.type === "ObjectExpression" ? node.arguments[0] :
    node.arguments[0]?.type === "NewExpression" && node.arguments[0].callee?.name === "Request" ? node.arguments[0].arguments[1] : undefined);
  if (options?.type !== "ObjectExpression") return true;
  const method = options.properties.find((item: any) => (item.key?.name ?? item.key?.value) === "method");
  return !method || method.value?.type !== "StringLiteral" || ["GET", "HEAD"].includes(method.value.value.toUpperCase());
}

export function retrievalCalls(tree: any): Map<RetrievalKind, RetrievalEvidence[]> {
  const found = new Map<RetrievalKind, RetrievalEvidence[]>();
  traverse(tree, {
    CallExpression(path) {
      const node = path.node;
      const callee: any = node.callee;
      const method = member(callee);
      const qualifiedFetch = method === "fetch" && ["globalThis", "window"].includes(callee.object?.name) && !path.scope.getBinding(callee.object.name);
      const origin = moduleOrigin(callee, path);
      let kind: RetrievalKind | undefined;
      let evidence: RetrievalEvidence["kind"] = "http-call";
      if ((qualifiedFetch || (origin === "native-fetch" && !method)) && isRead(node)) { kind = "native-fetch"; evidence = "fetch-call"; }
      else if (origin && clients.has(origin) && isRead(node) && (!method || ["fetch", "get", "request", "stream"].includes(method))) kind = "http-client";
      else if (origin && browsers.has(origin) && method === "goto") { kind = "browser"; evidence = "browser-navigation"; }
      if (!kind) return;
      const items = found.get(kind) ?? [];
      const line = node.loc!.start.line;
      if (!items.some(item => item.line === line && item.kind === evidence)) items.push({ line, kind: evidence });
      found.set(kind, items);
    }
  });
  return found;
}
