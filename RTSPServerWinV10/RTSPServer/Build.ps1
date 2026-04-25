# RTSP 서버 빌드 및 배포 스크립트
# PowerShell 5.1 이상 필요

param(
    [string]$Configuration = "Release",
    [string]$Version = "1.0.0",
    [switch]$SkipBuild,
    [switch]$CreateInstaller
)

$ErrorActionPreference = "Stop"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "RTSP Server 빌드 및 배포" -ForegroundColor Cyan
Write-Host "버전: $Version" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# 프로젝트 경로
$projectPath = $PSScriptRoot
$projectFile = Join-Path $projectPath "RTSPServer.csproj"
$outputPath = Join-Path $projectPath "Publish\RTSPServer-$Version"

# 1. 클린
if (-not $SkipBuild) {
    Write-Host "[1/5] 이전 빌드 정리 중..." -ForegroundColor Yellow
    
    if (Test-Path ".\bin") {
        Remove-Item -Path ".\bin" -Recurse -Force
    }
    if (Test-Path ".\obj") {
        Remove-Item -Path ".\obj" -Recurse -Force
    }
    if (Test-Path $outputPath) {
        Remove-Item -Path $outputPath -Recurse -Force
    }
    
    Write-Host "  ✓ 정리 완료" -ForegroundColor Green
    Write-Host ""
}

# 2. 복원
if (-not $SkipBuild) {
    Write-Host "[2/5] NuGet 패키지 복원 중..." -ForegroundColor Yellow
    dotnet restore $projectFile
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ 패키지 복원 실패" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "  ✓ 패키지 복원 완료" -ForegroundColor Green
    Write-Host ""
}

# 3. 빌드
if (-not $SkipBuild) {
    Write-Host "[3/5] 프로젝트 빌드 중..." -ForegroundColor Yellow
    dotnet build $projectFile -c $Configuration
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ 빌드 실패" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "  ✓ 빌드 완료" -ForegroundColor Green
    Write-Host ""
}

# 4. 게시
Write-Host "[4/5] 배포판 생성 중..." -ForegroundColor Yellow

# 자체 포함 배포 (단일 파일)
Write-Host "  - 단일 실행 파일 생성 중..." -ForegroundColor Gray
$singleFileOutput = Join-Path $outputPath "SingleFile"
dotnet publish $projectFile `
    -c $Configuration `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:PublishTrimmed=false `
    -o $singleFileOutput

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ 단일 파일 생성 실패" -ForegroundColor Red
    exit 1
}

# 일반 자체 포함 배포
Write-Host "  - 전체 배포판 생성 중..." -ForegroundColor Gray
$fullOutput = Join-Path $outputPath "Full"
dotnet publish $projectFile `
    -c $Configuration `
    -r win-x64 `
    --self-contained true `
    -o $fullOutput

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ 전체 배포판 생성 실패" -ForegroundColor Red
    exit 1
}

# 문서 파일 복사
Write-Host "  - 문서 파일 복사 중..." -ForegroundColor Gray
Copy-Item -Path "README.md" -Destination $singleFileOutput -Force
Copy-Item -Path "LICENSE.txt" -Destination $singleFileOutput -Force
Copy-Item -Path "README.md" -Destination $fullOutput -Force
Copy-Item -Path "LICENSE.txt" -Destination $fullOutput -Force

Write-Host "  ✓ 배포판 생성 완료" -ForegroundColor Green
Write-Host ""

# 5. 설치 프로그램 생성 (선택사항)
if ($CreateInstaller) {
    Write-Host "[5/5] 설치 프로그램 생성 중..." -ForegroundColor Yellow
    
    # Inno Setup 경로 찾기
    $innoSetupPaths = @(
        "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
        "C:\Program Files\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles(x86)\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    )
    
    $innoSetup = $null
    foreach ($path in $innoSetupPaths) {
        if (Test-Path $path) {
            $innoSetup = $path
            break
        }
    }
    
    if ($null -eq $innoSetup) {
        Write-Host "  ! Inno Setup을 찾을 수 없습니다." -ForegroundColor Yellow
        Write-Host "  ! https://jrsoftware.org/isinfo.php 에서 다운로드하세요." -ForegroundColor Yellow
    }
    else {
        Write-Host "  - Inno Setup 실행 중..." -ForegroundColor Gray
        
        # setup.iss 파일의 버전 정보 업데이트 (선택사항)
        # 여기에 버전 업데이트 로직 추가 가능
        
        & $innoSetup "setup.iss"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ 설치 프로그램 생성 완료" -ForegroundColor Green
        }
        else {
            Write-Host "  ✗ 설치 프로그램 생성 실패" -ForegroundColor Red
        }
    }
    Write-Host ""
}
else {
    Write-Host "[5/5] 설치 프로그램 생성 건너뜀 (-CreateInstaller 플래그 사용)" -ForegroundColor Gray
    Write-Host ""
}

# 완료 메시지
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "빌드 및 배포 완료!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "출력 위치:" -ForegroundColor White
Write-Host "  - 단일 파일: $singleFileOutput" -ForegroundColor Gray
Write-Host "  - 전체 배포: $fullOutput" -ForegroundColor Gray

if ($CreateInstaller -and $null -ne $innoSetup) {
    $installerPath = Join-Path $projectPath "Installer"
    if (Test-Path $installerPath) {
        Write-Host "  - 설치 프로그램: $installerPath" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "실행 방법:" -ForegroundColor White
Write-Host "  $singleFileOutput\RTSPServer.exe" -ForegroundColor Cyan
Write-Host ""

# 파일 크기 정보
$exePath = Join-Path $singleFileOutput "RTSPServer.exe"
if (Test-Path $exePath) {
    $fileSize = (Get-Item $exePath).Length / 1MB
    Write-Host "실행 파일 크기: $([math]::Round($fileSize, 2)) MB" -ForegroundColor White
}
Write-Host ""
