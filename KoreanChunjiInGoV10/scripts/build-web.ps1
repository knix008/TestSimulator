# build-web.ps1 - 웹 판을 만든다. (Windows)
#
#   .\scripts\build-web.ps1          web\ 에 chunjiin.wasm 을 만든다
#   .\scripts\build-web.ps1 -Serve   만든 뒤 서버까지 띄운다
#
# 만들어지는 것
#   web\chunjiin.wasm     조합 엔진 (약 2 MB)
#   web\wasm_exec.js      Go 가 함께 주는 다리 코드
#   chunjiin-serve.exe    web\ 을 품은 서버 실행 파일 (저장소 루트)
#
# web\ 을 그대로 정적 호스팅(GitHub Pages 등)에 올려도 된다.
# 그때는 .wasm 의 MIME 형식이 application/wasm 인지 확인한다.

[CmdletBinding()]
param([switch]$Serve)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host '-- WASM 엔진' -ForegroundColor Cyan
$env:GOOS = 'js'; $env:GOARCH = 'wasm'
go build -ldflags '-s -w' -o web/chunjiin.wasm ./cmd/chunjiin-wasm
$code = $LASTEXITCODE
Remove-Item Env:GOOS, Env:GOARCH
if ($code -ne 0) { throw 'WASM 빌드 실패' }

Write-Host '-- wasm_exec.js' -ForegroundColor Cyan
$goroot = (go env GOROOT)
$exec = Join-Path $goroot 'lib\wasm\wasm_exec.js'
if (-not (Test-Path $exec)) { $exec = Join-Path $goroot 'misc\wasm\wasm_exec.js' }
Copy-Item $exec 'web\wasm_exec.js' -Force
Copy-Item 'assets\chunjiin.png' 'web\chunjiin.png' -Force

Write-Host '-- 서버' -ForegroundColor Cyan
$site = Join-Path $root 'cmd\chunjiin-serve\site'
Remove-Item $site -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $site | Out-Null
Copy-Item 'web\index.html', 'web\style.css', 'web\app.js', 'web\wasm_exec.js',
          'web\chunjiin.wasm', 'web\chunjiin.png' $site -Force
go build -ldflags '-s -w' -o chunjiin-serve.exe ./cmd/chunjiin-serve
if ($LASTEXITCODE -ne 0) { throw '서버 빌드 실패' }

foreach ($f in 'web\chunjiin.wasm', 'chunjiin-serve.exe') {
    $size = [math]::Round((Get-Item (Join-Path $root $f)).Length / 1MB, 1)
    Write-Host ("   {0,-22} {1,6} MB" -f $f, $size) -ForegroundColor Green
}

if ($Serve) { & "$root\chunjiin-serve.exe" }
