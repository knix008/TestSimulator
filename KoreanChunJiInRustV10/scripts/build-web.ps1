# build-web.ps1 - 웹 판(WASM + 정적 파일)을 만든다.
#
#   .\scripts\build-web.ps1            web\ 에 chunjiin_wasm 을 만든다
#   .\scripts\build-web.ps1 -Serve     만든 뒤 서버까지 띄운다
#
# 필요한 것
#   rustup target add wasm32-unknown-unknown
#   cargo install wasm-bindgen-cli
#
# 데스크톱 판과 달리 C 컴파일러가 필요 없다.

[CmdletBinding()]
param([switch]$Serve)

$ErrorActionPreference = 'Stop'
# 콘솔이 한글을 깨뜨리지 않게 UTF-8 로 맞춘다.
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root
& "$root\scripts\prereq.ps1"

Write-Host '== 웹 판 빌드' -ForegroundColor Cyan

# 필요한 것이 갖춰졌는지 먼저 본다. 없으면 스스로 넣는다.
if (-not ((rustup target list --installed) -match 'wasm32-unknown-unknown')) {
    Write-Host '   wasm32 대상이 없습니다. 넣습니다...'
    rustup target add wasm32-unknown-unknown
}
if (-not (Get-Command wasm-bindgen -ErrorAction SilentlyContinue)) {
    Write-Host '   wasm-bindgen 이 없습니다. 넣습니다...'
    cargo install wasm-bindgen-cli
    if ($LASTEXITCODE -ne 0) { throw 'wasm-bindgen-cli 설치 실패' }
}

Write-Host '-- 엔진(WASM)' -ForegroundColor Cyan
# 웹 꾸러미는 작업공간 밖에 있다. 그 폴더에서 따로 빌드한다.
Push-Location "$root\crates\wasm"
try {
    cargo build --release --target wasm32-unknown-unknown
    if ($LASTEXITCODE -ne 0) { throw 'WASM 빌드 실패' }
}
finally { Pop-Location }

$wasm = "$root\crates\wasm\target\wasm32-unknown-unknown\release\chunjiin_wasm.wasm"
if (-not (Test-Path $wasm)) { throw "빌드 결과를 찾지 못했습니다: $wasm" }

Write-Host '-- 자바스크립트 이음새' -ForegroundColor Cyan
wasm-bindgen $wasm --out-dir "$root\web" --target web --no-typescript
if ($LASTEXITCODE -ne 0) { throw '이음새 만들기 실패' }

$kb = [math]::Round((Get-Item "$root\web\chunjiin_wasm_bg.wasm").Length / 1KB)
Write-Host "   web\chunjiin_wasm_bg.wasm  $kb KB" -ForegroundColor Green
Write-Host '== 웹 판 빌드 완료' -ForegroundColor Green

if ($Serve) {
    Write-Host '-- 서버' -ForegroundColor Cyan
    cargo run --release -p chunjiin-serve -- -dir web
}
