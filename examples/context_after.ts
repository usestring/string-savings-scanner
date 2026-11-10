export async function getContext(url: string, apiKey: string, request: (url: string, init: RequestInit) => Promise<Response> = fetch) {
  const response = await request("https://request.usestring.ai/v1/fetch", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, format: "markdown" })
  });
  if (!response.ok) throw new Error(`Page service returned ${response.status}`);
  if (!/^text\/(markdown|plain)(;|$)/i.test(response.headers.get("content-type") ?? "")) throw new Error("Expected readable page text");
  return response.text();
}
