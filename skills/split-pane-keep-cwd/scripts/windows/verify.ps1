#requires -Version 5.1
<#
.SYNOPSIS
    Read-only health check for the split-pane-keep-cwd skill on Windows.
.DESCRIPTION
    For each installed Microsoft terminal package, checks that:
      - settings.json parses
      - alt+shift+right / down / left / up resolve to splitPane + splitMode:duplicate
    Then checks that:
      - cmd-shell-integration.cmd exists
      - HKCU AutoRun is registered
      - A fresh cmd subprocess loads PROMPT correctly
      - PowerShell profile loads an OSC 9;9 emitter
    Exits 0 if all checks pass, 1 otherwise.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'
$global:__failed = 0

function Pass($t) { Write-Host "  ✓ $t" -ForegroundColor Green }
function Fail($t) { Write-Host "  ✗ $t" -ForegroundColor Red; $global:__failed++ }
function Info($t) { Write-Host "  • $t" -ForegroundColor DarkGray }
function Section($t) { Write-Host ""; Write-Host "── $t ──" -ForegroundColor Cyan }

$Packages = [ordered]@{
    IntelligentTerminal = 'Microsoft.IntelligentTerminal_8wekyb3d8bbwe'
    WindowsTerminal     = 'Microsoft.WindowsTerminal_8wekyb3d8bbwe'
}

function Check-Settings($name, $pkg) {
    Section "$name settings.json"
    $p = Join-Path $env:LOCALAPPDATA "Packages\$pkg\LocalState\settings.json"
    if (-not (Test-Path $p)) { Info "Not installed — skipping."; return }

    try { $j = Get-Content -Raw $p | ConvertFrom-Json -ErrorAction Stop; Pass "JSON parses" }
    catch { Fail "JSON parse error: $($_.Exception.Message)"; return }

    foreach ($key in 'alt+shift+right','alt+shift+down','alt+shift+left','alt+shift+up') {
        $kb = $j.keybindings | Where-Object { $_.keys -eq $key }
        if (-not $kb) { Fail "${key}: no binding"; continue }

        $isDupBuiltin = $kb.id -match '^Terminal\.DuplicatePane(Right|Down)$'
        $act = $j.actions | Where-Object { $_.id -eq $kb.id }
        $isDupCustom = $act -and $act.command.action -eq 'splitPane' -and $act.command.splitMode -eq 'duplicate'

        if ($isDupBuiltin) {
            Pass "$key → $($kb.id) (built-in duplicate variant)"
        } elseif ($isDupCustom) {
            Pass "$key → $($kb.id) (custom splitPane + splitMode:duplicate, split=$($act.command.split))"
        } else {
            Fail "$key → $($kb.id) (NOT a duplicate-mode split)"
        }
    }
}

function Check-CmdIntegration {
    Section "cmd.exe shell integration"
    $script = Join-Path $env:LOCALAPPDATA 'WindowsTerminal\cmd-shell-integration.cmd'
    if (Test-Path $script) { Pass "Script exists: $script" }
    else { Fail "Script missing: $script" }

    $ar = (Get-ItemProperty 'HKCU:\Software\Microsoft\Command Processor' -Name AutoRun -ErrorAction SilentlyContinue).AutoRun
    if ($ar -and $ar -like "*cmd-shell-integration.cmd*") {
        Pass "AutoRun registered: $ar"
    } else {
        Fail "AutoRun not registered (current: [$ar])"
    }

    try {
        $out = & $env:ComSpec /c 'echo %PROMPT%' 2>&1
        if ("$out" -like '*]9;9;*') {
            Pass "Fresh cmd session loads OSC 9;9 PROMPT"
        } else {
            Fail "Fresh cmd session PROMPT is '$out' — OSC 9;9 not emitted"
        }
    } catch {
        Fail "Could not spawn cmd: $($_.Exception.Message)"
    }
}

function Check-PowerShellIntegration {
    Section "PowerShell shell integration"
    $profiles = @($PROFILE.AllUsersAllHosts, $PROFILE.AllUsersCurrentHost,
                  $PROFILE.CurrentUserAllHosts, $PROFILE.CurrentUserCurrentHost) |
                Where-Object { $_ -and (Test-Path $_) } | Sort-Object -Unique

    if (-not $profiles) {
        Fail "No PowerShell profile exists. PowerShell panes will NOT inherit cwd."
        return
    }

    $found = $false
    foreach ($p in $profiles) {
        $t = Get-Content -Raw $p
        $hit = ($t -match '9;9') -or ($t -match 'shell-integration')
        if (-not $hit) {
            $matches = [regex]::Matches($t, '(?im)^\s*\.\s+["'']?([^"''`r`n]+)["'']?')
            foreach ($m in $matches) {
                $inc = $m.Groups[1].Value -replace '\$env:USERPROFILE', $env:USERPROFILE
                if (Test-Path $inc) {
                    $child = Get-Content -Raw $inc
                    if ($child -match '9;9') { $hit = $true; break }
                }
            }
        }
        if ($hit) { Pass "$p → OSC 9;9 emitter present"; $found = $true }
        else     { Info "$p → no OSC 9;9 reference" }
    }
    if (-not $found) { Fail "None of your PowerShell profiles emit OSC 9;9." }
}

Write-Host "split-pane-keep-cwd · verify.ps1" -ForegroundColor White

foreach ($name in $Packages.Keys) {
    Check-Settings $name $Packages[$name]
}
Check-CmdIntegration
Check-PowerShellIntegration

Section "Summary"
if ($global:__failed -eq 0) {
    Write-Host "  All checks passed." -ForegroundColor Green
    exit 0
} else {
    Write-Host "  $global:__failed check(s) failed." -ForegroundColor Red
    exit 1
}
