# Document templates

These mirror a phased task workflow's documents for spec-driven work. The
`spec-workflow` MCP server owns storage and `metadata.json`; you fill the
Markdown docs. `get_spec_questions` also returns the spec template at runtime —
this file is the human-readable reference.

Fill every `{{placeholder}}` from the interview answers. Leave a `> TODO` marker
only where information is genuinely missing.

---

## spec.md

```markdown
# {{title}}

## Problem & context
{{What problem are we solving, for whom, and why now?}}

## Goals
- {{concrete, verifiable goal}}

## Non-goals
- {{explicitly out of scope}}

## Users & scenarios
{{Who uses this and how — walk through the main scenario(s) and key edge cases.}}

## Constraints & dependencies
{{Technical constraints (language/framework/perf/compat/security), dependencies
on other systems/teams, and data/privacy/auth considerations.}}

## Acceptance criteria
- [ ] {{verifiable criterion}}

## Testing strategy
{{Unit / integration / manual — how correctness will be proven.}}

## Rollout & risks
{{Rollout/migration/back-compat concerns, main risks, and mitigations.}}

## Open questions
- {{anything ambiguous that needs the user to clarify, else "None"}}
```

---

## plan.md

```markdown
# Plan — {{title}}

## Approach
{{1–3 sentence strategy}}

## Design & alternatives
{{For significant changes only (hard to reverse, cross-cutting, or changing a
contract / data shape / dependency): 2–3 options considered, their tradeoffs, the
option chosen, and why. Otherwise "N/A — small change".}}

## Steps
1. {{ordered, concrete, verifiable step}}
2. ...

## Affected areas
{{files / modules / services expected to change — fill during exploration}}

## Risks & mitigations
- {{risk}} → {{mitigation}}
```

---

## implementation.md

```markdown
# Implementation log — {{title}}

> Append an entry per meaningful change. Newest at the bottom.

## Changes
- [ ] {{step from plan}} — {{file(s)}} — {{what & why}}

## Notes
{{decisions, deviations from the plan, follow-ups}}

## Review notes
{{filled by the code-reviewer agent}}
```

---

## validation.md

```markdown
# Validation — {{title}}

## How to verify
{{build/run/test commands for this repo}}

## Checks
- [ ] Builds cleanly
- [ ] Tests pass: {{command}}
- [ ] Lint/format pass: {{command}}
{{one checkbox per acceptance criterion from spec.md}}

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Code reviewed (see implementation.md review notes)
- [ ] Tests added/updated and passing locally
- [ ] PR opened (if applicable)
- [ ] Docs/comments updated where needed
- [ ] No new warnings or lint errors introduced

## Results
{{paste/summarize command output and pass/fail per check}}
```

---

## metadata.json

Owned and written by the `spec-workflow` MCP server (via `create_spec` /
`update_metadata`). Shown here for reference — do not hand-edit; use the tools.

```json
{
  "id": "{{guid}}",
  "title": "{{title}}",
  "state": "draft",
  "phase": "requirement",
  "gates": {
    "requirement": false,
    "plan": false,
    "implementation": false,
    "review": false,
    "validation": false
  },
  "tags": [],
  "branch": null,
  "pullRequest": null,
  "notes": "",
  "createdAt": "{{ISO-8601 timestamp}}",
  "updatedAt": "{{ISO-8601 timestamp}}"
}
```

- `phase` is one of: `requirement`, `plan`, `implementation`, `review`,
  `validation`, `done`.
- `state` is one of: `draft`, `specifying`, `planned`, `implementing`,
  `in-review`, `validating`, `done`, `abandoned`.

---

## PR description

Used when opening the pull request after the review gate (Step 4). Branch name:
`<alias>/<slug>` (use your Git alias). Replace the lead line with a
real summary, fill each section, and tick the checklist items that apply (mark
the rest N/A). **Keep the whole description under 4000 characters.**

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
