export async function getPage(url: string, apiKey: string, request: (url: string, init: RequestInit) => Promise<Response> = fetch) {
  const response = await request("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["rawHtml"], maxAge: 0, onlyMainContent: false })
  });
  if (!response.ok) throw new Error(`Page service returned ${response.status}`);
  const result = await response.json();
  if (!result.success || typeof result.data?.rawHtml !== "string" || !Number.isInteger(result.data?.metadata?.statusCode)) {
    throw new Error("Invalid page response");
  }
  return { html: result.data.rawHtml, status: result.data.metadata.statusCode };
}
