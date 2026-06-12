# Start the Memories server on port 3466 (foreground)

$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot

$Port = if ($env:PORT) { $env:PORT } else { 3466 }
$env:PORT = $Port

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    Write-Host "Error: Port $Port is already in use."
    Write-Host "Run .\stop-server.ps1 to stop the existing server."
    Pop-Location
    exit 1
}

Write-Host "Starting Memories server on port $Port..."
Set-Location src
npm start

Pop-Location
