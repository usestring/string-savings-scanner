export async function getPage(url: string, apiKey: string, request: (url: string, init: RequestInit) => Promise<Response> = fetch) {
  const response = await request("https://request.usestring.ai/v1/fetch", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, format: "json" })
  });
  if (!response.ok) throw new Error(`Page service returned ${response.status}`);
  const result = await response.json();
  if (typeof result.data !== "string" || !Number.isInteger(result.statusCode)) throw new Error("Invalid page response");
  return { html: result.data, status: result.statusCode };
}
