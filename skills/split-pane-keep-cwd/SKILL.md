---
name: split-pane-keep-cwd
description: Configures the user's terminal + shell so that splitting a pane (or opening a new tab/window) reuses the current working directory of the active shell. Heavy Windows focus (Windows Terminal, PowerShell, cmd) with adaptive guidance for any macOS / Linux terminal + shell combo.
user-invocable: true
---

# Split Pane / Tab — Keep Current Working Directory

You are now in `split-pane-keep-cwd` mode. Your job is to configure the
user's terminal **and** shell so that the next time they press their
split-pane hot key, the new pane opens in the active shell's current
directory instead of bouncing back to `~`.

**The user invoking this skill is their confirmation.** Don't ask for
permission to back up settings or write `AutoRun` — gather context, show
a clear plan with the diff/changes you're about to make, and apply. Only
stop if the user explicitly objects, or if you detect existing state that
the user must decide about (e.g. a pre-existing cmd `AutoRun` value that
isn't yours — append, don't overwrite, and tell them).

The end state always requires **two cooperating pieces**:

1. **Terminal asks for cwd** when splitting (e.g. Windows Terminal's
   `"splitMode": "duplicate"`; iTerm2's "Reuse previous session's
   directory"; tmux's `split-window -c "#{pane_current_path}"`).
2. **Shell reports cwd** to the terminal via `OSC 9;9;<path>` (Microsoft /
   ConEmu extension, read by every modern Windows terminal) and/or
   `OSC 7;file://<host><path>` (the POSIX-world standard).

Without **both**, splits fall back to the profile's `startingDirectory`.

---

## Step 1 — Detect the environment

Run these checks in **parallel** before doing anything else:

1. **OS:** `$IsWindows` / `$IsMacOS` / `$IsLinux` in PowerShell; `uname -s`
   elsewhere.
2. **Terminal hosting this shell:**
   - Windows: `$env:WT_SESSION` set ⇒ Windows Terminal.
     Check which packages are installed under
     `%LOCALAPPDATA%\Packages\` for `Microsoft.WindowsTerminal_*`.
     **Edit the one the user actually launches.**
   - macOS / Linux: `$TERM_PROGRAM`, `$TERMINAL_EMULATOR`, `$KITTY_PID`,
     `$WEZTERM_PANE`, `$ALACRITTY_LOG`, `$GHOSTTY_RESOURCES_DIR`. Also
     ask the user — `$TERM_PROGRAM` lies often (TermInal.app vs Wez vs
     iTerm).
3. **Shell:** `$PSVersionTable` if PowerShell, else `$SHELL`.
4. **tmux / screen / zellij wrapper?** `$TMUX`, `$STY`, `$ZELLIJ` — if
   present, treat the multiplexer as the source of truth for splits.

Tell the user what you found in one short paragraph and confirm the
terminal + shell to target before applying changes.

---

## Step 2 — Apply the configuration (pick the right branch)

### 2a. Windows (Windows Terminal) — the primary target

There is a self-contained installer that does every step idempotently:

```powershell
$skillDir = "<absolute path to the split-pane-keep-cwd skill directory>"
pwsh -ExecutionPolicy Bypass -File "$skillDir\scripts\windows\setup.ps1"
```

`$skillDir` is the directory this `SKILL.md` lives in. The script:

- discovers any installed Microsoft terminal package(s)
- backs up each `settings.json` with a timestamped `.preedit.backup`
- rebinds `Alt+Shift+{Right,Down}` to the built-in `Terminal.DuplicatePane{Right,Down}` IDs (which already set `splitMode: "duplicate"`)
- adds custom `splitPane` actions and rebinds `Alt+Shift+{Left,Up}` (no built-ins exist for those directions)
- installs `cmd-shell-integration.cmd` to `%LOCALAPPDATA%\WindowsTerminal\` and registers it via `HKCU\Software\Microsoft\Command Processor\AutoRun` (**appending** if a value already exists)
- checks whether the user's PowerShell `$PROFILE` already emits OSC 9;9 — does NOT auto-edit `$PROFILE`

Read the script briefly and **summarise what it will do in plain English
before running it.** Then run it. Then run `verify.ps1` and report a
green/red status per check.

If `verify.ps1` reports PowerShell doesn't emit OSC 9;9, offer to append
the minimal snippet from `reference/windows-deep-dive.md` to the user's
`$PROFILE`. Show the exact lines and ask before writing.

If `verify.ps1` reports a `settings.json` parse failure, **stop**, show
the parse error, and ask the user to fix it before re-running.

If the script's `-WhatIf` output (which you can preview by running
`setup.ps1 -WhatIf` first) reveals existing AutoRun content that isn't
ours, narrate it to the user before applying — they may want to know
what's there.

### 2b. macOS

Most macOS terminals support cwd inheritance — your job is mostly
diagnosing which app + shell the user has and flipping the right setting.
Read [`reference/macos.md`](./reference/macos.md) for per-terminal
recipes. Common cases:

- **iTerm2** — Preferences → Profiles → General → Working Directory →
  "Reuse previous session's directory" (usually already on by default).
  If shell integration isn't installed, install it.
- **Terminal.app** — Settings → Profiles → Shell → "Same Working
  Directory" (usually on by default).
- **Ghostty** — auto-installed shell integration; nothing to do unless
  disabled.
- **WezTerm / kitty / foot** — need the shell to emit OSC 7. See the
  bash/zsh snippet in `reference/macos.md`.
- **tmux** — add `split-window -c "#{pane_current_path}"` bindings; the
  inner shell must emit OSC 7.

Ask the user what they use, then propose the diff to their dotfile and
write it after they see it.

### 2c. Linux

Same approach. Read [`reference/linux.md`](./reference/linux.md). The
likely cases:

- **VTE-family** (GNOME Terminal, Tilix, xfce4-terminal, Console) —
  bash usually inherits via `/etc/profile.d/vte.sh`; zsh needs an
  explicit `precmd_functions+=(__vte_osc7)` line.
- **Konsole** — same as VTE.
- **WezTerm / Alacritty + tmux / kitty / foot / Ghostty** — see snippets
  in `reference/linux.md`.
- **tmux** — same bindings as macOS.

The reference doc includes a universal bash/zsh emitter that satisfies
both OSC 7 and OSC 9;9, which is what you want for users who jump
between WSL panes (read by WT/IT) and Linux-native panes (read by VTE
etc.).

---

## Step 3 — Verify

After applying changes:

1. Have the user **open a new terminal window** — not just a new tab.
   Settings *usually* hot-reload, but cmd `AutoRun` requires a fresh cmd
   process to take effect.
2. `cd` into a non-home folder.
3. Trigger a split:
   - Windows: `Alt+Shift+Right`, `Alt+Shift+Down`.
   - iTerm2: `⌘D`, `⌘⇧D`.
   - tmux: `prefix + "`, `prefix + %`.
   - Other terminals: whatever the user has bound (or the default).
4. Confirm the new pane's `pwd` (POSIX) / `Get-Location` (PowerShell)
   matches the original.
5. On Windows, also run `scripts/windows/verify.ps1` and read out the
   final green/red summary.

If a split still doesn't inherit cwd:

- The shell is probably not emitting OSC 9;9 / OSC 7 on this run. Have
  the user type `cd <somewhere>` and capture the next prompt — the
  bytes immediately before the visible prompt should include
  `\x1b]9;9;` or `\x1b]7;file://`. You can capture with `od -c` (POSIX)
  or by piping to a file and `Format-Hex`.
- On Windows, check that the user really did open a **new** terminal
  window (not just a new tab in the running instance), so cmd
  `AutoRun` had a chance to fire.
- For tmux: confirm `tmux show-options -g default-command` and
  `tmux list-keys | grep split-window` reflect the changes.

---

## Step 4 — Tell the user what's next

After everything is green, output **exactly** this checklist (substitute
the OS-specific items as needed):

> ✅ Splits will now keep your current directory. Next steps:
>
> 1. **Open a fresh terminal window** so all changes take effect (cmd
>    `AutoRun` only fires on new cmd sessions).
> 2. `cd` into any project and press your split-pane hot key. New pane
>    should open in the same folder.
> 3. To roll back on Windows, run
>    `scripts/windows/uninstall.ps1` from this skill folder.
> 4. To re-check at any time, run `scripts/windows/verify.ps1`.

---

## Boundaries — do not cross

- **Do not** overwrite a non-empty `HKCU\Software\Microsoft\Command Processor\AutoRun` value. Append using ` & call "<path>"`. Tell the user what was already there.
- **Do not** write to `$PROFILE` or any dotfile without showing the user the diff first and asking for confirmation. Frontmatter pre-approval covers `settings.json`, the cmd helper, and `AutoRun`, but **not** the user's shell init.
- **Do not** edit any settings.json other than the ones under `%LOCALAPPDATA%\Packages\Microsoft.WindowsTerminal_*\LocalState\`.
- **Do not** disable existing actions in `settings.json` — only rebind the four split keys and add the new custom actions. Leave everything else (other actions, profiles, schemes, themes) untouched.
- **Do not** touch WSL distros from a Windows session. If the user wants WSL panes to inherit cwd, source the universal emitter from `reference/linux.md` inside the WSL distro's `~/.bashrc` / `~/.zshrc`.
- If the user is on a terminal you don't recognize, **ask** — don't guess. iTerm2-style OSC 1337 sequences and VTE-style OSC 7 are not interchangeable in every emulator.

---

## Files in this skill folder

- `scripts/windows/setup.ps1` — idempotent one-shot Windows installer.
- `scripts/windows/verify.ps1` — read-only health check.
- `scripts/windows/uninstall.ps1` — reverts every change made by `setup.ps1`.
- `scripts/windows/cmd-shell-integration.cmd` — sets `PROMPT` to emit OSC 9;9; loaded by cmd via `AutoRun`.
- `reference/windows-deep-dive.md` — manual recipe and background for Windows.
- `reference/macos.md` — per-terminal recipes for macOS.
- `reference/linux.md` — per-terminal recipes for Linux (and WSL).
