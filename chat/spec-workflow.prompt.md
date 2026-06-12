---
mode: agent
description: Turn an idea into a written spec through a short interview, scaffold/resume a per-spec folder of living docs (via the spec-workflow MCP), and drive it through requirement → plan → implementation → review → validation with optional local Git branch/PR.
---

# Spec-driven task workflow

Use the **spec-workflow MCP server** (`spec-workflow`) for all spec storage and
state — it owns where specs live on disk and the `metadata.json` schema. If no
spec tools are available, tell me to run `install.ps1`, reload, then stop. This
flow uses local Git and has no CI integration.

## Pick a mode

- If I ask for **status / standup / "what am I working on"** → run the
  **Dashboard** below.
- If I describe an idea / "spec out" / "write a spec" → **New spec**.
- If I name an existing spec (id or title) or say "continue" → **resume** from
  its `metadata.json` instead of re-scaffolding.

## Dashboard

Call `list_specs`. Print one line each: `id-prefix… title — phase (N/5 gates) —
PR — updated`. Then offer to resume one, start a new spec, or generate a standup
summary. Always use the full GUID in tool calls.

## New spec

1. **Interview.** Call `get_spec_questions` and ask me the questions in small
   batches (2–3 at a time), skipping anything I've already answered. Keep going
   until every spec section can be filled without a `> TODO`.
2. **Create.** Synthesize my answers into a spec using the returned template,
   then call `create_spec` with a short `title` and the draft `spec`. Use the
   returned GUID `id` for everything after. Show me the draft and refine with
   `save_spec`. When I confirm scope, set
   `update_metadata({ id, gates: { requirement: true }, state: "specifying" })`.
3. **Drive the phases**, one at a time with my sign-off at each gate, persisting
   each doc with `write_doc` and advancing `metadata.json` with `update_metadata`:
   - **Requirement**: confirm scope & acceptance criteria in `spec.md`.
   - **Plan**: ordered, verifiable steps; delegate codebase exploration to the
     `Explore` subagent; write `plan.md`; set `phase: "plan"`, `state: "planned"`.
   - **Implementation**: execute the plan; log each change in
     `implementation.md`; `state: "implementing"`.
   - **Review**: a focused code-review pass (correctness, scope, security/OWASP,
     tests, conventions); record findings in `implementation.md`; address blockers;
     `state: "in-review"`.
   - **Validation**: build, run tests/linters **locally** (no CI); record real
     output and pass/fail per check + Definition of Done in `validation.md`; loop
     back on failure; `state: "validating"`.
4. **Branch & PR (after the review gate).** Once review passes and I approve, use
   plain Git to create a branch `<alias>/<slug>` (use your Git alias),
   commit the changes, and open a PR titled with the spec title using the **PR
   description template** below (keep it **under 4000 characters**). Record them
   with `update_metadata({ id, branch, pullRequest })`.
5. **Wrap up.** Summarize and link the docs (and PR). Set
   `update_metadata({ id, phase: "done", state: "done", gates: { validation: true } })`.

### PR description template

```markdown
_Replace_ by description of the work done

## **Risk Assessment**
High / Medium / Low

## **Services affected**

## ✅ **PR Checklist**

- [ ] 👌 Code hygiene (follows the repo style guidelines and .editorconfig, sufficient comments and docs)
- [ ] 🚀 No performance regression (extra requests, console errors, page load), or N/A
- [ ] 🔭 Telemetry added, updated, or N/A
- [ ] 📄 Documentation added, updated, or N/A
- [ ] 🛡️ Automated tests added, or N/A

## 🧪 **How did you test it?**

## **How will you monitor the rollout**

## 🚧 **How can you roll back these changes?**
```

## Phase agents

Delegate phases to the specialist agents when available — `task-planner`,
`task-implementer`, `code-reviewer`, `task-validator` — which drive each phase
(they read `spec.md` + `metadata.json` here via the
`spec-workflow` MCP). If unavailable, do the phase inline but keep the same gates
and separation of concerns.

## Doc structure

- `spec.md`: problem & context, goals, non-goals, users & scenarios, constraints
  & dependencies, acceptance criteria, testing strategy, rollout & risks, open
  questions.
- `plan.md`: approach, ordered steps, affected areas, risks.
- `implementation.md`: per-change log, decisions/deviations, review notes.
- `validation.md`: how-to-verify commands, checks, Definition of Done, results.
- `metadata.json` (MCP-owned): `{ id, title, state, phase, gates, tags, branch,
  pullRequest, notes, createdAt, updatedAt }`.

## Rules

- Keep the docs and `metadata.json` in sync with reality. All reads/writes go
  through the `spec-workflow` MCP server.
- One phase at a time; honor the gates.
- Ask before creating branches, pushing, opening PRs, or deleting a spec.
