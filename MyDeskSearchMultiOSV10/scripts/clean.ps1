# Remove build output: Cargo target, dist/, and installers copied to the repository root.
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

cargo clean
if ($LASTEXITCODE -ne 0) { throw "cargo clean failed ($LASTEXITCODE)" }

$dist = Join-Path $Root 'dist'
if (Test-Path -LiteralPath $dist) {
    Remove-Item -LiteralPath $dist -Recurse -Force
    Write-Host "Removed $dist"
}

$removed = @(Get-ChildItem -LiteralPath $Root -File | Where-Object {
        $_.Name -like 'MyDeskSearch-*.zip' -or
        $_.Name -like 'MyDeskSearch-*-setup.exe' -or
        $_.Name -like 'MyDeskSearch-*.tar.gz' -or
        $_.Name -like 'MyDeskSearch-*.pkg' -or
        $_.Name -like 'mydesksearch_*.deb' -or
        $_.Name -like 'mydesksearch*_setup.exe' -or
        $_.Name -like 'mydesksearch*.msi' -or
        $_.Name -like 'DeskSearch-*.zip' -or
        $_.Name -like 'DeskSearch-*-setup.exe'
    })
foreach ($file in $removed) {
    Remove-Item -LiteralPath $file.FullName -Force
    Write-Host "Removed $($file.FullName)"
}

Write-Host 'Clean finished.'
