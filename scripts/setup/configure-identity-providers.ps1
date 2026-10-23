# =====================================================================
# CredPay - add social / enterprise login providers to Keycloak
# =====================================================================
#   .\scripts\setup\configure-identity-providers.ps1
#
# Reads client ids and secrets from infra/.env (git-ignored; copy
# infra/.env.example) and creates or updates the providers in the
# running Keycloak (credpay realm). Safe to re-run, e.g. after rotating
# a secret. Keycloak must be running (docker compose up).
#
# Secrets stay out of git: they live only in infra/.env and in
# Keycloak's own database.
# =====================================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envFile = Join-Path $root 'infra\.env'
$container = 'credpay-keycloak'
$kcadm = '/opt/keycloak/bin/kcadm.sh'
$realm = 'credpay'

if (-not (Test-Path $envFile)) {
    throw "infra\.env not found. Copy infra\.env.example to infra\.env and fill in the values."
}

# Parse KEY=VALUE lines (ignores comments and blank lines)
$settings = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$') {
        $settings[$Matches[1]] = $Matches[2]
    }
}

# kcadm prints progress ("Logging into ...") on stderr. Windows PowerShell 5.1
# turns native stderr into error records, so judge success by exit code only.
function Invoke-Kcadm {
    param([Parameter(ValueFromRemainingArguments)] [string[]]$KcadmArgs)
    $ErrorActionPreference = 'Continue'
    $output = docker exec $container $kcadm @KcadmArgs 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { throw "kcadm $($KcadmArgs[0]) failed: $output" }
    $output
}

function Test-IdentityProvider([string]$alias) {
    $ErrorActionPreference = 'Continue'
    docker exec $container $kcadm get "identity-provider/instances/$alias" -r $realm 2>&1 | Out-Null
    return $LASTEXITCODE -eq 0
}

function Set-IdentityProvider([string]$alias, [string[]]$properties) {
    if (Test-IdentityProvider $alias) {
        Invoke-Kcadm update "identity-provider/instances/$alias" -r $realm @properties | Out-Null
        Write-Host "[updated] $alias" -ForegroundColor Green
    } else {
        Invoke-Kcadm create identity-provider/instances -r $realm @properties | Out-Null
        Write-Host "[created] $alias" -ForegroundColor Green
    }
}

# Log kcadm in to the master realm with the local bootstrap admin
Invoke-Kcadm config credentials --server http://localhost:8080 --realm master --user admin --password admin | Out-Null

# ---------------------------------------------------------------------
# Google - customers sign in with their Gmail / Google account.
# trustEmail: Google has verified the address, so Keycloak marks it verified.
# ---------------------------------------------------------------------
if ($settings['GOOGLE_CLIENT_ID'] -and $settings['GOOGLE_CLIENT_SECRET']) {
    Set-IdentityProvider 'google' @(
        '-s', 'alias=google',
        '-s', 'providerId=google',
        '-s', 'displayName=Google',
        '-s', 'enabled=true',
        '-s', 'trustEmail=true',
        '-s', "config.clientId=$($settings['GOOGLE_CLIENT_ID'])",
        '-s', "config.clientSecret=$($settings['GOOGLE_CLIENT_SECRET'])",
        '-s', 'config.defaultScope=openid profile email',
        '-s', 'config.syncMode=IMPORT'
    )
} else {
    Write-Host "[skip] Google: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set in infra\.env" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Done. The Keycloak sign-in page now shows the enabled providers." -ForegroundColor Green
