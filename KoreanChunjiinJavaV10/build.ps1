# build.ps1 - Windows 에서 빌드한다.
#
#   .\build.ps1
#
# out\classes 에 컴파일하고 dist\Chunjiin.jar 를 만든다.
# 의존성이 하나도 없으므로 javac 와 jar 만 있으면 된다.
#
# 단계마다 무엇을 얼마나 했는지 찍는다. 무엇이 실제로 들어갔는지,
# 어디서 시간이 걸리는지 눈으로 보려는 것이다.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
. "$PSScriptRoot\scripts\Find-Jdk.ps1"

$appName = '천지인 한글 입력기'
$mainClass = 'com.shkwon.chunjiin.Main'
$jar = Join-Path $script:JdkHome 'bin\jar.exe'
$out = 'out\classes'
$dist = 'dist'
$jarPath = "$dist\Chunjiin.jar"

# 경고를 켠다. serial 만 뺀다. Swing 을 물려받은 창마다 serialVersionUID 가
# 없다고 하는데, 창을 파일로 저장할 일이 없으니 들을 것이 없다.
$lint = '-Xlint:all,-serial'

$labelWidth = 13
$ruleWidth = 64

# PowerShell 5.1 의 Out-File -Encoding utf8 은 BOM 을 붙인다.
# javac 는 @목록 파일 맨 앞의 BOM 을 파일 이름의 일부로 읽어 실패하므로
# BOM 없는 UTF-8 로 직접 쓴다.
function Write-Utf8NoBom($path, $lines) {
    $enc = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllLines((Join-Path (Get-Location) $path), [string[]]$lines, $enc)
}

# 한글은 터미널에서 두 칸을 차지한다. 글자 수로 자리를 맞추면 어긋난다.
function Get-DisplayWidth([string]$text) {
    $width = 0
    foreach ($ch in $text.ToCharArray()) {
        $code = [int]$ch
        if (($code -ge 0x1100 -and $code -le 0x115F) -or
            ($code -ge 0x2E80 -and $code -le 0xA4CF) -or
            ($code -ge 0xAC00 -and $code -le 0xD7A3) -or
            ($code -ge 0xF900 -and $code -le 0xFAFF) -or
            ($code -ge 0xFE30 -and $code -le 0xFE6F) -or
            ($code -ge 0xFF00 -and $code -le 0xFF60) -or
            ($code -ge 0xFFE0 -and $code -le 0xFFE6)) { $width += 2 } else { $width += 1 }
    }
    return $width
}

function Write-Rule { Write-Host ('─' * $ruleWidth) -ForegroundColor DarkGray }

# 왼쪽에 이름, 가운데에 내용, 오른쪽 끝에 걸린 시간.
function Write-Field($label, $value, $tail) {
    $gap = $labelWidth - (Get-DisplayWidth $label)
    if ($gap -lt 1) { $gap = 1 }
    $line = ' ' + $label + (' ' * $gap) + $value
    if ($tail) {
        $stop = $ruleWidth - 1 - (Get-DisplayWidth $tail)
        $now = Get-DisplayWidth $line
        if ($stop -gt $now) { $line += ' ' * ($stop - $now) } else { $line += '  ' }
        $line += $tail
    }
    Write-Host $line
}

function Write-Detail($text) { Write-Host ('   ' + (' ' * $labelWidth) + $text) -ForegroundColor DarkGray }

function Format-Size([long]$bytes) {
    if ($bytes -ge 1MB) { return ('{0:N1} MB' -f ($bytes / 1MB)) }
    if ($bytes -ge 1KB) { return ('{0:N1} KB' -f ($bytes / 1KB)) }
    return "$bytes B"
}

function Format-Span($stopwatch) { return ('{0:N1}초' -f $stopwatch.Elapsed.TotalSeconds) }

# 빈 칸이 든 경로가 많으므로 따옴표를 붙여 넘긴다.
function Format-Arg([string]$value) {
    if ($value -match '[\s"]') { return '"' + ($value -replace '"', '\"') + '"' }
    return $value
}

# javac 와 jar 를 부르고 두 줄기(표준 출력·표준 오류)를 다 받아 온다.
# `& exe ... 2>&1` 로 받으면 PowerShell 5.1 이 표준 오류를 오류로 잘못 읽어
# ErrorActionPreference = 'Stop' 만으로 멎어 버린다.
function Invoke-Tool([string]$exe, [string[]]$toolArgs) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $exe
    $psi.Arguments = (($toolArgs | ForEach-Object { Format-Arg $_ }) -join ' ')
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()
    return [pscustomobject]@{
        ExitCode = $proc.ExitCode
        Text     = ($stdout + $stderr).TrimEnd()
    }
}

# 클래스 파일 머리에 어느 자바로 돌릴 수 있는지 적혀 있다. 45 가 자바 1.1 이다.
function Get-ClassTarget($classFile) {
    $stream = [System.IO.File]::OpenRead($classFile)
    try {
        $head = New-Object byte[] 8
        if ($stream.Read($head, 0, 8) -lt 8) { return 0 }
        return ([int]$head[6] * 256 + [int]$head[7]) - 44
    } finally { $stream.Dispose() }
}

$whole = [System.Diagnostics.Stopwatch]::StartNew()
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'

Write-Host ''
Write-Rule
Write-Host " $appName  빌드"
Write-Rule

$jdkLine = (Invoke-Tool $script:JavaBin @('--version')).Text -split "`r?`n" | Select-Object -First 1
Write-Field 'JDK' $jdkLine
Write-Field '자리' $script:JdkHome
Write-Field '빌드 시각' $stamp
Write-Host ''

# 1) 비우기
$step = [System.Diagnostics.Stopwatch]::StartNew()
$wiped = @()
foreach ($dir in @($out, $dist)) {
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force; $wiped += $dir }
}
New-Item -ItemType Directory -Force $out | Out-Null
New-Item -ItemType Directory -Force $dist | Out-Null
$wipedText = if ($wiped.Count -gt 0) { $wiped -join '  ' } else { '지울 것이 없었습니다' }
Write-Field '비우기' $wipedText (Format-Span $step)

# 2) 자원 (아이콘, 빌드 시각)
$step = [System.Diagnostics.Stopwatch]::StartNew()
Copy-Item 'src\main\resources\*' $out -Recurse -Force
Write-Utf8NoBom "$out\build-stamp.txt" @($stamp)
$resFiles = @(Get-ChildItem 'src\main\resources' -File -Recurse)
$resBytes = ($resFiles | Measure-Object -Property Length -Sum).Sum
Write-Field '자원' ("{0}개  {1}" -f $resFiles.Count, (Format-Size $resBytes)) (Format-Span $step)
foreach ($group in ($resFiles | Group-Object { $_.Directory.Name } | Sort-Object Name)) {
    Write-Detail ("{0}  {1}개" -f $group.Name, $group.Count)
}

# 3) 컴파일
$step = [System.Diagnostics.Stopwatch]::StartNew()
$srcFiles = @(Get-ChildItem 'src\main\java' -Filter *.java -Recurse)
$srcBytes = ($srcFiles | Measure-Object -Property Length -Sum).Sum
$srcLines = ($srcFiles | ForEach-Object { (Get-Content $_.FullName).Count } | Measure-Object -Sum).Sum
Write-Field '원본' ("{0}개  {1}줄  {2}" -f $srcFiles.Count, $srcLines, (Format-Size $srcBytes))

# 상대 경로로 적는다. 오류와 경고에 그대로 찍히므로 짧을수록 읽기 좋다.
Write-Utf8NoBom 'out\sources.txt' ($srcFiles | ForEach-Object { Resolve-Path $_.FullName -Relative })
$javacRun = Invoke-Tool $script:Javac @('-encoding', 'UTF-8', $lint, '-d', $out, '@out\sources.txt')

# 오류는 그 자리에서 다 보여 준다. 어디가 잘못됐는지 알아야 고친다.
if ($javacRun.ExitCode -ne 0) {
    Write-Host ''
    if ($javacRun.Text) { Write-Host $javacRun.Text }
    Write-Host ''
    Write-Host ('컴파일 실패.  원본 {0}개 가운데 오류가 있습니다.' -f $srcFiles.Count) -ForegroundColor Red
    throw '컴파일 실패'
}

$classFiles = @(Get-ChildItem $out -Filter *.class -Recurse)
$warnings = @(($javacRun.Text -split "`r?`n") | Where-Object { $_ -match ': (warning|경고):' })
$warnText = if ($warnings.Count -gt 0) { "경고 {0}개" -f $warnings.Count } else { '경고 없음' }
Write-Field '컴파일' ("클래스 {0}개  {1}" -f $classFiles.Count, $warnText) (Format-Span $step)
Write-Detail $lint

$packages = $classFiles | Group-Object {
    $rel = $_.Directory.FullName.Substring((Resolve-Path $out).Path.Length).TrimStart('\')
    if ($rel) { $rel -replace '\\', '.' } else { '(기본)' }
} | Sort-Object Name
foreach ($group in $packages) {
    Write-Detail ("{0}  {1}개" -f $group.Name, $group.Count)
}

# 경고는 요약 뒤에 붙인다. 앞에 두면 줄줄이 흘러 단계가 안 보인다.
# 원본 발췌와 캐럿은 빼고 무엇이 어디서 났는지만 남긴다.
$here = (Get-Location).Path + '\'
foreach ($line in $warnings) {
    Write-Host ('   ' + (' ' * $labelWidth) + $line.Replace($here, '')) -ForegroundColor DarkYellow
}

$target = Get-ClassTarget $classFiles[0].FullName
Write-Field '바이트코드' ("Java {0}" -f $target)
if ($target -gt $script:JdkMinimum) {
    Write-Host ('   ' + (' ' * $labelWidth) +
        ("이 JAR 은 Java {0} 이상에서만 돕니다. JDK {1} 로는 못 돌립니다." -f $target, $script:JdkMinimum)) -ForegroundColor DarkYellow
} else {
    Write-Detail ("Java {0} 이상이면 돕니다" -f $target)
}

# 4) 실행 가능한 JAR
$step = [System.Diagnostics.Stopwatch]::StartNew()
$jarRun = Invoke-Tool $jar @('--create', '--file', $jarPath, '--main-class', $mainClass, '-C', $out, '.')
if ($jarRun.Text) { Write-Host $jarRun.Text }
if ($jarRun.ExitCode -ne 0) { throw 'JAR 만들기 실패' }

$jarBytes = (Get-Item $jarPath).Length
$entries = @(((Invoke-Tool $jar @('--list', '--file', $jarPath)).Text -split "`r?`n") | Where-Object { $_ -ne '' })
Write-Field '묶기' ("{0}  {1}  항목 {2}개" -f $jarPath, (Format-Size $jarBytes), $entries.Count) (Format-Span $step)
Write-Detail "주 클래스  $mainClass"

Write-Rule
Write-Host (" 다 됐습니다.  모두 {0}" -f (Format-Span $whole)) -ForegroundColor Green
Write-Host "   실행   .\run.ps1   또는   java -jar $jarPath"
Write-Host ''
