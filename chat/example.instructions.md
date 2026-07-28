---
description: Template showing the instructions-file format. Inert by default — copy it to a real name and set applyTo. See chat/engineering-principles.instructions.md for a live example.
applyTo: "**/*.example.md"
---

# Example Instructions

Template only. Instruction files are injected automatically into any session
whose files match `applyTo`, so keep always-on globs tight — an example that
matched `**/*.md` would pollute every Markdown session. Copy this file, rename it
to `<name>.instructions.md`, set a specific `applyTo`, and replace the guidance.

- State a coding or content convention here.
- Keep each instruction short and unambiguous.
