# Linux — split / new pane keeps cwd

The matrix on Linux is even wider than macOS. Same approach: identify terminal + shell first, then apply.

## Decision tree

1. **Terminal emulator?** GNOME Terminal / Konsole / xfce4-terminal / Tilix / Terminator / WezTerm / Alacritty / kitty / foot / Ghostty / tmux-on-top
2. **Shell?** bash / zsh / fish / nushell
3. **Display server?** X11 / Wayland (rarely matters for cwd, but matters for keybinding rebinds in some emulators)
4. **Inside a WSL distro on Windows?** If yes, treat as Linux — but understand that Windows Terminal still needs its own `splitMode: duplicate` keybindings (see `windows-deep-dive.md`); the bash/zsh snippets below make WSL panes report their cwd via OSC 9;9 or OSC 7.

## VTE-family terminals (GNOME Terminal, Tilix, xfce4-terminal, Terminator, Console, MATE Terminal)

These read **OSC 7**. On most distros, bash inherits the integration automatically via `/etc/profile.d/vte.sh`:

```bash
. /etc/profile.d/vte.sh   # defines __vte_prompt_command and appends it to PROMPT_COMMAND
```

If splits open in `~`:

- Bash: confirm `/etc/profile.d/vte.sh` is sourced. If you have a custom `~/.bashrc` that resets `PROMPT_COMMAND`, append `__vte_prompt_command` back.
- Zsh: add this to `~/.zshrc`:
  ```zsh
  if [[ -f /etc/profile.d/vte.sh ]]; then
      . /etc/profile.d/vte.sh
      precmd_functions+=(__vte_osc7)
  fi
  ```
- Fish: GNOME Terminal includes a `fish_prompt_pwd` integration that works automatically with `fish` ≥ 3.

To split, the keybinding depends on the terminal — most use `Ctrl+Shift+O` / `Ctrl+Shift+E` (Tilix) or `F11`/`F12` (Terminator). Whatever it is, once OSC 7 is emitted, the new pane inherits cwd.

## Konsole (KDE)

Konsole reads OSC 7 the same way. Same snippet above works. Splits via *Split View → Top/Bottom or Left/Right* inherit cwd.

## WezTerm

Splits via `Ctrl+Shift+Alt+"` / `Ctrl+Shift+Alt+%`. Default config does inherit cwd. If not, install the OSC 7 emitter (see VTE snippet above) and confirm with:

```sh
echo $PROMPT_COMMAND | grep -o 'osc7'
```

## Alacritty

No native splits — use tmux/zellij/screen.

## kitty

Built-in shell integration. Run `kitty +kitten ssh ...` for SSH cases. Splits via `Ctrl+Shift+Enter` inherit cwd automatically if `shell_integration enabled` in `~/.config/kitty/kitty.conf` (the default).

## foot (Wayland)

Reads OSC 7. Same emitter snippet.

## Ghostty

Auto-installed shell integration for bash, zsh, fish. Splits via `Ctrl+Shift+O` (horizontal) / `Ctrl+Shift+E` (vertical) inherit cwd. Verify with:

```sh
ghostty +show-config | grep shell-integration
```

Should show `shell-integration = detect`.

## tmux (universal — works on top of any terminal)

```tmux
# ~/.tmux.conf
bind '"' split-window -v -c "#{pane_current_path}"
bind %   split-window -h -c "#{pane_current_path}"
bind c   new-window      -c "#{pane_current_path}"
```

`#{pane_current_path}` requires the shell to emit OSC 7 (tmux tracks it). Install the VTE snippet above for the inner shell.

## Reusable bash/zsh OSC 9;9 + OSC 7 emitter

If you want one snippet that satisfies *every* terminal (OSC 7 for VTE/Wez/Konsole/kitty/foot/Ghostty, OSC 9;9 for Windows Terminal via WSL), use:

```bash
# ~/.bashrc or ~/.zshrc
__report_cwd() {
    # OSC 7 — file:// URI with percent-encoded path
    local p=${PWD//%/%25}
    p=${p// /%20}
    printf '\e]7;file://%s%s\e\\' "${HOSTNAME:-localhost}" "$p"
    # OSC 9;9 — plain path (Microsoft / ConEmu extension)
    printf '\e]9;9;%s\e\\' "$PWD"
}

if [[ -n "$ZSH_VERSION" ]]; then
    precmd_functions+=(__report_cwd)
elif [[ -n "$BASH_VERSION" ]]; then
    PROMPT_COMMAND="__report_cwd${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
fi
```

Fish equivalent:

```fish
# ~/.config/fish/conf.d/report-cwd.fish
function __report_cwd --on-event fish_prompt
    printf '\e]7;file://%s%s\e\\' (hostname) (string escape --style=url -- $PWD)
    printf '\e]9;9;%s\e\\' $PWD
end
```

## Verifying

In a fresh shell:

```sh
cd ~/projects/something
# trigger split (tmux: prefix + "; Konsole: Ctrl+Shift+L; etc.)
pwd
```

Should print `~/projects/something`. If it prints `~`, check:

1. `echo "$PROMPT_COMMAND"` (bash) — does it call your emitter?
2. `print -l ${(o)precmd_functions[@]}` (zsh) — is your function listed?
3. Try the verifier from the WezTerm docs (`cat | hexdump -C` while pressing Enter) — you should see `1b 5d 37 3b 66 69 6c 65 ...` (`ESC ] 7 ; file ...`) immediately after each Enter.
