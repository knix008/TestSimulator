# Installs Python 3 (if missing) and pip packages for ONNX export (Ultralytics).
# Usage (from repo):  powershell -ExecutionPolicy Bypass -File .\tools\setup-python.ps1
# Requires: Windows 10/11. Uses winget when Python is not on PATH.

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
$req = Join-Path $here 'requirements-export.txt'
if (-not (Test-Path -LiteralPath $req)) {
    throw "requirements file not found: $req"
}

function Refresh-PathEnv {
    $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Test-PyLauncher3 {
    try {
        & py -3 --version 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

function Test-PythonCmd {
    try {
        & python --version 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

if (-not (Test-PyLauncher3) -and -not (Test-PythonCmd)) {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw @"
Python 3 was not found on PATH, and winget is not available.
Install Python 3 from https://www.python.org/downloads/ (check 'Add python.exe to PATH'),
then run this script again.
"@
    }
    Write-Host 'Python 3 not found. Installing Python.Python.3.12 via winget (user scope)...'
    & winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
    Refresh-PathEnv
}

if (Test-PyLauncher3) {
    Write-Host 'Using: py -3'
    & py -3 -m pip install --upgrade pip
    & py -3 -m pip install -r $req
    Write-Host 'Done.'
    exit 0
}

if (Test-PythonCmd) {
    Write-Host 'Using: python'
    & python -m pip install --upgrade pip
    & python -m pip install -r $req
    Write-Host 'Done.'
    exit 0
}

throw 'Python 3 is still not available after install. Close this terminal, open a new one, and run the script again so PATH is refreshed.'
