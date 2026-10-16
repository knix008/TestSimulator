# kws_infer(C++ ONNX 추론 예제)를 MSVC로 빌드한다.
# ONNX Runtime 폴더를 주지 않으면 ONNXRUNTIME_ROOT, 그다음 third_party\onnxruntime 을 쓰고, 없으면 받는다.
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build_kws_infer.ps1 [-OrtRoot DIR] [-BuildDir DIR]
# 마지막 줄에 KWS_INFER=<exe 경로>를 출력한다.
param(
    [string]$OrtRoot = "",
    [string]$BuildDir = ""
)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
if (-not $OrtRoot) { $OrtRoot = $env:ONNXRUNTIME_ROOT }
if (-not $OrtRoot) {
    $OrtRoot = Join-Path $root "third_party\onnxruntime"
    & (Join-Path $PSScriptRoot "get_onnxruntime.ps1")
    if ($LASTEXITCODE) { throw "ONNX Runtime download failed." }
}
$OrtRoot = (Resolve-Path $OrtRoot).Path
if (-not (Test-Path (Join-Path $OrtRoot "include\onnxruntime_cxx_api.h"))) {
    throw "ONNX Runtime headers were not found in $OrtRoot"
}

# MSBuild의 파일 추적은 긴 경로(예: %TEMP% 아래)에서 실패하므로 프로젝트 안의 짧은 경로에 빌드한다.
if (-not $BuildDir) { $BuildDir = Join-Path $root "cpp\build\msvc" }

$cmake = (Get-Command cmake -ErrorAction SilentlyContinue).Source
if (-not $cmake) { throw "cmake is required to build kws_infer." }

# 미리보기(Insiders) 판은 빼고, C++ 도구가 있는 정식 Visual Studio를 고른다.
$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
$generatorArgs = @()
if (Test-Path $vswhere) {
    $instance = & $vswhere -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -format json | ConvertFrom-Json
    if ($instance) {
        $instance = @($instance)[0]
        $major = [int]($instance.installationVersion.Split(".")[0])
        $years = @{ 16 = "2019"; 17 = "2022"; 18 = "2026" }
        if ($years.ContainsKey($major)) {
            $generatorArgs = @("-G", "Visual Studio $major $($years[$major])", "-A", "x64", "-DCMAKE_GENERATOR_INSTANCE=$($instance.installationPath)")
        }
    }
}

# 다른 생성기로 만든 캐시가 남아 있으면 설정이 실패하므로 지운다.
Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $BuildDir "CMakeCache.txt")
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $BuildDir "CMakeFiles")

& $cmake @generatorArgs -S (Join-Path $root "cpp") -B $BuildDir "-DONNXRUNTIME_ROOT=$OrtRoot"
if ($LASTEXITCODE) { throw "cmake configure failed." }
& $cmake --build $BuildDir --config Release
if ($LASTEXITCODE) { throw "cmake build failed." }

$exe = @("Release\kws_infer.exe", "kws_infer.exe") | ForEach-Object { Join-Path $BuildDir $_ } | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { throw "kws_infer.exe was not produced." }
Get-ChildItem (Join-Path $OrtRoot "lib") -Filter *.dll | Copy-Item -Destination (Split-Path -Parent $exe) -Force
Write-Output "KWS_INFER=$exe"
