# Fix MariaDB auth_gssapi_client for Node.js / Prisma / Web app.
# Run in PowerShell (same Windows user as MyProjectWinV10):
#   cd C:\Home\Projects\TestSimulator\MyProjectWebV10\server
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

$env:MYSQL_PWD = $password
try {
    Write-Host 'Checking current auth plugins...' -ForegroundColor Yellow
    & $mariadb -u root -e "SELECT user, host, plugin FROM mysql.user WHERE user IN ('root','myproject');"

    $sql = @"
ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('$($password.Replace("'", "''"))');
ALTER USER 'root'@'127.0.0.1' IDENTIFIED VIA mysql_native_password USING PASSWORD('$($password.Replace("'", "''"))');
ALTER USER 'root'@'::1' IDENTIFIED VIA mysql_native_password USING PASSWORD('$($password.Replace("'", "''"))');
FLUSH PRIVILEGES;
SELECT user, host, plugin FROM mysql.user WHERE user IN ('root','myproject');
"@

    Write-Host 'Applying mysql_native_password...' -ForegroundColor Yellow
    $sql | & $mariadb -u root

    Write-Host ''
    Write-Host 'Done. plugin should be mysql_native_password.' -ForegroundColor Green
    Write-Host 'Next: Web admin -> DB settings -> enter the same password -> Save and apply.' -ForegroundColor Green
} finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}
