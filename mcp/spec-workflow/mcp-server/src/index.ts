#!/usr/bin/env node
/**
 * Spec-workflow MCP server — entry point (local stdio only).
 *
 * A brain-mcp-backed MCP server for spec-driven development: it generates specs
 * from an interview, stores each as linked notes in the "Tasks & Specs" section
 * of brain-mcp, and tracks the task through plan/implementation/review/
 * validation phases.
 *
 * Usage:
 *   node build/index.js
 *   node build/index.js --api-base-url http://localhost:3466/api
 *
 * Configuration sources (highest priority first):
 *   --api-base-url <url>       Memories REST API base
 *   MEMORIES_API_BASE_URL env  Memories REST API base
 *   default                    http://localhost:3466/api
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MemoriesApiClient } from "./api.js";
import { BrainMcpStore } from "./brain-store.js";
import { createSpecWorkflowServer } from "./server.js";
import { log } from "./logger.js";

interface CliOptions {
  apiBaseUrl: string;
}

function parseArgs(argv: string[]): CliOptions {
  let apiBaseUrl =
    process.env.MEMORIES_API_BASE_URL ?? "http://localhost:3466/api";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--api-base-url") apiBaseUrl = argv[++i];
    else if (arg.startsWith("--api-base-url="))
      apiBaseUrl = arg.slice("--api-base-url=".length);
  }

  return { apiBaseUrl };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const api = new MemoriesApiClient(options.apiBaseUrl);
  const store = new BrainMcpStore(api);

  // Verify brain-mcp is reachable before starting
  try {
    await store.healthCheck();
  } catch (err) {
    log(
      "ERROR:",
      err instanceof Error ? err.message : String(err),
      "\nMake sure the Memories app is running (mcp/memories/start-server.ps1)."
    );
    process.exit(1);
  }
  log(`API base URL: ${options.apiBaseUrl}`);

  const server = createSpecWorkflowServer(store);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("Spec-workflow MCP server connected over stdio (brain-mcp backend).");
}

main().catch((err) => {
  log("Fatal error:", err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
