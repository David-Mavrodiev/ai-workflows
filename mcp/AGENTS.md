# Agent instructions — MCP servers

Scope: `mcp/**`. Two local, file-backed MCP servers live here. This complements
the root `AGENTS.md`.

## Layout

- `mcp/servers.json` — canonical, tool-agnostic server definitions. **Edit here
  only**; `install.ps1` regenerates the VS Code (`mcp.json`) and Copilot CLI
  (`mcp-config.json`) configs. Never hand-edit the generated configs.
- `mcp/memories/` — the Memories app (REST API on port 3466) plus its
  `mcp-server/` stdio wrapper (`brain-mcp`).
- `mcp/spec-workflow/mcp-server/` — the spec-workflow stdio server, backed by
  brain-mcp.

## Build & run (TypeScript servers)

Each `mcp/*/mcp-server` is a Node/TypeScript project:

```powershell
cd mcp/spec-workflow/mcp-server   # or mcp/memories/mcp-server
npm install
npm run build                     # tsc -> build/
node build/index.js               # stdio smoke-run
npm test                          # if a test script is present
```

- **Commit the compiled `build/` output.** The installer and MCP clients run it
  directly (`node build/index.js`), and installs may skip `npm install`. After
  changing a server, rebuild before committing.
- Both servers require the Memories app running on port 3466
  (`mcp/memories/start-server.ps1`).
- After changing a server, reload VS Code / restart the Copilot CLI so it
  reconnects.

## Conventions

- **Storage of record is brain-mcp** (the Memories app). The spec-workflow server
  persists specs as linked notes in the **"Tasks & Specs"** section via
  `src/brain-store.ts` — not the local filesystem.
- **Never commit anything under `mcp/memories/memories-storage/`** — that's local
  personal data. The `.githooks/pre-commit` guard blocks it.
