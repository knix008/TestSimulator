#Requires -Version 5.1
<#
.SYNOPSIS
  Downloads the Ultralytics brain-tumor sample slice (CT/MRI-style) for YOLO26BrainV20.

.DESCRIPTION
  Does not download any ONNX. Train YOLO26n-seg on brain CT segmentation labels, then export ONNX
  (see tools\train_yolo26n_seg_brain_ct.py and tools\export_yolo26_brain_onnx.py).
  Default class order for brain-tumor.yaml: negative,positive

.EXAMPLE
  .\Download-SampleAssets.ps1
  .\Download-SampleAssets.ps1 -OutDir "D:\path\to\YOLO26BrainV20\samples"
#>
[CmdletBinding()]
param(
    [string] $OutDir = ""
)

$ErrorActionPreference = "Stop"

function Get-RepoSamplesDir {
    $dir = $PSScriptRoot
    while ($dir) {
        $marker = Join-Path $dir "samples\coco80_labels_comma.txt"
        if (Test-Path -LiteralPath $marker) {
            return Join-Path $dir "samples"
        }
        $parent = Split-Path $dir -Parent
        if ([string]::IsNullOrEmpty($parent) -or $parent -eq $dir) { break }
        $dir = $parent
    }
    $repoRoot = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
    return Join-Path $repoRoot "samples"
}

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = [System.IO.Path]::GetFullPath((Get-RepoSamplesDir))
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
