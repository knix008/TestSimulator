# install-helper.ps1 - build.bat 이 설치할 때 부르는 보조 스크립트.
#
# .bat 은 cmd.exe 가 ANSI 코드 페이지로 읽어서 한글을 쓸 수 없다. 그래서
# 한글 이름이 필요한 일만 여기서 한다. 설치 흐름과 물어보는 일은 build.bat 에 있다.
#
#   install-helper.ps1 shortcut-add     desktop|startmenu  <exe>
#       바로 가기 "천지인 한글 입력기.lnk" 를 만든다.
#   install-helper.ps1 shortcut-remove  desktop|startmenu  <exe>
#       그 exe 를 가리키는 .lnk 를 이름과 상관없이 모두 지운다.
#       (Go 설치기가 만든 것도 같이 정리된다.)
#   install-helper.ps1 register         <설치 폴더>  <version>
#       "설정 > 앱" 목록에 나오도록 HKCU 에 등록한다.
#       cmd/chunjiin-setup/install_windows.go 와 같은 값을 쓴다.
#
# 관리자 권한은 필요 없다. 모두 사용자 영역이다.

[CmdletBinding()]
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet('shortcut-add', 'shortcut-remove', 'register')]
    [string]$Action,

    [Parameter(Mandatory, Position = 1)]
    [string]$Arg1,

    [Parameter(Mandatory, Position = 2)]
    [string]$Arg2
)

$ErrorActionPreference = 'Stop'

$displayName  = '천지인 한글 입력기'
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Chunjiin'

function ShortcutDir([string]$where) {
    switch ($where) {
        'desktop'   { [Environment]::GetFolderPath('Desktop') }
        'startmenu' { Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs' }
        default     { throw "모르는 자리: $where (desktop 또는 startmenu)" }
    }
}

switch ($Action) {
    'shortcut-add' {
        $dir = ShortcutDir $Arg1
        $exe = $Arg2
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        $link = Join-Path $dir "$displayName.lnk"
        $s = (New-Object -ComObject WScript.Shell).CreateShortcut($link)
        $s.TargetPath       = $exe
        $s.WorkingDirectory = Split-Path -Parent $exe
        $s.IconLocation     = $exe
        $s.Description      = $displayName
        $s.Save()
        Write-Host "   $link"
    }

    'shortcut-remove' {
        $dir = ShortcutDir $Arg1
        $exe = $Arg2
        if (-not (Test-Path $dir)) { return }
        $sh = New-Object -ComObject WScript.Shell
        Get-ChildItem -Path $dir -Filter '*.lnk' -File |
            Where-Object { $sh.CreateShortcut($_.FullName).TargetPath -ieq $exe } |
            ForEach-Object {
                Remove-Item -Force -Path $_.FullName
                Write-Host "   removed $($_.FullName)"
            }
    }

    'register' {
        $target  = $Arg1
        $version = $Arg2
        $exe     = Join-Path $target 'chunjiin.exe'
        $bat     = Join-Path $target 'uninstall.bat'
        New-Item -Path $uninstallKey -Force | Out-Null
        $values = [ordered]@{
            DisplayName     = $displayName
            DisplayVersion  = $version
            Publisher       = 'SHKWON'
            DisplayIcon     = $exe
            InstallLocation = $target
            UninstallString = "cmd.exe /c """"$bat"""""
        }
        foreach ($k in $values.Keys) {
            New-ItemProperty -Path $uninstallKey -Name $k -Value $values[$k] -PropertyType String -Force | Out-Null
        }
        New-ItemProperty -Path $uninstallKey -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null
        Write-Host "   $uninstallKey"
    }
}
