# Find-Jdk.ps1 - 쓸 만한 JDK 를 찾아 환경을 맞춰 준다. 없으면 설치까지 한다.
#
# 다른 스크립트가 `. scripts\Find-Jdk.ps1` 로 불러 쓴다.
# 찾으면 $Javac, $JavaBin, $JdkHome, $JdkMajor 를 채우고 $env:JAVA_HOME 과
# $env:PATH 도 그 JDK 로 맞춘다.
#
# 이 프로그램은 텍스트 블록(Java 15) 과 instanceof 패턴(Java 16) 을 쓰므로
# JDK 17 이상이라야 한다. 그래서 처음 만난 javac 를 그냥 쓰지 않는다.
# 후보를 모두 모아 버전을 확인한 뒤 조건에 맞는 것만 고른다.
# 옛 JDK 가 PATH 앞자리에 있어도 알아서 비켜 간다.
#
# 고르는 차례
#   1. JAVA_HOME          (17 이상일 때만)
#   2. PATH 위의 javac    (17 이상일 때만)
#   3. JDK 가 흔히 놓이는 자리 가운데 가장 높은 버전
#
# 하나도 없으면 winget 으로 설치할지 물어본다. 묻지 말고 바로 깔게 하려면
#   $env:CHUNJIIN_INSTALL_JDK = '1'
# 손대지 못하게 하려면
#   $env:CHUNJIIN_INSTALL_JDK = 'no'

$script:JdkMinimum = 17
$script:JdkPackage = 'EclipseAdoptium.Temurin.21.JDK'

$script:Javac = $null
$script:JavaBin = $null
$script:JdkHome = $null
$script:JdkMajor = 0

# '1.8.0_302' 는 8, '23.0.1' 은 23. 자바 9 에서 번호 매기는 법이 바뀌었다.
function ConvertTo-JdkMajor([string]$version) {
    if ($version -match '^1\.(\d+)') { return [int]$Matches[1] }
    if ($version -match '^(\d+)') { return [int]$Matches[1] }
    return 0
}

function Get-JdkMajor([string]$javacPath) {
    # 1) release 파일. JDK 안에 늘 들어 있고 프로그램을 띄우지 않아도 되므로 빠르다.
    $jdkDir = Split-Path (Split-Path $javacPath)
    $releaseFile = Join-Path $jdkDir 'release'
    if (Test-Path $releaseFile) {
        foreach ($line in (Get-Content $releaseFile -ErrorAction SilentlyContinue)) {
            if ($line -match '^JAVA_VERSION="?([^"]+)"?') {
                $major = ConvertTo-JdkMajor $Matches[1]
                if ($major -gt 0) { return $major }
            }
        }
    }

    # 2) 물어본다. javac 8 은 -version 을 표준 오류로 내고 PowerShell 5.1 은
    #    그것을 오류로 잘못 읽으므로, 프로세스를 직접 띄워 두 줄기를 다 받는다.
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $javacPath
        $psi.Arguments = '-version'
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $proc = [System.Diagnostics.Process]::Start($psi)
        $text = $proc.StandardOutput.ReadToEnd() + $proc.StandardError.ReadToEnd()
        $proc.WaitForExit()
        if ($text -match 'javac\s+([0-9][0-9._]*)') { return ConvertTo-JdkMajor $Matches[1] }
    } catch { }

    return 0
}

function Get-JdkCandidatePath {
    $list = New-Object System.Collections.ArrayList

    if ($env:JAVA_HOME) {
        [void]$list.Add(@{ Path = "$env:JAVA_HOME\bin\javac.exe"; Origin = 'JAVA_HOME' })
    }

    $onPath = Get-Command javac.exe -ErrorAction SilentlyContinue
    if ($onPath) { [void]$list.Add(@{ Path = $onPath.Source; Origin = 'PATH' }) }

    $roots = @(
        'C:\Program Files\Java',
        'C:\Program Files\Eclipse Adoptium',
        'C:\Program Files\Eclipse Foundation',
        'C:\Program Files\Microsoft',
        'C:\Program Files\Amazon Corretto',
        'C:\Program Files\Zulu',
        'C:\Program Files\BellSoft',
        'C:\Program Files\Semeru',
        'C:\Program Files\RedHat',
        'C:\Program Files\Android\openjdk',
        "$env:LOCALAPPDATA\Programs\Eclipse Adoptium",
        "$env:USERPROFILE\.jdks"
    )
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        foreach ($dir in (Get-ChildItem $root -Directory -ErrorAction SilentlyContinue)) {
            [void]$list.Add(@{ Path = (Join-Path $dir.FullName 'bin\javac.exe'); Origin = '흔한 자리' })
        }
    }

    return $list
}

# 이 컴퓨터에 있는 JDK 를 모두 찾아 버전을 매겨 돌려준다.
# 설치한 뒤 다시 부를 수 있어야 하므로 함수로 두었다.
function Find-InstalledJdk {
    $seen = @{}
    $out = New-Object System.Collections.ArrayList
    foreach ($cand in (Get-JdkCandidatePath)) {
        if (-not (Test-Path $cand.Path)) { continue }
        $full = (Resolve-Path $cand.Path).Path
        if ($seen.ContainsKey($full)) { continue }
        $seen[$full] = $true
        [void]$out.Add([pscustomobject]@{
            Javac  = $full
            Origin = $cand.Origin
            Major  = (Get-JdkMajor $full)
        })
    }
    return , $out
}

# 사람이 시킨 것(JAVA_HOME, PATH)을 먼저 존중하고,
# 그것들이 너무 낡았으면 찾아 둔 것 가운데 가장 높은 버전으로 넘어간다.
function Select-Jdk($found) {
    $usable = @($found | Where-Object { $_.Major -ge $script:JdkMinimum })
    $pick = $usable | Where-Object { $_.Origin -eq 'JAVA_HOME' } | Select-Object -First 1
    if (-not $pick) { $pick = $usable | Where-Object { $_.Origin -eq 'PATH' } | Select-Object -First 1 }
    if (-not $pick) { $pick = $usable | Sort-Object Major -Descending | Select-Object -First 1 }
    return $pick
}

function Show-JdkProblem($found) {
    $tooOld = @($found | Where-Object { $_.Major -gt 0 })
    if ($tooOld.Count -gt 0) {
        Write-Host "JDK $script:JdkMinimum 이상이 필요한데 찾지 못했습니다." -ForegroundColor Red
        Write-Host ''
        Write-Host '  이 컴퓨터에 있는 것은 이것뿐입니다.'
        foreach ($old in $tooOld) {
            Write-Host ("    JDK {0,-3} {1}  ({2})" -f `
                $old.Major, (Split-Path (Split-Path $old.Javac)), $old.Origin)
        }
        Write-Host ''
        Write-Host '  이 프로그램은 텍스트 블록과 instanceof 패턴을 쓰므로 옛 JDK 로는 컴파일되지 않습니다.'
    } else {
        Write-Host 'JDK 가 설치되어 있지 않습니다.' -ForegroundColor Red
        Write-Host ''
        Write-Host '  JDK 가 아니라 JRE 만 깔려 있어도 javac 가 없어 이렇게 됩니다.'
    }
}

function Show-JdkHelp {
    Write-Host ''
    Write-Host "  JDK $script:JdkMinimum 이상을 설치한 뒤 다시 해 보세요."
    Write-Host "    winget install $script:JdkPackage"
    Write-Host '    또는 https://adoptium.net 에서 받아 설치'
    Write-Host ''
    Write-Host '  이미 설치했다면 JAVA_HOME 을 알려 주세요.'
    Write-Host '    $env:JAVA_HOME = "C:\Program Files\Java\jdk-21"; .\build.ps1'
}

# winget 으로 깔아 준다. 깔았으면 $true.
function Install-Jdk {
    if ($env:CHUNJIIN_INSTALL_JDK -eq 'no') { return $false }

    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        Write-Host ''
        Write-Host '  winget 이 없어 대신 깔아 드리지는 못합니다.' -ForegroundColor DarkYellow
        return $false
    }

    if ($env:CHUNJIIN_INSTALL_JDK -ne '1') {
        # 사람이 없는 자리(CI, 파이프)에서 물으면 아무도 답하지 않아 그대로 멎는다.
        # 표준 입력이 딴 데로 이어져 있으면 묻지 않고 넘어간다.
        # 묻지 않고 바로 깔게 하려면 CHUNJIIN_INSTALL_JDK=1.
        $canAsk = $true
        try { $canAsk = -not [Console]::IsInputRedirected } catch { $canAsk = $false }
        if (-not $canAsk) {
            Write-Host ''
            Write-Host '  물어볼 자리가 아니어서 설치하지 않았습니다.' -ForegroundColor DarkYellow
            Write-Host '  묻지 말고 깔게 하려면  $env:CHUNJIIN_INSTALL_JDK = ''1'''
            return $false
        }

        Write-Host ''
        $answer = ''
        try { $answer = Read-Host "지금 winget 으로 $script:JdkPackage 를 설치할까요? (y/N)" } catch { }
        if ($answer -notmatch '^\s*[yY]') {
            Write-Host '  설치하지 않았습니다.'
            return $false
        }
    }

    Write-Host ''
    Write-Host 'JDK 를 설치합니다. 관리자 권한을 묻는 창이 뜰 수 있습니다 ...'

    # winget 은 진행 상황을 표준 오류로도 뱉는다. 부르는 쪽이 ErrorActionPreference
    # 를 Stop 으로 두었으면 그것만으로 멎어 버리므로 잠시 풀어 둔다.
    $keep = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $winget.Source install --exact --id $script:JdkPackage `
            --accept-package-agreements --accept-source-agreements
    } finally {
        $ErrorActionPreference = $keep
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host "winget 이 설치를 마치지 못했습니다. (종료 코드 $LASTEXITCODE)" -ForegroundColor Red
        return $false
    }

    Write-Host ''
    Write-Host '설치했습니다. 이어서 합니다.' -ForegroundColor Green
    return $true
}

$found = Find-InstalledJdk
$pick = Select-Jdk $found

if (-not $pick) {
    Show-JdkProblem $found
    if (Install-Jdk) {
        # 방금 깐 것은 이 셸의 PATH 에 아직 없다. 하지만 '흔한 자리' 를
        # 다시 훑으면 나온다.
        $found = Find-InstalledJdk
        $pick = Select-Jdk $found
        if (-not $pick) {
            Write-Host ''
            Write-Host '설치는 됐는데 그 JDK 를 찾지 못했습니다.' -ForegroundColor Red
        }
    }
}

if (-not $pick) {
    Show-JdkHelp
    Write-Host ''
    # exit 로는 안 된다. 이 파일은 점 소싱으로 불려 오므로 exit 는 이 파일만
    # 끝낼 뿐, 부르는 build.ps1 은 그대로 이어 가다 엉뚱한 데서 넘어진다.
    # throw 라야 부르는 쪽까지 멎는다.
    throw "쓸 수 있는 JDK $script:JdkMinimum 이상을 찾지 못했습니다."
}

$script:Javac = $pick.Javac
$script:JdkHome = Split-Path (Split-Path $pick.Javac)
$script:JavaBin = Join-Path $script:JdkHome 'bin\java.exe'
$script:JdkMajor = $pick.Major

# 비켜 간 것이 있으면 말해 준다. 아무 말 없이 다른 JDK 를 쓰면
# 왜 그런지 몰라 헤매게 된다.
foreach ($skipped in $found) {
    if ($skipped.Major -ge $script:JdkMinimum) { continue }
    if ($skipped.Origin -eq '흔한 자리') { continue }
    Write-Host ("{0} 의 JDK {1} 은 너무 낡아 건너뜁니다.  {2}" -f `
        $skipped.Origin, $skipped.Major, (Split-Path (Split-Path $skipped.Javac))) -ForegroundColor DarkYellow
}

# 이 셸에서 이어 도는 것들 - jpackage, jlink, 자식 프로세스 - 이 모두
# 같은 JDK 를 보도록 환경을 맞춘다.
$env:JAVA_HOME = $script:JdkHome
$env:PATH = "$script:JdkHome\bin;$env:PATH"
