# test.ps1 - 시험을 돌린다.
#
#   .\test.ps1            엔진 회귀 시험 584항목 (항목마다 PASS/FAIL 과 요약)
#   .\test.ps1 -q         실패한 항목과 요약만
#   .\test.ps1 -App       엔진 시험 뒤에 창까지 띄우는 화면 시험 18항목
#   .\test.ps1 -OnlyApp   화면 시험만
#
# 엔진 시험은 창을 띄우지 않으므로 화면 없는 서버에서도 돈다.
# 화면 시험은 창을 띄우고 Robot 으로 키를 눌러 보므로 화면이 있어야 한다.

param(
    [switch]$App,
    [switch]$OnlyApp,
    [switch]$Shots,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
. "$PSScriptRoot\scripts\Find-Jdk.ps1"

# PowerShell 5.1 의 Out-File -Encoding utf8 은 BOM 을 붙인다.
# javac 는 @목록 파일 맨 앞의 BOM 을 파일 이름의 일부로 읽어 실패한다.
function Write-Utf8NoBom($path, $lines) {
    $enc = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllLines((Join-Path (Get-Location) $path), [string[]]$lines, $enc)
}

# 콘솔이 한글과 색을 제대로 받도록
$prevEnc = [Console]::OutputEncoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    $out = 'out\test-classes'
    if (Test-Path $out) { Remove-Item $out -Recurse -Force }
    New-Item -ItemType Directory -Force $out | Out-Null

    Write-Utf8NoBom 'out\test-sources.txt' (Get-ChildItem 'src\main\java', 'src\test\java' -Filter *.java -Recurse |
        Select-Object -ExpandProperty FullName)
    & $script:Javac -encoding UTF-8 -d $out '@out\test-sources.txt'
    if ($LASTEXITCODE -ne 0) { throw '컴파일 실패' }
    Copy-Item 'src\main\resources\*' $out -Recurse -Force

    $status = 0

    if (-not $OnlyApp -and -not $Shots) {
        & $script:JavaBin '-Dfile.encoding=UTF-8' -cp $out com.shkwon.chunjiin.EngineTest @Rest
        $status = $LASTEXITCODE
    }

    if (($App -or $OnlyApp) -and $status -eq 0) {
        Write-Host ''
        & $script:JavaBin '-Dfile.encoding=UTF-8' -cp $out com.shkwon.chunjiin.AppSmokeTest
        $status = $LASTEXITCODE
    }

    if ($Shots -and $status -eq 0) {
        Write-Host ''
        & $script:JavaBin '-Dfile.encoding=UTF-8' -cp $out com.shkwon.chunjiin.Screenshots
        $status = $LASTEXITCODE
    }

    exit $status
}
finally {
    [Console]::OutputEncoding = $prevEnc
}
