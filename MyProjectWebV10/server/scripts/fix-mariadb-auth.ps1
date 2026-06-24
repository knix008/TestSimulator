# Fix MariaDB auth_gssapi_client for Node.js / Prisma / Web app.
# Removes gssapi from auth_or on ALL root accounts (including PC hostname entries).
# Run in PowerShell (same Windows user as MyProjectWinV10):
#   cd ...\MyProjectWebV10\server
#   .\scripts\fix-mariadb-auth.ps1
#
# Use the same root password as MyProjectWinV10 DB connection settings.

$ErrorActionPreference = 'Stop'

$mariadb = 'C:\Program Files\MariaDB 12.3\bin\mariadb.exe'
if (-not (Test-Path $mariadb)) {
    throw "MariaDB client not found: $mariadb"
}

Write-Host 'MariaDB root password (same as Win program DB settings):' -ForegroundColor Cyan
$secure = Read-Host -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

function EscapeSqlLiteral([string]$value) {
    return $value.Replace("'", "''")
}

function EscapeSqlIdentifier([string]$value) {
    return $value.Replace("'", "''")
}

$env:MYSQL_PWD = $password
try {
    Write-Host 'Checking current auth plugins...' -ForegroundColor Yellow
    & $mariadb -u root -e "SELECT user, host, plugin FROM mysql.user WHERE user IN ('root','myproject');"
    & $mariadb -u root -e "SELECT Host, User, Priv FROM mysql.global_priv WHERE User IN ('root','myproject');"

    $escapedPassword = EscapeSqlLiteral $password
    $alterStatements = @()

    $hostsRaw = & $mariadb -u root -N -e "SELECT Host FROM mysql.global_priv WHERE User='root';"
    foreach ($hostEntry in $hostsRaw) {
        $hostEntry = [string]$hostEntry
        if ([string]::IsNullOrWhiteSpace($hostEntry)) { continue }
        $escapedHost = EscapeSqlIdentifier $hostEntry
        $alterStatements += "ALTER USER 'root'@'$escapedHost' IDENTIFIED VIA mysql_native_password USING PASSWORD('$escapedPassword');"
    }

    if ($alterStatements.Count -eq 0) {
        throw 'No root accounts found in mysql.global_priv.'
    }

    Write-Host "Applying mysql_native_password to $($alterStatements.Count) account(s)..." -ForegroundColor Yellow
    $sql = ($alterStatements -join "`n") + "`nFLUSH PRIVILEGES;`nSELECT user, host, plugin FROM mysql.user WHERE user IN ('root','myproject');"
    $sql | & $mariadb -u root

    Write-Host ''
    Write-Host 'Done. All root accounts should use mysql_native_password only.' -ForegroundColor Green
    Write-Host 'Next: Web admin -> DB settings -> enter the same password -> Save and apply.' -ForegroundColor Green
} finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}
