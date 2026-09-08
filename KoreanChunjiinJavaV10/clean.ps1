# clean.ps1 - 빌드가 만든 것을 지운다.
#
#   .\clean.ps1           빌드 결과를 지운다 (out, dist, release, 루트로 복사한 설치 파일)
#   .\clean.ps1 -Tools    내려받은 빌드 도구(tools\ 의 WiX)까지 지운다
#   .\clean.ps1 -All      위의 것을 모두 지운다
#   .\clean.ps1 -DryRun   지우지 않고 무엇이 지워질지만 보여 준다
#
# tools\ 는 기본으로 남긴다. 40MB 를 다시 내려받아야 하고, 그 안에는
# 빌드마다 새로 만들 것이 없기 때문이다.
#
# 저장소에 들어가는 것(src, docs\images, 문서, 스크립트)은 건드리지 않는다.

param(
    [switch]$Tools,
    [switch]$All,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$withTools = $Tools -or $All
$totalBytes = 0

function Get-Size($path) {
    if (-not (Test-Path $path)) { return 0 }
    $item = Get-Item $path -Force
    if ($item.PSIsContainer) {
        $sum = (Get-ChildItem $path -Recurse -File -Force -ErrorAction SilentlyContinue |
            Measure-Object Length -Sum).Sum
        if ($sum) { return $sum } else { return 0 }
    }
    return $item.Length
}

# 있으면 지운다. 크기를 재어 얼마나 비웠는지 알려 준다.
function Remove-Target($path) {
    if (-not (Test-Path $path)) { return }
    $bytes = Get-Size $path
    $script:totalBytes += $bytes
    $mb = [math]::Round($bytes / 1MB, 1)
    if ($DryRun) {
        Write-Host ("  지울 것   {0,-34} {1,7} MB" -f $path, $mb)
    }
    else {
        Remove-Item $path -Recurse -Force
        Write-Host ("  지움      {0,-34} {1,7} MB" -f $path, $mb)
    }
}

Write-Host '빌드 결과'
foreach ($d in @('out', 'dist', 'release')) { Remove-Target $d }

# package 스크립트가 손 닿는 자리에 두려고 루트로 복사해 둔 설치 파일
$patterns = @('Chunjiin-*.exe', 'Chunjiin-*.msi', 'Chunjiin-*.dmg', 'Chunjiin-*.pkg',
              'Chunjiin-*.deb', 'Chunjiin-*.rpm', 'Chunjiin-*.zip', 'Chunjiin-*.tar.gz')
foreach ($p in $patterns) {
    Get-ChildItem $p -File -ErrorAction SilentlyContinue | ForEach-Object { Remove-Target $_.Name }
}

if ($withTools) {
    Write-Host '내려받은 빌드 도구'
    Remove-Target 'tools'
}
elseif (Test-Path 'tools') {
    $mb = [math]::Round((Get-Size 'tools') / 1MB, 1)
    Write-Host ("  남김      {0,-34} {1,7} MB   (-Tools 로 지웁니다)" -f 'tools', $mb)
}

Write-Host ''
$totalMb = [math]::Round($totalBytes / 1MB, 1)
if ($totalBytes -eq 0) {
    Write-Host '지울 것이 없습니다. 이미 깨끗합니다.'
}
elseif ($DryRun) {
    Write-Host "모두 $totalMb MB 를 지울 수 있습니다. (-DryRun 이라 지우지 않았습니다)"
}
else {
    Write-Host "모두 $totalMb MB 를 비웠습니다."
}
