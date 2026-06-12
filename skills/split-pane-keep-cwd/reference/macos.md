# macOS — split / new pane keeps cwd

Most macOS terminals support this out of the box. The skill's job on macOS is mostly **diagnosing which terminal + shell the user has** and then flipping the right setting or installing a small snippet.

## Decision tree

Ask the user:

1. **Which terminal app?** iTerm2 / Terminal.app / Ghostty / Warp / WezTerm / Alacritty / kitty / Hyper / tmux-on-top
2. **Which shell?** zsh (default on macOS 10.15+) / bash / fish
3. **Do you use tmux on top of your terminal?** If yes, treat tmux as the source of truth — the host terminal's cwd inheritance is irrelevant; tmux drives splits.

## Per-terminal recipes

### iTerm2 (most common)

iTerm2 reuses the previous session's directory by default for the same profile.

1. **Preferences → Profiles → General → Working Directory** → choose *Reuse previous session's directory*.
2. **Preferences → Profiles → Advanced → Semantic History / Shell Integration** → "Install Shell Integration" (writes `~/.iterm2_shell_integration.zsh` etc. and sources it from your shell rc). This is what lets iTerm2 know cwd reliably across SSH and remote sessions too.
3. Splits (`⌘D`, `⌘⇧D`) and new tabs (`⌘T`) inherit cwd.

If still broken: the user's shell rc probably overwrites `PS1` after the iTerm2 integration sources, blowing away its `precmd` hook. Move the iTerm2 sourcing line to the **bottom** of `~/.zshrc` / `~/.bashrc`.

### Terminal.app

1. **Terminal → Settings → Profiles → Shell** → *When creating a new tab/window with the same profile: Same Working Directory*.
2. That's it for tabs/windows. Terminal.app has no built-in panes.

### Ghostty

Ghostty installs shell integration automatically for bash, zsh, and fish. Splits (`⌘D`, `⌘⇧D`) inherit cwd by default.

Verify with `ghostty +show-config | grep shell-integration`:

```
shell-integration = detect    # default
```

If a user disabled it: re-enable in `~/.config/ghostty/config` and reload.

### WezTerm

WezTerm reads **OSC 7** (`ESC ]7;file://hostname/path BEL`). zsh on macOS does not emit it out of the box. Add to `~/.zshrc`:

```zsh
# OSC 7 for WezTerm / VTE / Konsole / kitty
precmd_functions+=(__osc7_cwd)
__osc7_cwd() {
    local strlen=${#PWD}
    local encoded=""
    local i=0 c
    for (( i = 0; i < strlen; i++ )); do
        c=${PWD:$i:1}
        case "$c" in
            [a-zA-Z0-9.~_/-]) encoded+="$c" ;;
            *) printf -v c "%%%02X" "'$c"; encoded+="$c" ;;
        esac
    done
    printf '\e]7;file://%s%s\e\\' "${HOST}" "${encoded}"
}
```

Bash equivalent uses `PROMPT_COMMAND`; fish uses `function fish_prompt`.

Then in `~/.config/wezterm/wezterm.lua`, splits already inherit cwd by default (no extra config needed) — the integration above is just to give WezTerm the data.

### kitty

Same as WezTerm — install shell integration (`kitty` does it automatically when started with default config). Splits via `ctrl+shift+enter` / `ctrl+shift+]` inherit cwd. If they don't, check `~/.config/kitty/kitty.conf` for `shell_integration disabled`.

### Alacritty

Alacritty does not have splits — it relies on tmux/zellij. See the tmux section.

### Warp

Inherits cwd by default; nothing to configure.

### Hyper

Inherits cwd on macOS by default if you're on Hyper ≥ 3.

## tmux (any terminal)

tmux's own splits need explicit cwd preservation:

```tmux
# ~/.tmux.conf
bind '"' split-window -v -c "#{pane_current_path}"
bind %   split-window -h -c "#{pane_current_path}"
bind c   new-window      -c "#{pane_current_path}"
```

`#{pane_current_path}` works if the shell inside the pane uses OSC 7 (which tmux understands natively). zsh on macOS doesn't emit OSC 7 by default — install the snippet from the WezTerm section above so tmux knows where each pane is.

Reload tmux conf: `tmux source-file ~/.tmux.conf`.

## Verifying

After applying changes, in a fresh terminal:

```sh
cd ~/code/some-project
# trigger split — for iTerm2: ⌘D
pwd   # should print /Users/<you>/code/some-project, not $HOME
```

If `pwd` is still `$HOME`, run `echo $PROMPT_COMMAND` (bash) or `print -l ${precmd_functions[@]}` (zsh) and confirm the OSC emitter hook is registered. Then check whether your prompt theme (powerlevel10k, starship) is wrapping `precmd_functions` in a way that loses additions — most don't, but a misconfigured custom theme can.
