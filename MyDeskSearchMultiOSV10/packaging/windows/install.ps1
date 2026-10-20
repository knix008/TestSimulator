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
    [string]$DesktopDir,
    [ValidateSet('ask', 'yes', 'no')]
    [string]$Shortcuts = 'ask',
    [string]$LegacyDir,
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
if (-not $DesktopDir) {
    if ($Isolated) { throw 'Isolated mode requires -DesktopDir.' }
    $DesktopDir = [Environment]::GetFolderPath('Desktop')
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
        WindowTitle = 'MyDeskSearch 설치'
        WizardSubtitle = '설치 마법사'
        WelcomeHeading = 'MyDeskSearch 설치를 시작합니다'
        WelcomeBody = "이 마법사가 컴퓨터에 MyDeskSearch를 설치합니다.`r`n계속하려면 다음을 누르세요."
        UninstallHeading = 'MyDeskSearch를 제거합니다'
        UninstallBody = "이 컴퓨터에서 MyDeskSearch를 제거합니다.`r`n계속하려면 제거를 누르세요."
        LanguageLabel = '언어'
        OptionsHeading = '설치 옵션'
        OptionsIntro = '추가 작업을 선택하세요.'
        Reinstall = "이미 설치된 MyDeskSearch가 있습니다.`r`n프로그램 파일을 모두 지운 다음 새로 설치합니다."
        AskData  = "설정과 검색 인덱스를 어떻게 할까요?`r`n유지하면 앱에 저장된 언어도 그대로 남습니다.`r`n삭제하면 지금 고른 언어로 시작합니다."
        DataHeading = '설정과 검색 인덱스'
        Keep     = '유지'
        Delete   = '삭제'
        ShortcutsHeading = '바로 가기'
        DesktopShortcut = '바탕 화면에 바로 가기 만들기'
        StartMenuShortcut = '시작 메뉴에 바로 가기 만들기'
        ProgressHeading = 'MyDeskSearch를 설치하는 중'
        ProgressBody = '설치가 끝날 때까지 잠시 기다리세요.'
        RemoveProgressHeading = 'MyDeskSearch를 제거하는 중'
        RemoveProgressBody = '제거가 끝날 때까지 잠시 기다리세요.'
        StatusFiles = '프로그램 파일을 복사하는 중...'
        StatusShortcuts = '바로 가기를 등록하는 중...'
        StatusSettings = '설정을 저장하는 중...'
        StatusRemove = '프로그램 파일을 제거하는 중...'
        FinishHeading = '설치를 마쳤습니다'
        LaunchApp = 'MyDeskSearch 실행'
        FailedHeading = '설치하지 못했습니다'
        Done     = 'MyDeskSearch를 설치했습니다.'
        Removed  = 'MyDeskSearch를 제거했습니다.'
        Back     = '< 뒤로'
        Next     = '다음 >'
        InstallButton = '설치'
        RemoveButton = '제거'
        FinishButton = '마침'
        Cancel   = '취소'
        NeedFile = '설치할 mydesksearch.exe 를 찾지 못했습니다.'
        Denied   = '프로그램 파일을 지우지 못했습니다. 관리자 권한으로 설치 프로그램을 다시 실행하세요.'
        SkippedLegacy = '권한이 없어 지우지 못한 이전 프로그램 폴더가 있습니다. MyDeskSearch 설치는 완료되었습니다.'
    }
    $en = @{
        WindowTitle = 'MyDeskSearch Setup'
        WizardSubtitle = 'Setup Wizard'
        WelcomeHeading = 'Welcome to the MyDeskSearch Setup Wizard'
        WelcomeBody = "This wizard installs MyDeskSearch on your computer.`r`nClick Next to continue."
        UninstallHeading = 'Remove MyDeskSearch'
        UninstallBody = "This wizard removes MyDeskSearch from your computer.`r`nClick Remove to continue."
        LanguageLabel = 'Language'
        OptionsHeading = 'Installation options'
        OptionsIntro = 'Select additional tasks.'
        Reinstall = "MyDeskSearch is already installed.`r`nIts program files will be removed and installed again."
        AskData  = "What should happen to settings and the search index?`r`nKeep leaves the language saved in the app.`r`nDelete starts in the language you just chose."
        DataHeading = 'Settings and search index'
        Keep     = 'Keep'
        Delete   = 'Delete'
        ShortcutsHeading = 'Shortcuts'
        DesktopShortcut = 'Create a Desktop shortcut'
        StartMenuShortcut = 'Create a Start menu shortcut'
        ProgressHeading = 'Installing MyDeskSearch'
        ProgressBody = 'Please wait while Setup installs MyDeskSearch.'
        RemoveProgressHeading = 'Removing MyDeskSearch'
        RemoveProgressBody = 'Please wait while Setup removes MyDeskSearch.'
        StatusFiles = 'Copying program files...'
        StatusShortcuts = 'Creating shortcuts...'
        StatusSettings = 'Saving settings...'
        StatusRemove = 'Removing program files...'
        FinishHeading = 'Installation complete'
        LaunchApp = 'Launch MyDeskSearch'
        FailedHeading = 'Setup did not finish'
        Done     = 'MyDeskSearch is installed.'
        Removed  = 'MyDeskSearch was removed.'
        Back     = '< Back'
        Next     = 'Next >'
        InstallButton = 'Install'
        RemoveButton = 'Remove'
        FinishButton = 'Finish'
        Cancel   = 'Cancel'
        NeedFile = 'mydesksearch.exe was not found.'
        Denied   = 'The program files could not be removed. Run the installer again as administrator.'
        SkippedLegacy = 'An older program folder could not be removed because permission was denied. MyDeskSearch was still installed.'
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
    if ($LegacyDir) {
        $full = [System.IO.Path]::GetFullPath($LegacyDir)
        $leaf = Split-Path -Leaf $full.TrimEnd('\')
        if ($leaf -ne 'MyDeskSearch' -and $leaf -ne 'DeskSearch') {
            throw "Refusing to change $LegacyDir"
        }
        if (-not $dirs.Contains($full)) { [void]$dirs.Add($full) }
    }
    return $dirs
}

function Test-ProgramPresent {
    foreach ($dir in (Get-RemoveDirs)) {
        if ((Test-Path -LiteralPath (Join-Path $dir 'mydesksearch.exe')) -or (Test-Path -LiteralPath (Join-Path $dir 'desksearch.exe'))) { return $true }
    }
    return $false
}

function Set-ShortcutFlags {
    if ($NoShortcuts) { $script:Shortcuts = 'no' }
    $script:CreateDesktop = ($script:Shortcuts -eq 'yes')
    $script:CreateStartMenu = ($script:Shortcuts -eq 'yes')
}

function Resolve-Choices {
    if ($UninstallOnly -and -not $Language) {
        $saved = Read-SavedLanguage
        if ($saved) { $script:Language = $saved } else { $script:Language = 'ko' }
    }
    if (-not $Language) {
        if ($NonInteractive) { throw 'Pass -Language ko or -Language en.' }
        $script:Language = 'ko'
    }
    $needsDataChoice = (Test-ProgramPresent) -or (Test-DataPresent)
    if ($needsDataChoice -and $UserData -eq 'ask') {
        if ($NonInteractive) { throw 'Pass -UserData keep or -UserData delete.' }
        $script:UserData = 'keep'
    } elseif ($UserData -eq 'ask') {
        $script:UserData = 'keep'
    }
    if (-not $UninstallOnly -and $Shortcuts -eq 'ask') {
        if ($NonInteractive) { throw 'Pass -Shortcuts yes or -Shortcuts no.' }
        $script:Shortcuts = 'yes'
    }
    Set-ShortcutFlags
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

$script:SkippedLegacy = New-Object System.Collections.Generic.List[string]

function Remove-Tree([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $full = [System.IO.Path]::GetFullPath($Path)
    $leaf = [System.IO.Path]::GetFileName($full.TrimEnd('\'))
    if ($leaf -ne 'MyDeskSearch' -and $leaf -ne 'DeskSearch') {
        throw "Refusing to change $Path"
    }
    try {
        Remove-Item -LiteralPath $full -Recurse -Force -ErrorAction Stop
    } catch {
        if ($full -eq [System.IO.Path]::GetFullPath($InstallDir)) {
            throw (Get-Text 'Denied')
        }
        [void]$script:SkippedLegacy.Add($full)
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
    foreach ($dir in @($StartMenuDir, $DesktopDir)) {
        if (-not $dir) { continue }
        foreach ($name in @('MyDeskSearch.lnk', 'DeskSearch.lnk')) {
            $link = Join-Path $dir $name
            if (Test-Path -LiteralPath $link) {
                Remove-Item -LiteralPath $link -Force
            }
        }
    }
}

function New-ProgramShortcut([string]$Directory) {
    New-Item -ItemType Directory -Path $Directory -Force | Out-Null
    $exe = Join-Path $InstallDir 'mydesksearch.exe'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path $Directory 'MyDeskSearch.lnk'))
    $shortcut.TargetPath = $exe
    $shortcut.WorkingDirectory = $InstallDir
    $shortcut.Description = 'MyDeskSearch'
    $shortcut.IconLocation = "$exe,0"
    $shortcut.Save()
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
        foreach ($name in @('install.ps1', 'uninstall.ps1', 'install.cmd', 'mydesksearch.ico')) {
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

    if ($script:CreateStartMenu) { New-ProgramShortcut $StartMenuDir }
    if ($script:CreateDesktop) { New-ProgramShortcut $DesktopDir }
}

function Get-FinishedMessage {
    if ($UninstallOnly) { return (Get-Text 'Removed') }
    $done = Get-Text 'Done'
    if ($script:SkippedLegacy.Count -gt 0) {
        $done = $done + "`r`n`r`n" + (Get-Text 'SkippedLegacy')
    }
    return $done
}

function Invoke-SetupWork([scriptblock]$OnStatus) {
    if ($UninstallOnly) {
        & $OnStatus (Get-Text 'StatusRemove') 35
        Remove-ProgramFiles
        & $OnStatus (Get-Text 'StatusSettings') 75
        Set-UserData
        & $OnStatus (Get-Text 'Removed') 100
        return
    }
    & $OnStatus (Get-Text 'StatusFiles') 30
    Copy-Program
    & $OnStatus (Get-Text 'StatusShortcuts') 68
    Register-Install
    & $OnStatus (Get-Text 'StatusSettings') 90
    Set-UserData
    & $OnStatus (Get-FinishedMessage) 100
}

function Show-SetupWizard {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [System.Windows.Forms.Application]::EnableVisualStyles()
    if (-not $script:Language) { $script:Language = 'ko' }
    $needsData = (Test-ProgramPresent) -or (Test-DataPresent)
    $script:WizardBusy = $false
    $script:WizardFinished = $false
    $script:WizardExit = 1

    $form = New-Object System.Windows.Forms.Form
    $form.Text = Get-Text 'WindowTitle'
    $form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::None
    $form.ClientSize = New-Object System.Drawing.Size(680, 560)
    $form.FormBorderStyle = 'FixedDialog'
    $form.StartPosition = 'CenterScreen'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $uiFont = 'Segoe UI'
    if (Test-Path -LiteralPath 'C:\Windows\Fonts\malgun.ttf') { $uiFont = 'Malgun Gothic' }
    $form.Font = New-Object System.Drawing.Font($uiFont, 9)
    $form.BackColor = [System.Drawing.Color]::White
    $iconPath = Join-Path $PSScriptRoot 'mydesksearch.ico'
    $icon = $null
    if (Test-Path -LiteralPath $iconPath) {
        $icon = New-Object System.Drawing.Icon($iconPath, 48, 48)
        $form.Icon = New-Object System.Drawing.Icon($iconPath)
    } elseif ($SourceExe -and (Test-Path -LiteralPath $SourceExe)) {
        $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($SourceExe)
        $form.Icon = $icon
    }

    $header = New-Object System.Windows.Forms.Panel
    $header.Bounds = New-Object System.Drawing.Rectangle(0, 0, 680, 92)
    $header.BackColor = [System.Drawing.Color]::FromArgb(29, 78, 216)
    $picture = New-Object System.Windows.Forms.PictureBox
    $picture.Bounds = New-Object System.Drawing.Rectangle(24, 22, 48, 48)
    $picture.SizeMode = 'CenterImage'
    $picture.BackColor = $header.BackColor
    if ($icon) { $picture.Image = $icon.ToBitmap() }
    $title = New-Object System.Windows.Forms.Label
    $title.Text = 'MyDeskSearch'
    $title.Bounds = New-Object System.Drawing.Rectangle(88, 20, 560, 32)
    $title.Font = New-Object System.Drawing.Font($uiFont, 16, [System.Drawing.FontStyle]::Bold)
    $title.ForeColor = [System.Drawing.Color]::White
    $title.BackColor = $header.BackColor
    $subtitle = New-Object System.Windows.Forms.Label
    $subtitle.Bounds = New-Object System.Drawing.Rectangle(90, 52, 560, 24)
    $subtitle.Font = New-Object System.Drawing.Font($uiFont, 9)
    $subtitle.ForeColor = [System.Drawing.Color]::FromArgb(219, 234, 254)
    $subtitle.BackColor = $header.BackColor
    $header.Controls.AddRange(@($picture, $title, $subtitle))

    $footer = New-Object System.Windows.Forms.Panel
    $footer.Bounds = New-Object System.Drawing.Rectangle(0, 502, 680, 58)
    $footer.BackColor = [System.Drawing.Color]::FromArgb(243, 244, 246)
    $footer.Add_Paint({
        $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(209, 213, 219))
        $_.Graphics.DrawLine($pen, 0, 0, 680, 0)
        $pen.Dispose()
    })
    $back = New-Object System.Windows.Forms.Button
    $next = New-Object System.Windows.Forms.Button
    $cancel = New-Object System.Windows.Forms.Button
    $back.SetBounds(356, 14, 96, 30)
    $next.SetBounds(460, 14, 96, 30)
    $cancel.SetBounds(564, 14, 96, 30)
    $footer.Controls.AddRange(@($back, $next, $cancel))
    $form.AcceptButton = $next
    $form.CancelButton = $cancel

    function New-WizardLabel([int]$X, [int]$Y, [int]$W, [int]$H, [single]$Size, [bool]$Bold) {
        $label = New-Object System.Windows.Forms.Label
        $label.Bounds = New-Object System.Drawing.Rectangle($X, $Y, $W, $H)
        $style = if ($Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
        $label.Font = New-Object System.Drawing.Font($uiFont, $Size, $style)
        $label.ForeColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
        return $label
    }

    $welcome = New-Object System.Windows.Forms.Panel
    $options = New-Object System.Windows.Forms.Panel
    $progress = New-Object System.Windows.Forms.Panel
    $finish = New-Object System.Windows.Forms.Panel
    foreach ($page in @($welcome, $options, $progress, $finish)) {
        $page.Bounds = New-Object System.Drawing.Rectangle(0, 92, 680, 410)
        $page.BackColor = [System.Drawing.Color]::White
        $page.Visible = $false
    }

    $welcomeHeading = New-WizardLabel 32 28 616 36 14 $true
    $welcomeBody = New-WizardLabel 32 72 616 64 10 $false
    $languageLabel = New-WizardLabel 32 156 616 24 10 $true
    $korean = New-Object System.Windows.Forms.RadioButton
    $korean.Text = '한국어'
    $korean.Bounds = New-Object System.Drawing.Rectangle(32, 188, 240, 28)
    $korean.Font = New-Object System.Drawing.Font($uiFont, 10)
    $english = New-Object System.Windows.Forms.RadioButton
    $english.Text = 'English'
    $english.Bounds = New-Object System.Drawing.Rectangle(32, 220, 240, 28)
    $english.Font = New-Object System.Drawing.Font($uiFont, 10)
    if ($Language -eq 'en') { $english.Checked = $true } else { $korean.Checked = $true }
    $welcome.Controls.AddRange(@($welcomeHeading, $welcomeBody, $languageLabel, $korean, $english))

    $optionsHeading = New-WizardLabel 32 24 616 32 14 $true
    $optionsIntro = New-WizardLabel 32 60 616 36 10 $false
    $reinstallBody = New-WizardLabel 32 100 616 48 9 $false
    $reinstallBody.Visible = $needsData -and -not $UninstallOnly
    $dataGroup = New-Object System.Windows.Forms.GroupBox
    $dataTop = 108
    if ($reinstallBody.Visible) { $dataTop = 152 }
    $dataGroup.Bounds = New-Object System.Drawing.Rectangle(32, $dataTop, 616, 140)
    $dataGroup.Visible = $needsData
    $dataGroup.Font = New-Object System.Drawing.Font($uiFont, 9)
    $dataBody = New-Object System.Windows.Forms.Label
    $dataBody.Bounds = New-Object System.Drawing.Rectangle(16, 28, 580, 60)
    $keep = New-Object System.Windows.Forms.RadioButton
    $keep.Bounds = New-Object System.Drawing.Rectangle(16, 98, 220, 26)
    $keep.Checked = $UserData -ne 'delete'
    $delete = New-Object System.Windows.Forms.RadioButton
    $delete.Bounds = New-Object System.Drawing.Rectangle(250, 98, 220, 26)
    $delete.Checked = $UserData -eq 'delete'
    $dataGroup.Controls.AddRange(@($dataBody, $keep, $delete))
    $shortcutGroup = New-Object System.Windows.Forms.GroupBox
    $shortcutTop = 108
    if ($needsData) { $shortcutTop = $dataTop + 152 }
    $shortcutGroup.Bounds = New-Object System.Drawing.Rectangle(32, $shortcutTop, 616, 96)
    $shortcutGroup.Visible = -not $UninstallOnly
    $shortcutGroup.Font = New-Object System.Drawing.Font($uiFont, 9)
    $desktopBox = New-Object System.Windows.Forms.CheckBox
    $desktopBox.Bounds = New-Object System.Drawing.Rectangle(16, 28, 560, 24)
    $desktopBox.Checked = $Shortcuts -ne 'no'
    $menuBox = New-Object System.Windows.Forms.CheckBox
    $menuBox.Bounds = New-Object System.Drawing.Rectangle(16, 56, 560, 24)
    $menuBox.Checked = $Shortcuts -ne 'no'
    $shortcutGroup.Controls.AddRange(@($desktopBox, $menuBox))
    $options.Controls.AddRange(@($optionsHeading, $optionsIntro, $reinstallBody, $dataGroup, $shortcutGroup))

    $progressHeading = New-WizardLabel 32 36 616 36 14 $true
    $progressBody = New-WizardLabel 32 80 616 48 10 $false
    $bar = New-Object System.Windows.Forms.ProgressBar
    $bar.Bounds = New-Object System.Drawing.Rectangle(32, 150, 616, 22)
    $bar.Minimum = 0
    $bar.Maximum = 100
    $bar.Style = 'Continuous'
    $status = New-WizardLabel 32 184 616 32 9 $false
    $progress.Controls.AddRange(@($progressHeading, $progressBody, $bar, $status))

    $finishHeading = New-WizardLabel 32 36 616 36 14 $true
    $finishBody = New-WizardLabel 32 84 616 160 10 $false
    $launchBox = New-Object System.Windows.Forms.CheckBox
    $launchBox.Bounds = New-Object System.Drawing.Rectangle(32, 260, 616, 28)
    $launchBox.Font = New-Object System.Drawing.Font($uiFont, 10)
    $launchBox.Checked = -not $UninstallOnly
    $launchBox.Visible = -not $UninstallOnly
    $finish.Controls.AddRange(@($finishHeading, $finishBody, $launchBox))

    $form.Controls.AddRange(@($welcome, $options, $progress, $finish, $header, $footer))
    $script:Ui = @{
        Form = $form
        Subtitle = $subtitle
        Welcome = $welcome
        Options = $options
        Progress = $progress
        Finish = $finish
        WelcomeHeading = $welcomeHeading
        WelcomeBody = $welcomeBody
        LanguageLabel = $languageLabel
        Korean = $korean
        English = $english
        OptionsHeading = $optionsHeading
        OptionsIntro = $optionsIntro
        ReinstallBody = $reinstallBody
        DataGroup = $dataGroup
        DataBody = $dataBody
        Keep = $keep
        Delete = $delete
        ShortcutGroup = $shortcutGroup
        DesktopBox = $desktopBox
        MenuBox = $menuBox
        ProgressHeading = $progressHeading
        ProgressBody = $progressBody
        Bar = $bar
        Status = $status
        FinishHeading = $finishHeading
        FinishBody = $finishBody
        LaunchBox = $launchBox
        Back = $back
        Next = $next
        Cancel = $cancel
        NeedsData = $needsData
    }

    function script:Update-WizardText {
        $ui = $script:Ui
        $ui.Form.Text = Get-Text 'WindowTitle'
        $ui.Subtitle.Text = Get-Text 'WizardSubtitle'
        if ($UninstallOnly) {
            $ui.WelcomeHeading.Text = Get-Text 'UninstallHeading'
            $ui.WelcomeBody.Text = Get-Text 'UninstallBody'
        } else {
            $ui.WelcomeHeading.Text = Get-Text 'WelcomeHeading'
            $ui.WelcomeBody.Text = Get-Text 'WelcomeBody'
        }
        $ui.LanguageLabel.Text = Get-Text 'LanguageLabel'
        $ui.OptionsHeading.Text = Get-Text 'OptionsHeading'
        $ui.OptionsIntro.Text = Get-Text 'OptionsIntro'
        $ui.ReinstallBody.Text = Get-Text 'Reinstall'
        $ui.DataGroup.Text = Get-Text 'DataHeading'
        $ui.DataBody.Text = Get-Text 'AskData'
        $ui.Keep.Text = Get-Text 'Keep'
        $ui.Delete.Text = Get-Text 'Delete'
        $ui.ShortcutGroup.Text = Get-Text 'ShortcutsHeading'
        $ui.DesktopBox.Text = Get-Text 'DesktopShortcut'
        $ui.MenuBox.Text = Get-Text 'StartMenuShortcut'
        if ($UninstallOnly) {
            $ui.ProgressHeading.Text = Get-Text 'RemoveProgressHeading'
            $ui.ProgressBody.Text = Get-Text 'RemoveProgressBody'
        } else {
            $ui.ProgressHeading.Text = Get-Text 'ProgressHeading'
            $ui.ProgressBody.Text = Get-Text 'ProgressBody'
        }
        $ui.Back.Text = Get-Text 'Back'
        $ui.Cancel.Text = Get-Text 'Cancel'
        $ui.LaunchBox.Text = Get-Text 'LaunchApp'
    }

    function script:Show-WizardPage([int]$Index) {
        $ui = $script:Ui
        $ui.Welcome.Visible = $Index -eq 0
        $ui.Options.Visible = $Index -eq 1
        $ui.Progress.Visible = $Index -eq 2
        $ui.Finish.Visible = $Index -eq 3
        $ui.Back.Enabled = $Index -eq 1
        $ui.Back.Visible = $Index -lt 2
        $ui.Cancel.Visible = $Index -lt 2
        $ui.Cancel.Enabled = $Index -lt 2
        $ui.Next.Visible = $Index -ne 2
        $ui.Next.Enabled = $Index -ne 2
        if ($Index -eq 0) { $ui.Next.Text = Get-Text 'Next' }
        elseif ($Index -eq 1) { $ui.Next.Text = $(if ($UninstallOnly) { Get-Text 'RemoveButton' } else { Get-Text 'InstallButton' }) }
        elseif ($Index -eq 3) { $ui.Next.Text = Get-Text 'FinishButton' }
        else { $ui.Next.Text = Get-Text 'Next' }
    }

    $korean.Add_CheckedChanged({
        if ($script:Ui.Korean.Checked) { $script:Language = 'ko'; Update-WizardText }
    })
    $english.Add_CheckedChanged({
        if ($script:Ui.English.Checked) { $script:Language = 'en'; Update-WizardText }
    })
    $back.Add_Click({ Show-WizardPage 0 })
    $cancel.Add_Click({
        if (-not $script:WizardBusy) { $script:Ui.Form.Close() }
    })
    $next.Add_Click({
        $ui = $script:Ui
        if ($ui.Welcome.Visible) {
            $script:Language = $(if ($ui.English.Checked) { 'en' } else { 'ko' })
            Update-WizardText
            Show-WizardPage 1
            return
        }
        if ($ui.Options.Visible) {
            if ($ui.NeedsData) {
                $script:UserData = $(if ($ui.Delete.Checked) { 'delete' } else { 'keep' })
            } else {
                $script:UserData = 'keep'
            }
            $script:CreateDesktop = [bool]$ui.DesktopBox.Checked
            $script:CreateStartMenu = [bool]$ui.MenuBox.Checked
            $script:Shortcuts = $(if ($script:CreateDesktop -or $script:CreateStartMenu) { 'yes' } else { 'no' })
            $script:WizardBusy = $true
            Show-WizardPage 2
            [System.Windows.Forms.Application]::DoEvents()
            try {
                Invoke-SetupWork {
                    param($text, $percent)
                    $script:Ui.Status.Text = [string]$text
                    $script:Ui.Bar.Value = [Math]::Min(100, [Math]::Max(0, [int]$percent))
                    [System.Windows.Forms.Application]::DoEvents()
                }
                $ui.FinishHeading.Text = $(if ($UninstallOnly) { Get-Text 'Removed' } else { Get-Text 'FinishHeading' })
                $ui.FinishHeading.ForeColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
                $ui.FinishBody.Text = Get-FinishedMessage
                $ui.LaunchBox.Visible = -not $UninstallOnly
                $script:WizardExit = 0
            } catch {
                $ui.FinishHeading.Text = Get-Text 'FailedHeading'
                $ui.FinishHeading.ForeColor = [System.Drawing.Color]::FromArgb(153, 27, 27)
                $ui.FinishBody.Text = $_.Exception.Message
                $ui.LaunchBox.Visible = $false
                $script:WizardExit = 1
            } finally {
                $script:WizardBusy = $false
                $script:WizardFinished = $true
            }
            Show-WizardPage 3
            return
        }
        if ($ui.Finish.Visible) {
            if ($ui.LaunchBox.Visible -and $ui.LaunchBox.Checked -and $script:WizardExit -eq 0) {
                $installed = Join-Path $InstallDir 'mydesksearch.exe'
                if (Test-Path -LiteralPath $installed) {
                    Start-Process -FilePath $installed -WorkingDirectory $InstallDir
                }
            }
            $ui.Form.Close()
        }
    })
    $form.Add_FormClosing({
        if ($script:WizardBusy) { $_.Cancel = $true }
    })

    Update-WizardText
    Show-WizardPage 0
    [void]$form.ShowDialog()
    $form.Dispose()
    if ($icon) { $icon.Dispose() }
    exit $script:WizardExit
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

try {
    $InstallDir = Assert-SafeDirectory $InstallDir 'MyDeskSearch'
    $DataDir = Assert-SafeDirectory $DataDir 'MyDeskSearch'

    if (-not $NonInteractive) {
        Show-SetupWizard
    }

    Resolve-Choices
    Invoke-SetupWork { param($text, $percent) }
    Write-Host (Get-FinishedMessage)
    exit 0
} catch {
    $message = $_.Exception.Message
    if (-not $NonInteractive) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($message, 'MyDeskSearch') | Out-Null
    }
    [Console]::Error.WriteLine($message)
    exit 1
}
