---
description: Durable engineering principles (the "constitution") that govern how any change is planned, built, and reviewed in this repo. Referenced by the task-planner, task-implementer, and code-reviewer agents and by the spec-workflow.
applyTo: "**"
---

# Engineering principles (constitution)

Durable, project-agnostic rules that gate every plan and review. When a change
conflicts with one of these, stop and raise it rather than working around it.
Keep this file lean — if a rule stops earning its place, cut it.

## Simplicity first

- Prefer the smallest change that fully solves the problem. Don't add features,
  layers, or abstractions the task didn't ask for.
- Delete dead code rather than working around it. No speculative generality.
- Add a dependency only when it removes materially more complexity than it adds;
  prefer what the codebase already uses.

## Correctness is proven, not asserted

- Every behavioral change ships with a check that fails before and passes after
  (a test, a build, a script, or a screenshot). Show the evidence; don't claim
  success.
- Validate at system boundaries (untrusted input, I/O, config). Don't add
  defensive handling for states that can't occur.

## Design for change

- Match existing patterns and structure before inventing new ones; name the
  pattern you followed.
- Keep modules cohesive and dependencies one-directional. Isolate side effects.
- For architecturally significant decisions, record the alternatives considered
  and why you chose one (an ADR-style note in `plan.md`'s "Design & alternatives"
  section). "Significant" = hard to reverse, cross-cutting, or affecting a public
  contract, data shape, or dependency.

## Security & data

- Follow the OWASP Top 10: never trust input, never log or commit secrets,
  authorize at boundaries, use parameterized queries.
- Least privilege for tools, tokens, and file/network access.

## Reversibility & scope

- Take local, reversible steps freely; get explicit approval before destructive
  or shared-state actions (deletes, force-push, schema drops, pushing, PRs).
- Keep each change scoped to its task. If you discover the plan is wrong, raise
  it instead of silently expanding scope.
