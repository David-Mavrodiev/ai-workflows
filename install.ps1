#Requires -Version 5.1
<#
.SYNOPSIS
    Registers this repo's AI customizations (skills, agents, prompts, MCP servers)
    with the GitHub Copilot CLI and VS Code Copilot on the current machine.

.DESCRIPTION
    Idempotent installer. Safe to re-run: it appends/merges without creating
    duplicates and backs up every file it modifies (*.bak).

    What it does:
      1. Copilot CLI  (~/.copilot/settings.json):
         adds <repo>/skills to skillDirectories and <repo>/agents to agentDirectories.
      2. VS Code user settings.json:
         registers <repo>/chat in chat.promptFilesLocations,
         chat.instructionsFilesLocations and chat.modeFilesLocations.
      3. MCP servers (mcp/servers.json -> source of truth):
         merges into VS Code user mcp.json and ~/.copilot/mcp-config.json.
         The ${repoRoot} token in stdio command/args/env is resolved to this
         repo's absolute path so local servers stay portable.
      4. Loads .env (if present) to resolve secret references for the CLI MCP config.
      5. Builds any local MCP servers (each mcp/*/mcp-server with a package.json).

.PARAMETER WhatIf
    Show planned changes without writing anything.

.EXAMPLE
    ./install.ps1
.EXAMPLE
    ./install.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string] $RepoRoot = $PSScriptRoot,
    [string] $VSCodeUserDir
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

function Write-Step    { param([string]$m) Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Info    { param([string]$m) Write-Host "    $m" -ForegroundColor Gray }
function Write-Added   { param([string]$m) Write-Host "    + $m" -ForegroundColor Green }
function Write-Skipped { param([string]$m) Write-Host "    = $m (already present)" -ForegroundColor DarkGray }
function Write-Warn    { param([string]$m) Write-Host "    ! $m" -ForegroundColor Yellow }

# Safe property existence check (works under Set-StrictMode -Version Latest).
function Test-HasProp {
    param([Parameter(Mandatory)] $Object, [Parameter(Mandatory)][string] $Name)
    if ($null -eq $Object) { return $false }
    return ($null -ne $Object.PSObject.Properties[$Name])
}

# Strips // and /* */ comments and trailing commas so JSONC files (like the
# Copilot CLI settings.json) parse cleanly. Ignores delimiters inside strings.
function ConvertFrom-Jsonc {
    param([Parameter(Mandatory)][string] $Text)

    $sb = [System.Text.StringBuilder]::new()
    $inString = $false; $escape = $false
    $inLine = $false; $inBlock = $false
    $chars = $Text.ToCharArray()
    for ($i = 0; $i -lt $chars.Length; $i++) {
        $c = $chars[$i]
        $next = if ($i + 1 -lt $chars.Length) { $chars[$i + 1] } else { [char]0 }

        if ($inLine) { if ($c -eq "`n") { $inLine = $false; [void]$sb.Append($c) }; continue }
        if ($inBlock) { if ($c -eq '*' -and $next -eq '/') { $inBlock = $false; $i++ }; continue }

        if ($inString) {
            [void]$sb.Append($c)
            if ($escape) { $escape = $false }
            elseif ($c -eq '\') { $escape = $true }
            elseif ($c -eq '"') { $inString = $false }
            continue
        }

        if ($c -eq '"') { $inString = $true; [void]$sb.Append($c); continue }
        if ($c -eq '/' -and $next -eq '/') { $inLine = $true; $i++; continue }
        if ($c -eq '/' -and $next -eq '*') { $inBlock = $true; $i++; continue }
        [void]$sb.Append($c)
    }

    # Remove trailing commas:  ,}  or  ,]
    $clean = [System.Text.RegularExpressions.Regex]::Replace($sb.ToString(), ',(\s*[}\]])', '$1')
    if ([string]::IsNullOrWhiteSpace($clean)) { return $null }
    return $clean | ConvertFrom-Json
}

# Reads a JSON/JSONC file into a PSCustomObject, or $null if missing/empty.
function Read-JsonFile {
    param([Parameter(Mandatory)][string] $Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $raw = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
    return ConvertFrom-Jsonc -Text $raw
}

# Backs up (once per run) then writes pretty JSON. Honors -WhatIf.
function Save-JsonFile {
    param(
        [Parameter(Mandatory)][string] $Path,
        [Parameter(Mandatory)] $Object
    )
    $json = $Object | ConvertTo-Json -Depth 64
    if ($PSCmdlet.ShouldProcess($Path, 'Write JSON')) {
        $dir = Split-Path -Parent $Path
        if ($dir -and -not (Test-Path -LiteralPath $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        if (Test-Path -LiteralPath $Path) {
            $backup = "$Path.bak"
            Copy-Item -LiteralPath $Path -Destination $backup -Force
            Write-Info "backup: $backup"
        }
        Set-Content -LiteralPath $Path -Value $json -Encoding UTF8
    }
}

# Ensures a property exists on a PSCustomObject (creating it with $default if not).
function Get-OrAddProperty {
    param(
        [Parameter(Mandatory)] $Object,
        [Parameter(Mandatory)][string] $Name,
        [Parameter(Mandatory)] $Default
    )
    if (-not (Test-HasProp -Object $Object -Name $Name)) {
        $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Default
    }
    return $Object.$Name
}

# Adds a path to a JSONC string-array property using text editing, preserving
# comments and the rest of the file verbatim (the Copilot CLI settings.json is
# JSONC and may contain commented template blocks). De-duplicates case-insensitively.
# Returns @{ Text = <updated text>; Changed = <bool> }.
function Add-PathToJsoncArray {
    param(
        [Parameter(Mandatory)][string] $Text,
        [Parameter(Mandatory)][string] $Key,
        [Parameter(Mandatory)][string] $Path
    )
    $escaped = ($Path -replace '\\', '\\')
    # Match  "key" : [ ... ]  (string arrays only -> no nested brackets in body).
    $rx = [regex]("(`"$([regex]::Escape($Key))`"\s*:\s*\[)([^\]]*)(\])")
    $m = $rx.Match($Text)

    if (-not $m.Success) {
        # Key missing: insert it right after the opening brace of the root object.
        $idx = $Text.IndexOf('{')
        if ($idx -lt 0) { Write-Warn "could not locate root object for '$Key'"; return @{ Text = $Text; Changed = $false } }
        $afterBrace = $Text.Substring($idx + 1).TrimStart()
        $sep = if ($afterBrace.StartsWith('}')) { '' } else { ',' }
        $entry = "`n  `"$Key`": [`n    `"$escaped`"`n  ]$sep"
        Write-Added $Path
        return @{ Text = $Text.Insert($idx + 1, $entry); Changed = $true }
    }

    $body = $m.Groups[2].Value
    $entryRx = [regex]'"((?:[^"\\]|\\.)*)"'
    $existing = @()
    foreach ($em in $entryRx.Matches($body)) {
        $existing += ($em.Groups[1].Value -replace '\\\\', '\' -replace '\\"', '"')
    }
    foreach ($e in $existing) {
        if ($e.TrimEnd('\', '/') -ieq $Path.TrimEnd('\', '/')) {
            Write-Skipped $Path
            return @{ Text = $Text; Changed = $false }
        }
    }

    $allEsc = @()
    foreach ($e in $existing) { $allEsc += ($e -replace '\\', '\\' -replace '"', '\"') }
    $allEsc += $escaped
    $newBody = "`n    " + (($allEsc | ForEach-Object { "`"$_`"" }) -join ",`n    ") + "`n  "
    $newText = $Text.Substring(0, $m.Index) + $m.Groups[1].Value + $newBody + $m.Groups[3].Value + $Text.Substring($m.Index + $m.Length)
    Write-Added $Path
    return @{ Text = $newText; Changed = $true }
}

# ----------------------------------------------------------------------------
# Resolve paths
# ----------------------------------------------------------------------------

if (-not $RepoRoot) { $RepoRoot = (Get-Location).Path }
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path

$skillsDir = Join-Path $RepoRoot 'skills'
$agentsDir = Join-Path $RepoRoot 'agents'
$chatDir   = Join-Path $RepoRoot 'chat'
$serversJsonPath = Join-Path $RepoRoot 'mcp\servers.json'
$envPath   = Join-Path $RepoRoot '.env'

$copilotDir = Join-Path $HOME '.copilot'
$cliSettingsPath = Join-Path $copilotDir 'settings.json'
$cliMcpPath      = Join-Path $copilotDir 'mcp-config.json'

if (-not $VSCodeUserDir) {
    # $IsWindows / $IsMacOS are automatic variables in PowerShell 6+ only.
    # Windows PowerShell 5.1 doesn't define them, and Set-StrictMode makes a
    # bare reference throw, so probe for them via the variable: provider.
    $onWindows = if (Test-Path variable:IsWindows) { $IsWindows } else { $true }
    $onMac     = if (Test-Path variable:IsMacOS)   { $IsMacOS }   else { $false }
    if ($onWindows -or $env:OS -match 'Windows') {
        $VSCodeUserDir = Join-Path $env:APPDATA 'Code\User'
    } elseif ($onMac) {
        $VSCodeUserDir = Join-Path $HOME 'Library/Application Support/Code/User'
    } else {
        $VSCodeUserDir = Join-Path $HOME '.config/Code/User'
    }
}
$vscodeSettingsPath = Join-Path $VSCodeUserDir 'settings.json'
$vscodeMcpPath      = Join-Path $VSCodeUserDir 'mcp.json'

Write-Step "Personal AI workflows installer"
Write-Info "repo:        $RepoRoot"
Write-Info "copilot dir: $copilotDir"
Write-Info "vscode user: $VSCodeUserDir"
Write-Host ""

# ----------------------------------------------------------------------------
# 1. Copilot CLI skills + agents directories
# ----------------------------------------------------------------------------

Write-Step "Copilot CLI skills & agents (settings.json)"
if (Test-Path -LiteralPath $cliSettingsPath) {
    $cliText = Get-Content -LiteralPath $cliSettingsPath -Raw
} else {
    $cliText = "{`n}`n"
    Write-Info "settings.json not found; will create it"
}

$cliChanged = $false
if (Test-Path -LiteralPath $skillsDir) {
    $r = Add-PathToJsoncArray -Text $cliText -Key 'skillDirectories' -Path $skillsDir
    $cliText = $r.Text; $cliChanged = $r.Changed -or $cliChanged
} else { Write-Warn "skills folder not found: $skillsDir" }
if (Test-Path -LiteralPath $agentsDir) {
    $r = Add-PathToJsoncArray -Text $cliText -Key 'agentDirectories' -Path $agentsDir
    $cliText = $r.Text; $cliChanged = $r.Changed -or $cliChanged
} else { Write-Warn "agents folder not found: $agentsDir" }

if ($cliChanged) {
    if ($PSCmdlet.ShouldProcess($cliSettingsPath, 'Write JSONC')) {
        if (-not (Test-Path -LiteralPath $copilotDir)) { New-Item -ItemType Directory -Path $copilotDir -Force | Out-Null }
        if (Test-Path -LiteralPath $cliSettingsPath) {
            Copy-Item -LiteralPath $cliSettingsPath -Destination "$cliSettingsPath.bak" -Force
            Write-Info "backup: $cliSettingsPath.bak"
        }
        Set-Content -LiteralPath $cliSettingsPath -Value $cliText -Encoding UTF8 -NoNewline
    }
} else { Write-Info "no changes" }
Write-Host ""

# ----------------------------------------------------------------------------
# 2. VS Code prompt / instructions / mode file locations
# ----------------------------------------------------------------------------

Write-Step "VS Code customization locations (settings.json)"
$vscodeSettings = Read-JsonFile -Path $vscodeSettingsPath
if ($null -eq $vscodeSettings) { $vscodeSettings = [pscustomobject]@{} }

$locationKeys = @(
    'chat.promptFilesLocations',
    'chat.instructionsFilesLocations',
    'chat.modeFilesLocations'
)
$vsChanged = $false
if (Test-Path -LiteralPath $chatDir) {
    foreach ($key in $locationKeys) {
        $map = Get-OrAddProperty -Object $vscodeSettings -Name $key -Default ([pscustomobject]@{})
        if (Test-HasProp -Object $map -Name $chatDir) {
            Write-Skipped "$key -> $chatDir"
        } else {
            $map | Add-Member -NotePropertyName $chatDir -NotePropertyValue $true -Force
            Write-Added "$key -> $chatDir"
            $vsChanged = $true
        }
    }
} else { Write-Warn "chat folder not found: $chatDir" }

if ($vsChanged) { Save-JsonFile -Path $vscodeSettingsPath -Object $vscodeSettings }
else { Write-Info "no changes" }
Write-Host ""

# ----------------------------------------------------------------------------
# 3. MCP servers (canonical -> VS Code user mcp.json + CLI mcp-config.json)
# ----------------------------------------------------------------------------

Write-Step "MCP servers (mcp/servers.json)"

# Load .env (KEY=VALUE) into process env for secret resolution.
$envVars = @{}
if (Test-Path -LiteralPath $envPath) {
    Get-Content -LiteralPath $envPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
            $idx = $line.IndexOf('=')
            $k = $line.Substring(0, $idx).Trim()
            $v = $line.Substring($idx + 1).Trim().Trim('"')
            if ($k) { $envVars[$k] = $v; Set-Item -Path "Env:$k" -Value $v }
        }
    }
    Write-Info ".env loaded ($($envVars.Count) variable(s))"
} else {
    Write-Info "no .env file (secret-based servers will use placeholders)"
}

# Resolves ${input:ID} and ${env:NAME} in a string using inputs + environment.
# Returns @{ Value = <resolved>; Missing = @(...) }.
function Resolve-Secrets {
    param([string] $Text, [hashtable] $InputEnvMap)
    $missing = New-Object System.Collections.Generic.List[string]
    $resolved = [regex]::Replace($Text, '\$\{(input|env):([^}]+)\}', {
        param($m)
        $kind = $m.Groups[1].Value
        $name = $m.Groups[2].Value
        $envName = if ($kind -eq 'input' -and $InputEnvMap.ContainsKey($name)) { $InputEnvMap[$name] } else { $name }
        $val = [Environment]::GetEnvironmentVariable($envName)
        if ([string]::IsNullOrEmpty($val)) { $missing.Add($envName); return $m.Value }
        return $val
    })
    return @{ Value = $resolved; Missing = $missing }
}

# Replaces the ${repoRoot} token with this repo's absolute path so local
# (stdio) servers stay portable across machines.
function Expand-RepoRoot {
    param([string] $Text)
    if ($null -eq $Text) { return $Text }
    return $Text.Replace('${repoRoot}', $RepoRoot)
}

$serversDoc = Read-JsonFile -Path $serversJsonPath
if ($null -eq $serversDoc) {
    Write-Warn "no mcp/servers.json found; skipping MCP setup"
} else {
    # Map input id -> backing env var name (for CLI secret resolution).
    $inputEnvMap = @{}
    if ((Test-HasProp -Object $serversDoc -Name 'inputs') -and $serversDoc.inputs) {
        foreach ($inp in $serversDoc.inputs) {
            if ((Test-HasProp -Object $inp -Name 'envVar') -and $inp.envVar) {
                $inputEnvMap[$inp.id] = $inp.envVar
            }
        }
    }

    $vscodeServers = [pscustomobject]@{}   # type stdio/http, ${input:} kept
    $cliServers    = [pscustomobject]@{}   # type local/http, secrets resolved
    $missingSecrets = New-Object System.Collections.Generic.List[string]

    foreach ($prop in $serversDoc.servers.PSObject.Properties) {
        $name = $prop.Name
        $def  = $prop.Value
        $targets = if ((Test-HasProp -Object $def -Name 'targets') -and $def.targets) { @($def.targets) } else { @('vscode','cli') }
        $kind = $def.kind

        # ---- VS Code entry (keep ${input:} so VS Code prompts securely) ----
        if ($targets -contains 'vscode') {
            if ($kind -eq 'http') {
                $entry = [pscustomobject]@{ type = 'http'; url = $def.url }
                if (Test-HasProp -Object $def -Name 'headers') { $entry | Add-Member headers $def.headers }
            } else {
                $entry = [pscustomobject]@{ type = 'stdio'; command = (Expand-RepoRoot ([string]$def.command)); args = @(@($def.args) | ForEach-Object { Expand-RepoRoot ([string]$_) }) }
                if (Test-HasProp -Object $def -Name 'env') {
                    $e = [pscustomobject]@{}
                    foreach ($ep in $def.env.PSObject.Properties) {
                        $e | Add-Member -NotePropertyName $ep.Name -NotePropertyValue (Expand-RepoRoot ([string]$ep.Value))
                    }
                    $entry | Add-Member env $e
                }
            }
            $vscodeServers | Add-Member -NotePropertyName $name -NotePropertyValue $entry
        }

        # ---- CLI entry (resolve secrets from env/.env; type local for stdio) ----
        if ($targets -contains 'cli') {
            if ($kind -eq 'http') {
                $urlRes = Resolve-Secrets -Text ([string]$def.url) -InputEnvMap $inputEnvMap
                $urlRes.Missing | ForEach-Object { [void]$missingSecrets.Add($_) }
                $entry = [pscustomobject]@{ type = 'http'; url = $urlRes.Value; tools = @('*') }
                if (Test-HasProp -Object $def -Name 'headers') {
                    $h = [pscustomobject]@{}
                    foreach ($hp in $def.headers.PSObject.Properties) {
                        $r = Resolve-Secrets -Text ([string]$hp.Value) -InputEnvMap $inputEnvMap
                        $r.Missing | ForEach-Object { [void]$missingSecrets.Add($_) }
                        $h | Add-Member -NotePropertyName $hp.Name -NotePropertyValue $r.Value
                    }
                    $entry | Add-Member headers $h
                }
            } else {
                $entry = [pscustomobject]@{ type = 'local'; command = (Expand-RepoRoot ([string]$def.command)); args = @(@($def.args) | ForEach-Object { Expand-RepoRoot ([string]$_) }); tools = @('*') }
                if (Test-HasProp -Object $def -Name 'env') {
                    $e = [pscustomobject]@{}
                    foreach ($ep in $def.env.PSObject.Properties) {
                        $r = Resolve-Secrets -Text (Expand-RepoRoot ([string]$ep.Value)) -InputEnvMap $inputEnvMap
                        $r.Missing | ForEach-Object { [void]$missingSecrets.Add($_) }
                        $e | Add-Member -NotePropertyName $ep.Name -NotePropertyValue $r.Value
                    }
                    $entry | Add-Member env $e
                }
            }
            $cliServers | Add-Member -NotePropertyName $name -NotePropertyValue $entry
        }
    }

    # ---- Merge into VS Code user mcp.json ----
    $vscodeMcp = Read-JsonFile -Path $vscodeMcpPath
    if ($null -eq $vscodeMcp) { $vscodeMcp = [pscustomobject]@{} }
    $vsServersNode = Get-OrAddProperty -Object $vscodeMcp -Name 'servers' -Default ([pscustomobject]@{})
    if ((Test-HasProp -Object $serversDoc -Name 'inputs') -and $serversDoc.inputs) {
        # Strip our private 'envVar' field from inputs before writing VS Code config.
        $cleanInputs = foreach ($inp in $serversDoc.inputs) {
            $o = [pscustomobject]@{}
            foreach ($p in $inp.PSObject.Properties) { if ($p.Name -ne 'envVar') { $o | Add-Member $p.Name $p.Value } }
            $o
        }
        if (Test-HasProp -Object $vscodeMcp -Name 'inputs') { $vscodeMcp.inputs = @($cleanInputs) }
        else { $vscodeMcp | Add-Member inputs @($cleanInputs) }
    }
    foreach ($p in $vscodeServers.PSObject.Properties) {
        if (Test-HasProp -Object $vsServersNode -Name $p.Name) { Write-Skipped "vscode: $($p.Name)" }
        else { Write-Added "vscode: $($p.Name)" }
        $vsServersNode | Add-Member -NotePropertyName $p.Name -NotePropertyValue $p.Value -Force
    }
    Save-JsonFile -Path $vscodeMcpPath -Object $vscodeMcp

    # ---- Merge into Copilot CLI mcp-config.json ----
    $cliMcp = Read-JsonFile -Path $cliMcpPath
    if ($null -eq $cliMcp) { $cliMcp = [pscustomobject]@{} }
    $cliServersNode = Get-OrAddProperty -Object $cliMcp -Name 'mcpServers' -Default ([pscustomobject]@{})
    foreach ($p in $cliServers.PSObject.Properties) {
        if (Test-HasProp -Object $cliServersNode -Name $p.Name) { Write-Skipped "cli: $($p.Name)" }
        else { Write-Added "cli: $($p.Name)" }
        $cliServersNode | Add-Member -NotePropertyName $p.Name -NotePropertyValue $p.Value -Force
    }
    Save-JsonFile -Path $cliMcpPath -Object $cliMcp

    if ($missingSecrets.Count -gt 0) {
        $uniq = $missingSecrets | Select-Object -Unique
        Write-Warn "Unresolved secret(s) for the CLI MCP config: $($uniq -join ', ')"
        Write-Warn "Set them in .env (see .env.example) and re-run, or VS Code will prompt at first use."
    }
}
Write-Host ""

# ----------------------------------------------------------------------------
# 4. Build local MCP servers (any mcp/*/mcp-server with a package.json)
# ----------------------------------------------------------------------------

$mcpRoot = Join-Path $RepoRoot 'mcp'
if (Test-Path $mcpRoot) {
    $serverDirs = Get-ChildItem -Path $mcpRoot -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName 'mcp-server' } |
        Where-Object { (Test-Path $_) -and (Test-Path (Join-Path $_ 'package.json')) }

    foreach ($serverDir in $serverDirs) {
        $relDir = $serverDir.Substring($RepoRoot.Length).TrimStart('\', '/').Replace('\', '/')
        $serverName = (Split-Path (Split-Path $serverDir -Parent) -Leaf)
        Write-Step "Local MCP server: $serverName"
        $buildOutput = Join-Path $serverDir 'build/index.js'
        if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
            Write-Warn "Node.js/npm not found on PATH; skipping build. Install Node 22+ and re-run."
        } elseif (Test-Path $buildOutput) {
            Write-Skipped "$serverName MCP server already built ($relDir/build/index.js)"
        } elseif ($PSCmdlet.ShouldProcess($serverDir, "npm install && npm run build")) {
            Push-Location $serverDir
            try {
                Write-Info "Installing dependencies (npm install)..."
                npm install --silent
                Write-Info "Building (npm run build)..."
                npm run build --silent
                if (Test-Path $buildOutput) { Write-Added "Built $relDir/build/index.js" }
                else { Write-Warn "Build completed but build/index.js was not found." }
            } catch {
                Write-Warn "Failed to build $serverName MCP server: $($_.Exception.Message)"
            } finally {
                Pop-Location
            }
        }

        # Server-specific post-build hints.
        if ($serverName -eq 'memories') {
            Write-Info "Start the Memories app before use: mcp/memories/start-server.ps1 (listens on http://localhost:3466)."
        } elseif ($serverName -eq 'spec-workflow') {
            Write-Info "Specs are stored in the Memories app under 'Tasks & Specs'."
        }
        Write-Host ""
    }
}

# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------

Write-Step "Done"
Write-Info "Reload VS Code (Developer: Reload Window) to pick up new prompt/mode/MCP files."
Write-Info "Restart the Copilot CLI to pick up new skills/agents/MCP servers."
Write-Info "Backups of modified files were written next to them as *.bak."
