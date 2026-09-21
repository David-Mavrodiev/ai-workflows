# Memories App - Setup Script (Windows PowerShell)
# Installs all prerequisites for running the Memories application.
#
# Usage:
#   .\setup.ps1
#
# This script is idempotent - safe to run multiple times.

$ErrorActionPreference = "Continue"

function Write-Info  { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "[X] $msg" -ForegroundColor Red }
function Write-Header { param($msg) Write-Host "`n$msg" -ForegroundColor Cyan }

Write-Header "Memories App - Setup"
Write-Host "This script installs prerequisites for the Memories application."
Write-Host ""

# --- Node.js ---
Write-Header "Checking Node.js..."
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $nodeVersion = & node --version
    $nodeMajor = [int]($nodeVersion -replace 'v','').Split('.')[0]
    if ($nodeMajor -ge 22) {
        Write-Info "Node.js $nodeVersion found (>= v22 required)"
    } else {
        Write-Warn "Node.js $nodeVersion found but v22+ is required"
        Write-Host "  Install the latest LTS from: https://nodejs.org"
        Write-Host "  Or with winget: winget install OpenJS.NodeJS.LTS"
    }
} else {
    Write-Err "Node.js not found"
    Write-Host "  Install from: https://nodejs.org"
    Write-Host "  Or with winget: winget install OpenJS.NodeJS.LTS"
}

# --- npm ---
Write-Header "Checking npm..."
$npm = Get-Command npm -ErrorAction SilentlyContinue
if ($npm) {
    $npmVersion = & npm --version
    Write-Info "npm $npmVersion found"
} else {
    Write-Err "npm not found (should come with Node.js)"
}

# --- Git ---
Write-Header "Checking Git..."
$git = Get-Command git -ErrorAction SilentlyContinue
if ($git) {
    $gitVersion = & git --version
    Write-Info "$gitVersion found"
} else {
    Write-Err "Git not found"
    Write-Host "  Install from: https://git-scm.com/download/win"
    Write-Host "  Or with winget: winget install Git.Git"
}

# --- GitHub Copilot CLI ---
Write-Header "Checking GitHub Copilot CLI..."
$copilot = Get-Command copilot -ErrorAction SilentlyContinue
if ($copilot) {
    try {
        $copilotVersion = & copilot --version 2>$null
        Write-Info "Copilot CLI found (version: $copilotVersion)"
    } catch {
        Write-Info "Copilot CLI found"
    }
} else {
    Write-Warn "Copilot CLI not found"
    Write-Host "  Install with winget:"
    Write-Host "    winget install GitHub.Copilot"
    Write-Host "  Or with npm:"
    Write-Host "    npm install -g @github/copilot"
}

# --- Python (optional) ---
Write-Header "Checking Python (optional - needed if building MCP server in Python)..."
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command python3 -ErrorAction SilentlyContinue }
if ($python) {
    $pyVersion = & $python.Source --version 2>&1
    Write-Info "$pyVersion found"
} else {
    Write-Warn "Python not found (only needed if building MCP server in Python)"
    Write-Host "  Install from: https://python.org"
    Write-Host "  Or with winget: winget install Python.Python.3.12"
}

# --- uv (optional) ---
$uv = Get-Command uv -ErrorAction SilentlyContinue
if ($uv) {
    Write-Info "uv found"
} else {
    Write-Warn "uv not found (optional - useful for Python MCP development)"
    Write-Host "  Install: powershell -ExecutionPolicy ByPass -c `"irm https://astral.sh/uv/install.ps1 | iex`""
}

# --- Install app dependencies ---
Write-Header "Installing Memories app dependencies..."
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$packageJson = Join-Path $scriptDir "src\package.json"
if (Test-Path $packageJson) {
    Push-Location (Join-Path $scriptDir "src")
    & npm install
    Write-Info "Dependencies installed"
    Pop-Location
} else {
    Write-Warn "No src\package.json found yet - run this again after the app is scaffolded"
}

# --- Summary ---
Write-Header "Setup Complete"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. cd src; npm start     - Start the Memories app"
Write-Host "  2. copilot               - Launch Copilot CLI"
Write-Host "  3. Follow docs\MCP_LAB_GUIDE.md to build your MCP server"
Write-Host ""
