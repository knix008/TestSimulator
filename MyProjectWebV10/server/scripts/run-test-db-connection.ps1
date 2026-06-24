$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$winSettings = Join-Path $env:LOCALAPPDATA 'MyProject\settings.json'
$settings = Get-Content $winSettings -Raw | ConvertFrom-Json
$profile = $settings.databaseProfiles | Select-Object -First 1
$bytes = [Convert]::FromBase64String([string]$profile.encryptedPassword)
$plain = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
$password = [System.Text.Encoding]::UTF8.GetString($plain)
$env:DB_HOST = [string]$profile.server
$env:DB_PORT = [string]$profile.port
$env:DB_USER = $user
$env:DB_NAME = [string]$profile.database
$env:MYSQL_PWD = $password
Push-Location $PSScriptRoot\..
npx tsx scripts/test-apply-db-settings.ts
Pop-Location
