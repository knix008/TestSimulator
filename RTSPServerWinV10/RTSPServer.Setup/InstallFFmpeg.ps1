# FFmpeg Installation Script for RTSP Server
# This script checks if FFmpeg is installed and installs it if necessary

$ErrorActionPreference = "SilentlyContinue"

# Function to check if FFmpeg is installed
function Test-FFmpegInstalled {
    $ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
    return $null -ne $ffmpeg
}

# Function to check if Chocolatey is installed
function Test-ChocolateyInstalled {
    $choco = Get-Command choco -ErrorAction SilentlyContinue
    return $null -ne $choco
}

# Function to install Chocolatey
function Install-Chocolatey {
    Write-Host "Installing Chocolatey..."
    try {
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        
        # Refresh environment variables
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        return $true
    }
    catch {
        Write-Host "Chocolatey 설치 실패: $_"
        return $false
    }
}

# Function to install FFmpeg
function Install-FFmpeg {
    Write-Host "Installing FFmpeg via Chocolatey..."
    try {
        $process = Start-Process -FilePath "choco" -ArgumentList "install", "ffmpeg", "-y" -Wait -PassThru -NoNewWindow
        return $process.ExitCode -eq 0
    }
    catch {
        Write-Host "FFmpeg 설치 실패: $_"
        return $false
    }
}

# Main installation logic
Write-Host "RTSP Server - FFmpeg 설치 확인 중..."

# Check if FFmpeg is already installed
if (Test-FFmpegInstalled) {
    Write-Host "FFmpeg이 이미 설치되어 있습니다."
    exit 0
}

Write-Host "FFmpeg이 설치되어 있지 않습니다."

# Ask user if they want to install FFmpeg
$title = "FFmpeg 설치"
$message = "RTSP 서버는 FFmpeg이 필요합니다. 지금 설치하시겠습니까?`n`n이 작업은 인터넷 연결이 필요하며 몇 분 정도 걸릴 수 있습니다."
$yes = New-Object System.Management.Automation.Host.ChoiceDescription "&예(Y)", "FFmpeg을 자동으로 설치합니다."
$no = New-Object System.Management.Automation.Host.ChoiceDescription "&아니오(N)", "나중에 수동으로 설치합니다."
$options = [System.Management.Automation.Host.ChoiceDescription[]]($yes, $no)
$result = $host.ui.PromptForChoice($title, $message, $options, 0)

if ($result -eq 1) {
    Write-Host "FFmpeg 설치를 건너뜁니다. README.md 파일을 참조하여 수동으로 설치해 주세요."
    exit 0
}

# Check if Chocolatey is installed
if (-not (Test-ChocolateyInstalled)) {
    Write-Host "Chocolatey가 설치되어 있지 않습니다."
    if (-not (Install-Chocolatey)) {
        Write-Host "Chocolatey 설치에 실패했습니다. FFmpeg을 수동으로 설치해 주세요."
        exit 1
    }
}

# Install FFmpeg
if (Install-FFmpeg) {
    Write-Host "FFmpeg 설치가 완료되었습니다."
    
    # Refresh environment variables
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Write-Host "설치 확인 중..."
    if (Test-FFmpegInstalled) {
        Write-Host "FFmpeg이 정상적으로 설치되었습니다."
        exit 0
    }
    else {
        Write-Host "FFmpeg 설치는 완료되었으나 PATH 설정이 완료되지 않았습니다. 시스템을 재시작하거나 새 터미널을 열어주세요."
        exit 0
    }
}
else {
    Write-Host "FFmpeg 설치에 실패했습니다. README.md 파일을 참조하여 수동으로 설치해 주세요."
    exit 1
}
