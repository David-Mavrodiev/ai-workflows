# Ideas backlog — future workflows

Brainstormed flows for a developer's day-to-day, captured for future iterations.
Each maps to the MCP servers already registered in `mcp/servers.json` (`github`,
`brain-mcp`, `spec-workflow`, `sequential-thinking`) or notes a connector we'd
need to add.

Legend: 🟢 buildable today with existing MCPs · 🟡 needs a new connector/MCP.

## Already shipped

- **spec-workflow** — phase discipline for any work: interview-driven spec
  generation, then requirement → plan → implementation → review → validation,
  file-backed store.
- **flow-coach** — analyzes local Copilot session history to suggest workflow
  improvements (new/edited skills, automation), persisting insights to `brain-mcp`.
- **brain-mcp** — persistent, file-backed memory.

## Candidate flows

### Build & CI

- 🟡 **Build-failure triage** — watch a pipeline/PR build; on red, pull the
  failing task log + failing tests, classify (compile / real test / flaky /
  infra), propose a fix or retry. Needs a CI/pipeline connector.
- 🟡 **Flaky-test detective** — query recent runs for a test to decide flaky vs.
  real regression before investing time. Needs a CI/pipeline connector.

### Pull requests

- 🟢 **PR feedback resolver** — pull review comments on *my* PRs, group them,
  draft replies/code changes, re-push. (`github`)
- 🟢 **PR review queue** — surface PRs awaiting my review, prioritize, and assist
  (diff-only). (`github`)

### Career & hygiene

- 🟢 **Brag-doc builder** — continuously capture shipped work (merged PRs, closed
  items) into a running accomplishments log in `brain-mcp`, ready for reviews.
- 🟢 **Work-item hygiene** — end-of-day nudge to update states/remaining work;
  flag items with no recent activity, missing acceptance criteria, or stale PRs.

### Dependencies & security

- 🟢 **Dependency / CVE triage** — Dependabot alerts → summarize impact, draft the
  bump PR. (`github`)

### Workflow analytics (self-improvement)

Builds on the local **session store** (SQLite/FTS5 populated from CLI debug
logs: `sessions`, `turns`, `session_files`, `session_refs`), queried read-only
via `session_store_sql`. `flow-coach` (shipped) covers the local, single-developer
case. Follow-ups:

- 🟢 **flow-export** — emit an **anonymized, metrics-only** snapshot of a
  developer's flow (counts, command sequences, durations, skill-usage rates,
  hashed file types / repo categories) — **never** raw prompts, responses, or
  paths. Opt-in, with a redaction pass and an explicit allowlist of what leaves
  the machine.
- 🟡 **team-benchmark** — pool the anonymized exports in a shared store (a repo,
  small service, or MCP) and surface cross-developer patterns: which skills
  correlate with fewer retries, common sequences nobody has turned into a skill,
  where a developer's flow diverges from the team median. Needs the shared store
  wired up; privacy/consent is the gating concern, not the plumbing.

## Recommended next iterations

Best value / lowest new infrastructure first:

1. **PR feedback resolver** — closes the loop with code review.
2. **PR review queue** — composes with the feedback resolver.
3. **Brag-doc builder** — low effort, captures value continuously.
4. **flow-export** — extends the shipped `flow-coach` analytics safely.
