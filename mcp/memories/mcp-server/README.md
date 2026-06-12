# Memories MCP Server (TypeScript)

A [Model Context Protocol](https://modelcontextprotocol.io) server that wraps
the **Memories** REST API and exposes it as tools an AI agent can call.

This build is **local / stdio only**: it speaks newline-delimited JSON-RPC over
stdin/stdout and forwards requests to the Memories app at
`http://localhost:3466/api`.

## Tools

| Tool | Memories API | Notes |
|------|--------------|-------|
| `list_memories` | `GET /api/memories?section=` | Optional section filter |
| `get_note` | `GET /api/memories/:id` | |
| `create_note` | `POST /api/memories` | Requires `existingMemoryTitlesChecked: true` (evidence param); Skill Building requires `knowledgeType` |
| `update_note` | `PUT /api/memories/:id` | Only provided fields change |
| `delete_note` | `DELETE /api/memories/:id` | Requires matching `confirmTitle` (evidence param) |
| `search_notes` | `GET /api/search?q=` | Surfaces `X-Semantic-Index-*` headers |
| `link_memories` | `POST /api/memories/:id/links` | Requires `linkReason` (evidence param) |
| `list_tags` | `GET /api/tags` | |
| `list_sections` | `GET /api/sections` | |
| `get_skill_coverage` | `GET /api/skills/coverage?tag=` | |
| `check_semantic_index` | `GET /api/semantic-index/status` | |
| `rebuild_semantic_index` | `POST /api/semantic-index/rebuild` | Requires `indexStatusChecked: true` (evidence param) |

The "evidence parameters" (`existingMemoryTitlesChecked`, `confirmTitle`,
`linkReason`, `indexStatusChecked`) force the agent to do grounding work before
taking an action, rather than operating on the honor system.

## Build

```bash
npm install
npm run build
```

This compiles `src/` into `build/`. The entry point is `build/index.js`.

## Run / Test

The Memories app must be running on `http://localhost:3466` (see
[../start-server.ps1](../start-server.ps1)).

```bash
node smoke-test.mjs    # starts the server, verifies all 12 tools (no app needed)
node e2e-test.mjs      # exercises tools against the live API
```

## CLI arguments

| Argument | Description |
|----------|-------------|
| `--memory-location <path>` | Where memories are stored. Logged; also read from `MEMORY_LOCATION`. |
| `--api-base-url <url>` | Override the Memories API base URL. Default `http://localhost:3466/api` (or `MEMORIES_API_BASE_URL`). |

## Configure Copilot CLI / VS Code

This server is registered from the repo's canonical MCP config
([../../servers.json](../../servers.json)) and installed by `install.ps1`, which
resolves `${repoRoot}` to this repo's absolute path. No manual config is needed;
re-run `install.ps1` after changes.

## Source layout

| File | Responsibility |
|------|----------------|
| [src/index.ts](src/index.ts) | Arg parsing + stdio transport |
| [src/server.ts](src/server.ts) | MCP server factory |
| [src/tools.ts](src/tools.ts) | The 12 tool definitions + evidence parameters |
| [src/api.ts](src/api.ts) | Memories REST client (+ semantic-index headers) |
| [src/logger.ts](src/logger.ts) | stderr-only logging |
