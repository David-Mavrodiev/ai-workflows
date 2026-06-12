# Agent Instructions

These instructions apply to AI coding agents working in this repository.

## Repository purpose

This repo is a personal source of truth for AI assistant customizations:
skills, custom agents, VS Code prompts/instructions/chat modes, and MCP servers.
`install.ps1` registers these with the Copilot CLI and VS Code on a new machine.

## Conventions

- Skills live in `skills/<name>/SKILL.md` (Copilot CLI format with YAML front matter).
- CLI custom agents live in `agents/*.md`.
- VS Code customizations live in `chat/` as `*.prompt.md`, `*.instructions.md`, `*.chatmode.md`.
- MCP servers are defined once in `mcp/servers.json` (the canonical source).
- Never commit secrets. Use `.env` (gitignored) and `${input:ID}` / `${env:NAME}` references.

## When adding a customization

1. Add the file in the correct folder using the conventions above.
2. For MCP servers, edit only `mcp/servers.json`; let `install.ps1` regenerate tool-specific configs.
3. Re-run `install.ps1` to register changes (it is idempotent).
