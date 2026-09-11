# package.ps1 - Windows 에서 설치 파일을 만든다.
#
#   .\package.ps1              설치 프로그램 (Chunjiin-1.0.0.exe)
#   .\package.ps1 -Portable    설치 없이 풀어 쓰는 압축본만
#   .\package.ps1 -Type msi    만들 종류를 직접 고른다 (exe, msi, app-image)
#   .\package.ps1 -NoWix       WiX 가 없어도 받아 오지 않는다 (그냥 멈춘다)
#
# exe / msi 는 WiX Toolset 3.14 가 있어야 만든다.
# 없으면 **자동으로 받아서** tools\wix314 에 풀고 그대로 이어서 빌드한다.
# 관리자 권한도, .NET 3.5 도 필요 없다 (winget 판은 둘 다 요구한다).
#
# 만들어진 것은 release\ 에 놓이고, 손 닿는 자리에 두려고 프로젝트 루트로도
# 복사한다 (원본 C 판이 chunjiin-setup.exe 를 저장소 루트에 두었던 것과 같다).
#
#
# 왜 자바를 따로 깔지 않아도 되는가
# ---------------------------------
# jlink 로 이 프로그램이 실제로 쓰는 모듈만 골라 작은 자바 런타임을 만들고,
# jpackage 가 그것을 설치 파일 **안에** 넣는다.
# 그래서 받는 쪽에는 자바가 없어도 되고, 설치 중에 무엇을 더 내려받지도 않는다.
# 이미 깔린 자바가 있어도 건드리지 않는다. 버전이 서로 어긋날 일이 없다.

param(
    [switch]$Portable,
    [string]$Type = '',
    [switch]$NoWix
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
. "$PSScriptRoot\scripts\Find-Jdk.ps1"

$bin = Split-Path $script:Javac
$jdkHome = Split-Path $bin
$jlink = Join-Path $bin 'jlink.exe'
$jpackage = Join-Path $bin 'jpackage.exe'
$jdeps = Join-Path $bin 'jdeps.exe'
$jmod = Join-Path $bin 'jmod.exe'

if (-not (Test-Path $jpackage)) {
    Write-Host 'jpackage 가 없습니다. JDK 17 이상이 필요합니다.' -ForegroundColor Red
    exit 1
}

$appName = 'Chunjiin'
$appVersion = '1.0.0'
$vendor = 'SHKWON'

# MSI 는 문자열을 코드 페이지 1252 로 담고 jpackage 는 -cultures:en-us 로 고정한다.
# 그래서 설치 프로그램에 들어가는 글에 한글을 쓰면 light.exe 가 LGHT0311 로 멈춘다.
# 창 제목과 화면은 그대로 한글이고, 여기 적는 것은 설치 프로그램이 쓰는 이름뿐이다.
$description = 'Chunjiin - Korean 12-key Hangul input'
$menuGroup = 'Chunjiin'

$release = 'release'
$runtime = 'out\runtime'

if ($Portable) { $Type = 'app-image' }
if (-not $Type) { $Type = 'exe' }

# ------------------------------------------------------------------ #
# 0) WiX 확인 - exe / msi 는 WiX Toolset 3.x 가 있어야 만들 수 있다    #
# ------------------------------------------------------------------ #
#
# jpackage 는 candle.exe 와 light.exe 를 PATH 에서 찾는다.
# 이미 깔려 있으면 그것을 쓰고, 없으면 공식 바이너리 묶음을 받아서
# tools\wix314 에 풀고 그대로 이어서 빌드한다. 그 묶음은 관리자 권한도,
# .NET 3.5 도 필요 없어서 winget 설치보다 걸리는 데가 적다.

$wixLocal = Join-Path $PSScriptRoot 'tools\wix314'
$wixUrl = 'https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip'
$wixZip = Join-Path $PSScriptRoot 'tools\wix314-binaries.zip'

# WiX 한 벌이 온전한가.
# jpackage 는 candle.exe 로 컴파일하고 light.exe 로 묶으므로 둘 다 있어야 한다.
# candle.exe 만 보고 넘어가면, 받다가 끊겨 반만 풀린 폴더를 멀쩡한 것으로 알고
# 한참 뒤 jpackage 안에서 엉뚱한 소리를 내며 넘어진다.
function Test-WixDir([string]$dir) {
    if (-not $dir) { return $false }
    return (Test-Path (Join-Path $dir 'candle.exe')) -and (Test-Path (Join-Path $dir 'light.exe'))
}

function Test-Wix {
    $onPath = Get-Command candle.exe -ErrorAction SilentlyContinue
    if ($onPath -and (Test-WixDir (Split-Path $onPath.Source))) { return $true }

    $dirs = @(
        $wixLocal,
        "${env:ProgramFiles(x86)}\WiX Toolset v3.14\bin",
        "${env:ProgramFiles(x86)}\WiX Toolset v3.11\bin",
        "$env:WIX\bin"
    )
    foreach ($d in $dirs) {
        if (Test-WixDir $d) {
            $env:PATH = "$d;$env:PATH"
            return $true
        }
    }
    return $false
}

# 받아 둔 zip 이 온전한가. 받다가 끊겼거나, 프록시가 zip 대신 로그인 쪽지를
# 돌려주었어도 파일은 남는다. 열어 보아야 안다.
function Test-WixZip([string]$path) {
    if (-not (Test-Path $path)) { return $false }
    if ((Get-Item $path).Length -lt 1MB) { return $false }
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $archive = [System.IO.Compression.ZipFile]::OpenRead($path)
        try { return $archive.Entries.Count -gt 0 } finally { $archive.Dispose() }
    } catch {
        return $false
    }
}

function Show-WixHelp($reason) {
    Write-Host ''
    Write-Host 'WiX 를 갖추지 못했습니다.' -ForegroundColor Red
    if ($reason) { Write-Host "  $reason" }
    Write-Host ''
    Write-Host '  인터넷에 닿지 않는 자리라면 이렇게 하세요.'
    Write-Host "    1) 다른 기계에서 $wixUrl 을 받아"
    Write-Host "    2) $wixLocal 에 풀어 놓고 (candle.exe 가 그 폴더 바로 밑에 오게)"
    Write-Host '    3) .\package.ps1 을 다시 실행'
    Write-Host ''
    Write-Host '  설치 프로그램 없이 쓰려면   .\package.ps1 -Portable'
}

# 받아서 tools\wix314 에 놓는다.
#
# 곧바로 tools\wix314 에 풀지 않고 곁에 풀었다가 옮긴다. 푸는 중에 끊기면
# 반만 든 폴더가 남고, 그 뒤로는 그것이 멀쩡한 줄 알고 지나가 버리기 때문이다.
# (이 저장소에도 그렇게 생긴 빈 tools\wix314 가 남아 있었다.)
function Install-Wix {
    $toolsDir = Join-Path $PSScriptRoot 'tools'
    $stage = Join-Path $toolsDir ('wix314-푸는중-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Force $toolsDir | Out-Null

    try {
        # 지난번에 받다 만 것이 남아 있을 수 있다. 온전한 것만 다시 쓴다.
        if ((Test-Path $wixZip) -and -not (Test-WixZip $wixZip)) {
            Write-Host '  지난번에 받다 만 것이 있어 지웁니다.'
            Remove-Item $wixZip -Force
        }

        if (Test-Path $wixZip) {
            Write-Host "  받아 둔 것을 씁니다   $wixZip"
        } else {
            Write-Host '  받는 중 ... (40MB 남짓)'
            Write-Host "  $wixUrl"

            # 다 받기 전에는 제 이름을 주지 않는다. 중간에 끊긴 파일을
            # 다음 실행에서 멀쩡한 것으로 잘못 알면 안 된다.
            $partial = "$wixZip.part"
            if (Test-Path $partial) { Remove-Item $partial -Force }
            try {
                # 옛 PowerShell 은 TLS 1.2 를 기본으로 켜지 않아 GitHub 에 붙지 못한다
                [Net.ServicePointManager]::SecurityProtocol =
                    [Net.SecurityProtocolType]::Tls12 -bor [Net.ServicePointManager]::SecurityProtocol
                $ProgressPreference = 'SilentlyContinue'   # 진행 막대를 끄면 훨씬 빠르다
                Invoke-WebRequest -Uri $wixUrl -OutFile $partial -UseBasicParsing -TimeoutSec 300
            }
            catch {
                if (Test-Path $partial) { Remove-Item $partial -Force }
                Show-WixHelp $_.Exception.Message
                exit 1
            }

            if (-not (Test-WixZip $partial)) {
                Remove-Item $partial -Force
                Show-WixHelp '받긴 받았는데 zip 이 아닙니다. 프록시가 가로챈 것일 수 있습니다.'
                exit 1
            }
            Move-Item $partial $wixZip -Force
        }

        Write-Host '  푸는 중 ...'
        try {
            Expand-Archive -Path $wixZip -DestinationPath $stage -Force
        }
        catch {
            Show-WixHelp "푸는 데 실패했습니다. $($_.Exception.Message)"
            exit 1
        }

        if (-not (Test-WixDir $stage)) {
            Show-WixHelp '푼 것 안에 candle.exe 와 light.exe 가 없습니다.'
            exit 1
        }

        # 여기까지 왔으면 온전한 한 벌이다. 이제야 제자리에 앉힌다.
        if (Test-Path $wixLocal) { Remove-Item $wixLocal -Recurse -Force }
        Move-Item $stage $wixLocal
        Remove-Item $wixZip -Force
        Write-Host "  풀었습니다   $wixLocal"
    }
    finally {
        if (Test-Path $stage) { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

if ($Type -in @('exe', 'msi') -and -not (Test-Wix)) {
    if ($NoWix) {
        Write-Host "$Type 설치 파일은 WiX Toolset 3.14 가 있어야 만듭니다." -ForegroundColor Yellow
        Write-Host ''
        Write-Host '  받아서 쓰기 (기본)        .\package.ps1'
        Write-Host '  시스템에 깔기             winget install --id WiXToolset.WiXToolset'
        Write-Host '  설치 프로그램 없이 쓰기   .\package.ps1 -Portable'
        Write-Host ''
        exit 1
    }

    Write-Host 'WiX Toolset 이 없습니다. 받아서 씁니다.' -ForegroundColor Yellow
    Install-Wix
    if (-not (Test-Wix)) {
        Show-WixHelp '받아서 풀었는데도 candle.exe 와 light.exe 를 찾지 못했습니다.'
        exit 1
    }
}

# ------------------------------------------------------------------ #
# 1) 프로그램 빌드                                                     #
# ------------------------------------------------------------------ #
& "$PSScriptRoot\build.ps1"

if (Test-Path $release) { Remove-Item $release -Recurse -Force }
if (Test-Path $runtime) { Remove-Item $runtime -Recurse -Force }
New-Item -ItemType Directory -Force $release | Out-Null

# ------------------------------------------------------------------ #
# 2) 이 프로그램에 꼭 필요한 모듈만 담은 작은 런타임                    #
# ------------------------------------------------------------------ #
Write-Host ''
Write-Host '런타임 만드는 중 ...'

# jdeps 가 실제로 쓰는 모듈을 알려 준다. 못 알아내면 안전한 목록을 쓴다.
$modules = ''
try {
    $modules = (& $jdeps --print-module-deps --ignore-missing-deps 'dist\Chunjiin.jar') -join ''
} catch { }
if (-not $modules) { $modules = 'java.base,java.desktop,java.prefs,java.logging' }
Write-Host "  모듈   $modules"

& $jlink --add-modules $modules --output $runtime `
    --strip-debug --no-header-files --no-man-pages --compress=zip-6
if ($LASTEXITCODE -ne 0) { throw '런타임 만들기 실패' }

$mb = [math]::Round((Get-ChildItem $runtime -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)
Write-Host "  크기   $mb MB"

# ------------------------------------------------------------------ #
# 2.5) 다시 깔 때 옛 것을 먼저 지우게 만든다                           #
# ------------------------------------------------------------------ #
#
# jpackage 가 만드는 MSI 는 그대로 두면 두 가지가 아쉽다.
#
#   - ProductCode 가 이름·판에서 결정적으로 나온다. 그래서 같은 판을 다시 깔면
#     윈도우가 "같은 제품"으로 보고 고치기/제거 화면을 띄운다. 새로 깔리지 않는다.
#   - 옛 것을 찾는 조건이 "이 판보다 낮은 것"이라 같은 판은 아예 걸리지 않는다.
#
# jpackage 는 이 둘을 옵션으로 열어 주지 않는다. 대신 WiX 원본(main.wxs)을
# --resource-dir 로 바꿔치기할 수 있으므로, 지금 쓰는 JDK 안에 든 원본을 꺼내
# 딱 두 군데만 고쳐 쓴다. JDK 를 바꿔도 그때의 원본을 꺼내 쓰므로 낡지 않는다.
#
#   Id="$(var.JpProductCode)"  ->  Id="*"        빌드마다 새 제품이 된다
#   IncludeMaximum="...."      ->  "yes"         같은 판도 옛 것으로 친다
#
# 그리고 옛 것을 지우는 자리를 옮긴다. 이것이 없으면 위의 것이 다 헛일이다.
#
# jpackage 의 원본은 <RemoveExistingProducts Before="CostInitialize"/> 라고 적어
# 이 동작을 798 번에 둔다. 그런데 그 자리는 값을 찾아보는 구간(Search)이라
# 윈도우 인스톨러가 거기서는 이 동작을 돌리지 않는다. 옛 것이 걸려도 지워지지
# 않는다는 뜻이다. WiX 의 검사 도구도 같은 말을 한다.
#
#   ICE27: 'RemoveExistingProducts' Action in InstallExecuteSequence table
#          in wrong place. Current: Search, Correct: Execution
#
# 그래서 InstallValidate 바로 뒤(1401)로 옮긴다. 새 파일을 깔기 전에 옛 것을
# 먼저 지우는 자리이고, WiX 의 MajorUpgrade 가 기본으로 쓰는 자리이기도 하다.

$wixRes = 'out\wix'

function Set-UpgradeOverride {
    $srcDir = 'out\wix-src'
    foreach ($d in @($srcDir, $wixRes)) { if (Test-Path $d) { Remove-Item $d -Recurse -Force } }
    New-Item -ItemType Directory -Force $srcDir | Out-Null
    New-Item -ItemType Directory -Force $wixRes | Out-Null

    $jmodFile = Join-Path $jdkHome 'jmods\jdk.jpackage.jmod'
    if (-not (Test-Path $jmod) -or -not (Test-Path $jmodFile)) { return $false }

    # 네이티브 exe 에 2>&1 을 걸면 PowerShell 5.1 이 정상 종료도 오류로 읽는다.
    # 그래서 stderr 는 건드리지 않고 종료 코드만 본다.
    $ok = $false
    Push-Location $srcDir
    try {
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & $jmod extract $jmodFile > $null
        $ok = ($LASTEXITCODE -eq 0)
        $ErrorActionPreference = $prev
    }
    finally { Pop-Location }
    if (-not $ok) { return $false }

    $src = Join-Path $srcDir 'classes/jdk/jpackage/internal/resources/main.wxs'
    if (-not (Test-Path $src)) { return $false }

    $text = [System.IO.File]::ReadAllText($src)

    # 1) 빌드마다 새 제품이 되게, 2) 같은 판도 옛 것으로 치게
    $text = $text.Replace('Id="$(var.JpProductCode)"', 'Id="*"')
    $text = $text.Replace('IncludeMaximum="$(var.JpUpgradeVersionOnlyDetectUpgrade)"', 'IncludeMaximum="yes"')

    # 3) 똑같은 설치 파일을 조용히(무인) 다시 실행했을 때 통째로 다시 쓰게 한다.
    #    ProductCode 가 같으면 윈도우는 "이미 깔린 그 제품"으로 보고 아무것도 하지 않는다.
    #    REINSTALL=ALL 과 REINSTALLMODE=amus 를 걸어 두면 파일·바로가기·레지스트리를
    #    판을 따지지 않고 모두 새로 쓴다. 지울 때(REMOVE)는 걸지 않는다.
    $reinstall = @(
        '    <SetProperty Id="REINSTALL" Value="ALL" After="FindRelatedProducts" Sequence="both">Installed AND NOT REMOVE</SetProperty>',
        '    <SetProperty Id="REINSTALLMODE" Value="amus" After="FindRelatedProducts" Sequence="both">Installed AND NOT REMOVE</SetProperty>',
        '    <UIRef Id="JpUI"/>'
    ) -join "`r`n"
    $text = $text.Replace('    <UIRef Id="JpUI"/>', $reinstall)

    # 4) 똑같은 설치 파일을 창을 띄워 다시 실행했을 때 "고치기 / 지우기" 를 묻게 한다.
    #    jpackage 는 이 대화상자를 차례에 넣지 않는다. 그래서 그냥 두면 아무것도 묻지 않고
    #    조용히 지워 버린다. 깔려 있는 프로그램이 사라지는 것이라 그대로 둘 수 없다.
    $maintenance = @(
        '    <InstallUISequence>',
        '      <Show Dialog="MaintenanceWelcomeDlg" Before="ProgressDlg">Installed AND NOT RESUME AND NOT Preselected AND NOT PATCH</Show>'
    ) -join "`r`n"
    $text = $text.Replace('    <InstallUISequence>', $maintenance)

    # 5) 옛 것을 지우는 자리를 Search 구간에서 Execution 구간으로 옮긴다.
    #    이것을 빼먹으면 1)~2) 가 아무리 옛 것을 찾아내도 지워지지 않는다.
    $text = $text.Replace('<RemoveExistingProducts Before="CostInitialize"/>',
                          '<RemoveExistingProducts After="InstallValidate"/>')

    # 다섯 군데가 정말로 바뀌었는지 본다. 앞으로 JDK 가 원본을 바꾸면 여기서 걸린다.
    if ($text -notmatch '(?m)Id="\*"' -or
        $text -notmatch 'IncludeMaximum="yes"' -or
        $text -notmatch 'Id="REINSTALLMODE"' -or
        $text -notmatch 'MaintenanceWelcomeDlg' -or
        $text -notmatch 'RemoveExistingProducts After="InstallValidate"' -or
        $text -match 'RemoveExistingProducts Before="CostInitialize"') { return $false }

    [System.IO.File]::WriteAllText((Join-Path (Get-Location) "$wixRes\main.wxs"), $text,
        (New-Object System.Text.UTF8Encoding $false))
    return $true
}

$upgradeOverride = $false
if ($Type -in @('exe', 'msi')) {
    $upgradeOverride = Set-UpgradeOverride
    Write-Host ''
    if ($upgradeOverride) {
        Write-Host '다시 깔기 규칙 적용   옛 것을 통째로 지우고 새로 깝니다'
    }
    else {
        if (Test-Path $wixRes) { Remove-Item $wixRes -Recurse -Force }
        Write-Host '알림: JDK 에서 WiX 원본을 꺼내지 못해 다시 깔기 규칙을 넣지 못했습니다.' -ForegroundColor Yellow
        Write-Host '      (jmods 폴더가 없는 JDK 입니다) 판이 다르면 업그레이드는 그대로 됩니다.'
    }
}

# ------------------------------------------------------------------ #
# 3) 설치 파일                                                         #
# ------------------------------------------------------------------ #
Write-Host ''
Write-Host "설치 파일 만드는 중 ($Type) ..."

$jpArgs = @(
    '--name', $appName,
    '--app-version', $appVersion,
    '--vendor', $vendor,
    '--description', $description,
    '--copyright', "Copyright (C) 2026 $vendor",
    '--input', 'dist',
    '--main-jar', 'Chunjiin.jar',
    '--main-class', 'com.shkwon.chunjiin.Main',
    '--runtime-image', $runtime,
    '--dest', $release,
    '--type', $Type
)

$icon = 'src\main\resources\icons\icon.ico'
if (Test-Path $icon) { $jpArgs += @('--icon', $icon) }

# 고쳐 둔 WiX 원본을 쓰게 한다 (다시 깔 때 옛 것을 먼저 지운다)
if ($upgradeOverride) { $jpArgs += @('--resource-dir', $wixRes) }

if ($Type -in @('exe', 'msi')) {
    $jpArgs += @(
        '--win-dir-chooser',
        '--win-menu',
        '--win-shortcut',
        '--win-shortcut-prompt',
        '--win-menu-group', $menuGroup,
        '--win-per-user-install'
    )
}

& $jpackage @jpArgs
if ($LASTEXITCODE -ne 0) { throw '설치 파일 만들기 실패' }

# app-image 는 폴더로 나오므로 압축해서 하나로 만든다.
#
# Compress-Archive 는 파일을 독점해서 열기 때문에, 방금 만들어진 런타임을
# 바이러스 검사기가 아직 붙잡고 있으면 실패한다. .NET 의 ZipFile 은 읽기
# 공유로 열어 그 문제가 없다. 그래도 붙잡혀 있으면 잠깐 쉬었다 다시 해 본다.
if ($Type -eq 'app-image') {
    Write-Host '묶는 중 ...'
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $stage = Join-Path $PSScriptRoot "$release\$appName"
    $zip = Join-Path $PSScriptRoot "$release\$appName-$appVersion-win-portable.zip"
    $tmp = Join-Path $env:TEMP "$appName-$appVersion-portable.zip"

    $made = $false
    foreach ($try in 1..3) {
        try {
            if (Test-Path $tmp) { Remove-Item $tmp -Force }
            [System.IO.Compression.ZipFile]::CreateFromDirectory(
                $stage, $tmp, [System.IO.Compression.CompressionLevel]::Optimal, $true)
            $made = $true
            break
        }
        catch {
            Write-Host "  다시 해 보는 중 ($try/3) ..."
            Start-Sleep -Seconds 3
        }
    }
    if (-not $made) { throw '압축 실패 - 바이러스 검사기가 파일을 붙잡고 있을 수 있습니다.' }

    Move-Item $tmp $zip -Force
    Remove-Item $stage -Recurse -Force
}

# ------------------------------------------------------------------ #
# 4) 손 닿는 자리(프로젝트 루트)로 복사                                #
# ------------------------------------------------------------------ #
Write-Host ''
$copied = 0
foreach ($f in Get-ChildItem $release -File) {
    Copy-Item $f.FullName (Join-Path $PSScriptRoot $f.Name) -Force
    Write-Host "복사함 -> $($f.Name)"
    $copied++
}
if ($copied -eq 0) { Write-Host 'release\ 에 만들어진 파일이 없습니다.' }

Write-Host ''
Write-Host "다 됐습니다.  $release\ 와 프로젝트 루트에 있습니다."
Write-Host '  받는 쪽에 자바가 없어도 됩니다 (런타임이 안에 들어 있습니다).'
