export async function getContext(url: string, request: (url: string, init: RequestInit) => Promise<Response> = fetch) {
  const response = await request(url, { method: "GET" });
  if (!response.ok) throw new Error(`Page returned ${response.status}`);
  return response.text();
}
