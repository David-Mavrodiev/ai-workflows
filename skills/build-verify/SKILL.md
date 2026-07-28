---
name: build-verify
description: Run a fast build/typecheck/test/lint pass and iterate until green before handing work to review. Auto-detects the project's ecosystem (npm/pnpm/yarn, dotnet, python, cargo, go). Use after making code changes, as the task-implementer's inner loop in the spec-workflow, or when the user says "verify", "run the checks", or "make it green".
user-invocable: true
---

# Build-Verify

Give your changes a check that returns pass/fail, then iterate until it passes —
so mistakes are caught by the loop, not by the human. This is the inner
verification loop for implementation work: run it after each meaningful change,
read the output, fix the root cause, and repeat until green.

## When to use

- After making code changes, before handing off to review/validation.
- As the `task-implementer`'s per-step check in the `spec-workflow`.
- Any time the user asks to "verify", "run the checks", or "make it green".

## How to run

Prefer the bundled script — it auto-detects the ecosystem and runs the right
build → typecheck → test → lint sequence, printing a `PASS`/`FAIL` summary and
exiting non-zero on failure:

```powershell
pwsh -File skills/build-verify/scripts/build-verify.ps1 -Path .
```

```bash
skills/build-verify/scripts/build-verify.sh .
```

Narrow the loop for speed during tight iteration with `-SkipTests` /
`-SkipLint` / `-SkipBuild` (PowerShell) or `--skip-tests` / `--skip-lint` /
`--skip-build` (bash). Point `-Path` at the sub-project in a monorepo.

If the script can't detect the stack (exit code 3), fall back to the repo's
documented commands (README, package manifest scripts) and run build, tests, and
lint yourself.

## The loop

1. Run the check. Capture the real output.
2. If it fails, read the **first** failure, fix the **root cause** — don't
   suppress the error or weaken the test — and re-run.
3. Stop when the check is green. Show the command(s) you ran and their output as
   evidence; don't just assert success.
4. Stay within the current task's scope. If a fix needs work beyond the plan,
   raise it instead of expanding silently.

## Rules

- Run the narrowest relevant checks first (a single test/module) for speed; run
  the full suite before declaring done.
- Never mark work verified without evidence a human can skim (command + output).
- A failing check is information, not a blocker to route around.
- Honor the engineering principles in
  `chat/engineering-principles.instructions.md` — a passing build is necessary,
  not sufficient.
