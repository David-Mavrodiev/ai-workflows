/**
 * Thin HTTP client for the Memories REST API.
 *
 * Reused from the brain-mcp MCP server. All logging goes to stderr (via the
 * logger module) — never stdout — because this process speaks JSON-RPC over
 * stdout for the stdio transport.
 */

export interface ApiResponse {
  ok: boolean;
  status: number;
  body?: unknown;
  headers: Record<string, string>;
}

export class MemoriesApiClient {
  constructor(private readonly baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ApiResponse> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: { Accept: "application/json" },
    };
    if (body !== undefined) {
      init.headers = { ...init.headers, "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);

    const headers: Record<string, string> = {};
    let parsed: unknown;
    const text = await res.text();
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    return { ok: res.ok, status: res.status, body: parsed, headers };
  }

  get(path: string): Promise<ApiResponse> {
    return this.request("GET", path);
  }

  post(path: string, body?: unknown): Promise<ApiResponse> {
    return this.request("POST", path, body);
  }

  put(path: string, body?: unknown): Promise<ApiResponse> {
    return this.request("PUT", path, body);
  }

  delete(path: string): Promise<ApiResponse> {
    return this.request("DELETE", path);
  }
}

/** Build a query string from defined params, URL-encoding values. */
export function buildQuery(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`);
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}
