#!/usr/bin/env node
/**
 * Memories MCP server — entry point (local stdio only).
 *
 * Wraps the Memories REST API and exposes it to MCP clients over stdio.
 * The Memories app must be running (default http://localhost:3466/api).
 *
 * Usage:
 *   node build/index.js
 *   node build/index.js --memory-location /path/to/memories-storage
 *   node build/index.js --api-base-url http://localhost:3466/api
 *
 * Configuration sources:
 *   --memory-location <path>   where memories are stored (or MEMORY_LOCATION env)
 *   --api-base-url <url>       Memories REST API base
 *                              (default localhost:3466/api, or MEMORIES_API_BASE_URL env)
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MemoriesApiClient } from "./api.js";
import { createMemoriesServer } from "./server.js";
import { log } from "./logger.js";

interface CliOptions {
  memoryLocation?: string;
  apiBaseUrl: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    memoryLocation: process.env.MEMORY_LOCATION,
    apiBaseUrl: process.env.MEMORIES_API_BASE_URL ?? "http://localhost:3466/api",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i];
    const inline = (flag: string) => arg.slice(flag.length + 1);

    if (arg === "--memory-location") opts.memoryLocation = value();
    else if (arg.startsWith("--memory-location=")) opts.memoryLocation = inline("--memory-location");
    else if (arg === "--api-base-url") opts.apiBaseUrl = value();
    else if (arg.startsWith("--api-base-url=")) opts.apiBaseUrl = inline("--api-base-url");
  }

  return opts;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.memoryLocation) {
    log(`Memory location: ${options.memoryLocation}`);
  } else {
    log(
      "No memory location provided; relying on the Memories app's own " +
        "configured storage."
    );
  }
  log(`API base URL: ${options.apiBaseUrl}`);

  const api = new MemoriesApiClient(options.apiBaseUrl);

  const server = createMemoriesServer(api);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("Memories MCP server connected over stdio.");
}

main().catch((err) => {
  log("Fatal error:", err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
