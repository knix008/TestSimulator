# Fix MariaDB auth_gssapi_client using the password stored in MyProjectWinV10 settings.
# Removes gssapi from auth_or on ALL root accounts (including PC hostname entries).
# Run in PowerShell as the same Windows user who uses the Win app:
#   cd ...\MyProjectWebV10\server
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

function EscapeSqlLiteral([string]$value) {
    return $value.Replace("'", "''")
}

function EscapeSqlIdentifier([string]$value) {
    return $value.Replace("'", "''")
}

$env:MYSQL_PWD = $password
try {
    Write-Host 'Current auth plugins (mysql.user):' -ForegroundColor Yellow
    & $mariadb -u $user -e "SELECT user, host, plugin FROM mysql.user WHERE user IN ('root','myproject');"

    Write-Host 'Current auth (mysql.global_priv, gssapi check):' -ForegroundColor Yellow
    & $mariadb -u $user -e "SELECT Host, User, Priv FROM mysql.global_priv WHERE User IN ('root','myproject');"

    $escapedPassword = EscapeSqlLiteral $password
    $alterStatements = @()

    $hostsRaw = & $mariadb -u $user -N -e "SELECT Host FROM mysql.global_priv WHERE User='root';"
    foreach ($hostEntry in $hostsRaw) {
        $hostEntry = [string]$hostEntry
        if ([string]::IsNullOrWhiteSpace($hostEntry)) { continue }
        $escapedHost = EscapeSqlIdentifier $hostEntry
        $alterStatements += "ALTER USER 'root'@'$escapedHost' IDENTIFIED VIA mysql_native_password USING PASSWORD('$escapedPassword');"
    }

    $myprojectHostsRaw = & $mariadb -u $user -N -e "SELECT Host FROM mysql.global_priv WHERE User='myproject';"
    foreach ($hostEntry in $myprojectHostsRaw) {
        $hostEntry = [string]$hostEntry
        if ([string]::IsNullOrWhiteSpace($hostEntry)) { continue }
        $escapedHost = EscapeSqlIdentifier $hostEntry
        $alterStatements += "ALTER USER 'myproject'@'$escapedHost' IDENTIFIED VIA mysql_native_password USING PASSWORD('$escapedPassword');"
    }

    if ($alterStatements.Count -eq 0) {
        throw 'No root accounts found in mysql.global_priv.'
    }

    Write-Host "Applying mysql_native_password to $($alterStatements.Count) account(s)..." -ForegroundColor Yellow
    $sql = ($alterStatements -join "`n") + "`nFLUSH PRIVILEGES;`nSELECT Host, User, Priv FROM mysql.global_priv WHERE User IN ('root','myproject');"
    $sql | & $mariadb -u $user

    Write-Host ''
    Write-Host 'MariaDB auth fixed (gssapi removed from auth_or).' -ForegroundColor Green
    Write-Host 'Next: Web admin -> DB settings -> same password -> Save and apply.' -ForegroundColor Green
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
    Write-Host 'If Win password is wrong, run .\scripts\fix-mariadb-auth.ps1 and enter the password manually.' -ForegroundColor Yellow
    throw
} finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}
