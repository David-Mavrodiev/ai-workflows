#Requires -Version 5.1
<#
.SYNOPSIS
    Prepares this repository and starts the local services used by its MCP servers.

.DESCRIPTION
    Validates Node.js and npm, installs the Memories app dependencies when
    needed, runs the idempotent repository installer, verifies the local MCP
    server builds, and starts the Memories HTTP app in the background.

    The MCP servers themselves use stdio, so VS Code or Copilot CLI starts them
    on demand after install.ps1 registers them.

.PARAMETER StartupTimeoutSeconds
    How long to wait for the Memories API to become healthy.

.EXAMPLE
    .\start.ps1
#>
[CmdletBinding()]
param(
    [ValidateRange(1, 300)]
    [int] $StartupTimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = $PSScriptRoot
$MemoriesPort = 3466
$MemoriesUrl = "http://127.0.0.1:$MemoriesPort"
$MemoriesApiUrl = "$MemoriesUrl/api/sections"

function Write-Step    { param([string] $Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Info    { param([string] $Message) Write-Host "    $Message" -ForegroundColor Gray }
function Write-Success { param([string] $Message) Write-Host "    + $Message" -ForegroundColor Green }
function Write-Warn    { param([string] $Message) Write-Host "    ! $Message" -ForegroundColor Yellow }

function Get-RequiredApplication {
    param([Parameter(Mandatory)][string] $Name)

    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $command) {
        throw "Required command '$Name' was not found on PATH."
    }
    return $command
}

function Test-HasProperty {
    param(
        [Parameter(Mandatory)] $Object,
        [Parameter(Mandatory)][string] $Name
    )

    return $null -ne $Object.PSObject.Properties[$Name]
}

function Test-MemoriesApi {
    try {
        $response = Invoke-WebRequest `
            -Uri $MemoriesApiUrl `
            -UseBasicParsing `
            -TimeoutSec 2 `
            -ErrorAction Stop
        if ($response.StatusCode -ne 200) {
            return $false
        }

        $payload = $response.Content | ConvertFrom-Json
        return Test-HasProperty -Object $payload -Name 'sections'
    } catch {
        return $false
    }
}

function Get-StartupDiagnostics {
    param(
        [Parameter(Mandatory)][string] $StandardOutputPath,
        [Parameter(Mandatory)][string] $StandardErrorPath
    )

    $lines = @()
    if (Test-Path -LiteralPath $StandardErrorPath) {
        $lines += Get-Content -LiteralPath $StandardErrorPath -Tail 20
    }
    if (Test-Path -LiteralPath $StandardOutputPath) {
        $lines += Get-Content -LiteralPath $StandardOutputPath -Tail 20
    }

    if ($lines.Count -eq 0) {
        return 'No startup output was captured.'
    }
    return ($lines -join [Environment]::NewLine)
}

Write-Step 'Checking prerequisites'
$node = Get-RequiredApplication -Name 'node'
$npm = Get-RequiredApplication -Name 'npm'

$nodeVersionText = (& $node.Source --version).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to determine the Node.js version.'
}

try {
    $nodeVersion = [version]($nodeVersionText.TrimStart('v').Split('-')[0])
} catch {
    throw "Unable to parse Node.js version '$nodeVersionText'."
}
if ($nodeVersion.Major -lt 22) {
    throw "Node.js 22 or newer is required; found $nodeVersionText."
}

$npmVersion = (& $npm.Source --version).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to determine the npm version.'
}

Write-Success "Node.js $nodeVersionText"
Write-Success "npm $npmVersion"

$git = Get-Command git -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($git) {
    Write-Success 'Git is available'
} else {
    Write-Warn 'Git is not available; branch and pull-request workflow steps will not work.'
}

$copilot = Get-Command copilot -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($copilot) {
    Write-Success 'Copilot CLI is available'
} else {
    Write-Warn 'Copilot CLI is not available; VS Code Copilot can still use these customizations.'
}
Write-Host ''

$installerPath = Join-Path $RepoRoot 'install.ps1'
$memoriesAppPath = Join-Path $RepoRoot 'mcp\memories\src'
$memoriesPackagePath = Join-Path $memoriesAppPath 'package.json'
$memoriesEntryPath = Join-Path $memoriesAppPath 'server\index.js'
$serversConfigPath = Join-Path $RepoRoot 'mcp\servers.json'

foreach ($requiredPath in @(
    $installerPath,
    $memoriesPackagePath,
    $memoriesEntryPath,
    $serversConfigPath
)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required repository file was not found: $requiredPath"
    }
}

Write-Step 'Checking Memories app dependencies'
Push-Location $memoriesAppPath
try {
    & $npm.Source ls --depth=0 --silent *> $null
    $dependenciesReady = $LASTEXITCODE -eq 0

    if ($dependenciesReady) {
        Write-Success 'Dependencies are already installed'
    } else {
        Write-Info 'Installing dependencies...'
        & $npm.Source install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE."
        }
        Write-Success 'Dependencies installed'
    }
} finally {
    Pop-Location
}
Write-Host ''

Write-Step 'Installing and registering customizations'
& $installerPath -RepoRoot $RepoRoot
Write-Host ''

Write-Step 'Checking local MCP servers'
$serversConfig = Get-Content -LiteralPath $serversConfigPath -Raw | ConvertFrom-Json
if (-not (Test-HasProperty -Object $serversConfig -Name 'servers')) {
    throw "No 'servers' object was found in $serversConfigPath."
}

$requiredMcpServers = @(
    @{
        Name = 'brain-mcp'
        EntryPoint = Join-Path $RepoRoot 'mcp\memories\mcp-server\build\index.js'
    },
    @{
        Name = 'spec-workflow'
        EntryPoint = Join-Path $RepoRoot 'mcp\spec-workflow\mcp-server\build\index.js'
    }
)

foreach ($server in $requiredMcpServers) {
    if (-not (Test-HasProperty -Object $serversConfig.servers -Name $server.Name)) {
        throw "MCP server '$($server.Name)' is missing from $serversConfigPath."
    }
    if (-not (Test-Path -LiteralPath $server.EntryPoint)) {
        throw "MCP server '$($server.Name)' is not built. Re-run install.ps1 after resolving its build error."
    }
    Write-Success "$($server.Name) is registered and built"
}
Write-Info 'VS Code or Copilot CLI will start these stdio MCP servers on demand.'
Write-Host ''

Write-Step 'Starting Memories app'
if (Test-MemoriesApi) {
    Write-Success "Memories API is already ready at $MemoriesUrl"
} else {
    $runtimePath = Join-Path ([System.IO.Path]::GetTempPath()) 'ai-workflows'
    New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
    $stdoutPath = Join-Path $runtimePath "memories-$MemoriesPort.stdout.log"
    $stderrPath = Join-Path $runtimePath "memories-$MemoriesPort.stderr.log"

    $hadPort = Test-Path Env:\PORT
    $previousPort = if ($hadPort) { $env:PORT } else { $null }
    try {
        $env:PORT = [string]$MemoriesPort
        $process = Start-Process `
            -FilePath $node.Source `
            -ArgumentList 'server/index.js' `
            -WorkingDirectory $memoriesAppPath `
            -RedirectStandardOutput $stdoutPath `
            -RedirectStandardError $stderrPath `
            -PassThru
    } finally {
        if ($hadPort) {
            $env:PORT = $previousPort
        } else {
            Remove-Item Env:\PORT -ErrorAction SilentlyContinue
        }
    }

    $memoriesReady = $false
    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 500
        $process.Refresh()

        if ($process.HasExited) {
            $diagnostics = Get-StartupDiagnostics `
                -StandardOutputPath $stdoutPath `
                -StandardErrorPath $stderrPath
            throw "Memories app exited with code $($process.ExitCode).`n$diagnostics"
        }

        if (Test-MemoriesApi) {
            $memoriesReady = $true
            Write-Success "Memories API is ready at $MemoriesUrl"
            Write-Info "Process ID: $($process.Id)"
            Write-Info "Standard output: $stdoutPath"
            Write-Info "Standard error:  $stderrPath"
            break
        }
    }

    if (-not $memoriesReady) {
        if (-not $process.HasExited) {
            Stop-Process -Id $process.Id -Force
        }
        $diagnostics = Get-StartupDiagnostics `
            -StandardOutputPath $stdoutPath `
            -StandardErrorPath $stderrPath
        throw "Memories API did not become ready within $StartupTimeoutSeconds seconds.`n$diagnostics"
    }
}

Write-Host ''
Write-Step 'Ready'
Write-Info 'Open or reload VS Code, or restart Copilot CLI, after configuration changes.'
Write-Info 'The MCP processes start automatically when Copilot first uses their tools.'
