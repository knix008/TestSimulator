# ONNX Runtime 공식 Windows x64 패키지(include, lib)를 third_party\onnxruntime 에 받는다.
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\get_onnxruntime.ps1 [-Version 1.31.0]
param(
    [string]$Version = "1.31.0"
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root "third_party\onnxruntime"
$header = Join-Path $target "include\onnxruntime_cxx_api.h"
$library = Join-Path $target "lib\onnxruntime.lib"
if ((Test-Path $header) -and (Test-Path $library)) {
    Write-Output "ONNX Runtime already present: $target"
    exit 0
}

$name = "onnxruntime-win-x64-$Version"
$url = "https://github.com/microsoft/onnxruntime/releases/download/v$Version/$name.zip"
$work = Join-Path ([IO.Path]::GetTempPath()) ("ort-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $work | Out-Null
try {
    $zip = Join-Path $work "$name.zip"
    Write-Output "Downloading $url"
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $work -Force
    $extracted = Join-Path $work $name
    if (-not (Test-Path (Join-Path $extracted "include\onnxruntime_cxx_api.h"))) {
        throw "Unexpected archive layout: $name"
    }
    if (Test-Path $target) {
        Remove-Item -Recurse -Force $target
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Move-Item -Path $extracted -Destination $target
    Write-Output "ONNX Runtime $Version installed: $target"
}
finally {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
