@echo off
REM ============================================================================
REM  cmd.exe shell integration for Windows Terminal
REM ----------------------------------------------------------------------------
REM  Installed by setup.ps1 to %LOCALAPPDATA%\WindowsTerminal\, and loaded
REM  automatically on every cmd.exe session via the AutoRun registry value at
REM    HKCU\Software\Microsoft\Command Processor\AutoRun
REM
REM  Sets PROMPT so each command-line redraw emits the OSC 9;9 escape sequence:
REM      ESC ]9;9;<current-path> ESC \ <current-path> >
REM  The terminal reads this and remembers the active pane's cwd, which is what
REM  lets splitMode:"duplicate" / DuplicatePaneRight / DuplicatePaneDown open
REM  the new pane in the same directory.
REM
REM  $e = ESC, $p = current path, $g = '>', $_ = newline (unused)
REM ============================================================================
prompt $e]9;9;$p$e\$p$g
