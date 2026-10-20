# Runs every MyDeskSearch test and prints one aligned English line per result.
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

$script:passed = 0
$script:failed = 0
$script:skipped = 0
$script:failedNames = New-Object System.Collections.Generic.List[string]
$script:lastSection = ''
$script:wall = [Diagnostics.Stopwatch]::StartNew()

function Write-Rule {
    Write-Host ('  ' + ('-' * 68)) -ForegroundColor DarkCyan
}

function Write-Section([string]$Title) {
    if ($Title -eq $script:lastSection) { return }
    $script:lastSection = $Title
    Write-Host ''
    Write-Host "  $Title" -ForegroundColor Cyan
}

function Write-Row([string]$Status, [double]$Seconds, [string]$Name, [string]$Detail) {
    $timeText = if ($Status -eq 'SKIP') { '-'.PadLeft(8) } else { ('{0:0.000}s' -f $Seconds).PadLeft(8) }
    $statusColor = switch ($Status) {
        'PASS' { 'Green' }
        'FAIL' { 'Red' }
        default { 'Yellow' }
    }
    $timeColor = if ($Status -eq 'SKIP') { 'DarkGray' } elseif ($Seconds -ge 2) { 'Yellow' } else { 'Gray' }
    Write-Host '  ' -NoNewline
    Write-Host ('{0,-4}' -f $Status) -ForegroundColor $statusColor -NoNewline
    Write-Host '  ' -NoNewline
    Write-Host $timeText -ForegroundColor $timeColor -NoNewline
    Write-Host '   ' -NoNewline
    if ($Detail) {
        Write-Host $Name -ForegroundColor White -NoNewline
        Write-Host '   ' -NoNewline
        Write-Host $Detail -ForegroundColor Red
    } else {
        Write-Host $Name -ForegroundColor White
    }
}

function Add-Result([string]$Status, [double]$Seconds, [string]$Name, [string]$Detail) {
    switch ($Status) {
        'PASS' { $script:passed++ }
        'FAIL' {
            $script:failed++
            $script:failedNames.Add($Name)
        }
        default { $script:skipped++ }
    }
    Write-Row $Status $Seconds $Name $Detail
}

function Convert-Label([string]$Raw) {
    $leaf = ($Raw -split '::')[-1] -replace '_', ' '
    if ($leaf.Length -gt 0) {
        return $leaf.Substring(0, 1).ToUpper() + $leaf.Substring(1)
    }
    return $Raw
}

function Convert-Section([string]$Raw) {
    $key = if ($Raw -match '^(.*)::tests::') { $Matches[1] } else { 'features' }
    switch ($key) {
        'color' { 'Colors' }
        'debounce' { 'File watch debounce' }
        'inclusion' { 'Index scope' }
        'instance' { 'Single instance' }
        'locale' { 'Languages' }
        'paths' { 'Data paths' }
        'platform' { 'Startup entries' }
        'query' { 'Search grammar' }
        'scan' { 'Folder scan' }
        'settings' { 'Settings' }
        'text' { 'File names' }
        'volume' { 'Volumes' }
        'features' { 'Search and index' }
        default { $key }
    }
}

function Get-Version {
    $cargo = Get-Content -LiteralPath (Join-Path $root 'Cargo.toml') -Raw
    if ($cargo -match 'version\s*=\s*"([^"]+)"') { return $Matches[1] }
    return 'unknown'
}

function Convert-ToMsys([string]$Path) {
    $full = [System.IO.Path]::GetFullPath($Path)
    if ($full -match '^([A-Za-z]):\\(.*)$') {
        return '/' + $Matches[1].ToLower() + '/' + ($Matches[2] -replace '\\', '/')
    }
    return ($full -replace '\\', '/')
}

function Receive-Report([scriptblock]$Command) {
    $script:reportSaw = $false
    $script:reportCode = 0
    $script:reportLog = ''
    $log = Join-Path $env:TEMP 'mydesksearch-suite.log'
    if (Test-Path -LiteralPath $log) { Remove-Item -LiteralPath $log -Force }
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $Command 2>$log | ForEach-Object {
        $line = "$_".Trim()
        if ($line -match '^MYDS\|(PASS|FAIL|SKIP)\|([0-9]+(?:\.[0-9]+)?)\|([^|]*)(?:\|(.*))?$') {
            $script:reportSaw = $true
            $status = $Matches[1]
            $seconds = [double]$Matches[2]
            $name = $Matches[3]
            $detail = $Matches[4]
            Add-Result $status $seconds $name $detail
        }
    }
    $script:reportCode = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if (Test-Path -LiteralPath $log) {
        $script:reportLog = ((Get-Content -LiteralPath $log -Tail 1 -ErrorAction SilentlyContinue) -join ' ')
        $script:reportLog = ($script:reportLog -replace '\s+', ' ').Trim()
        if ($script:reportLog.Length -gt 90) { $script:reportLog = $script:reportLog.Substring(0, 90) + '...' }
    }
}

function Find-Bash {
    foreach ($candidate in @(
            "$env:ProgramFiles\Git\bin\bash.exe",
            "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
            "$env:LocalAppData\Programs\Git\bin\bash.exe"
        )) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    return $null
}

$version = Get-Version
Write-Host ''
Write-Host '  MyDeskSearch' -ForegroundColor Cyan
Write-Host "  Version $version" -ForegroundColor DarkCyan
Write-Host '  Feature tests' -ForegroundColor DarkCyan
Write-Rule

Write-Section 'Build'
$buildLog = Join-Path $env:TEMP 'mydesksearch-build.log'
$buildWatch = [Diagnostics.Stopwatch]::StartNew()
$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$json = @(& cargo test --workspace --offline --locked --no-run --message-format=json --color never 2> $buildLog)
$buildCode = $LASTEXITCODE
$ErrorActionPreference = $prev
$buildWatch.Stop()
if ($buildCode -ne 0) {
    $tail = ''
    if (Test-Path -LiteralPath $buildLog) {
        $tail = ((Get-Content -LiteralPath $buildLog -Tail 2) -join ' ')
        $tail = ($tail -replace '\s+', ' ').Trim()
        if ($tail.Length -gt 90) { $tail = $tail.Substring(0, 90) + '...' }
    }
    if (-not $tail) { $tail = "cargo exited with code $buildCode" }
    Add-Result 'FAIL' $buildWatch.Elapsed.TotalSeconds 'Compile test binaries' $tail
} else {
    Add-Result 'PASS' $buildWatch.Elapsed.TotalSeconds 'Compile test binaries' ''

    $exes = New-Object System.Collections.Generic.List[string]
    foreach ($line in $json) {
        $text = [string]$line
        if ($text -notmatch '^\{') { continue }
        try { $obj = $text | ConvertFrom-Json } catch { continue }
        if ($obj.reason -ne 'compiler-artifact') { continue }
        if (-not $obj.profile.test) { continue }
        if (-not $obj.executable) { continue }
        if (-not $exes.Contains([string]$obj.executable)) { [void]$exes.Add([string]$obj.executable) }
    }
    $ordered = $exes | Sort-Object {
        $path = $_.ToLower()
        if ($path -match 'features-') { 1 }
        elseif ($path -match 'mydesksearch') { 2 }
        else { 0 }
    }

    $log = Join-Path $env:TEMP 'mydesksearch-one-test.log'
    foreach ($exe in $ordered) {
        $ErrorActionPreference = 'Continue'
        $listed = @(& $exe --list --color never 2>&1)
        $ErrorActionPreference = 'Stop'
        foreach ($entry in $listed) {
            $item = "$entry".Trim()
            if ($item -notmatch ': (test|ignore)$') { continue }
            $ignored = $item.EndsWith(': ignore')
            $name = $item -replace ': (test|ignore)$', ''
            $label = Convert-Label $name
            Write-Section (Convert-Section $name)
            if ($ignored) {
                Add-Result 'SKIP' 0 $label 'ignored'
                continue
            }
            $watch = [Diagnostics.Stopwatch]::StartNew()
            $ErrorActionPreference = 'Continue'
            & $exe $name --exact --test-threads=1 --color never *> $log
            $code = $LASTEXITCODE
            $ErrorActionPreference = 'Stop'
            $watch.Stop()
            $detail = ''
            if ($code -ne 0) {
                $lines = @(Get-Content -LiteralPath $log -ErrorAction SilentlyContinue)
                $hit = $lines | Where-Object { $_ -match 'panicked|assertion|error' } | Select-Object -First 1
                if (-not $hit) { $hit = $lines | Where-Object { $_.Trim() } | Select-Object -Last 1 }
                $detail = ("$hit" -replace '\s+', ' ').Trim()
                if ($detail.Length -gt 90) { $detail = $detail.Substring(0, 90) + '...' }
                if (-not $detail) { $detail = "exited with code $code" }
            }
            if ($code -eq 0) { Add-Result 'PASS' $watch.Elapsed.TotalSeconds $label '' }
            else { Add-Result 'FAIL' $watch.Elapsed.TotalSeconds $label $detail }
        }
    }
}

Write-Section 'Windows installer'
$winScript = Join-Path $root 'packaging\windows\test-install.ps1'
Receive-Report { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $winScript }
if (-not $script:reportSaw) {
    $why = "printed no results (exit $($script:reportCode))"
    if ($script:reportLog) { $why = $script:reportLog }
    Add-Result 'FAIL' 0 'Windows installer suite' $why
}

Write-Section 'Linux and macOS installer'
$bash = Find-Bash
$unixScript = Join-Path $root 'packaging\unix\test-install.sh'
if (-not $bash) {
    Add-Result 'SKIP' 0 'Linux and macOS installer' 'Git bash was not found'
} else {
    $msysScript = Convert-ToMsys $unixScript
    Receive-Report { & $bash --noprofile --norc -c "export PATH=/usr/bin:/bin:`$PATH; stdbuf -oL bash '$msysScript'" }
    if (-not $script:reportSaw) {
        $why = "printed no results (exit $($script:reportCode))"
        if ($script:reportLog) { $why = $script:reportLog }
        Add-Result 'FAIL' 0 'Linux and macOS installer suite' $why
    }
}

$script:wall.Stop()
$total = $script:passed + $script:failed + $script:skipped
$wallText = '{0:0.000}s' -f $script:wall.Elapsed.TotalSeconds
Write-Host ''
Write-Rule
Write-Host '  Summary' -ForegroundColor Cyan
Write-Host ''
function Write-Stat([string]$Label, [string]$Value, [string]$Color) {
    Write-Host '  ' -NoNewline
    Write-Host ('{0,-14}' -f $Label) -ForegroundColor DarkGray -NoNewline
    Write-Host ('{0,8}' -f $Value) -ForegroundColor $Color
}
Write-Stat 'Passed' $script:passed 'Green'
Write-Stat 'Failed' $script:failed $(if ($script:failed -gt 0) { 'Red' } else { 'DarkGray' })
Write-Stat 'Skipped' $script:skipped 'Yellow'
Write-Stat 'Total' $total 'White'
Write-Stat 'Time' $wallText 'Cyan'
Write-Host ''
if ($script:failed -eq 0) {
    Write-Host '  Result        PASS' -ForegroundColor Green
} else {
    Write-Host '  Result        FAIL' -ForegroundColor Red
    Write-Host ''
    Write-Host '  Failed tests' -ForegroundColor Red
    foreach ($name in $script:failedNames) {
        Write-Host "    $name" -ForegroundColor Red
    }
}
Write-Host ''
Write-Rule
Write-Host ''

if ($script:failed -gt 0) { exit 1 }
exit 0
