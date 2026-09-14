# prereq.ps1 - rustc / cargo 가 없으면 rustup 으로 넣는다. (Windows)
#
#   & "$root\scripts\prereq.ps1"
#
# $env:PATH 는 이 프로세스에 남는다. 호출하는 쪽에서 cargo / rustc 를
# 바로 쓸 수 있다. 실패하면 throw 하므로, 호출 쪽 ErrorActionPreference
# 가 Stop 이면 그 자리에서 멈춘다. 성공 때 exit 하지 않는다.
#
# 하는 일
#   1. %USERPROFILE%\.cargo\bin 을 PATH 앞에 붙인다
#   2. rustc · cargo 가 없으면 rustup 을 물어보지 않고 넣는다
#        먼저 winget (Rustlang.Rustup), 안 되면 rustup-init.exe
#   3. rustc 가 1.85 보다 낮으면 rustup update 로 올린다

$ErrorActionPreference = 'Stop'

function Add-CargoBinToPath {
    $cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
    if (Test-Path -LiteralPath $cargoBin) {
        $parts = $env:PATH -split ';'
        if (-not ($parts | Where-Object { $_ -and [string]::Equals($_, $cargoBin, 'OrdinalIgnoreCase') })) {
            $env:PATH = "$cargoBin;$env:PATH"
        }
    }
}

function Test-RustReady {
    Add-CargoBinToPath
    return [bool](Get-Command rustc -ErrorAction SilentlyContinue) -and
           [bool](Get-Command cargo -ErrorAction SilentlyContinue)
}

function Get-RustcVersion {
    try {
        $line = & rustc --version 2>$null
    } catch {
        return $null
    }
    if ($line -match 'rustc (\d+)\.(\d+)(?:\.(\d+))?') {
        $patch = if ($Matches[3]) { [int]$Matches[3] } else { 0 }
        return [version]::new([int]$Matches[1], [int]$Matches[2], $patch)
    }
    return $null
}

function Install-Rustup {
    Write-Host '   rustc 가 없습니다. rustup 으로 넣습니다...' -ForegroundColor Cyan

    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host '   winget install Rustlang.Rustup'
        & winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements
        Add-CargoBinToPath
        if (Test-RustReady) { return }
        Write-Host '   winget 으로는 바로 쓰지 못했습니다. rustup-init 으로 넣습니다...'
    }

    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'aarch64' } else { 'x86_64' }
    $url = "https://static.rust-lang.org/rustup/dist/${arch}-pc-windows-msvc/rustup-init.exe"
    $tmp = Join-Path $env:TEMP "chunjiin-rustup-init-$PID.exe"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
        if (-not (Test-Path -LiteralPath $tmp)) {
            throw "rustup-init 을 받지 못했습니다: $url"
        }
        Write-Host '   rustup-init -y'
        & $tmp -y --default-toolchain stable
        if ($LASTEXITCODE -ne 0) { throw "rustup-init 이 실패했다 (exit $LASTEXITCODE)" }
    } finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
    Add-CargoBinToPath
}

Add-CargoBinToPath

if (-not (Test-RustReady)) {
    Install-Rustup
    if (-not (Test-RustReady)) {
        throw 'rustup 을 넣었는데 rustc 를 찾지 못했다. 터미널을 다시 열고 실행하세요.'
    }
}

$min = [version]'1.85.0'
$ver = Get-RustcVersion
if ($null -eq $ver) {
    throw 'rustc --version 을 읽지 못했다.'
}
if ($ver -lt $min) {
    Write-Host "   rustc $ver 는 1.85 보다 낮습니다. 올립니다..." -ForegroundColor Cyan
    if (-not (Get-Command rustup -ErrorAction SilentlyContinue)) {
        throw "rustc $ver 는 1.85 보다 낮고 rustup 이 없습니다. https://rustup.rs 를 보세요."
    }
    & rustup update stable
    if ($LASTEXITCODE -ne 0) { throw 'rustup update 실패' }
    & rustup default stable
    $ver = Get-RustcVersion
    if ($null -eq $ver -or $ver -lt $min) {
        throw 'rustc 를 올렸는데도 1.85 보다 낮다. rustup update stable 을 직접 해 보세요.'
    }
}