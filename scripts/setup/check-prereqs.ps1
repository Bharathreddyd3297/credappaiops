# =====================================================================
# CredPay - verify the laptop is ready
# =====================================================================
# Run in a NEW PowerShell window after install-prereqs.ps1 + restart.
# Every line should print OK.
# =====================================================================

# Commands run through `cmd /c "... 2>&1"`: some tools (java) print their
# version to stderr, and Windows PowerShell 5.1 shows native stderr as a red
# NativeCommandError even when the tool is fine.
function Invoke-Quiet([string]$command) {
    cmd /c "$command 2>&1" | Select-Object -First 1
}

$checks = @(
    @{ Name = 'Java 21';        Cmd = { Invoke-Quiet 'java -version' };                          Expect = '"21' },
    @{ Name = 'Maven 3.9';      Cmd = { Invoke-Quiet 'mvn -v' };                                 Expect = 'Apache Maven 3\.9' },
    @{ Name = 'Node.js 20+';    Cmd = { Invoke-Quiet 'node -v' };                                Expect = '^v(2[0-9])' },
    @{ Name = 'npm';            Cmd = { Invoke-Quiet 'npm -v' };                                 Expect = '^\d' },
    @{ Name = 'Python 3.12';    Cmd = { Invoke-Quiet 'python --version' };                       Expect = 'Python 3\.12' },
    @{ Name = 'Docker running'; Cmd = { Invoke-Quiet 'docker info --format "{{.ServerVersion}}"' }; Expect = '^\d' },
    @{ Name = 'Docker Compose'; Cmd = { Invoke-Quiet 'docker compose version' };                 Expect = 'Docker Compose version v?\d' },
    @{ Name = 'Azure CLI';      Cmd = { Invoke-Quiet 'az version --query "\"azure-cli\"" -o tsv' }; Expect = '^2\.' },
    @{ Name = 'Git';            Cmd = { Invoke-Quiet 'git --version' };                          Expect = 'git version' }
)

$failed = 0
foreach ($c in $checks) {
    try   { $out = (& $c.Cmd | Out-String).Trim() } catch { $out = $_.Exception.Message }
    if ($out -match $c.Expect) {
        Write-Host ("OK    {0,-15} {1}" -f $c.Name, $out) -ForegroundColor Green
    } else {
        Write-Host ("FAIL  {0,-15} {1}" -f $c.Name, $out) -ForegroundColor Red
        $failed++
    }
}

if ($failed -gt 0) {
    Write-Host "`n$failed check(s) failed. Fix them, open a new terminal and re-run." -ForegroundColor Yellow
    exit 1
}
Write-Host "`nLaptop is ready for CredPay." -ForegroundColor Green
