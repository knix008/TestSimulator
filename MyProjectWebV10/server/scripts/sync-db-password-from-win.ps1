# Sync MariaDB password from MyProjectWinV10 into Web app settings and connect.
# Run:
#   cd C:\Home\Projects\TestSimulator\MyProjectWebV10\server
#   .\scripts\sync-db-password-from-win.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

$winSettings = Join-Path $env:LOCALAPPDATA 'MyProject\settings.json'
if (-not (Test-Path $winSettings)) {
    throw "Win app settings not found: $winSettings"
}

$settings = Get-Content $winSettings -Raw | ConvertFrom-Json
$profile = $settings.databaseProfiles | Select-Object -First 1
$protected = [string]$profile.encryptedPassword
if ([string]::IsNullOrWhiteSpace($protected)) {
    $password = ''
} else {
    $bytes = [Convert]::FromBase64String($protected)
    $plain = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $password = [System.Text.Encoding]::UTF8.GetString($plain)
}

$env:SYNC_DB_PASSWORD = $password
try {
    Set-Location (Split-Path $PSScriptRoot -Parent)
    npx tsx .\scripts\apply-db-password.ts
} finally {
    Remove-Item Env:SYNC_DB_PASSWORD -ErrorAction SilentlyContinue
}
