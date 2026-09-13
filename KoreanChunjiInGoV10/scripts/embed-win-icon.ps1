# embed-win-icon.ps1 - Windows 실행 파일에 넣을 아이콘 리소스를 만든다.
#
#   .\scripts\embed-win-icon.ps1
#   .\scripts\embed-win-icon.ps1 -Version 1.1
#
# go build 가 자동으로 집어넣는 rsrc_windows_amd64.syso 를
# cmd\chunjiin 과 cmd\chunjiin-setup 에 둔다.
# 창 아이콘(assets.Icon)과 달리, 탐색기·작업 표시줄·바로 가기가
# 보는 아이콘은 이 리소스가 있어야 한다.
#
# Linux · macOS 빌드에는 붙지 않는다 (_windows_amd64 접미사).

[CmdletBinding()]
param(
    [string]$Version = '1.0'
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$ico = Join-Path $root 'assets\chunjiin.ico'
if (-not (Test-Path $ico)) {
    throw "아이콘이 없습니다: $ico  (python scripts/make_icon.py 로 만드세요)"
}

# Windows 판 번호는 a.b.c.d 네 칸이다.
$parts = @(($Version -split '[^0-9]+') | Where-Object { $_ -ne '' })
while ($parts.Count -lt 4) { $parts += '0' }
$fv = ($parts[0..3] -join '.')

$tool = 'github.com/tc-hib/go-winres@v0.3.3'
$targets = @(
    @{
        Dir  = 'cmd\chunjiin'
        Name = '천지인 한글 입력기'
        Desc = '천지인 한글 입력기'
        File = 'chunjiin.exe'
    }
    @{
        Dir  = 'cmd\chunjiin-setup'
        Name = '천지인 한글 입력기'
        Desc = '천지인 한글 입력기 설치'
        File = 'chunjiin-setup.exe'
    }
)

foreach ($t in $targets) {
    $pkg = Join-Path $root $t.Dir
    Write-Host ("   " + $t.File) -ForegroundColor Gray
    Push-Location $pkg
    try {
        go run $tool simply `
            --icon $ico `
            --arch amd64 `
            --manifest gui `
            --product-name $t.Name `
            --file-description $t.Desc `
            --original-filename $t.File `
            --product-version $fv `
            --file-version $fv
        if ($LASTEXITCODE -ne 0) { throw "아이콘 리소스 만들기 실패: $($t.Dir)" }
    }
    finally {
        Pop-Location
    }
}
