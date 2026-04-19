#Requires -Version 5.1
<#
.SYNOPSIS
  Full automation: venv → deps → Ultralytics brain-tumor dataset → YOLO26n train → ONNX → val → report.
  See: https://docs.ultralytics.com/datasets/detect/brain-tumor/
#>
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

$venvPy = Join-Path $Root "venv\Scripts\python.exe"
$venvPip = Join-Path $Root "venv\Scripts\pip.exe"

if (-not (Test-Path $venvPy)) {
    Write-Host "Creating virtual environment in venv\ ..."
    $py = Get-Command python -ErrorAction SilentlyContinue
    if (-not $py) { $py = Get-Command py -ErrorAction SilentlyContinue }
    if (-not $py) { throw "python not found on PATH. Install Python 3.10+ and retry." }
    & $py.Source -m venv (Join-Path $Root "venv")
    if (-not (Test-Path $venvPy)) { throw "venv creation failed." }
}

Write-Host "Upgrading pip and installing requirements ..."
& $venvPy -m pip install --upgrade pip
& $venvPy -m pip install -r (Join-Path $Root "requirements.txt")

$script = Join-Path $Root "scripts\brain_tumor_auto_pipeline.py"
if (-not (Test-Path $script)) { throw "Missing $script" }

Write-Host "Running brain tumor auto pipeline ..."
& $venvPy $script @args
