# build.ps1 - 바로 실행할 수 있는 실행 파일을 만든다.
#
#   .\build.ps1              앱 · 서버 · 설치 프로그램을 만들어 저장소 루트에 둔다
#   .\build.ps1 -Run         빌드한 뒤 곧바로 실행한다
#   .\build.ps1 -Web         웹 판(WASM + 정적 파일)까지 함께 만든다
#   .\build.ps1 -Dev         디버그 빌드 (빠르게 만들고 느리게 돈다)
#
# 배포용 zip 은 scripts\package.ps1 을 쓴다.

[CmdletBinding()]
param(
    [switch]$Run,
    [switch]$Web,
    [switch]$Dev
)

$ErrorActionPreference = 'Stop'
# 콘솔이 한글을 깨뜨리지 않게 UTF-8 로 맞춘다.
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
& "$root\scripts\prereq.ps1"
. "$root\scripts\cargo-out.ps1"

$profileName = if ($Dev) { 'debug' } else { 'release' }
$cargoArgs = @('build')
if (-not $Dev) { $cargoArgs += '--release' }

Write-Host '== 천지인 한글 입력기 빌드' -ForegroundColor Cyan
Write-Host ("   " + (cargo --version))
Write-Host ("   " + (rustc --version))

# 데스크톱 앱과 서버를 함께 만든다.
# 콘솔 창이 따라 뜨지 않는 것은 crates/app 의 windows_subsystem 이 맡는다.
Write-Host '-- 데스크톱 앱 · 서버' -ForegroundColor Cyan
cargo @cargoArgs -p chunjiin-app -p chunjiin-serve
if ($LASTEXITCODE -ne 0) { throw '빌드 실패' }

# 저장소 루트에 갖다 놓는다. 여기서 바로 실행하고 배포할 수 있다.
foreach ($name in @('chunjiin.exe', 'chunjiin-serve.exe')) {
    Copy-CargoBinTo -Name $name -DestDir $root -Profile $profileName
    $mb = [math]::Round((Get-Item (Join-Path $root $name)).Length / 1MB, 1)
    Write-Host "   $name  $mb MB" -ForegroundColor Green
}

Write-Host '-- 설치 프로그램' -ForegroundColor Cyan
Build-ChunjiinSetup -Root $root -Profile $profileName -CargoArgs $cargoArgs
$setupMb = [math]::Round((Get-Item (Join-Path $root 'chunjiin-setup.exe')).Length / 1MB, 1)
Write-Host "   chunjiin-setup.exe  $setupMb MB" -ForegroundColor Green

if ($Web) {
    Write-Host '-- 웹 판' -ForegroundColor Cyan
    & "$root\scripts\build-web.ps1"
    if ($LASTEXITCODE -ne 0) { throw '웹 판 빌드 실패' }
}

Write-Host '== 빌드 완료' -ForegroundColor Green

if ($Run) {
    Write-Host '-- 실행' -ForegroundColor Cyan
    & "$root\chunjiin.exe"
}
