# Find-Jdk.ps1 - javac 와 java 가 어디에 있는지 찾는다.
#
# 다른 스크립트가 `. scripts\Find-Jdk.ps1` 로 불러 쓴다.
# 찾으면 $Javac 와 $JavaBin 두 변수를 채우고, 못 찾으면 안내를 찍고 끝낸다.
#
# 찾는 차례
#   1. JAVA_HOME
#   2. PATH 위의 javac
#   3. JDK 가 흔히 놓이는 자리

$script:Javac = $null
$script:JavaBin = $null

# 1) JAVA_HOME
if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\javac.exe")) {
    $script:Javac = "$env:JAVA_HOME\bin\javac.exe"
    $script:JavaBin = "$env:JAVA_HOME\bin\java.exe"
}

# 2) PATH
if (-not $script:Javac) {
    $found = Get-Command javac.exe -ErrorAction SilentlyContinue
    if ($found) {
        $script:Javac = $found.Source
        $script:JavaBin = Join-Path (Split-Path $found.Source) 'java.exe'
    }
}

# 3) 흔한 자리
if (-not $script:Javac) {
    $roots = @(
        'C:\Program Files\Java',
        'C:\Program Files\Eclipse Adoptium',
        'C:\Program Files\Microsoft',
        'C:\Program Files\Amazon Corretto',
        'C:\Program Files\Android\openjdk',
        "$env:USERPROFILE\.jdks"
    )
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        $hit = Get-ChildItem $root -Directory -ErrorAction SilentlyContinue |
            ForEach-Object { Join-Path $_.FullName 'bin\javac.exe' } |
            Where-Object { Test-Path $_ } |
            Select-Object -First 1
        if ($hit) {
            $script:Javac = $hit
            $script:JavaBin = Join-Path (Split-Path $hit) 'java.exe'
            break
        }
    }
}

if (-not $script:Javac) {
    Write-Host 'JDK 를 찾지 못했습니다.' -ForegroundColor Red
    Write-Host ''
    Write-Host '  JDK 17 이상을 설치한 뒤 다시 해 보세요.'
    Write-Host '    winget install EclipseAdoptium.Temurin.21.JDK'
    Write-Host '    또는 https://adoptium.net'
    Write-Host ''
    Write-Host '  이미 설치했다면 JAVA_HOME 을 알려 주세요.'
    Write-Host '    $env:JAVA_HOME = "C:\Program Files\Java\jdk-21"; .\build.ps1'
    exit 1
}
