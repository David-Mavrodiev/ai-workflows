#!/usr/bin/env node
/**
 * Minimal smoke test: spawns the built MCP server over stdio, runs the
 * initialize handshake, then lists tools and prints their names.
 *
 * This does NOT require the Memories app to be running — it only verifies the
 * server starts and registers its tools. Run with: node smoke-test.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(__dirname, "build", "index.js");

const child = spawn(
  process.execPath,
  [serverEntry, "--memory-location", "/tmp/example"],
  { stdio: ["pipe", "pipe", "inherit"] }
);

let buffer = "";
const pending = new Map();

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function send(method, params, id) {
  return new Promise((resolve) => {
    if (id !== undefined) pending.set(id, resolve);
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"
    );
    if (id === undefined) resolve();
  });
}

const init = await send(
  "initialize",
  {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "1.0.0" },
  },
  1
);
console.log("initialize ->", init.result.serverInfo);

await send("notifications/initialized", {});

const tools = await send("tools/list", {}, 2);
const names = tools.result.tools.map((t) => t.name).sort();
console.log(`tools/list -> ${names.length} tools:`);
for (const n of names) console.log("  -", n);

const expected = [
  "check_semantic_index",
  "create_note",
  "delete_note",
  "get_note",
  "get_skill_coverage",
  "link_memories",
  "list_memories",
  "list_sections",
  "list_tags",
  "rebuild_semantic_index",
  "search_notes",
  "update_note",
];
const missing = expected.filter((e) => !names.includes(e));
child.kill();

if (missing.length > 0) {
  console.error("MISSING TOOLS:", missing);
  process.exit(1);
}
console.log("\nAll expected tools registered. ✓");
