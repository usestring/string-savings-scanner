import { expect, test } from "bun:test";
import { getContext as before } from "./context_before.ts";
import { getContext as after } from "./context_after.ts";

test("plain-fetch migration delivers readable context and preserves service failures", async () => {
  const html = "<html><nav>Menu</nav><article><h1>Guide</h1><p>Released November 10.</p></article></html>";
  const markdown = "# Guide\n\nReleased November 10.";
  const original = await before("https://example.com/guide", async () => new Response(html));
  const migrated = await after("https://example.com/guide", "test-key", async (url, init) => {
    expect(url).toBe("https://request.usestring.ai/v1/fetch");
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://example.com/guide", format: "markdown" });
    return new Response(markdown, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
  });
  expect(original).toContain("Released November 10.");
  expect(migrated).toContain("Released November 10.");
  await expect(after("https://example.com", "test-key", async () => new Response("limited", { status: 429 }))).rejects.toThrow();
  await expect(after("https://example.com", "test-key", async () => Response.json({ error: "bad request" }))).rejects.toThrow();
});
