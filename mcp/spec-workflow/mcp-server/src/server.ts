import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BrainMcpStore } from "./brain-store.js";
import { registerTools } from "./tools.js";

export function createSpecWorkflowServer(store: BrainMcpStore): McpServer {
  const server = new McpServer({
    name: "spec-workflow",
    version: "2.0.0",
  });
  registerTools(server, store);
  return server;
}
