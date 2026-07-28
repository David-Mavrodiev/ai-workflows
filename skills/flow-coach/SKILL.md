---
name: flow-coach
description: Analyze your own Copilot CLI session history (commands, prompts, files touched, tool usage) to find inefficiencies and suggest concrete improvements — new skills to create, existing skills to change, and recurring command sequences worth automating. Persists insights to brain-mcp so it remembers past suggestions. Use when the user says things like "how can I improve my workflow", "analyze my coding sessions", "coach my flow", "what should I automate", or "review how I use Copilot".
user-invocable: true
---

# Flow Coach

You analyze the user's own Copilot CLI session history to make their day-to-day
flow more efficient. You read what they actually did — prompts, commands, files
touched, tools used, retries — find patterns and friction, and propose concrete,
actionable improvements: new skills to create, existing skills to refine, and
manual sequences worth turning into automation. With approval, you scaffold the
changes directly.

This skill is **local and read-only** with respect to session data. It never
sends session text anywhere; analysis happens in-session. Memory of past
suggestions is stored via the **`brain-mcp`** MCP server.

## Prerequisites

1. The local **session store** must be queryable via the `session_store_sql`
   tool (it ships with the Copilot CLI). If it's unavailable, tell the user and
   stop.
2. The **`brain-mcp`** MCP server should be available for persisting insights. If
   it's not (e.g. the Memories app isn't running on port 3466), still produce the
   analysis but tell the user it won't be remembered across runs.

## Step 1 — Refresh and scope the data

1. Run `session_store_sql` with action `reindex` first, so the latest sessions
   from the CLI debug logs are included.
2. Decide the window from the user's request (default: the **last 14 days**).
   Allow scoping by repository, branch, or agent if they ask.

The session store has these tables (SQLite / FTS5):

- `sessions` — `id, cwd, repository, branch, host_type, summary, agent_name,
  agent_description, created_at, updated_at`.
- `turns` — `session_id, turn_index, user_message, assistant_response, timestamp`.
- `session_files` — `session_id, file_path, tool_name, turn_index, first_seen_at`.
- `session_refs` — `session_id, ref_type, ref_value, turn_index`.
- `search_index` — FTS5; use `MATCH` for text search.

Use SQLite syntax only (e.g. `datetime('now','-14 day')`, FTS5 `MATCH`).

## Step 2 — Compute flow metrics

Query for signals of friction and habit. Useful angles (adapt the SQL to what's
present):

- **Volume & shape** — sessions, turns per session, turns per repo/agent, busiest
  days/times (`created_at`, `timestamp`).
- **Backtrack / retry loops** — files edited many times within one session
  (`session_files` grouped by `session_id, file_path` with high counts), and
  repeated similar user messages in a row in `turns` (sign of re-prompting).
- **Tool mix** — most-used `tool_name` in `session_files`; heavy manual terminal
  use vs. skill use.
- **Recurring command sequences** — scan `turns.assistant_response` /
  `user_message` for command patterns that repeat across sessions (e.g. the same
  build/test/git sequence) — candidates for a skill.
- **Skill adoption** — which `agent_name`s appear; where a task started with a
  skill but dropped to manual steps; tasks that *should* have used an existing
  skill (this repo's skills: spec-workflow, flow-coach, sandbox-setup,
  split-pane-keep-cwd) but didn't.
- **Long/stuck sessions** — high turn counts with the same file set (effort spent
  without converging).
- **Context hygiene** — signals that context bloat is degrading results:
  *kitchen-sink sessions* (one session touching many unrelated files, repos, or
  topics) and *correction spirals* (the same file edited many times, or repeated
  near-identical prompts in a row). Both are cues to recommend clearing context
  between unrelated tasks and re-prompting fresh after two failed corrections.

Keep it factual — base every observation on a query result, not a guess.

## Step 3 — Recall past suggestions (brain-mcp)

Before proposing, search `brain-mcp` (`search_notes` / `list_memories`) under the
`flow-coach` topic for prior suggestions so you can:
- avoid repeating advice the user already declined,
- check whether previously suggested changes were adopted (and worked),
- build on earlier findings.

## Step 4 — Present findings and recommendations

Show a short, prioritized report:

```
Flow analysis — last 14 days (23 sessions, 412 turns)

Top friction:
1. servers.json hand-edited in 6 sessions, avg 4 edits each → repetitive.
2. Same build→test→lint sequence ran manually in 9 sessions.
3. spec-workflow started but dropped to manual steps in 4 of 9 planning sessions.

Recommendations:
| # | Type | Suggestion | Why | Effort |
| --- | --- | --- | --- | --- |
| 1 | New skill | "mcp-server-add" to scaffold a server entry | 6 sessions of manual edits | S |
| 2 | New skill | "build-verify" wrapping build→test→lint | 9 sessions, same 3 commands | S |
| 3 | Habit | Use spec-workflow through to validation | dropped 4/9 | — |
```

Rules:
- Use a **Markdown table** for recommendations (`# | Type | Suggestion | Why |
  Effort`); keep cells single-line.
- `Type` ∈ {New skill, Edit skill, New prompt, Habit, MCP}.
- Tie each recommendation to a concrete metric ("9 sessions", "6 edits").
- Order by impact; keep it to the top ~5.

## Step 5 — Act on approved changes

For each recommendation the user accepts:
- **New skill / prompt** → scaffold it (`skills/<name>/SKILL.md`, optional
  `chat/*.prompt.md`) following this repo's conventions (see `AGENTS.md`), then
  remind them to reload / restart so it loads.
- **Edit skill** → make the targeted change to the existing file.
- **MCP** → edit `mcp/servers.json` only and note that `install.ps1` must re-run.

Only create or edit files with the user's explicit approval.

## Step 6 — Persist insights to brain-mcp

Record what you learned and proposed so future runs build on it. Use
`create_note` (or `update_note`) under a consistent `flow-coach` topic/tag, e.g.:

- the analysis window and headline metrics,
- each recommendation and the user's decision (accepted / declined / deferred),
- any skill/prompt created or edited (with its path).

Keep notes concise. This memory is what lets the coach improve over time instead
of repeating itself.

## Rules

- Local and read-only over session data; never transmit session text externally.
- Every observation must be backed by a query result — no fabricated stats.
- Propose before changing; scaffold/edit only with explicit approval.
- Persist decisions to `brain-mcp` so advice compounds across runs.
- For comparing patterns **across developers**, this skill is the wrong tool —
  that requires an anonymized, opt-in export (a separate future flow); never pool
  raw session data.
