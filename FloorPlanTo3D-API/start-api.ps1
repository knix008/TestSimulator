# Start FloorPlanTo3D API (Mask R-CNN) on http://localhost:5000
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = Join-Path $env:USERPROFILE "miniconda3\envs\imageTo3D\python.exe"
if (-not (Test-Path $py)) {
    Write-Error "Conda env not found: $py`nCreate it with: conda create -n imageTo3D python=3.6.13"
}
$env:TF_CPP_MIN_LOG_LEVEL = "2"
Set-Location $root
Write-Host "Starting API (model loads first, wait until 'Running on http://0.0.0.0:5000/')..."
& $py application.py
