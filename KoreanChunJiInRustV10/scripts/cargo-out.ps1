# cargo-out.ps1 - cargo 가 실행 파일을 둔 폴더를 찾는다.
#
#   . "$root\scripts\cargo-out.ps1"
#   $out = Get-CargoProfileDir 'release'
#
# CARGO_TARGET_DIR 이 다른 곳을 가리켜도 cargo metadata 가 진짜 자리를 준다.
# 호출하는 쪽이 이 파일을 dot-source 한다.

function Get-CargoProfileDir {
    param(
        [string]$Profile = 'release'
    )
    # PowerShell 5.1 의 ConvertFrom-Json 은 한글이 섞인 cargo metadata 를
    # 종종 읽지 못한다. 환경 변수와 칸 이름만 본다.
    if ($env:CARGO_TARGET_DIR) {
        return (Join-Path $env:CARGO_TARGET_DIR $Profile)
    }
    $raw = & cargo metadata --format-version 1 --no-deps 2>$null
    if (-not $raw) {
        throw 'cargo metadata 가 비었다. rustc / cargo 를 먼저 넣는다.'
    }
    $json = if ($raw -is [System.Array]) { $raw -join "`n" } else { [string]$raw }
    if ($json -notmatch '"target_directory"\s*:\s*"((?:\\.|[^"\\])*)"') {
        throw 'cargo metadata 에 target_directory 가 없다.'
    }
    $dir = $Matches[1].Replace('\\', '\')
    return (Join-Path $dir $Profile)
}

function Copy-CargoBinTo {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$DestDir,
        [string]$Profile = 'release'
    )
    $src = Join-Path (Get-CargoProfileDir $Profile) $Name
    if (-not (Test-Path -LiteralPath $src)) {
        throw "빌드 결과가 없다: $src"
    }
    Copy-Item -LiteralPath $src -Destination (Join-Path $DestDir $Name) -Force
}

# 앱을 payload 에 넣고 설치 프로그램을 만든 뒤, 루트에 복사하고 payload 를 비운다.
function Build-ChunjiinSetup {
    param(
        [Parameter(Mandatory)][string]$Root,
        [string]$Profile = 'release',
        [string[]]$CargoArgs = @('build', '--release')
    )
    $payload = Join-Path $Root 'crates\setup\payload'
    $app = Join-Path $Root 'chunjiin.exe'
    if (-not (Test-Path -LiteralPath $app)) {
        throw "설치 프로그램이 품을 앱이 없다: $app"
    }
    if (-not (Test-Path -LiteralPath $payload)) {
        New-Item -ItemType Directory -Force -Path $payload | Out-Null
    }
    Get-ChildItem -LiteralPath $payload -Filter 'chunjiin*' -ErrorAction SilentlyContinue |
        Remove-Item -Force
    Copy-Item -LiteralPath $app -Destination (Join-Path $payload 'chunjiin.exe') -Force
    try {
        cargo @CargoArgs -p chunjiin-setup
        if ($LASTEXITCODE -ne 0) { throw '설치 프로그램 빌드 실패' }
        Copy-CargoBinTo -Name 'chunjiin-setup.exe' -DestDir $Root -Profile $Profile
    }
    finally {
        Get-ChildItem -LiteralPath $payload -Filter 'chunjiin*' -ErrorAction SilentlyContinue |
            Remove-Item -Force
    }
}
