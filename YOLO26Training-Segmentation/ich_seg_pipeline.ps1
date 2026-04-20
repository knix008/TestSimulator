#Requires -Version 5.1
<#
.SYNOPSIS
  venv → deps → Brain CT ICH (hemorrhage) YOLO segmentation → train → ONNX → val → report.
  Entry point: scripts\ich_seg_pipeline.py

.PARAMETER FromCQ500
  Run Seg-CQ500 (Zenodo) download/extract → NIfTI→YOLO first, then train on dataset\ich_cq500_yolo_seg.
  Data: https://zenodo.org/records/8063221
#>
param(
    [switch]$FromCQ500
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

$venvPy = Join-Path $Root "venv\Scripts\python.exe"

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

$train = Join-Path $Root "scripts\ich_seg_pipeline.py"
if (-not (Test-Path $train)) { throw "Missing $train" }

if ($FromCQ500) {
    $prep = Join-Path $Root "scripts\ich_seg_prepare_cq500_yolo.py"
    if (-not (Test-Path $prep)) { throw "Missing $prep" }
    Write-Host "Seg-CQ500 → YOLO dataset prep ..."
    & $venvPy $prep
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    # Default --device 0. Override with e.g. --device cpu in remaining arguments.
    Write-Host "Running ICH segmentation pipeline ..."
    & $venvPy $train --dataset-root (Join-Path $Root "dataset\ich_cq500_yolo_seg") --class-names hemorrhage --nc 1 --device 0 @args
} else {
    Write-Host "Running ICH segmentation pipeline ..."
    & $venvPy $train @args
}
