# build.ps1 - Windows 에서 빌드한다.
#
#   .\build.ps1
#
# out\classes 에 컴파일하고 dist\Chunjiin.jar 를 만든다.
# 의존성이 하나도 없으므로 javac 와 jar 만 있으면 된다.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
. "$PSScriptRoot\scripts\Find-Jdk.ps1"

# PowerShell 5.1 의 Out-File -Encoding utf8 은 BOM 을 붙인다.
# javac 는 @목록 파일 맨 앞의 BOM 을 파일 이름의 일부로 읽어 실패하므로
# BOM 없는 UTF-8 로 직접 쓴다.
function Write-Utf8NoBom($path, $lines) {
    $enc = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllLines((Join-Path (Get-Location) $path), [string[]]$lines, $enc)
}

$jar = Join-Path (Split-Path $script:Javac) 'jar.exe'
$out = 'out\classes'
$dist = 'dist'

# `--version` 은 표준 출력으로 나온다. 옛 `-version` 은 표준 오류로 나가서
# PowerShell 5.1 이 그것을 오류로 잘못 읽는다.
Write-Host "JDK    $(& $script:JavaBin --version | Select-Object -First 1)"

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Force $out | Out-Null
New-Item -ItemType Directory -Force $dist | Out-Null

# 1) 자원 (아이콘, 빌드 시각)
Copy-Item 'src\main\resources\*' $out -Recurse -Force
Write-Utf8NoBom "$out\build-stamp.txt" @(Get-Date -Format 'yyyy-MM-dd HH:mm')

# 2) 컴파일
Write-Host '컴파일 ...'
Write-Utf8NoBom 'out\sources.txt' (Get-ChildItem 'src\main\java' -Filter *.java -Recurse |
    Select-Object -ExpandProperty FullName)
& $script:Javac -encoding UTF-8 -d $out '@out\sources.txt'
if ($LASTEXITCODE -ne 0) { throw '컴파일 실패' }

# 3) 실행 가능한 JAR
Write-Host '묶는 중 ...'
& $jar --create --file "$dist\Chunjiin.jar" --main-class com.shkwon.chunjiin.Main -C $out .
if ($LASTEXITCODE -ne 0) { throw 'JAR 만들기 실패' }

Write-Host ''
Write-Host "다 됐습니다.  $dist\Chunjiin.jar"
Write-Host '  실행   .\run.ps1   또는   java -jar dist\Chunjiin.jar'
