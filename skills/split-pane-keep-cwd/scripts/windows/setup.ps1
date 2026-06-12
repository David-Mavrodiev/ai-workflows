#requires -Version 5.1
<#
.SYNOPSIS
    Configures Windows Terminal so that
    splitting a pane reuses the active shell's current working directory.

.DESCRIPTION
    Idempotent installer. For each detected terminal app it:
      * Backs up settings.json
      * Rebinds Alt+Shift+{Right,Down,Left,Up} to splitPane actions with
        splitMode: "duplicate" (preferring built-in Terminal.DuplicatePane*
        IDs where they exist)
    For cmd.exe it:
      * Installs cmd-shell-integration.cmd into %LOCALAPPDATA%\WindowsTerminal\
      * Registers HKCU\Software\Microsoft\Command Processor\AutoRun
        (appends if a value already exists)
    For PowerShell it:
      * Detects whether the current $PROFILE already loads an OSC 9;9 emitter
      * Prints guidance — does NOT auto-edit $PROFILE

.PARAMETER WhatIf
    Show planned actions without writing.

.PARAMETER Apps
    Restrict to specific app(s): WindowsTerminal
    (default: whichever are installed).

.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File .\setup.ps1
    pwsh -ExecutionPolicy Bypass -File .\setup.ps1 -WhatIf
    pwsh -ExecutionPolicy Bypass -File .\setup.ps1 -Apps WindowsTerminal
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [ValidateSet('WindowsTerminal')]
    [string[]]$Apps
)

$ErrorActionPreference = 'Stop'

function Write-Section($t) { Write-Host ""; Write-Host "── $t ──" -ForegroundColor Cyan }
function Write-Ok($t)      { Write-Host "  ✓ $t" -ForegroundColor Green }
function Write-Skip($t)    { Write-Host "  • $t" -ForegroundColor DarkGray }
function Write-Warn2($t)   { Write-Host "  ! $t" -ForegroundColor Yellow }

$Packages = [ordered]@{
    WindowsTerminal     = 'Microsoft.WindowsTerminal_8wekyb3d8bbwe'
}

# -------------------------------------------------------------------------
#  Helpers
# -------------------------------------------------------------------------
function Get-AppSettingsPath([string]$Pkg) {
    Join-Path $env:LOCALAPPDATA "Packages\$Pkg\LocalState\settings.json"
}

function Backup-Settings([string]$Path) {
    $stamp = (Get-Date -Format 'yyyy-MM-ddTHH-mm-ss')
    $dst   = "$Path.$stamp.preedit.backup"
    if ($PSCmdlet.ShouldProcess($Path, "Backup to $dst")) {
        Copy-Item -LiteralPath $Path -Destination $dst -Force
        Write-Ok "Backup → $dst"
    }
    return $dst
}

# Rebinds the four split keybindings to duplicate variants. Uses built-in
# Terminal.DuplicatePaneRight/Down IDs where available, and synthesises
# custom actions for Left/Up since no built-ins exist.
function Update-Settings([string]$Path) {
    Write-Section "Updating $Path"
    if (-not (Test-Path -LiteralPath $Path)) {
        Write-Skip "Settings file not found — skipping."
        return
    }

    $raw = Get-Content -LiteralPath $Path -Raw
    try {
        $j = $raw | ConvertFrom-Json -ErrorAction Stop
    } catch {
        Write-Warn2 "settings.json could not be parsed: $($_.Exception.Message)"
        Write-Warn2 "Skipping this file. Manually verify it is valid JSON, then re-run."
        return
    }

    if (-not $j.actions)     { $j | Add-Member -NotePropertyName actions     -NotePropertyValue @() -Force }
    if (-not $j.keybindings) { $j | Add-Member -NotePropertyName keybindings -NotePropertyValue @() -Force }

    Backup-Settings -Path $Path | Out-Null

    $bindings = @(
        @{ Key = 'alt+shift+right'; Direction = 'right'; BuiltIn = 'Terminal.DuplicatePaneRight'; CustomId = 'User.splitPane.DuplicateRight' },
        @{ Key = 'alt+shift+down';  Direction = 'down';  BuiltIn = 'Terminal.DuplicatePaneDown';  CustomId = 'User.splitPane.DuplicateDown'  },
        @{ Key = 'alt+shift+left';  Direction = 'left';  BuiltIn = $null;                          CustomId = 'User.splitPane.DuplicateLeft'  },
        @{ Key = 'alt+shift+up';    Direction = 'up';    BuiltIn = $null;                          CustomId = 'User.splitPane.DuplicateUp'    }
    )

    $actions     = [System.Collections.ArrayList]@($j.actions)
    $keybindings = [System.Collections.ArrayList]@($j.keybindings)

    foreach ($b in $bindings) {
        $targetId = if ($b.BuiltIn) { $b.BuiltIn } else { $b.CustomId }

        if (-not $b.BuiltIn) {
            $existing = $actions | Where-Object { $_.id -eq $b.CustomId }
            if (-not $existing) {
                $null = $actions.Add([pscustomobject]@{
                    id      = $b.CustomId
                    command = [pscustomobject]@{
                        action    = 'splitPane'
                        split     = $b.Direction
                        splitMode = 'duplicate'
                    }
                })
                Write-Ok "Added action $($b.CustomId) ($($b.Direction))"
            } else {
                Write-Skip "Action $($b.CustomId) already present"
            }
        }

        $current = $keybindings | Where-Object { $_.keys -eq $b.Key }
        if ($current) {
            if ($current.id -eq $targetId) {
                Write-Skip "$($b.Key) already → $targetId"
            } else {
                $previous = $current.id
                $current.id = $targetId
                Write-Ok "Rebound $($b.Key) → $targetId (was $previous)"
            }
        } else {
            $null = $keybindings.Add([pscustomobject]@{
                id   = $targetId
                keys = $b.Key
            })
            Write-Ok "Bound $($b.Key) → $targetId"
        }
    }

    $j.actions     = @($actions)
    $j.keybindings = @($keybindings)

    $new = ($j | ConvertTo-Json -Depth 32)
    if ($PSCmdlet.ShouldProcess($Path, "Write updated settings.json")) {
        Set-Content -LiteralPath $Path -Value $new -Encoding utf8
        Write-Ok "Wrote updated settings.json ($(($new -split "`n").Count) lines)"
    }
}

function Install-CmdShellIntegration {
    Write-Section "cmd.exe shell integration"

    $targetDir  = Join-Path $env:LOCALAPPDATA 'WindowsTerminal'
    $targetPath = Join-Path $targetDir 'cmd-shell-integration.cmd'

    if (-not (Test-Path $targetDir)) {
        if ($PSCmdlet.ShouldProcess($targetDir, 'Create directory')) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
            Write-Ok "Created $targetDir"
        }
    }

    $src = Join-Path $PSScriptRoot 'cmd-shell-integration.cmd'
    if (-not (Test-Path $src)) {
        Write-Warn2 "Source script not found at $src — skipping copy."
    } elseif ($PSCmdlet.ShouldProcess($targetPath, "Copy from $src")) {
        Copy-Item -LiteralPath $src -Destination $targetPath -Force
        Write-Ok "Installed $targetPath"
    }

    $regPath  = 'HKCU:\Software\Microsoft\Command Processor'
    $existing = (Get-ItemProperty -Path $regPath -Name AutoRun -ErrorAction SilentlyContinue).AutoRun
    $quoted   = '"' + $targetPath + '"'

    if ([string]::IsNullOrWhiteSpace($existing)) {
        if ($PSCmdlet.ShouldProcess($regPath, "Set AutoRun=$quoted")) {
            New-ItemProperty -Path $regPath -Name AutoRun -Value $quoted -PropertyType ExpandString -Force | Out-Null
            Write-Ok "Registered AutoRun → $quoted"
        }
    } elseif ($existing -like "*cmd-shell-integration.cmd*") {
        Write-Skip "AutoRun already includes our script — leaving alone."
    } else {
        $combined = "$existing & call $quoted"
        Write-Warn2 "Existing AutoRun value detected: [$existing]"
        Write-Warn2 "Will append our script using ' & call ' so both run."
        if ($PSCmdlet.ShouldProcess($regPath, "Set AutoRun=$combined")) {
            New-ItemProperty -Path $regPath -Name AutoRun -Value $combined -PropertyType ExpandString -Force | Out-Null
            Write-Ok "Appended AutoRun → $combined"
        }
    }
}

function Check-PowerShellIntegration {
    Write-Section "PowerShell shell integration"

    $profiles = @($PROFILE.AllUsersAllHosts, $PROFILE.AllUsersCurrentHost,
                  $PROFILE.CurrentUserAllHosts, $PROFILE.CurrentUserCurrentHost) |
                Where-Object { $_ -and (Test-Path $_) } | Sort-Object -Unique

    if (-not $profiles) {
        Write-Warn2 "No PowerShell profile exists. To enable OSC 9;9 emission, see"
        Write-Warn2 "  reference/windows-deep-dive.md → 'Add minimal PowerShell integration'."
        return
    }

    $found = $false
    foreach ($p in $profiles) {
        $text = Get-Content -Raw -LiteralPath $p
        if ($text -match '9;9' -or $text -match 'shell-integration') {
            Write-Ok "OSC 9;9 / shell-integration hook detected in $p"
            $found = $true

            # If it sources another file, check that too.
            $matches = [regex]::Matches($text, '(?im)^\s*\.\s+["'']?([^"''`r`n]+)["'']?')
            foreach ($m in $matches) {
                $inc = $m.Groups[1].Value -replace '\$env:USERPROFILE', $env:USERPROFILE
                if (Test-Path $inc) {
                    $childText = Get-Content -Raw -LiteralPath $inc
                    if ($childText -match '9;9') {
                        Write-Ok "  → sourced file $inc emits OSC 9;9"
                    }
                }
            }
        }
    }
    if (-not $found) {
        Write-Warn2 "No OSC 9;9 emitter found in your PowerShell profile(s)."
        Write-Warn2 "See reference/windows-deep-dive.md → 'Add minimal PowerShell integration'."
        Write-Warn2 "(This script does not auto-edit `$PROFILE; you should review changes.)"
    }
}

# -------------------------------------------------------------------------
#  Main
# -------------------------------------------------------------------------
Write-Host "split-pane-keep-cwd · setup.ps1" -ForegroundColor White

if (-not $Apps) {
    $Apps = @()
    foreach ($name in $Packages.Keys) {
        $sp = Get-AppSettingsPath $Packages[$name]
        if (Test-Path $sp) { $Apps += $name }
    }
    if (-not $Apps) {
        Write-Warn2 "Windows Terminal is not installed."
        Write-Warn2 "Install it (e.g. ``winget install Microsoft.WindowsTerminal``) and re-run."
        exit 1
    }
}

Write-Host ("Targeting: " + ($Apps -join ', ')) -ForegroundColor White
foreach ($name in $Apps) {
    Update-Settings -Path (Get-AppSettingsPath $Packages[$name])
}

Install-CmdShellIntegration
Check-PowerShellIntegration

Write-Section "Done"
Write-Host "  Open a NEW terminal window, ``cd`` somewhere, and press Alt+Shift+Right." -ForegroundColor White
Write-Host "  The new pane should open in the same directory." -ForegroundColor White
Write-Host "  Run verify.ps1 in this directory for a programmatic check." -ForegroundColor White
