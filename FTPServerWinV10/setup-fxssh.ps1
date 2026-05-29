# FxSsh (dev) — SFTP 서버용. 프로젝트 루트에서 실행.
$dest = Join-Path $PSScriptRoot "_fxssh_src"
if (Test-Path (Join-Path $dest "FxSsh\FxSsh.csproj")) {
    Write-Host "FxSsh already present at $dest"
    exit 0
}
git clone --depth 1 --branch dev https://github.com/Aimeast/FxSsh.git $dest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "FxSsh cloned to $dest"
