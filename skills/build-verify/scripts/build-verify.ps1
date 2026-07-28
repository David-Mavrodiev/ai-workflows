#Requires -Version 5.1
<#
.SYNOPSIS
    Fast build/typecheck/test/lint pass with ecosystem auto-detection.

.DESCRIPTION
    Detects the project stack under -Path (npm/pnpm/yarn, dotnet, python, cargo,
    go) and runs a sensible build -> typecheck -> test -> lint sequence, printing
    a PASS/FAIL summary. Intended as the implementer's inner verification loop.

    Exit codes: 0 = all detected checks passed, 1 = at least one failed,
    2 = bad path, 3 = no known stack detected.

.PARAMETER Path
    Project root to verify. Defaults to the current directory.

.PARAMETER SkipBuild
    Skip build/typecheck stages.

.PARAMETER SkipTests
    Skip test stages.

.PARAMETER SkipLint
    Skip lint stages.

.EXAMPLE
    pwsh -File build-verify.ps1 -Path . -SkipLint
#>
[CmdletBinding()]
param(
    [string] $Path = '.',
    [switch] $SkipBuild,
    [switch] $SkipTests,
    [switch] $SkipLint
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Head { param([string]$m) Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok   { param([string]$m) Write-Host "    OK   $m" -ForegroundColor Green }
function Write-Bad  { param([string]$m) Write-Host "    FAIL $m" -ForegroundColor Red }
function Write-Skip { param([string]$m) Write-Host "    --   $m" -ForegroundColor DarkGray }

$script:results = New-Object System.Collections.Generic.List[object]

function Have { param([string]$Name) [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

# Runs a native command, streaming its output; returns $true on exit code 0.
function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments)
    Write-Host "    `$ $Exe $($Arguments -join ' ')" -ForegroundColor Gray
    & $Exe @Arguments
    return ($LASTEXITCODE -eq 0)
}

function Record {
    param([string]$Stage, [bool]$Ok)
    $script:results.Add([pscustomobject]@{ Stage = $Stage; Ok = $Ok })
    if ($Ok) { Write-Ok $Stage } else { Write-Bad $Stage }
}

function Invoke-Pkg {
    param([string]$Pm, [string]$Script)
    if ($Pm -eq 'yarn') { return (Invoke-Native 'yarn' @($Script)) }
    return (Invoke-Native $Pm @('run', $Script))
}

if (-not (Test-Path -LiteralPath $Path)) { Write-Bad "path not found: $Path"; exit 2 }
$root = (Resolve-Path -LiteralPath $Path).Path

Push-Location $root
try {
    Write-Head "build-verify: $root"
    $detected = $false

    # ---- Node (npm / pnpm / yarn) --------------------------------------------
    $pkgPath = Join-Path $root 'package.json'
    if (Test-Path -LiteralPath $pkgPath) {
        $detected = $true
        $pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
        $scripts = if ($pkg.PSObject.Properties['scripts']) { $pkg.scripts } else { $null }
        function Test-Script { param([string]$n) return [bool]($scripts -and $scripts.PSObject.Properties[$n]) }

        $pm = 'npm'
        if     (Test-Path (Join-Path $root 'pnpm-lock.yaml')) { $pm = 'pnpm' }
        elseif (Test-Path (Join-Path $root 'yarn.lock'))      { $pm = 'yarn' }
        if (-not (Have $pm)) { $pm = 'npm' }

        if (-not $SkipBuild -and (Test-Script 'build')) { Record 'node: build' (Invoke-Pkg $pm 'build') }
        if (-not $SkipBuild -and (Test-Script 'typecheck')) {
            Record 'node: typecheck' (Invoke-Pkg $pm 'typecheck')
        } elseif (-not $SkipBuild -and (Test-Path (Join-Path $root 'tsconfig.json')) -and (Have 'npx')) {
            Record 'node: tsc --noEmit' (Invoke-Native 'npx' @('--no-install', 'tsc', '--noEmit'))
        }
        if (-not $SkipTests -and (Test-Script 'test')) { Record 'node: test' (Invoke-Pkg $pm 'test') }
        if (-not $SkipLint  -and (Test-Script 'lint')) { Record 'node: lint' (Invoke-Pkg $pm 'lint') }
    }

    # ---- .NET ----------------------------------------------------------------
    $hasDotnet = @(Get-ChildItem -LiteralPath $root -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in '.sln', '.csproj', '.fsproj' }).Count -gt 0
    if ($hasDotnet -and (Have 'dotnet')) {
        $detected = $true
        if (-not $SkipBuild) { Record 'dotnet: build' (Invoke-Native 'dotnet' @('build', '--nologo')) }
        if (-not $SkipTests) { Record 'dotnet: test'  (Invoke-Native 'dotnet' @('test', '--nologo')) }
        if (-not $SkipLint)  { Record 'dotnet: format' (Invoke-Native 'dotnet' @('format', '--verify-no-changes')) }
    }

    # ---- Python --------------------------------------------------------------
    $hasPy = (Test-Path (Join-Path $root 'pyproject.toml')) -or
             (Test-Path (Join-Path $root 'setup.py')) -or
             (Test-Path (Join-Path $root 'requirements.txt'))
    if ($hasPy) {
        $detected = $true
        if (-not $SkipTests -and (Have 'pytest'))      { Record 'python: pytest' (Invoke-Native 'pytest' @('-q')) }
        elseif (-not $SkipTests -and (Have 'python'))  { Record 'python: pytest' (Invoke-Native 'python' @('-m', 'pytest', '-q')) }
        if (-not $SkipLint -and (Have 'ruff'))         { Record 'python: ruff' (Invoke-Native 'ruff' @('check', '.')) }
    }

    # ---- Rust ----------------------------------------------------------------
    if ((Test-Path (Join-Path $root 'Cargo.toml')) -and (Have 'cargo')) {
        $detected = $true
        if (-not $SkipBuild) { Record 'cargo: build' (Invoke-Native 'cargo' @('build', '--quiet')) }
        if (-not $SkipTests) { Record 'cargo: test'  (Invoke-Native 'cargo' @('test', '--quiet')) }
        if (-not $SkipLint)  { Record 'cargo: clippy' (Invoke-Native 'cargo' @('clippy', '--quiet')) }
    }

    # ---- Go ------------------------------------------------------------------
    if ((Test-Path (Join-Path $root 'go.mod')) -and (Have 'go')) {
        $detected = $true
        if (-not $SkipBuild) { Record 'go: build' (Invoke-Native 'go' @('build', './...')) }
        if (-not $SkipTests) { Record 'go: test'  (Invoke-Native 'go' @('test', './...')) }
        if (-not $SkipLint)  { Record 'go: vet'   (Invoke-Native 'go' @('vet', './...')) }
    }

    if (-not $detected) {
        Write-Skip "no known stack detected under $root — run this repo's build/test/lint manually."
        exit 3
    }

    Write-Host ''
    Write-Head 'summary'
    foreach ($r in $script:results) { if ($r.Ok) { Write-Ok $r.Stage } else { Write-Bad $r.Stage } }
    $failed = @($script:results | Where-Object { -not $_.Ok })
    if ($failed.Count -gt 0) {
        Write-Host "`nRESULT: FAIL ($($failed.Count) stage(s))" -ForegroundColor Red
        exit 1
    }
    Write-Host "`nRESULT: PASS" -ForegroundColor Green
    exit 0
}
finally {
    Pop-Location
}
