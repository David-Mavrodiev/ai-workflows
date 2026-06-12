---
name: spec-workflow
description: Turn a rough idea into a written spec through a short interview, store it as a per-spec folder (spec.md, plan.md, implementation.md, validation.md, metadata.json), then drive the task through each phase. Use when the user says things like "spec out this feature", "start a spec-driven task", "write a spec for...", "let's plan this work", or wants a phased task workflow for any piece of work.
user-invocable: true
---

# Spec-Driven Task Workflow

You are now in `spec-workflow` mode. You take the user from "I have an idea" all
the way to a built, validated change, using a consistent per-spec folder of
living documents — a phase-disciplined workflow for any piece of work.

This skill depends on the **spec-workflow MCP server** (`spec-workflow`). Its
tools are the only supported way to read/write specs here — they own where specs
are stored on disk and the metadata schema.

## Prerequisites

1. The `spec-workflow` MCP server must be available. If no spec tools are
   present, tell the user to run `install.ps1` from this repo (it builds and
   registers the server), then reload VS Code / restart the Copilot CLI.
2. The **Memories app** (brain-mcp) must be running on port 3466. Spec data is
   stored as linked notes in the "Tasks & Specs" section.
3. No external service or sign-in is needed beyond the local Memories app.

## Where specs live

The MCP server owns storage. Specs are stored as linked notes in the **"Tasks &
Specs"** section of brain-mcp (the Memories app). Each spec becomes multiple
notes: a metadata note (containing phase, gates, state as JSON) and up to 4
document notes (spec.md, plan.md, implementation.md, validation.md), all linked
together.

You never access storage directly — use the MCP tools (`list_specs`,
`get_spec`, `create_spec`, `save_spec`, `read_doc`, `write_doc`,
`update_metadata`, `delete_spec`).

## Choose a mode

Decide which mode the user wants from their request:

- **Dashboard** — "status", "list my specs", "what am I working on", "standup".
  Go to [Mode A](#mode-a--dashboard--status).
- **New spec** — "spec out", "write a spec", "start a new task", describing an
  idea. Go to [Mode B](#mode-b--new-spec).
- **Resume** — naming an existing spec id/title, or "continue".
  See [Resuming](#resuming-a-spec).

---

## Mode A — Dashboard / status

Call `list_specs`. For each spec print one line from its metadata:

```
abc12345…  Add retry to upload client     phase: implementation  (2/5 gates)  updated 2026-06-09
def67890…  CLI: --json output flag        phase: validation      (4/5 gates)  PR #42
```

(Show a short id prefix for readability, but always use the full GUID in tool
calls.) Then offer to: resume one, start a new spec (Mode B), or generate a
**standup summary** (what changed recently, what's next, blockers from notes).
Stop after the user chooses.

---

## Mode B — New spec

### Step 1 — Run the interview

Call `get_spec_questions` to fetch the structured interview and the spec
template. Ask the developer the questions **in small batches (2–3 at a time)**,
not all at once. Skip questions they've already answered. Keep going until each
section of the spec can be filled without a `> TODO`.

If the user gives you a lot up front, summarize your understanding and only ask
about the gaps.

### Step 2 — Create the spec

When you have enough to write a first draft:

1. Synthesize the answers into a spec using the template from
   `get_spec_questions` (Problem & context, Goals, Non-goals, Users & scenarios,
   Constraints & dependencies, Acceptance criteria, Testing strategy, Rollout &
   risks, Open questions).
2. Call `create_spec` with a short `title` and the drafted `spec` content. It
   returns the generated `id` (GUID) and seeds `metadata.json` (state `draft`,
   phase `requirement`). Use that id for everything below.
3. Show the user the draft spec and refine it with `save_spec` until they're
   happy. When they confirm scope, set the requirement gate:
   `update_metadata({ id, gates: { requirement: true }, state: "specifying" })`.

### Step 3 — Drive the phases (with specialist agents)

Work the phases in order. Each phase is delegated to a specialist agent; you
orchestrate, keep the docs in sync, and hold the gate until the user signs off.
After each phase, advance `metadata.json` via **a single `update_metadata`
call** that combines all field changes (`phase`, `gates`, and `state`) for that
transition. Do **not** call `update_metadata` multiple times for individual
fields — batch them into one call to avoid metadata churn (e.g. 8+ edits to
`metadata.json` in a single session).

| Phase | Delegate to | Produces | Gate |
| --- | --- | --- | --- |
| Requirement | (you + user) | confirmed `spec.md` | user confirms scope |
| Plan | `task-planner` agent (uses `Explore` for codebase) | `plan.md` | user approves plan |
| Implementation | `task-implementer` agent | code + `implementation.md` | code review passes |
| Review | `code-reviewer` agent | review notes in `implementation.md` | issues addressed |
| Validation | `task-validator` agent | `validation.md` results | all checks + DoD pass |

The specialist agents work for both flows: they read the requirement/spec doc
(`spec.md` here) and the task state (`metadata.json` here) through the
`spec-workflow` MCP tools. If these custom agents aren't available, perform the
phase inline but keep the same gates and the planner→implementer→reviewer→
validator separation of concerns.

Map `state` to `phase` as you go: `specifying` → `planned` (after plan) →
`implementing` → `in-review` → `validating` → `done`.

### Step 4 — Branch & pull request (after the review gate)

Once the **review** gate passes, prepare the branch and open a PR using plain
Git / the user's host. Do this with the user's explicit approval.

1. Create a feature branch off the default branch named
   `<alias>/<slug>`, where `<alias>` is the user's Git alias
   and `<slug>` is a short kebab-case form of the spec title.
2. Commit the changes to that branch; never commit to or push the default branch.
3. Open a pull request titled with the spec title. Use the **PR description
   template** in [TEMPLATES.md](./TEMPLATES.md) (the "PR description" section):
   replace the lead line with a real summary of the work done, fill Risk
   Assessment / Services affected / How you tested / monitoring / rollback, and
   tick the checklist items that apply (mark others N/A). **Keep the description
   under 4000 characters** — trim detail rather than exceeding the limit.
4. Record the branch and PR in metadata via
   `update_metadata({ id, branch, pullRequest })`.

If there's no repo (e.g. a doc-only or local task), skip this step.

### Step 5 — Validation

Run the validation steps from `validation.md` locally (build, tests, lint).
There is **no CI integration** in this flow — record real local command output
and pass/fail per check in `validation.md` via `write_doc`. Loop back to
implementation on failures.

### Step 6 — Wrap up

When validation + Definition of Done pass:
- Summarize what was done and reference the spec docs (and PR, if any).
- Set the final state:
  `update_metadata({ id, phase: "done", state: "done", gates: { validation: true } })`.

---

## Resuming a spec

When the user names an existing spec:

1. Use `list_specs` to find the id (match on title or id prefix), then
   `get_spec` for its metadata and which docs exist.
2. Briefly summarize where things stand (phase, gates, PR, last update) and
   continue from the next incomplete phase — do **not** overwrite existing docs;
   read them with `read_doc` first.
3. Only re-scaffold if the user explicitly asks to start over (confirm first;
   `delete_spec` requires the exact title).

## Rules

- Keep `spec.md`, the phase docs, and `metadata.json` in sync with reality; they
  are living state. All reads/writes go through the `spec-workflow` MCP server.
- One phase at a time; honor the gates and the agent separation of concerns.
- This flow has **no CI**; use local Git and local validation.
- Ask before creating branches, pushing, opening PRs, or deleting a spec.
