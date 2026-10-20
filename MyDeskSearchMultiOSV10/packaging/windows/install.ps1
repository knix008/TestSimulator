# MyDeskSearch Windows installer.
# Asks for Korean or English, removes an existing program, then installs a fresh copy.
# Settings and the search index are deleted only when the user chooses that.
param(
    [ValidateSet('ko', 'en')]
    [string]$Language,
    [ValidateSet('ask', 'keep', 'delete')]
    [string]$UserData = 'ask',
    [string]$SourceExe,
    [string]$InstallDir,
    [string]$DataDir,
    [string]$Version,
    [string]$ProductRegistry = 'HKCU:\Software\MyDeskSearch',
    [string]$UninstallRegistry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MyDeskSearch',
    [string]$StartupRegistry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
    [string]$StartupValueName = 'MyDeskSearch',
    [string]$StartMenuDir,
    [switch]$NonInteractive,
    [switch]$UninstallOnly,
    [switch]$Isolated,
    [switch]$NoShortcuts
)

$ErrorActionPreference = 'Stop'

if ($Isolated) {
    if (-not $PSBoundParameters.ContainsKey('InstallDir') -or -not $PSBoundParameters.ContainsKey('DataDir')) {
        throw 'Isolated mode requires -InstallDir and -DataDir.'
    }
}

if (-not $Version) {
    $versionFile = Join-Path $PSScriptRoot 'version.txt'
    if (Test-Path -LiteralPath $versionFile) {
        $Version = (Get-Content -LiteralPath $versionFile -Raw).Trim()
    } else {
        $Version = '1.0.1'
    }
}
if (-not $InstallDir) {
    $InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\MyDeskSearch'
}
if (-not $DataDir) {
    $DataDir = Join-Path $env:APPDATA 'MyDeskSearch'
}
if (-not $StartMenuDir) {
    $StartMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
}
if (-not $SourceExe) {
    $SourceExe = Join-Path $PSScriptRoot 'mydesksearch.exe'
}

function Assert-SafeDirectory([string]$Path, [string]$Leaf) {
    $full = [System.IO.Path]::GetFullPath($Path)
    $trimmed = $full.TrimEnd('\')
    if ($trimmed -match '^[A-Za-z]:$' -or $trimmed -eq '\' -or $full -eq [System.IO.Path]::GetPathRoot($full)) {
        throw "Refusing to change $Path"
    }
    if ([System.IO.Path]::GetFileName($trimmed) -ne $Leaf) {
        throw "Refusing to change $Path"
    }
    return $full
}

function Get-Text([string]$Name) {
    $ko = @{
        Reinstall = "이미 설치된 MyDeskSearch가 있습니다.`r`n프로그램 파일을 모두 지운 다음 새로 설치합니다."
        AskData  = "설정과 검색 인덱스를 삭제할까요?`r`n유지하면 앱에 저장된 언어도 그대로 남습니다.`r`n삭제하면 지금 고른 언어로 시작합니다."
        Keep     = '유지'
        Delete   = '삭제'
        Done     = 'MyDeskSearch를 설치했습니다.'
        Removed  = 'MyDeskSearch를 제거했습니다.'
        Cancel   = '취소'
        NeedFile = '설치할 mydesksearch.exe 를 찾지 못했습니다.'
        Denied   = '프로그램 파일을 지우지 못했습니다. 관리자 권한으로 설치 프로그램을 다시 실행하세요.'
    }
    $en = @{
        Reinstall = "MyDeskSearch is already installed.`r`nIts program files will be removed and installed again."
        AskData  = "Delete settings and the search index?`r`nKeep leaves the language saved in the app.`r`nDelete starts in the language you just chose."
        Keep     = 'Keep'
        Delete   = 'Delete'
        Done     = 'MyDeskSearch is installed.'
        Removed  = 'MyDeskSearch was removed.'
        Cancel   = 'Cancel'
        NeedFile = 'mydesksearch.exe was not found.'
        Denied   = 'The program files could not be removed. Run the installer again as administrator.'
    }
    $table = if ($Language -eq 'en') { $en } else { $ko }
    return $table[$Name]
}

function Read-SavedLanguage {
    $settings = Join-Path $DataDir 'settings.json'
    if (-not (Test-Path -LiteralPath $settings)) { return $null }
    try {
        $raw = [System.IO.File]::ReadAllText($settings)
        $parsed = $raw | ConvertFrom-Json
        if ($parsed.Language -eq 'en' -or $parsed.Language -eq 'ko') { return [string]$parsed.Language }
    } catch {
        return $null
    }
    return $null
}

function Get-LegacyDataDir {
    if ($Isolated) { return $null }
    $legacy = [System.IO.Path]::GetFullPath((Join-Path $env:APPDATA 'DeskSearch'))
    if ($legacy -eq $DataDir) { return $null }
    return $legacy
}

function Test-HasFiles([string]$Path) {
    if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return $false }
    return $null -ne (Get-ChildItem -LiteralPath $Path -Force | Select-Object -First 1)
}

function Test-DataPresent {
    if (Test-HasFiles $DataDir) { return $true }
    return Test-HasFiles (Get-LegacyDataDir)
}

function Get-RemoveDirs {
    $dirs = New-Object System.Collections.Generic.List[string]
    [void]$dirs.Add($InstallDir)
    if (-not $Isolated) {
        foreach ($extra in @(
                (Join-Path $env:LOCALAPPDATA 'Programs\MyDeskSearch'),
                (Join-Path $env:LOCALAPPDATA 'Programs\DeskSearch'),
                (Join-Path $env:ProgramFiles 'MyDeskSearch'),
                (Join-Path $env:ProgramFiles 'DeskSearch'),
                $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} 'MyDeskSearch' }),
                $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} 'DeskSearch' })
            )) {
            if ($extra) {
                $full = [System.IO.Path]::GetFullPath($extra)
                if (-not $dirs.Contains($full)) { [void]$dirs.Add($full) }
            }
        }
        if (Test-Path -LiteralPath $ProductRegistry) {
            $recorded = (Get-ItemProperty -LiteralPath $ProductRegistry -Name InstallDir -ErrorAction SilentlyContinue).InstallDir
            if ($recorded) {
                $full = [System.IO.Path]::GetFullPath([string]$recorded)
                $leaf = Split-Path -Leaf $full.TrimEnd('\')
                if (($leaf -eq 'MyDeskSearch' -or $leaf -eq 'DeskSearch') -and -not $dirs.Contains($full)) {
                    [void]$dirs.Add($full)
                }
            }
        }
    }
    return $dirs
}

function Test-ProgramPresent {
    foreach ($dir in (Get-RemoveDirs)) {
        if ((Test-Path -LiteralPath (Join-Path $dir 'mydesksearch.exe')) -or (Test-Path -LiteralPath (Join-Path $dir 'desksearch.exe'))) { return $true }
    }
    return $false
}

function Show-LanguageDialog {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'MyDeskSearch'
    $form.ClientSize = New-Object System.Drawing.Size(420, 170)
    $form.FormBorderStyle = 'FixedDialog'
    $form.StartPosition = 'CenterScreen'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $label = New-Object System.Windows.Forms.Label
    $label.Text = "Select a language.`r`n언어를 선택하세요."
    $label.Location = New-Object System.Drawing.Point(16, 16)
    $label.Size = New-Object System.Drawing.Size(380, 40)
    $ko = New-Object System.Windows.Forms.RadioButton
    $ko.Text = '한국어'
    $ko.Location = New-Object System.Drawing.Point(16, 68)
    $ko.Size = New-Object System.Drawing.Size(160, 24)
    $ko.Checked = $true
    $en = New-Object System.Windows.Forms.RadioButton
    $en.Text = 'English'
    $en.Location = New-Object System.Drawing.Point(190, 68)
    $en.Size = New-Object System.Drawing.Size(160, 24)
    $ok = New-Object System.Windows.Forms.Button
    $ok.Text = 'OK'
    $ok.Location = New-Object System.Drawing.Point(220, 120)
    $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = 'Cancel'
    $cancel.Location = New-Object System.Drawing.Point(310, 120)
    $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Controls.AddRange(@($label, $ko, $en, $ok, $cancel))
    $form.AcceptButton = $ok
    $form.CancelButton = $cancel
    $result = $form.ShowDialog()
    $selected = if ($en.Checked) { 'en' } else { 'ko' }
    $form.Dispose()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 }
    return $selected
}

function Show-DataDialog {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'MyDeskSearch'
    $form.ClientSize = New-Object System.Drawing.Size(460, 230)
    $form.FormBorderStyle = 'FixedDialog'
    $form.StartPosition = 'CenterScreen'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $label = New-Object System.Windows.Forms.Label
    $label.Text = (Get-Text 'Reinstall') + "`r`n`r`n" + (Get-Text 'AskData')
    $label.Location = New-Object System.Drawing.Point(16, 16)
    $label.Size = New-Object System.Drawing.Size(428, 130)
    $keep = New-Object System.Windows.Forms.Button
    $keep.Text = Get-Text 'Keep'
    $keep.Location = New-Object System.Drawing.Point(230, 170)
    $keep.Size = New-Object System.Drawing.Size(90, 28)
    $keep.DialogResult = [System.Windows.Forms.DialogResult]::Yes
    $delete = New-Object System.Windows.Forms.Button
    $delete.Text = Get-Text 'Delete'
    $delete.Location = New-Object System.Drawing.Point(330, 170)
    $delete.Size = New-Object System.Drawing.Size(90, 28)
    $delete.DialogResult = [System.Windows.Forms.DialogResult]::No
    $form.Controls.AddRange(@($label, $keep, $delete))
    $form.AcceptButton = $keep
    $result = $form.ShowDialog()
    $form.Dispose()
    if ($result -eq [System.Windows.Forms.DialogResult]::No) { return 'delete' }
    if ($result -eq [System.Windows.Forms.DialogResult]::Yes) { return 'keep' }
    exit 1
}

function Resolve-Choices {
    if ($UninstallOnly -and -not $Language) {
        $saved = Read-SavedLanguage
        if ($saved) { $script:Language = $saved } else { $script:Language = 'ko' }
    }
    if (-not $Language) {
        if ($NonInteractive) { throw 'Pass -Language ko or -Language en.' }
        $script:Language = Show-LanguageDialog
    }
    $needsDataChoice = (Test-ProgramPresent) -or (Test-DataPresent)
    if ($needsDataChoice -and $UserData -eq 'ask') {
        if ($NonInteractive) { throw 'Pass -UserData keep or -UserData delete.' }
        $script:UserData = Show-DataDialog
    } elseif ($UserData -eq 'ask') {
        $script:UserData = 'keep'
    }
}

function Stop-InstalledProcesses {
    $roots = @(Get-RemoveDirs | ForEach-Object { $_.TrimEnd('\') + '\' })
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'mydesksearch.exe' OR Name = 'desksearch.exe'" -ErrorAction SilentlyContinue
    foreach ($process in $processes) {
        $exe = [string]$process.ExecutablePath
        if (-not $exe) { continue }
        foreach ($root in $roots) {
            if ($exe.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
                Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
                break
            }
        }
    }
}

function Remove-Tree([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $leaf = [System.IO.Path]::GetFileName($Path.TrimEnd('\'))
    if ($leaf -ne 'MyDeskSearch' -and $leaf -ne 'DeskSearch') {
        throw "Refusing to change $Path"
    }
    try {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
    } catch {
        throw (Get-Text 'Denied')
    }
}

function Remove-StartupEntry {
    if (-not (Test-Path -LiteralPath $StartupRegistry)) { return }
    foreach ($name in @($StartupValueName, 'MyDeskSearch', 'DeskSearch')) {
        $current = (Get-ItemProperty -LiteralPath $StartupRegistry -Name $name -ErrorAction SilentlyContinue).$name
        if (-not $current) { continue }
        $text = [string]$current
        foreach ($dir in (Get-RemoveDirs)) {
            if ($text.IndexOf($dir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
                Remove-ItemProperty -LiteralPath $StartupRegistry -Name $name -ErrorAction SilentlyContinue
                break
            }
        }
    }
}

function Remove-Shortcuts {
    foreach ($name in @('MyDeskSearch.lnk', 'DeskSearch.lnk')) {
        $link = Join-Path $StartMenuDir $name
        if (Test-Path -LiteralPath $link) {
            Remove-Item -LiteralPath $link -Force
        }
    }
}

function Remove-ProgramFiles {
    Stop-InstalledProcesses
    Remove-Shortcuts
    Remove-StartupEntry
    foreach ($dir in (Get-RemoveDirs)) {
        Remove-Tree $dir
    }
    $keys = @($ProductRegistry, $UninstallRegistry)
    if (-not $Isolated) {
        $keys += 'HKCU:\Software\DeskSearch'
        $keys += 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\DeskSearch'
    }
    foreach ($key in $keys) {
        if (Test-Path -LiteralPath $key) {
            Remove-Item -LiteralPath $key -Recurse -Force
        }
    }
}

function Write-Utf8([string]$Path, [string]$Text) {
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Text, $utf8)
}

function Copy-Program {
    if (-not (Test-Path -LiteralPath $SourceExe)) { throw (Get-Text 'NeedFile') }
    $stage = Join-Path $env:TEMP ("mydesksearch-setup-" + [guid]::NewGuid().ToString('n'))
    New-Item -ItemType Directory -Path $stage | Out-Null
    try {
        Copy-Item -LiteralPath $SourceExe -Destination (Join-Path $stage 'mydesksearch.exe')
        foreach ($name in @('install.ps1', 'uninstall.ps1', 'install.cmd')) {
            $source = Join-Path $PSScriptRoot $name
            if (Test-Path -LiteralPath $source) {
                Copy-Item -LiteralPath $source -Destination (Join-Path $stage $name)
            }
        }
        Write-Utf8 (Join-Path $stage 'version.txt') $Version
        Remove-ProgramFiles
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        Copy-Item -Path (Join-Path $stage '*') -Destination $InstallDir
    } finally {
        if (Test-Path -LiteralPath $stage) {
            Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Register-Install {
    New-Item -Path $ProductRegistry -Force | Out-Null
    Set-ItemProperty -LiteralPath $ProductRegistry -Name InstallDir -Value $InstallDir
    Set-ItemProperty -LiteralPath $ProductRegistry -Name DataDir -Value $DataDir
    Set-ItemProperty -LiteralPath $ProductRegistry -Name Version -Value $Version

    New-Item -Path $UninstallRegistry -Force | Out-Null
    $uninstall = Join-Path $InstallDir 'uninstall.ps1'
    $command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$uninstall`""
    Set-ItemProperty -LiteralPath $UninstallRegistry -Name DisplayName -Value 'MyDeskSearch'
    Set-ItemProperty -LiteralPath $UninstallRegistry -Name DisplayVersion -Value $Version
    Set-ItemProperty -LiteralPath $UninstallRegistry -Name Publisher -Value 'MyDeskSearch'
    Set-ItemProperty -LiteralPath $UninstallRegistry -Name InstallLocation -Value $InstallDir
    Set-ItemProperty -LiteralPath $UninstallRegistry -Name UninstallString -Value $command
    Set-ItemProperty -LiteralPath $UninstallRegistry -Name DisplayIcon -Value (Join-Path $InstallDir 'mydesksearch.exe')
    Set-ItemProperty -LiteralPath $UninstallRegistry -Name NoModify -Value 1 -Type DWord
    Set-ItemProperty -LiteralPath $UninstallRegistry -Name NoRepair -Value 1 -Type DWord

    if (-not $NoShortcuts) {
        New-Item -ItemType Directory -Path $StartMenuDir -Force | Out-Null
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut((Join-Path $StartMenuDir 'MyDeskSearch.lnk'))
        $shortcut.TargetPath = Join-Path $InstallDir 'mydesksearch.exe'
        $shortcut.WorkingDirectory = $InstallDir
        $shortcut.Description = 'MyDeskSearch'
        $shortcut.Save()
    }
}

function Set-UserData {
    $settings = Join-Path $DataDir 'settings.json'
    $legacy = Get-LegacyDataDir
    if ($UserData -eq 'delete') {
        if (Test-Path -LiteralPath $DataDir) {
            Remove-Item -LiteralPath $DataDir -Recurse -Force
        }
        if ($legacy -and (Test-Path -LiteralPath $legacy)) {
            Remove-Item -LiteralPath $legacy -Recurse -Force
        }
    } elseif ($legacy -and -not (Test-Path -LiteralPath $DataDir) -and (Test-Path -LiteralPath $legacy)) {
        $parent = Split-Path -Parent $DataDir
        if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        Move-Item -LiteralPath $legacy -Destination $DataDir
    }
    if ($UninstallOnly) { return }
    if ($UserData -eq 'delete' -or -not (Test-Path -LiteralPath $settings)) {
        New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
        Write-Utf8 $settings ("{`n  `"Language`": `"$Language`"`n}`n")
    }
}

$InstallDir = Assert-SafeDirectory $InstallDir 'MyDeskSearch'
$DataDir = Assert-SafeDirectory $DataDir 'MyDeskSearch'

Resolve-Choices
if ($UninstallOnly) {
    Remove-ProgramFiles
    Set-UserData
    if (-not $NonInteractive) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show((Get-Text 'Removed'), 'MyDeskSearch') | Out-Null
    }
    Write-Host (Get-Text 'Removed')
    exit 0
}

Copy-Program
Register-Install
Set-UserData
if (-not $NonInteractive) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show((Get-Text 'Done'), 'MyDeskSearch') | Out-Null
}
Write-Host (Get-Text 'Done')
exit 0
