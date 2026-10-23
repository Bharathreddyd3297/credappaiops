# =====================================================================
# CredPay - one-time laptop setup (Windows 10/11)
# =====================================================================
# Installs everything needed to run CredPay locally:
#   Java 21 (Temurin), Maven 3.9, Node.js LTS, Python 3.12,
#   Docker Desktop (+ WSL2), Azure CLI
#
# HOW TO RUN (once):
#   1. Open PowerShell as Administrator (right-click > Run as administrator)
#   2. cd <repo folder>
#   3. Set-ExecutionPolicy -Scope Process Bypass -Force
#   4. .\scripts\setup\install-prereqs.ps1
#   5. Restart the laptop (needed for WSL2 / Docker Desktop)
#   6. Start Docker Desktop once and accept its terms
#
# Safe to re-run: tools that are already installed are skipped.
# =====================================================================

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Please run this script from an Administrator PowerShell window." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------
# 1. winget packages
# ---------------------------------------------------------------------
$packages = @(
    @{ Id = 'EclipseAdoptium.Temurin.21.JDK'; Name = 'Java 21 (Temurin JDK)' },
    @{ Id = 'OpenJS.NodeJS.LTS';              Name = 'Node.js LTS' },
    @{ Id = 'Python.Python.3.12';             Name = 'Python 3.12' },
    @{ Id = 'Docker.DockerDesktop';           Name = 'Docker Desktop' },
    @{ Id = 'Microsoft.AzureCLI';             Name = 'Azure CLI' }
)

foreach ($p in $packages) {
    $installed = winget list --id $p.Id --exact --accept-source-agreements 2>$null | Select-String $p.Id
    if ($installed) {
        Write-Host "[skip] $($p.Name) already installed" -ForegroundColor DarkGray
        continue
    }
    Write-Host "[install] $($p.Name) ..." -ForegroundColor Cyan
    winget install --id $p.Id --exact --silent --scope machine `
        --accept-package-agreements --accept-source-agreements
}

# ---------------------------------------------------------------------
# 2. Maven (not in winget) - download the official zip from Apache
# ---------------------------------------------------------------------
$mavenVersion = '3.9.11'
$toolsDir     = 'C:\tools'
$mavenHome    = Join-Path $toolsDir "apache-maven-$mavenVersion"

if (Test-Path "$mavenHome\bin\mvn.cmd") {
    Write-Host "[skip] Maven $mavenVersion already installed" -ForegroundColor DarkGray
} else {
    Write-Host "[install] Maven $mavenVersion ..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force $toolsDir | Out-Null
    $zip = Join-Path $env:TEMP "apache-maven-$mavenVersion-bin.zip"
    Invoke-WebRequest -UseBasicParsing `
        -Uri "https://archive.apache.org/dist/maven/maven-3/$mavenVersion/binaries/apache-maven-$mavenVersion-bin.zip" `
        -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $toolsDir -Force
    Remove-Item $zip
}

[Environment]::SetEnvironmentVariable('MAVEN_HOME', $mavenHome, 'Machine')
$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
if ($machinePath -notlike "*$mavenHome\bin*") {
    [Environment]::SetEnvironmentVariable('Path', "$machinePath;$mavenHome\bin", 'Machine')
}

# ---------------------------------------------------------------------
# 3. WSL2 (Docker Desktop backend)
# ---------------------------------------------------------------------
Write-Host "[install] WSL2 (no Linux distro needed) ..." -ForegroundColor Cyan
wsl --install --no-distribution

Write-Host ""
Write-Host "Done. Next steps:" -ForegroundColor Green
Write-Host "  1. Restart the laptop"
Write-Host "  2. Start Docker Desktop once and accept its terms"
Write-Host "  3. Open a NEW terminal and run: .\scripts\setup\check-prereqs.ps1"
