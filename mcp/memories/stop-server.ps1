# Stop the Memories server running on port 3466

$Port = if ($env:PORT) { $env:PORT } else { 3466 }

$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if (-not $listeners) {
    Write-Host "Server is not running (nothing listening on port $Port)."
    exit 0
}

$processIds = $listeners | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($procId in $processIds) {
    Write-Host "Stopping process $procId on port $Port..."
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

Write-Host "Server stopped."
