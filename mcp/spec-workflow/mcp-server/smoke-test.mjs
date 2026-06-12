#!/usr/bin/env node
/**
 * Minimal smoke test: spawns the built MCP server over stdio, runs the
 * initialize handshake, lists tools, then exercises a create/get/update/delete
 * round-trip against a temporary specs directory.
 *
 * Run with: node smoke-test.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(__dirname, "build", "index.js");
const specsDir = mkdtempSync(join(tmpdir(), "spec-workflow-smoke-"));

const child = spawn(
  process.execPath,
  [serverEntry, "--specs-dir", specsDir],
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

function callTool(name, args, id) {
  return send("tools/call", { name, arguments: args }, id);
}

function textOf(res) {
  return res.result.content.map((c) => c.text).join("\n");
}

function cleanup(code) {
  child.kill();
  try {
    rmSync(specsDir, { recursive: true, force: true });
  } catch {}
  process.exit(code);
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
  "create_spec",
  "delete_spec",
  "get_spec",
  "get_spec_questions",
  "list_specs",
  "read_doc",
  "save_spec",
  "update_metadata",
  "write_doc",
];
const missing = expected.filter((e) => !names.includes(e));
if (missing.length > 0) {
  console.error("MISSING TOOLS:", missing);
  cleanup(1);
}

// Round-trip: create -> get -> update_metadata -> delete.
const created = await callTool(
  "create_spec",
  { title: "Smoke test spec", spec: "# Smoke test spec\n\nHello.\n" },
  3
);
const meta = JSON.parse(textOf(created));
console.log(`\ncreate_spec -> id ${meta.id} (state=${meta.state}, phase=${meta.phase})`);

const got = await callTool("get_spec", { id: meta.id }, 4);
const gotObj = JSON.parse(textOf(got));
if (!gotObj.spec || !gotObj.spec.includes("Hello.")) {
  console.error("get_spec did not return spec content");
  cleanup(1);
}
console.log("get_spec -> spec.md content present ✓");

const updated = await callTool(
  "update_metadata",
  { id: meta.id, phase: "plan", state: "specifying", gates: { requirement: true } },
  5
);
const updatedMeta = JSON.parse(textOf(updated));
if (updatedMeta.phase !== "plan" || !updatedMeta.gates.requirement) {
  console.error("update_metadata did not apply patch", updatedMeta);
  cleanup(1);
}
console.log("update_metadata -> phase=plan, gates.requirement=true ✓");

const del = await callTool(
  "delete_spec",
  { id: meta.id, confirmTitle: "Smoke test spec" },
  6
);
if (del.error || del.result.isError) {
  console.error("delete_spec failed", textOf(del));
  cleanup(1);
}
console.log("delete_spec -> ok ✓");

console.log("\nAll expected tools registered and round-trip passed. ✓");
cleanup(0);
