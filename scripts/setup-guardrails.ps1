#Requires -Version 5.1
<#
.SYNOPSIS
    Enable this repo's Git guardrail hooks (.githooks/pre-commit).

.DESCRIPTION
    Idempotent. Points Git at the tracked .githooks directory via
    core.hooksPath so the pre-commit guard runs for every commit in this clone.
    Run once per fresh clone.

.EXAMPLE
    pwsh -File scripts/setup-guardrails.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    git config core.hooksPath .githooks
    if ($LASTEXITCODE -ne 0) { throw "git config failed (are you inside the repo?)" }

    # $IsWindows exists only in PowerShell 6+; guard for Windows PowerShell 5.1.
    $onWindows = if (Test-Path variable:IsWindows) { $IsWindows } else { $true }
    if (-not $onWindows) { & chmod '+x' (Join-Path $repoRoot '.githooks/pre-commit') }

    Write-Host "Guardrails enabled: core.hooksPath -> .githooks" -ForegroundColor Green
    Write-Host "Pre-commit guard blocks: default-branch commits, memories-storage data, obvious secrets." -ForegroundColor Gray
    Write-Host "Override in a pinch with: git commit --no-verify" -ForegroundColor DarkGray
}
finally {
    Pop-Location
}
