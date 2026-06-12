# personal-ai-workflows

Personal source of truth for AI assistant customizations — skills, custom agents,
VS Code prompts/instructions/chat modes, and MCP servers — with a one-shot
installer that wires them into the **GitHub Copilot CLI** and **VS Code Copilot**
on any new machine.

## Layout

| Path | Purpose | Used by |
| --- | --- | --- |
| `skills/<name>/SKILL.md` | Agent skills | Copilot CLI |
| `agents/*.md` | Custom agents | Copilot CLI |
| `chat/*.prompt.md` | Reusable prompts | VS Code Copilot |
| `chat/*.instructions.md` | Auto-applied instructions | VS Code Copilot |
| `chat/*.chatmode.md` | Custom chat modes / agents | VS Code Copilot |
| `mcp/servers.json` | Canonical MCP server definitions | both (translated) |
| `mcp/memories/` | Local-only memories MCP server + file-backed store | both |
| `mcp/spec-workflow/` | Local-only, file-backed spec-driven task MCP server | both |
| `.vscode/mcp.json` | Workspace MCP config for this repo | VS Code Copilot |
| `AGENTS.md` | Repo-level agent instructions | both |
| `install.ps1` | Idempotent installer | — |

## Setup on a new devbox

```powershell
git clone <this-repo> C:\work\personal-ai-workflows
cd C:\work\personal-ai-workflows
Copy-Item .env.example .env   # then fill in any secrets
./install.ps1                 # add -WhatIf to preview changes
```

Then reload VS Code and restart the Copilot CLI.

## What the installer changes

- **Copilot CLI** `~/.copilot/settings.json` — adds `skills/` to `skillDirectories`
  and `agents/` to `agentDirectories`.
- **VS Code** user `settings.json` — registers `chat/` in `chat.promptFilesLocations`,
  `chat.instructionsFilesLocations`, and `chat.modeFilesLocations`.
- **MCP** — merges `mcp/servers.json` into VS Code user `mcp.json` and
  `~/.copilot/mcp-config.json`.

The installer is **idempotent** (no duplicates on re-run) and backs up every file
it edits as `*.bak`. Because it registers folder paths, customizations stay
live-editable from this repo — edit a file here and it takes effect after a reload.

## Adding things

- **Skill** — create `skills/<name>/SKILL.md` with YAML front matter (`name`, `description`, `user-invocable`).
- **CLI agent** — add `agents/<name>.md`.
- **VS Code prompt/instructions/mode** — add the matching `chat/*.{prompt,instructions,chatmode}.md` file.
- **MCP server** — edit `mcp/servers.json` only, then re-run `install.ps1`.

## Secrets

Never commit secrets. Put them in `.env` (gitignored) and reference them from
`mcp/servers.json` as `${input:ID}` (VS Code prompts securely; the installer
resolves the value from `.env` when writing the CLI config) or `${env:NAME}`.

## Local memories MCP server

`mcp/memories/` bundles a **local-only** MCP server (stdio) that gives agents a
personal, file-backed memory store. It is registered automatically via
`mcp/servers.json` (the `brain-mcp` entry) — the installer:

- builds the server (`mcp/memories/mcp-server` → `build/index.js`), and
- resolves the `${repoRoot}` token in the path so the config is portable across machines.

How it works: the MCP server is a thin wrapper that forwards to the **Memories
app** REST API on `http://localhost:3466`. Start the app before using the tools:

```powershell
./mcp/memories/start-server.ps1   # listens on http://localhost:3466
```

Memories persist as files under `mcp/memories/memories-storage/`, which is
**tracked in this repo** so your notes are committed and never lost. (The folder's
former nested git repo was removed during integration so the parent repo tracks it
directly.)

## Tasks & Specs

The **spec-driven task workflow** takes a piece of work from intake to a
validated PR through phases (requirement → plan → implementation → review →
validation) and specialist agents (`task-planner`, `task-implementer`,
`code-reviewer`, `task-validator`).

### Spec-driven task workflow

The `spec-workflow` skill (and the `/spec-workflow` VS Code prompt) brings phase
discipline to any piece of work. It interviews you
about a rough idea, writes a `spec.md`, then drives the task through requirement →
plan → implementation → review → validation using the specialist agents.

Highlights:
- **Interview → spec** — `get_spec_questions` returns a structured questionnaire;
  the agent asks in small batches and synthesizes your answers into `spec.md`.
- **File-backed store** — each spec is a GUID folder with `metadata.json`,
  `spec.md`, `plan.md`, `implementation.md`, and `validation.md`. No external
  service or sign-in; it's all local.
- **Dashboard / resume** — `metadata.json` tracks phase, gates, branch, and PR;
  ask for "status" to list specs or get a standup summary, and naming an existing
  spec resumes it.
- **Specialist agents** — the `task-planner`, `task-implementer`, `code-reviewer`,
  and `task-validator` agents (in `agents/`) drive each phase.
- **Local Git, no CI** — optional feature branch / PR via plain Git; validation
  runs locally.

It's powered by a **local-only, file-backed MCP server** (`mcp/spec-workflow/`),
registered automatically via `mcp/servers.json` (the `spec-workflow` entry) and
built by the installer (`mcp/spec-workflow/mcp-server` → `build/index.js`). Specs
are stored **outside this repo** under `~/specs` (`%USERPROFILE%\specs` on
Windows) by default; set `SPECS_DIR` to override.