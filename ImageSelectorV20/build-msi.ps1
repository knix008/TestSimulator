param(
    [string]$Version = "1.0.0"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeIdentifier = "win-x64"
$configuration = "Release"
$publishDir = Join-Path $projectRoot "artifacts\publish\$configuration\$runtimeIdentifier"
$msiDir = Join-Path $projectRoot "artifacts\msi"
$toolDir = Join-Path $projectRoot ".tools\wix"
$wixExe = Join-Path $toolDir "wix.exe"
$wxsFile = Join-Path $projectRoot "installer\Product.wxs"
$rootIconFile = Join-Path $projectRoot "daemon_hammer.ico"
$installerIconFile = Join-Path $projectRoot "installer\daemon_hammer.ico"
$outputMsi = Join-Path $msiDir "ImageSelectorV10-$Version.msi"

function Assert-Success([string]$stepName) {
    if ($LASTEXITCODE -ne 0) {
        throw "$stepName failed with exit code $LASTEXITCODE."
    }
}

New-Item -ItemType Directory -Force -Path $publishDir | Out-Null
New-Item -ItemType Directory -Force -Path $msiDir | Out-Null
New-Item -ItemType Directory -Force -Path $toolDir | Out-Null

$iconFile = $null
if (Test-Path $rootIconFile) {
    $iconFile = $rootIconFile
}
elseif (Test-Path $installerIconFile) {
    $iconFile = $installerIconFile
}
else {
    throw "Icon file not found.`nExpected one of:`n- $rootIconFile`n- $installerIconFile"
}

if (-not (Test-Path $wixExe)) {
    Write-Host "Installing WiX CLI..."
    dotnet tool install wix --version "5.*" --tool-path $toolDir
    Assert-Success "WiX CLI install"
}
else {
    $wixVersion = (& $wixExe --version).Trim()
    if ($wixVersion.StartsWith("7.")) {
        Write-Host "Replacing WiX v7 with v5 for MSI build compatibility..."
        dotnet tool uninstall wix --tool-path $toolDir
        Assert-Success "WiX CLI uninstall"
        dotnet tool install wix --version "5.*" --tool-path $toolDir
        Assert-Success "WiX CLI install"
    }
}

Write-Host "Ensuring WiX UI extension..."
& $wixExe extension add -g WixToolset.UI.wixext/5.0.2 | Out-Null
Assert-Success "WiX UI extension install"

Write-Host "Publishing app..."
dotnet publish "$projectRoot\ImageSelectorV10.csproj" `
    -c $configuration `
    -r $runtimeIdentifier `
    --self-contained true `
    /p:SkipMsiBuild=true `
    /p:PublishSingleFile=true `
    /p:IncludeNativeLibrariesForSelfExtract=true `
    -o $publishDir
Assert-Success "dotnet publish"

Write-Host "Building MSI..."
& $wixExe build $wxsFile `
    -ext WixToolset.UI.wixext `
    -d PublishDir="$publishDir" `
    -d IconPath="$iconFile" `
    -d ProductVersion="$Version" `
    -out $outputMsi
Assert-Success "wix build"

Write-Host ""
Write-Host "MSI created:"
Write-Host $outputMsi
