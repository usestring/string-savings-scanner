import { expect, test } from "bun:test";
import { getPage as before } from "./pilot_before.ts";
import { getPage as after } from "./pilot_after.ts";

test("migration preserves HTML and destination status for the fixture contract", async () => {
  for (const status of [200, 404]) {
    const html = "<html><body>Fixture page</body></html>";
    const oldRequest = async (url: string, init: RequestInit) => {
      expect(String(url)).toBe("https://api.firecrawl.dev/v2/scrape");
      expect(JSON.parse(init!.body as string)).toMatchObject({ formats: ["rawHtml"], maxAge: 0 });
      return Response.json({ success: true, data: { rawHtml: html, metadata: { statusCode: status } } });
    };
    const newRequest = async (url: string, init: RequestInit) => {
      expect(String(url)).toBe("https://request.usestring.ai/v1/fetch");
      expect(JSON.parse(init!.body as string)).toEqual({ url: "https://example.com/page", format: "json" });
      return Response.json({ data: html, statusCode: status });
    };
    expect(await after("https://example.com/page", "test-placeholder", newRequest))
      .toEqual(await before("https://example.com/page", "test-placeholder", oldRequest));
  }
});

test("migration rejects provider errors and malformed envelopes instead of reporting empty success", async () => {
  for (const getPage of [before, after]) {
    const failed = async () => new Response("", { status: 429 });
    await expect(getPage("https://example.com", "test-placeholder", failed)).rejects.toThrow("429");
    const invalid = async () => Response.json({});
    await expect(getPage("https://example.com", "test-placeholder", invalid)).rejects.toThrow("Invalid page response");
  }
});
