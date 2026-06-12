#requires -Version 5.1
<#
.SYNOPSIS
    Reverts every change made by setup.ps1.
.DESCRIPTION
    For each installed Microsoft terminal package, locates the most recent
    *.preedit.backup file alongside its settings.json and restores it.
    Removes the cmd AutoRun registration if it points at our script (or, if
    AutoRun also contains other commands, strips just our portion).
    Optionally deletes the installed cmd-shell-integration.cmd.
    Does NOT touch your PowerShell $PROFILE.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$KeepCmdScript
)

$ErrorActionPreference = 'Stop'

function Section($t) { Write-Host ""; Write-Host "── $t ──" -ForegroundColor Cyan }
function Ok($t)      { Write-Host "  ✓ $t" -ForegroundColor Green }
function Skip($t)    { Write-Host "  • $t" -ForegroundColor DarkGray }
function Warn2($t)   { Write-Host "  ! $t" -ForegroundColor Yellow }

$Packages = @(
    'Microsoft.IntelligentTerminal_8wekyb3d8bbwe',
    'Microsoft.WindowsTerminal_8wekyb3d8bbwe'
)

foreach ($pkg in $Packages) {
    $settings = Join-Path $env:LOCALAPPDATA "Packages\$pkg\LocalState\settings.json"
    Section "Restore $pkg"
    if (-not (Test-Path $settings)) { Skip "Not installed."; continue }

    $backups = Get-ChildItem -LiteralPath (Split-Path $settings) -Filter "settings.json.*.preedit.backup" -ErrorAction SilentlyContinue |
               Sort-Object LastWriteTime -Descending
    if (-not $backups) { Warn2 "No .preedit.backup found — leaving settings.json untouched."; continue }

    $best = $backups[0]
    if ($PSCmdlet.ShouldProcess($settings, "Restore from $($best.FullName)")) {
        Copy-Item -LiteralPath $best.FullName -Destination $settings -Force
        Ok "Restored from $($best.Name)"
    }
}

Section "cmd AutoRun"
$regPath = 'HKCU:\Software\Microsoft\Command Processor'
$ar = (Get-ItemProperty -Path $regPath -Name AutoRun -ErrorAction SilentlyContinue).AutoRun
if (-not $ar) {
    Skip "No AutoRun value set."
} elseif ($ar -match 'cmd-shell-integration\.cmd') {
    # Remove our portion. We register either:
    #   "<path>\cmd-shell-integration.cmd"               (only)
    # or
    #   <existing> & call "<path>\cmd-shell-integration.cmd"   (appended)
    $cleaned = ($ar -replace '\s*&\s*call\s*"[^"]*cmd-shell-integration\.cmd"', '') -replace '^"[^"]*cmd-shell-integration\.cmd"\s*&\s*', ''
    if ($cleaned -eq $ar) {
        $cleaned = ($ar -replace '^"[^"]*cmd-shell-integration\.cmd"$', '')
    }
    $cleaned = $cleaned.Trim(' &')

    if ([string]::IsNullOrWhiteSpace($cleaned)) {
        if ($PSCmdlet.ShouldProcess($regPath, "Delete AutoRun")) {
            Remove-ItemProperty -Path $regPath -Name AutoRun -Force
            Ok "Removed AutoRun"
        }
    } else {
        if ($PSCmdlet.ShouldProcess($regPath, "Set AutoRun=$cleaned")) {
            New-ItemProperty -Path $regPath -Name AutoRun -Value $cleaned -PropertyType ExpandString -Force | Out-Null
            Ok "Restored AutoRun → $cleaned"
        }
    }
} else {
    Skip "AutoRun does not reference our script — leaving alone."
}

if (-not $KeepCmdScript) {
    Section "cmd shell-integration script"
    $script = Join-Path $env:LOCALAPPDATA 'WindowsTerminal\cmd-shell-integration.cmd'
    if (Test-Path $script) {
        if ($PSCmdlet.ShouldProcess($script, 'Delete')) {
            Remove-Item -LiteralPath $script -Force
            Ok "Deleted $script"
        }
    } else {
        Skip "Script not installed."
    }
}

Section "Done"
Write-Host "  Restart any open terminal windows for the rollback to take effect." -ForegroundColor White
Write-Host "  Your PowerShell `$PROFILE was NOT modified by setup.ps1, and is therefore not touched here." -ForegroundColor White
