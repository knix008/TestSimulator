<#
clean.ps1

빌드 산출물을 지운다. 실행 파일이 루트에 놓이므로 build\ 만 지워서는 부족하다.

사용법:
  .\clean.ps1            # 빌드 산출물 (build\ + 루트의 실행 파일·런타임)
  .\clean.ps1 -Deps      # 위에 더해 내려받은 libvosk·모델까지 (완전 초기화)
  .\clean.ps1 -DryRun    # 무엇을 지울지 보여만 준다
#>
param(
    [switch]$Deps,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Say([string]$text) { Write-Host "==> $text" -ForegroundColor Cyan }

$removed = 0

# 이름을 하나하나 적는다. 루트에서 와일드카드로 쓸어내면 사고가 난다.
function Remove-Artifact([string]$name) {
    $target = Join-Path $root $name
    if (-not (Test-Path $target)) { return }
    if ($DryRun) {
        Write-Host "    지울 것: $name"
    } else {
        Remove-Item -Recurse -Force $target
        Write-Host "    지움: $name"
    }
    $script:removed++
}

Say "빌드 산출물을 지웁니다"
Remove-Artifact 'build'

foreach ($name in @('kstt-cli', 'kstt-gui', 'kstt-gui-native', 'kstt-gui-gtk4', 'kstt-tests')) {
    Remove-Artifact $name
    Remove-Artifact "$name.exe"
}

# 실행 파일 옆에 복사해 둔 공유 라이브러리들
foreach ($lib in @('libvosk.dll', 'libvosk.so', 'libvosk.dylib',
                   'libstdc++-6.dll', 'libgcc_s_seh-1.dll', 'libwinpthread-1.dll')) {
    Remove-Artifact $lib
}

if ($Deps) {
    Say "내려받은 의존물도 지웁니다 (다시 받으려면 .\fetch_deps.ps1)"
    Remove-Artifact 'third_party'
    Remove-Artifact 'models'
}

if ($removed -eq 0) {
    Say "지울 것이 없습니다 (이미 깨끗합니다)"
} else {
    Say "끝났습니다 — ${removed}개 항목"
}
