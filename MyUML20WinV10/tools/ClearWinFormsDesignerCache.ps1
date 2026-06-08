# WinForms 디자이너 shadow cache 및 빌드 산출물을 정리합니다.
# Visual Studio를 종료한 뒤 실행하세요.

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "DesignToolsServer 프로세스 종료..." -ForegroundColor Cyan
Get-Process -Name 'DesignToolsServer' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name 'MyUML20WinV10' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "WinFormsDesigner shadow cache 삭제..." -ForegroundColor Cyan
$vsRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\VisualStudio'
if (Test-Path $vsRoot) {
    Get-ChildItem -Path $vsRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $cache = Join-Path $_.FullName 'WinFormsDesigner'
        if (Test-Path $cache) {
            Remove-Item -Path $cache -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  removed: $cache"
        }
    }
}

Write-Host "bin / obj 정리..." -ForegroundColor Cyan
foreach ($dir in @('bin', 'obj')) {
    $path = Join-Path $projectRoot $dir
    if (Test-Path $path) {
        Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  removed: $path"
    }
}

Write-Host "Debug 빌드..." -ForegroundColor Cyan
Push-Location $projectRoot
try {
    dotnet build MyUML20WinV10.csproj -c Debug
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}

Write-Host "완료. Visual Studio에서 MainForm.cs 디자이너를 다시 열어 보세요." -ForegroundColor Green
