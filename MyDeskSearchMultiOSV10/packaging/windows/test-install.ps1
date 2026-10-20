$ErrorActionPreference = 'Stop'
$installer = Join-Path $PSScriptRoot 'install.ps1'
$root = Join-Path $env:TEMP ("desksearch-install-test-" + [guid]::NewGuid().ToString('n'))
$guid = [guid]::NewGuid().ToString('n')
$product = "HKCU:\Software\DeskSearchInstallTest\$guid"
$startup = "HKCU:\Software\DeskSearchInstallTest\$guid-Run"
$menu = Join-Path $root 'StartMenu'
$installDir = Join-Path $root 'Programs\MyDeskSearch'
$dataDir = Join-Path $root 'Roaming\MyDeskSearch'
$source = Join-Path $root 'payload'
New-Item -ItemType Directory -Force -Path $source, $menu | Out-Null
[System.IO.File]::WriteAllText((Join-Path $source 'mydesksearch.exe'), 'new-binary')

function Snap([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return '<missing>' }
    return ((Get-ChildItem -LiteralPath $Path -Recurse -Force | ForEach-Object { $_.FullName + ':' + $_.Length }) -join '|')
}

$realInstall = Join-Path $env:LOCALAPPDATA 'Programs\MyDeskSearch'
$realLegacyInstall = Join-Path $env:LOCALAPPDATA 'Programs\DeskSearch'
$realData = Join-Path $env:APPDATA 'MyDeskSearch'
$realLegacyData = Join-Path $env:APPDATA 'DeskSearch'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$beforeInstall = Snap $realInstall
$beforeLegacyInstall = Snap $realLegacyInstall
$beforeData = Snap $realData
$beforeLegacyData = Snap $realLegacyData
$beforeRun = [string](Get-ItemProperty -LiteralPath $runKey -Name MyDeskSearch -ErrorAction SilentlyContinue).MyDeskSearch
$beforeLegacyRun = [string](Get-ItemProperty -LiteralPath $runKey -Name DeskSearch -ErrorAction SilentlyContinue).DeskSearch
$script:failures = 0

function Emit([string]$Status, [double]$Seconds, [string]$Name, [string]$Detail) {
    $sec = '{0:0.000}' -f $Seconds
    $safeName = ($Name -replace '\|', '/')
    $safeDetail = (($Detail -replace '\|', '/') -replace '\s+', ' ').Trim()
    if ($safeDetail) {
        [Console]::Out.WriteLine("MYDS|$Status|$sec|$safeName|$safeDetail")
    } else {
        [Console]::Out.WriteLine("MYDS|$Status|$sec|$safeName")
    }
    [Console]::Out.Flush()
}

function Invoke-Case([string]$Name, [scriptblock]$Body) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        & $Body
        $sw.Stop()
        Emit 'PASS' $sw.Elapsed.TotalSeconds $Name ''
    } catch {
        $sw.Stop()
        $script:failures++
        Emit 'FAIL' $sw.Elapsed.TotalSeconds $Name $_.Exception.Message
    }
}

function Invoke-QuietFile([string]$File, [string[]]$ArgumentList) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $File @ArgumentList 2>&1 | Out-Null
    $script:lastCode = $LASTEXITCODE
    $ErrorActionPreference = $prev
}

function Invoke-Quiet([string[]]$ArgumentList) {
    Invoke-QuietFile $installer $ArgumentList
}

$common = @(
    '-NonInteractive', '-Isolated',
    '-InstallDir', $installDir,
    '-DataDir', $dataDir,
    '-SourceExe', (Join-Path $source 'mydesksearch.exe'),
    '-ProductRegistry', $product,
    '-UninstallRegistry', "$product\Uninstall",
    '-StartupRegistry', $startup,
    '-StartMenuDir', $menu,
    '-Version', '1.0.1'
)

try {
    Invoke-Case 'Installer offers Korean and English' {
        $scriptText = [System.IO.File]::ReadAllText($installer)
        $korean = -join (@(0xD55C, 0xAD6D, 0xC5B4) | ForEach-Object { [char]$_ })
        if ($scriptText.IndexOf($korean) -lt 0 -or $scriptText.IndexOf('English') -lt 0) {
            throw 'the installer does not offer Korean and English'
        }
    }

    Invoke-Case 'Installer rejects a directory that is not MyDeskSearch' {
        Invoke-Quiet @(
            '-NonInteractive', '-Isolated', '-Language', 'en', '-UserData', 'keep',
            '-InstallDir', (Join-Path $root 'Programs\Other'),
            '-DataDir', $dataDir,
            '-SourceExe', (Join-Path $source 'mydesksearch.exe'),
            '-ProductRegistry', $product,
            '-UninstallRegistry', "$product\Uninstall",
            '-StartupRegistry', $startup,
            '-StartMenuDir', $menu
        )
        if ($script:lastCode -eq 0) { throw 'an install directory that is not MyDeskSearch was accepted' }
    }

    Invoke-Case 'Installer rejects a missing language' {
        Invoke-Quiet @(
            '-NonInteractive', '-Isolated', '-InstallDir', $installDir,
            '-DataDir', $dataDir, '-UserData', 'keep'
        )
        if ($script:lastCode -eq 0) { throw 'missing language was accepted' }
    }

    Invoke-Case 'Fresh install writes English without a BOM' {
        Invoke-Quiet ($common + @('-Language', 'en', '-UserData', 'keep'))
        if ($script:lastCode -ne 0) { throw "installer failed ($($script:lastCode))" }
        $settings = Join-Path $dataDir 'settings.json'
        $text = [System.IO.File]::ReadAllText($settings)
        if ($text -notmatch '"Language": "en"') { throw "fresh install language was [$text]" }
        $bytes = [System.IO.File]::ReadAllBytes($settings)
        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
            throw 'settings.json was written with a BOM'
        }
        if (-not (Test-Path -LiteralPath (Join-Path $installDir 'mydesksearch.exe'))) { throw 'binary missing' }
        if (-not (Test-Path -LiteralPath (Join-Path $menu 'MyDeskSearch.lnk'))) { throw 'shortcut missing' }
        $recorded = [System.IO.Path]::GetFullPath((Get-ItemProperty -LiteralPath $product).InstallDir)
        if ($recorded -ne [System.IO.Path]::GetFullPath($installDir)) { throw "install directory was not recorded: $recorded" }
    }

    Invoke-Case 'Reinstall replaces the program and keeps user data' {
        $settings = Join-Path $dataDir 'settings.json'
        $recorded = [System.IO.Path]::GetFullPath($installDir)
        [System.IO.File]::WriteAllText((Join-Path $installDir 'old-marker.txt'), 'old')
        [System.IO.File]::WriteAllText((Join-Path $installDir 'mydesksearch.exe'), 'old-binary')
        [System.IO.File]::WriteAllText((Join-Path $dataDir 'index.db'), 'index')
        [System.IO.File]::WriteAllText((Join-Path $dataDir 'notes.txt'), 'notes')
        [System.IO.File]::WriteAllText($settings, "{`n  `"Language`": `"ko`"`n}`n")
        New-Item -Path $startup -Force | Out-Null
        Set-ItemProperty -LiteralPath $startup -Name MyDeskSearch -Value "`"$recorded\mydesksearch.exe`""
        Set-ItemProperty -LiteralPath $startup -Name DeskSearch -Value "`"$recorded\desksearch.exe`""
        Set-ItemProperty -LiteralPath $startup -Name OtherApp -Value '"C:\Other\app.exe"'
        Invoke-Quiet ($common + @('-Language', 'en', '-UserData', 'keep'))
        if ($script:lastCode -ne 0) { throw "installer failed ($($script:lastCode))" }
        if (Test-Path -LiteralPath (Join-Path $installDir 'old-marker.txt')) { throw 'old program file remained' }
        if ([System.IO.File]::ReadAllText((Join-Path $installDir 'mydesksearch.exe')) -ne 'new-binary') { throw 'binary was not replaced' }
        if ([System.IO.File]::ReadAllText($settings) -notmatch '"Language": "ko"') { throw 'kept language was overwritten' }
        if ([System.IO.File]::ReadAllText((Join-Path $dataDir 'index.db')) -ne 'index') { throw 'search index was removed' }
        if ([System.IO.File]::ReadAllText((Join-Path $dataDir 'notes.txt')) -ne 'notes') { throw 'user file was removed' }
        $run = (Get-ItemProperty -LiteralPath $startup -Name MyDeskSearch -ErrorAction SilentlyContinue).MyDeskSearch
        $legacyRun = (Get-ItemProperty -LiteralPath $startup -Name DeskSearch -ErrorAction SilentlyContinue).DeskSearch
        if ($run -or $legacyRun) { throw "startup entry remained: $run $legacyRun" }
        if ((Get-ItemProperty -LiteralPath $startup -Name OtherApp).OtherApp -notmatch 'Other') { throw 'unrelated startup entry was removed' }
    }

    Invoke-Case 'Delete removes user data and writes English' {
        $settings = Join-Path $dataDir 'settings.json'
        Invoke-Quiet ($common + @('-Language', 'en', '-UserData', 'delete'))
        if ($script:lastCode -ne 0) { throw "installer failed ($($script:lastCode))" }
        if (Test-Path -LiteralPath (Join-Path $dataDir 'index.db')) { throw 'index remained after delete' }
        if (Test-Path -LiteralPath (Join-Path $dataDir 'notes.txt')) { throw 'user file remained after delete' }
        if ([System.IO.File]::ReadAllText($settings) -notmatch '"Language": "en"') { throw 'deleted data did not start in English' }
    }

    Invoke-Case 'Uninstall while keeping data removes the program only' {
        $settings = Join-Path $dataDir 'settings.json'
        Invoke-QuietFile (Join-Path $installDir 'uninstall.ps1') @(
            '-NonInteractive', '-UserData', 'keep', '-Isolated',
            '-InstallDir', $installDir, '-DataDir', $dataDir,
            '-ProductRegistry', $product, '-UninstallRegistry', "$product\Uninstall",
            '-StartupRegistry', $startup, '-StartMenuDir', $menu
        )
        if ($script:lastCode -ne 0) { throw "uninstall keep failed ($($script:lastCode))" }
        if (Test-Path -LiteralPath $installDir) { throw 'program directory remained after uninstall' }
        if (-not (Test-Path -LiteralPath $settings)) { throw 'settings were removed while keeping data' }
        if (Test-Path -LiteralPath (Join-Path $menu 'MyDeskSearch.lnk')) { throw 'shortcut remained after uninstall' }
        if (Test-Path -LiteralPath $product) { throw 'product registry remained after uninstall' }
    }

    Invoke-Case 'Uninstall while deleting data removes the data directory' {
        Invoke-Quiet ($common + @('-Language', 'ko', '-UserData', 'keep'))
        if ($script:lastCode -ne 0) { throw "installer failed ($($script:lastCode))" }
        Invoke-QuietFile (Join-Path $installDir 'uninstall.ps1') @(
            '-NonInteractive', '-UserData', 'delete', '-Isolated',
            '-InstallDir', $installDir, '-DataDir', $dataDir,
            '-ProductRegistry', $product, '-UninstallRegistry', "$product\Uninstall",
            '-StartupRegistry', $startup, '-StartMenuDir', $menu
        )
        if ($script:lastCode -ne 0) { throw "uninstall delete failed ($($script:lastCode))" }
        if (Test-Path -LiteralPath $dataDir) { throw 'data remained after uninstall delete' }
    }
} finally {
    foreach ($key in @($product, $startup)) {
        if (Test-Path -LiteralPath $key) { Remove-Item -LiteralPath $key -Recurse -Force -ErrorAction SilentlyContinue }
    }
    $parent = 'HKCU:\Software\DeskSearchInstallTest'
    if (Test-Path -LiteralPath $parent) {
        $left = Get-ChildItem -LiteralPath $parent -ErrorAction SilentlyContinue
        if (-not $left) { Remove-Item -LiteralPath $parent -Force -ErrorAction SilentlyContinue }
    }
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
}

Invoke-Case 'Real profile and startup entries stay unchanged' {
    $afterInstall = Snap $realInstall
    $afterLegacyInstall = Snap $realLegacyInstall
    $afterData = Snap $realData
    $afterLegacyData = Snap $realLegacyData
    $afterRun = [string](Get-ItemProperty -LiteralPath $runKey -Name MyDeskSearch -ErrorAction SilentlyContinue).MyDeskSearch
    $afterLegacyRun = [string](Get-ItemProperty -LiteralPath $runKey -Name DeskSearch -ErrorAction SilentlyContinue).DeskSearch
    if ($beforeInstall -ne $afterInstall -or $beforeLegacyInstall -ne $afterLegacyInstall) { throw 'a real install directory changed' }
    if ($beforeData -ne $afterData -or $beforeLegacyData -ne $afterLegacyData) { throw 'a real data directory changed' }
    if ($beforeRun -ne $afterRun -or $beforeLegacyRun -ne $afterLegacyRun) { throw 'a real Run key changed' }
}

if ($script:failures -gt 0) { exit 1 }
exit 0
