# Build an MCP Server — Memories

> 🎫 **Camp AIR Attendee?** Go back to the [top-level README](../README.md) for an overview of both labs.

> **A developer-focused memory-keeping app — and your lab project for building an MCP server.**

Memories is a local-first notebook application designed for software developers. It organizes your thoughts, investigations, learnings, and relationships into a structured, searchable knowledge base. It features full-text and semantic search, a network graph of linked memories, and a knowledge framework for skill building.

**But that's not why you're here.**

This repository is a **hands-on lab activity**. The Memories app is already built — your job is to build an **MCP (Model Context Protocol) server** that connects an AI agent to the Memories API, enabling the agent to store, retrieve, search, and organize memories on your behalf.

---

## What You'll Build

In this lab, you will create an MCP server that exposes the Memories API as tools an AI agent can use. By the end, your agent will be able to:

- **Create and update memories** in any section (Ideas, Work Memories, Development Memories, Investigation Memories, etc.)
- **Move memories between sections** — drag-and-drop to reclassify
- **Search your memories** using full-text and semantic search
- **Bulk-manage memories** — select multiple memories and delete, tag, or move them at once
- **Link related memories** together, building a web of connected knowledge
- **Tag memories** for organization and automatic cross-referencing
- **Browse the memory graph** to discover relationships between ideas, investigations, and people
- **Query skill building progress** to see what subjects you've built comprehensive knowledge about

### The Memories API

The Memories app exposes a REST API that your MCP server will wrap. Key endpoints include:

| Method | Path | What It Does |
|--------|------|--------------|
| `GET` | `/api/memories` | List memories (filter by `?section=` or `?tag=`) |
| `GET` | `/api/memories/:id` | Get a single memory |
| `POST` | `/api/memories` | Create a new memory |
| `PUT` | `/api/memories/:id` | Update a memory (including section changes) |
| `DELETE` | `/api/memories/:id` | Delete a memory |
| `POST` | `/api/memories/bulk-delete` | Delete multiple memories at once |
| `GET` | `/api/search?q=` | Search across all memories (BM25 + semantic) |
| `POST` | `/api/memories/:id/links` | Link one memory to another |
| `GET` | `/api/network` | Get the full memory graph (nodes + edges) |
| `GET` | `/api/tags` | List all tags |
| `GET` | `/api/sections` | List all sections |
| `GET` | `/api/skills/coverage?tag=` | Knowledge type coverage for a subject |

For the full specification — including all features, data models, and behavioral test cases — see **[docs/SPEC.md](docs/SPEC.md)**.

---

## Repository Structure

```
build-an-mcp-server/
├── README.md            ← You are here
├── AGENTS.md            ← Instructions for AI agents working in this repo
├── setup.sh             ← Setup script for macOS / Linux
├── setup.ps1            ← Setup script for Windows PowerShell
├── docs/
│   ├── SPEC.md          ← Full design specification with inline test cases
│   ├── MCP_LAB_GUIDE.md ← Step-by-step lab guide with prompts for building your MCP server
│   └── MCP_HTTP_PROTOCOL.md ← Deep dive on the Streamable HTTP transport protocol
├── src/                 ← The Memories application source code
└── .mcp.json            ← MCP server configuration
```

---

## Getting Started

### Prerequisites

- **Any OS** — Windows, macOS, or Linux
- **Copilot CLI** installed and authenticated (the only universal requirement)
- Node.js 22+ and Git (installed by the setup scripts)

### Setup

**macOS / Linux:**
```bash
chmod +x setup.sh && ./setup.sh
```

**Windows (pwsh):**
```
pwsh -ExecutionPolicy Bypass -File setup.ps1
```

> ⚠️ Use `pwsh` (PowerShell 7+), not `powershell` (5.1) — the older version has encoding issues. Install `pwsh` with `winget install Microsoft.PowerShell` if needed.

These scripts check for and help install all prerequisites: Node.js 22+, npm, Git, and Copilot CLI. They'll also optionally check for Python and uv if you plan to build your MCP server in Python.

### Running the Memories App

```bash
cd src
# Install dependencies
npm install

# Start the server
npm start
```

The app will start on `http://localhost:3466`. On first launch, it will prompt you to configure a storage directory. The default suggestion is a sibling folder (e.g., `memories-storage/`), but you can choose any location. That directory is automatically initialized as a Git repository to track memory history.

### Building Your MCP Server

Follow **[docs/MCP_LAB_GUIDE.md](docs/MCP_LAB_GUIDE.md)** — it walks you through three phases with copy-paste prompts for Copilot CLI:

1. **Phase 1** — Build a local MCP server (stdio transport) in any language
2. **Phase 2** — Convert to a remote server (Streamable HTTP)
3. **Phase 3** — Add OAuth 2.1 authentication

The guide includes prompts designed for Copilot CLI — just paste them and specify your language/framework. Each prompt encodes [best practices for designing agent-safe tools](https://nickhauenstein.com/blog/2026/03/02/agents-lack-honor/).

For a deep dive on the HTTP protocol your remote server will implement, see **[docs/MCP_HTTP_PROTOCOL.md](docs/MCP_HTTP_PROTOCOL.md)**.

Your MCP server should:

1. Connect to the Memories REST API (default: `http://localhost:3466/api`)
2. Expose tools that map to the API endpoints above
3. Handle search, memory creation/editing, linking, tagging, and semantic index management
4. Accept a `--memory-location` argument (stdio) or `MEMORY_LOCATION` env var (HTTP) for memories storage path

---

## The Notebook

Memories organizes memories into **7 sections**, each tailored to a different aspect of a developer's workflow:

| Section | Purpose |
|---------|---------|
| **Ideas** | Brainstorms, inspiration, raw ideas |
| **Work Memories** | Day-to-day observations, meeting takeaways |
| **Development Memories** | Implementation details, technical decisions |
| **Investigation Memories** | Bug investigations, incident deep-dives |
| **Miscellaneous Memories** | Everything else |
| **People & Teams** | Who's who — people, teams, responsibilities |
| **Skill Building** | Learning memories organized by knowledge type |

### Skill Building & The Five Types of Knowledge

The Skill Building section uses a knowledge framework (based on Dr. Ruth Colvin Clark) that categorizes learning into five types:

| Type | What It Is | Example |
|------|-----------|---------|
| **Fact** | A specific, verifiable piece of information | "Azure Key Vault is a secret store." |
| **Concept** | An abstract category or idea | "A secret store is used to store secrets." |
| **Process** | What happens inside a system | "Secrets in AKV are encrypted in transit and at rest." |
| **Procedure** | Step-by-step instructions for a human | "1. Open Portal → 2. Create Key Vault → 3. Add secret" |
| **Principle** | A best practice or rule of thumb | "Never put secrets in code." |

When you've captured all five types about a subject, you have enough knowledge to **transfer that skill** — to yourself, to a colleague, or to an agent.

---

## Why This Matters

Building an MCP server against Memories isn't just an exercise — it's a gateway to a set of powerful, practical scenarios. Once your agent can read and write to your personal knowledge base, entirely new workflows open up.

### Agent-Powered Memory Organization

Imagine doing a brain dump at the end of your day — just stream-of-consciousness text about what happened, what you learned, what you're stuck on. An agent with access to Memories can automatically:

- Sort those thoughts into the right sections (this idea goes to Ideas, that incident detail goes to Investigation Memories)
- Create links between related memories you didn't realize were connected
- Tag memories with relevant subjects for automatic cross-referencing

### Investigation & Incident Helper

When you're investigating a bug or incident, your agent can:

- Pull in incident data from other MCP servers (e.g., PagerDuty) and populate Investigation Memories automatically
- Cross-reference against your past Investigation Memories to find patterns
- Surface related Development Memories that might contain the fix
- Help you write a troubleshooting guide based on what you discovered

### Meeting Data Capture

Your agent can pull meeting summaries (via other MCP servers) and automatically:

- Create Work Memories from meeting takeaways
- Update People & Teams entries with new information
- Link meeting memories to the projects and investigations they reference

### Implementation Assistant

An agent that knows your Ideas and Development Memories can:

- Review your ideas and suggest implementation approaches based on your past memories
- Learn from your previous implementations to guide future ones
- Surface relevant Skill Building Memories when you're working in an area you've studied

### From Knowledge to Skills to Agent Skills

This is where it gets interesting. As your Skill Building section fills up with facts, concepts, processes, procedures, and principles about a subject, your agent can:

- Identify when you've acquired comprehensive knowledge about a topic (all 5 types covered)
- Generate an **agent skill** from your accumulated knowledge — a portable definition of expertise that teaches other agents how to do what you've learned

Skills represent **expertise** which might pull in or require the usage of MCP tools. By combining Memories (the data store), an MCP server (the tool layer), and agent skills (the expertise layer), you create an AI-augmented personal knowledge base that learns from your past and makes you more effective in the future.

---

## Next Steps After the Lab

Once you've built your MCP server, here are ways to extend what you've created:

1. **Wire up additional data sources** — Connect other MCP servers (incident management, calendar, email) so your agent can automatically populate memories from your work life.

2. **Build an agent skill** — Create a skill definition at [agentskills.io](https://agentskills.io) that teaches an agent how to best organize thoughts, conduct investigations, or search through memories. Skills are expertise codified as instructions.

3. **Add an end-of-day reflection workflow** — Have your agent prompt you for a daily reflection, then automatically organize your thoughts into the appropriate sections and create links.

4. **Enable proactive suggestions** — Let your agent monitor new memories and suggest links, tags, or related memories you might have missed.

5. **Generate troubleshooting guides** — Have your agent analyze your Investigation Memories and produce reusable troubleshooting guides that your whole team can reference.
