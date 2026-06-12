---
name: sandbox-setup
description: Walks the user through enabling a safe-by-default Copilot CLI sandbox that protects the current working directory while still letting the agent read the rest of the filesystem.
user-invocable: true
---

# Default Sandbox Setup

You are now in sandbox-setup mode. Your job is to help the user enable a
**safe-by-default** Copilot CLI sandbox in their `~/.copilot/settings.json`.
The goal of the resulting configuration:

- Sandbox is **on by default** at every CLI start.
- The agent can **read the entire filesystem** so it can resolve tools,
  inspect git history, and look at sibling projects.
- The agent can **only write inside the current working directory** (plus
  temp dirs auto-granted by the runtime).
- Network access stays on (the user can tighten it later).

**The user invoking this skill is their confirmation.** Don't ask for
permission to write to `settings.json` — go gather context, present a diff,
and write the file. Only stop if the user explicitly objects.

---

## Step 1 — Detect the environment

Run these tool calls in **parallel** before doing anything else:

1. Read the user's settings file:
   - Windows: `%USERPROFILE%\.copilot\settings.json`
   - macOS / Linux: `~/.copilot/settings.json`

   If the file does not exist, treat it as `{}` and you will create it.
2. Determine the OS (`process.platform` equivalent — on Windows the path
   separator is `\`, etc.).
3. Note the user's home directory so you can construct absolute paths.

Don't run any other discovery commands — keep this fast.

---

## Step 2 — Compute the target `sandbox` block

Build the target block from the user's OS:

### Windows

```json
{
  "sandbox": {
    "enabled": true,
    "addCurrentWorkingDirectory": true,
    "sandboxMcpServers": true,
    "sandboxLspServers": true,
    "userPolicy": {
      "filesystem": {
        "readwritePaths": [],
        "readonlyPaths": ["C:\\"],
        "deniedPaths": [],
        "clearPolicyOnExit": false
      },
      "network": {
        "allowOutbound": true,
        "allowLocalNetwork": true,
        "allowedHosts": [],
        "blockedHosts": []
      }
    }
  }
}
```

If the user has multiple drives (D:, E:, etc.) and you can detect them
cheaply, offer to add each as an extra entry in `readonlyPaths`. Default to
just `C:\` if unsure.

### macOS / Linux

Same shape, but `readonlyPaths` becomes `["/"]`.

---

## Step 3 — Merge, don't overwrite

The user may already have other settings (`model`, `enabledPlugins`,
`footer`, etc.) in `settings.json`. **Preserve them.** Only the `sandbox`
key should change.

Within the `sandbox` block, preserve any existing fields the user has set
that you are not actively changing. For example, if they already have:

```json
"sandbox": {
  "enabled": false,
  "userPolicy": {
    "filesystem": { "readwritePaths": ["D:\\scratch"] },
    "network": { "allowedHosts": ["api.github.com"] }
  }
}
```

…the merged result should keep `readwritePaths: ["D:\\scratch"]` and
`allowedHosts: ["api.github.com"]` while flipping `enabled` to `true` and
adding `readonlyPaths: ["C:\\"]`.

Use a deep merge for `userPolicy.filesystem` and `userPolicy.network`. For
array fields, **union** existing entries with the new ones — don't replace.

---

## Step 4 — Show a diff and write

Before writing the file:

1. Print the **before** and **after** of the `sandbox` block as a unified
   diff (or two fenced JSON blocks side by side if a real diff renderer is
   not available).
2. Write the merged JSON back to `settings.json` with 2-space indentation
   (match the file's existing style if one is present).
3. Confirm the write succeeded by reading the file back.

---

## Step 5 — Tell the user what to do next

After a successful write, output **exactly** this checklist (substitute the
OS-specific items as needed):

> ✅ Sandbox configured. Next steps:
>
> 1. **Restart** `copilot` so the new settings take effect.
> 2. Run `/sandbox` to confirm the dialog shows _Sandbox: on_, with
>    `readonlyPaths` containing your system root and `readwritePaths` empty.
> 3. (Optional smoke test) From inside `copilot`, ask the agent to read a
>    file outside your project — e.g.
>    `view C:\Windows\System32\drivers\etc\hosts` (Windows) or
>    `view /etc/hosts` (Unix). It should succeed.
> 4. (Optional smoke test) Ask it to write to that same location. It should
>    be denied by the sandbox.
> 5. If something gets blocked that shouldn't be, run `/sandbox` and add the
>    path under **Read/Write** or **Read-Only** — _don't_ disable the sandbox.

---

## Platform caveats to mention if relevant

Only mention these if the user asks _why_ a particular field looks weird,
or if you detect they're trying something the platform won't enforce:

- **Windows:** `deniedPaths` is silently dropped — `processcontainer`
  cannot deny per path. Use `readonlyPaths` to allow read but block writes.
- **Windows:** `allowedHosts` / `blockedHosts` are silently dropped — there
  is no per-host network filter. Use `allowOutbound: false` to fully cut
  network.
- **macOS:** `allowedHosts` / `blockedHosts` are kept in `settings.json`
  (for portability) but Seatbelt cannot filter per host either.
- **macOS:** Homebrew prefixes (`/opt/homebrew`, `/usr/local`) and core
  system dirs are auto-added read-only by the runtime — you do not need to
  list them yourself.

---

## Boundaries

- **Do not** modify the user's `~/.copilot/config.json` — it is legacy and
  the runtime now reads `settings.json` first.
- **Do not** edit any file other than `~/.copilot/settings.json`.
- **Do not** change unrelated settings (`model`, `effortLevel`, hooks, etc.)
  even if they look out of date.
- **Do not** enable the sandbox globally on a machine where the user has
  said they are mid-debug of a non-sandboxed flow — ask first.
- If the existing `settings.json` is malformed JSON, **stop**, show the
  parse error, and ask the user to fix it before re-running this skill.
