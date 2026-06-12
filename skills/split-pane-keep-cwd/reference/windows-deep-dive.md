# Windows deep dive — split panes keep cwd

This is the long-form reference. The accompanying scripts (`scripts/windows/setup.ps1`, `verify.ps1`, `uninstall.ps1`) implement everything described here. Read this if you want to do it by hand, or if `verify.ps1` reports a failure and you need to understand why.

## The two pieces

```
┌────────────────────────────┐                ┌──────────────────────────┐
│  Shell (PowerShell / cmd)  │  OSC 9;9;<cwd> │  Terminal (IT / WT)      │
│  every prompt redraw       │ ─────────────▶ │  caches the active       │
│                            │                │  pane's cwd              │
└────────────────────────────┘                └──────────┬───────────────┘
                                                         │
                                                         ▼
                                            new pane opens with that cwd
                                            when splitMode:"duplicate"
                                            is requested
```

1. The shell has to **report cwd** to the terminal.
2. The terminal has to **request duplicate-mode** when creating a new pane.

If either is missing, the new pane falls back to the profile's `startingDirectory`.

## Windows Terminal on Windows

| Name | Package family | exe | Settings path |
| --- | --- | --- | --- |
| **Microsoft Windows Terminal** (public) | `Microsoft.WindowsTerminal_8wekyb3d8bbwe` | `WindowsTerminal.exe`, `wt.exe` | `%LOCALAPPDATA%\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json` |

Before editing settings, first confirm the terminal app is actually running:

```powershell
Get-Process | Where-Object { $_.Path -like "*Terminal*" } | Select-Object Path, Id
```

The exe path tells you which package's `settings.json` to edit.

## Hot-key rebinding

Windows Terminal ships built-in actions in `defaults.json`:

```jsonc
{ "command": { "action": "splitPane", "split": "right" },                          "id": "Terminal.SplitPaneRight"    },
{ "command": { "action": "splitPane", "split": "down"  },                          "id": "Terminal.SplitPaneDown"     },
{ "command": { "action": "splitPane", "splitMode": "duplicate", "split": "right" }, "id": "Terminal.DuplicatePaneRight" },
{ "command": { "action": "splitPane", "splitMode": "duplicate", "split": "down" },  "id": "Terminal.DuplicatePaneDown"  },
{ "command": { "action": "splitPane", "splitMode": "duplicate", "split": "auto" },  "id": "Terminal.DuplicatePaneAuto"  },
```

So the **minimal change** is to rebind the default Split keys to the Duplicate variants:

```jsonc
// In settings.json → "keybindings":
{ "id": "Terminal.DuplicatePaneRight", "keys": "alt+shift+right" },
{ "id": "Terminal.DuplicatePaneDown",  "keys": "alt+shift+down"  }
```

For `alt+shift+left` and `alt+shift+up` no built-in IDs exist, so add a custom action and bind it:

```jsonc
// In settings.json → "actions":
{ "id": "User.splitPane.DuplicateLeft", "command": { "action": "splitPane", "split": "left", "splitMode": "duplicate" } },
{ "id": "User.splitPane.DuplicateUp",   "command": { "action": "splitPane", "split": "up",   "splitMode": "duplicate" } }

// In settings.json → "keybindings":
{ "id": "User.splitPane.DuplicateLeft", "keys": "alt+shift+left" },
{ "id": "User.splitPane.DuplicateUp",   "keys": "alt+shift+up"   }
```

WT hot-reloads `settings.json` on save — no restart needed.

> **Note:** `Alt+Shift+D` is bound by default to `Terminal.DuplicatePaneAuto`, which already inherits cwd. If only that key matters to you, you're done — but most people prefer directional splits.

## PowerShell cwd reporting

PowerShell does **not** emit OSC 9;9 by default. You need a `prompt` function (or wrapper) that writes the sequence on each redraw. Minimal version:

```powershell
# Append to $PROFILE
if (-not $Global:__OscPromptInstalled) {
    $Global:__OscPromptInstalled = $true
    $Global:__OscOriginalPrompt  = $function:prompt
    function global:prompt {
        $loc = $executionContext.SessionState.Path.CurrentLocation
        $esc = [char]0x1B
        $bel = [char]0x07
        Write-Host -NoNewline "$esc]9;9;$loc$bel"
        & $Global:__OscOriginalPrompt
    }
}
```

This preserves whatever prompt you already had (Oh-My-Posh, Starship-via-pwsh, custom, etc.) and just prepends the OSC 9;9 sequence. The OSC bytes are invisible because terminals treat them as control sequences, not text.

If you already use a shell-integration script (the Microsoft `intelligent-terminal` one, the VS Code one, Oh-My-Posh transient prompts, etc.), check whether it already emits OSC 9;9 — most modern ones do. `verify.ps1` will tell you.

## cmd.exe cwd reporting

cmd has no prompt-function hook, but it has the `PROMPT` environment variable which is rendered on every command line. You can embed escape sequences there:

```
PROMPT=$e]9;9;$p$e\$p$g
```

Breakdown:

- `$e` → `ESC` (0x1B)
- `]9;9;` → literal
- `$p` → current path
- `$e\` → `ESC \` (the OSC string terminator, equivalent to `BEL`)
- `$p$g` → the visible prompt: path followed by `>`

To make every cmd session pick this up, register a per-user `AutoRun`:

```
reg add "HKCU\Software\Microsoft\Command Processor" /v AutoRun /t REG_EXPAND_SZ /d "\"%LOCALAPPDATA%\WindowsTerminal\cmd-shell-integration.cmd\"" /f
```

**Important:** if `AutoRun` is already set (oh-my-posh init, virtualenv hook, etc.), do **not** overwrite it. Append using `&`:

```
"<existing> & call "%LOCALAPPDATA%\WindowsTerminal\cmd-shell-integration.cmd"
```

`setup.ps1` does this correctly.

## Why my edit didn't work the first time

A common gotcha — if you edit `Microsoft.WindowsTerminal_…\settings.json` but the change still doesn't take effect, re-run the process check above to confirm you're editing the settings for the terminal you actually run.

## Diagnostics

If splits still don't inherit cwd after running `verify.ps1` clean:

1. **Confirm the shell is emitting OSC 9;9 live.** Pipe a test through `cat` (in WSL) or just observe with a recording tool. Typing `cd C:\Windows` and pressing Enter should emit `ESC ]9;9;C:\Windows BEL` before the next prompt.
2. **Confirm the terminal received it.** In WT/IT, open the in-app *Settings → Profiles → ProfileName → Starting directory* — when the active shell has emitted OSC 9;9, `Terminal.DuplicatePaneAuto` (Alt+Shift+D) will pick up the cwd. If even that fails, the shell is the problem; if Alt+Shift+D works but Alt+Shift+Right doesn't, the keybinding is wrong.
3. **Restart the terminal after large changes.** Settings *usually* hot-reload, but cached profile state sometimes lingers. A fresh window is the cheapest fix.
4. **WSL panes need their own integration.** Editing your Windows `$PROFILE` does nothing inside a WSL pane — see `reference/linux.md` for the bash/zsh OSC 9;9 emitter.
