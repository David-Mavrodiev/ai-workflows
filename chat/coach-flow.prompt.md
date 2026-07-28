---
mode: agent
description: Analyze my Copilot CLI session history to find workflow inefficiencies and suggest concrete improvements — new skills, edits to existing ones, and sequences worth automating — then scaffold the approved changes. Local and read-only over session data; remembers past suggestions via brain-mcp.
---

# Coach my flow

Use the local **session store** (`session_store_sql`) to analyze how I actually
work in Copilot, and **`brain-mcp`** to remember suggestions across runs. This is
**local and read-only** over my session data — never transmit session text
anywhere. If `session_store_sql` is unavailable, tell me and stop.

1. **Refresh & scope.** Run `session_store_sql` `reindex` first. Default window:
   last 14 days (let me narrow by repo / branch / agent). Tables: `sessions`,
   `turns` (user_message/assistant_response), `session_files` (file_path,
   tool_name), `session_refs`, FTS5 `search_index`. SQLite syntax only
   (`datetime('now','-14 day')`, `MATCH`).
2. **Compute metrics.** Find friction and habits: turns per session/repo/agent;
   backtrack loops (same file edited many times in a session; repeated similar
   prompts); tool mix; recurring command sequences across sessions; skill
   adoption (where a skill should have been used but wasn't); long/stuck sessions;
   context hygiene (kitchen-sink sessions touching many unrelated files/topics;
   correction spirals) — cues to clear context and re-prompt fresh. Base every
   observation on a query result.
3. **Recall.** Search `brain-mcp` under the `flow-coach` topic for past
   suggestions — don't repeat declined advice; check what was adopted.
4. **Report.** Show top friction, then a **Markdown table** of recommendations
   (`# | Type | Suggestion | Why | Effort`; Type ∈ New skill / Edit skill / New
   prompt / Habit / MCP), each tied to a concrete metric, top ~5 by impact.
5. **Act (with approval).** For accepted items, scaffold the new skill/prompt
   (`skills/<name>/SKILL.md`, `chat/*.prompt.md`) per `AGENTS.md`, edit an
   existing skill, or edit `mcp/servers.json` (then remind me to reload / re-run
   `install.ps1`). Only create/edit with my explicit approval.
6. **Persist.** Record the window, headline metrics, each recommendation + my
   decision, and any files created/edited to `brain-mcp` (`create_note` /
   `update_note`) under a `flow-coach` topic, so future runs build on it.

Comparing patterns across developers is out of scope here — that needs an
anonymized, opt-in export; never pool raw session data.
