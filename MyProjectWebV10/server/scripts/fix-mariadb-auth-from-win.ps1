# Fix MariaDB auth_gssapi_client using the password stored in MyProjectWinV10 settings.
# Run in PowerShell as the same Windows user who uses the Win app:
#   cd C:\Home\Projects\TestSimulator\MyProjectWebV10\server
#   .\scripts\fix-mariadb-auth-from-win.ps1

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Security

$mariadb = 'C:\Program Files\MariaDB 12.3\bin\mariadb.exe'
$winSettings = Join-Path $env:LOCALAPPDATA 'MyProject\settings.json'

if (-not (Test-Path $mariadb)) {
    throw "MariaDB client not found: $mariadb"
}
if (-not (Test-Path $winSettings)) {
    throw "Win app settings not found: $winSettings`nRun fix-mariadb-auth.ps1 and enter the password manually."
}

$settings = Get-Content $winSettings -Raw | ConvertFrom-Json
$profile = $settings.databaseProfiles | Select-Object -First 1
if (-not $profile) {
    throw 'No database profile in Win app settings.'
}

$protected = [string]$profile.encryptedPassword
if ([string]::IsNullOrWhiteSpace($protected)) {
    $password = ''
} else {
    $bytes = [Convert]::FromBase64String($protected)
    $plain = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $bytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $password = [System.Text.Encoding]::UTF8.GetString($plain)
}

$user = [string]$profile.userName
if ([string]::IsNullOrWhiteSpace($user)) { $user = 'root' }

Write-Host "Win profile: $($profile.name) / $($profile.server):$($profile.port) / $($profile.database) / user=$user" -ForegroundColor Cyan

$env:MYSQL_PWD = $password
try {
    Write-Host 'Current auth plugins:' -ForegroundColor Yellow
    & $mariadb -u $user -e "SELECT user, host, plugin FROM mysql.user WHERE user IN ('root','myproject');"

    $escaped = $password.Replace("'", "''")
    $sql = @"
ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('$escaped');
ALTER USER 'root'@'127.0.0.1' IDENTIFIED VIA mysql_native_password USING PASSWORD('$escaped');
ALTER USER 'root'@'::1' IDENTIFIED VIA mysql_native_password USING PASSWORD('$escaped');
FLUSH PRIVILEGES;
SELECT user, host, plugin FROM mysql.user WHERE user IN ('root','myproject');
"@

    Write-Host 'Applying mysql_native_password...' -ForegroundColor Yellow
    $sql | & $mariadb -u $user

    Write-Host ''
    Write-Host 'MariaDB auth fixed.' -ForegroundColor Green
    Write-Host 'Next: Web admin -> DB settings -> same password -> Save and apply.' -ForegroundColor Green
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
    Write-Host 'If Win password is wrong, run .\scripts\fix-mariadb-auth.ps1 and enter the password manually.' -ForegroundColor Yellow
    throw
} finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}
