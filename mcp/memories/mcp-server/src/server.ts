/**
 * Factory for a configured Memories MCP server.
 *
 * Transport-agnostic: the same server definition is used for both the stdio
 * transport (Phase 1) and the Streamable HTTP transport (Phase 2/3). For HTTP,
 * a fresh server instance is created per session.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoriesApiClient } from "./api.js";
import { registerTools } from "./tools.js";

export function createMemoriesServer(api: MemoriesApiClient): McpServer {
  const server = new McpServer({
    name: "memories",
    version: "1.0.0",
  });
  registerTools(server, api);
  return server;
}
