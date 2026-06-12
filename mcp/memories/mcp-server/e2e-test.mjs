#!/usr/bin/env node
/**
 * End-to-end test against the LIVE Memories app (http://localhost:3466).
 *
 * Verifies the MCP server can call real tools: list_sections, create_note
 * (with the evidence parameter), then confirms the memory shows up via
 * list_memories, and finally deletes it via delete_note (with confirmTitle).
 *
 * Requires the Memories app running on port 3466. Run: node e2e-test.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(__dirname, "build", "index.js");

const child = spawn(process.execPath, [serverEntry], {
  stdio: ["pipe", "pipe", "inherit"],
});

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

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"
    );
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}
function callTool(name, args) {
  return rpc("tools/call", { name, arguments: args });
}
function textOf(res) {
  return res.result.content.map((c) => c.text).join("\n");
}

await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "e2e", version: "1.0.0" },
});
notify("notifications/initialized", {});

console.log("== list_sections ==");
const sections = await callTool("list_sections", {});
console.log(textOf(sections).slice(0, 200), "...\n");

console.log("== create_note (Ideas) ==");
const title = `MCP e2e test ${Date.now()}`;
const created = await callTool("create_note", {
  title,
  section: "Ideas",
  body: "Created by the MCP server e2e test.",
  tags: ["mcp-e2e"],
  existingMemoryTitlesChecked: true,
});
const createdText = textOf(created);
console.log(createdText, "\n");
const id = JSON.parse(createdText.replace(/^Created memory:\n/, "")).id;

console.log("== list_memories (Ideas) contains new note? ==");
const list = await callTool("list_memories", { section: "Ideas" });
const found = textOf(list).includes(id);
console.log("found:", found, "\n");

console.log("== delete_note (with confirmTitle) ==");
const del = await callTool("delete_note", { id, confirmTitle: title });
console.log(textOf(del), "\n");

child.kill();

if (!id || !found) {
  console.error("E2E FAILED");
  process.exit(1);
}
console.log("E2E passed. ✓");
