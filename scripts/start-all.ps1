# =====================================================================
# CredPay - start everything locally
# =====================================================================
#   .\scripts\start-all.ps1
#
# 1. Starts PostgreSQL and Keycloak in Docker and waits for Keycloak.
# 2. Opens one PowerShell window per app, so each app's logs stay visible:
#      user-service (8080), payment-service (8000), customer-portal (5173),
#      admin-portal (5174)
#    First run only: creates the Python venv, runs npm install and copies
#    each portal's .env.example to .env.
#
# Stop everything with .\scripts\stop-all.ps1
# =====================================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Test-PortInUse([int]$port) {
    [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Start-AppWindow([string]$title, [string]$folder, [string]$command) {
    $script = "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location '$folder'; $command"
    Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $script
}

# ---------------------------------------------------------------------
# 1. Infrastructure (Docker)
# ---------------------------------------------------------------------
Write-Host "Starting PostgreSQL and Keycloak (Docker)..." -ForegroundColor Cyan
# docker compose reports progress on stderr; judge success by the exit code only
$ErrorActionPreference = 'Continue'
docker compose -f "$root\infra\docker-compose.yml" up -d
$composeExitCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($composeExitCode -ne 0) { throw "docker compose failed - is Docker Desktop running?" }

Write-Host "Waiting for Keycloak (first start takes about a minute)..." -ForegroundColor Cyan
$discovery = 'http://localhost:8081/realms/credpay/.well-known/openid-configuration'
$deadline = (Get-Date).AddMinutes(3)
while ($true) {
    try { Invoke-WebRequest -UseBasicParsing -Uri $discovery -TimeoutSec 3 | Out-Null; break }
    catch {
        if ((Get-Date) -gt $deadline) { throw "Keycloak did not start - check: docker logs credpay-keycloak" }
        Start-Sleep -Seconds 3
    }
}
Write-Host "Keycloak is ready." -ForegroundColor Green

# ---------------------------------------------------------------------
# 2. Applications (one window each)
# ---------------------------------------------------------------------
if (Test-PortInUse 8080) {
    Write-Host "[skip] user-service: port 8080 already in use" -ForegroundColor DarkGray
} else {
    Start-AppWindow 'user-service :8080' "$root\user-service" 'mvn spring-boot:run'
}

if (Test-PortInUse 8000) {
    Write-Host "[skip] payment-service: port 8000 already in use" -ForegroundColor DarkGray
} else {
    $setup = "if (-not (Test-Path .venv)) { python -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.txt }"
    Start-AppWindow 'payment-service :8000' "$root\payment-service" `
        "$setup; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8000"
}

if (Test-PortInUse 5173) {
    Write-Host "[skip] customer-portal: port 5173 already in use" -ForegroundColor DarkGray
} else {
    $setup = "if (-not (Test-Path .env)) { Copy-Item .env.example .env }; if (-not (Test-Path node_modules)) { npm install }"
    Start-AppWindow 'customer-portal :5173' "$root\customer-portal" "$setup; npm run dev"
}

if (Test-PortInUse 5174) {
    Write-Host "[skip] admin-portal: port 5174 already in use" -ForegroundColor DarkGray
} else {
    $setup = "if (-not (Test-Path .env)) { Copy-Item .env.example .env }; if (-not (Test-Path node_modules)) { npm install }"
    Start-AppWindow 'admin-portal :5174' "$root\admin-portal" "$setup; npm run dev"
}

Write-Host ""
Write-Host "CredPay is starting in separate windows:" -ForegroundColor Green
Write-Host "  Customer portal   http://localhost:5173   (customer@credpay.local / Customer@123)"
Write-Host "  Admin portal      http://localhost:5174   (admin@credpay.local / Admin@123)"
Write-Host "  user-service      http://localhost:8080/actuator/health"
Write-Host "  payment-service   http://localhost:8000/docs"
Write-Host "  Keycloak admin    http://localhost:8081/admin   (admin / admin)"
