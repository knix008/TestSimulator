#Requires -Version 5.1
<#
.SYNOPSIS
  Downloads the Ultralytics brain-tumor sample slice (CT/MRI-style) for YOLO11BrainV10.

.DESCRIPTION
  Does not download any ONNX. Train YOLO11n-seg on brain CT segmentation labels, then export ONNX
  (see tools\train_yolo11n_seg_brain_ct.py and tools\export_yolo11_brain_onnx.py).
  Default class order for brain-tumor.yaml: negative,positive
  Default output: repo data\ct (same layout as the app: %LocalAppData%\YOLO11BrainV10\data\ct).

.EXAMPLE
  .\Download-SampleAssets.ps1
  .\Download-SampleAssets.ps1 -OutDir "D:\path\to\YOLO11BrainV10\data\ct"
#>
[CmdletBinding()]
param(
    [string] $OutDir = ""
)

$ErrorActionPreference = "Stop"

function Get-RepoCtDataDir {
    $dir = $PSScriptRoot
    while ($dir) {
        $sln = Join-Path $dir "YOLO11BrainV10.sln"
        if (Test-Path -LiteralPath $sln) {
            return Join-Path $dir "data\ct"
        }
        $parent = Split-Path $dir -Parent
        if ([string]::IsNullOrEmpty($parent) -or $parent -eq $dir) { break }
        $dir = $parent
    }
    $repoRoot = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
    return Join-Path $repoRoot "data\ct"
}

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = [System.IO.Path]::GetFullPath((Get-RepoCtDataDir))
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$imageUrl = "https://github.com/ultralytics/assets/releases/download/v0.0.0/brain-tumor-sample.jpg"
$imgPath = Join-Path $OutDir "brain_tumor_sample.jpg"

Write-Host "Output directory: $OutDir"
Write-Host "Downloading brain tumor sample image (Ultralytics) ..."
Invoke-WebRequest -Uri $imageUrl -OutFile $imgPath -UseBasicParsing

Write-Host "Done."
Write-Host "  Image: $imgPath"
Write-Host "  Labels (brain-tumor.yaml): negative,positive"
