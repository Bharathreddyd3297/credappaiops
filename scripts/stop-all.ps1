# =====================================================================
# CredPay - stop everything started by start-all.ps1
# =====================================================================
#   .\scripts\stop-all.ps1              stop the apps and the Docker containers
#   .\scripts\stop-all.ps1 -KeepInfra   stop only the apps (PostgreSQL + Keycloak keep running)
#
# Data is kept. To wipe the database and Keycloak and start fresh:
#   docker compose -f infra/docker-compose.yml down -v
# =====================================================================

param([switch]$KeepInfra)

$root = Split-Path -Parent $PSScriptRoot
$apps = @{ 8080 = 'user-service'; 8000 = 'payment-service'; 5173 = 'customer-portal'; 5174 = 'admin-portal' }

foreach ($port in $apps.Keys) {
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($processId in ($listeners.OwningProcess | Select-Object -Unique)) {
        # `uvicorn --reload` serves from a child process that inherits the port.
        # Windows keeps reporting the parent as the port's owner - even after the
        # parent has exited - so stop the children too.
        $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$processId" -ErrorAction SilentlyContinue
        foreach ($child in $children) {
            Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped $($apps[$port]) (port $port)"
    }
}

if (-not $KeepInfra) {
    # --profile apps also removes the application containers, if they were started
    $ErrorActionPreference = 'Continue'
    docker compose -f "$root\infra\docker-compose.yml" --profile apps down
}
