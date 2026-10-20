# Build the Windows release binary and a zip the user can install.
# If Inno Setup 6 is installed, also build MyDeskSearch-*-windows-x64-setup.exe.
# Run from the repository root: .\build.ps1   or   .\scripts\build.ps1
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Packaging = Join-Path $Root 'packaging\windows'
$VersionLine = Select-String -Path (Join-Path $Root 'Cargo.toml') -Pattern '^version = "([^"]+)"' | Select-Object -First 1
if (-not $VersionLine) { throw 'workspace version was not found in Cargo.toml' }
$Version = $VersionLine.Matches[0].Groups[1].Value

Push-Location $Root
try {
    cargo build --release --locked -p mydesksearch
    if ($LASTEXITCODE -ne 0) { throw "cargo build failed ($LASTEXITCODE)" }
    $metadata = cargo metadata --format-version 1 --no-deps --offline | ConvertFrom-Json
} finally {
    Pop-Location
}

$Exe = Join-Path $metadata.target_directory 'release\mydesksearch.exe'
if (-not (Test-Path -LiteralPath $Exe)) { throw "release binary was not found: $Exe" }

$StageName = "MyDeskSearch-$Version-windows-x64"
$Stage = Join-Path $Root "dist\windows\$StageName"
if (Test-Path -LiteralPath $Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force }
New-Item -ItemType Directory -Path $Stage -Force | Out-Null
Copy-Item -LiteralPath $Exe -Destination (Join-Path $Stage 'mydesksearch.exe')
foreach ($name in @('install.ps1', 'uninstall.ps1', 'install.cmd')) {
    Copy-Item -LiteralPath (Join-Path $Packaging $name) -Destination (Join-Path $Stage $name)
}
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $Stage 'version.txt'), $Version, $utf8)

$Zip = Join-Path $Root "dist\$StageName.zip"
if (Test-Path -LiteralPath $Zip) { Remove-Item -LiteralPath $Zip -Force }
Compress-Archive -Path (Join-Path $Stage '*') -DestinationPath $Zip
$RootZip = Join-Path $Root "$StageName.zip"
Copy-Item -LiteralPath $Zip -Destination $RootZip -Force

function New-SetupExe([string]$ZipPath, [string]$Destination, [string]$StubSource, [string]$Version, [string]$IconPath) {
    $csc = @(
        (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
        (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if (-not $csc) { throw 'The .NET Framework C# compiler was not found' }
    $rc = Get-ChildItem -Path 'C:\Program Files (x86)\Windows Kits\10\bin' -Filter rc.exe -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '\\x64\\rc\.exe$' } |
        Sort-Object FullName |
        Select-Object -Last 1
    if (-not $rc) { throw 'Windows rc.exe was not found' }
    if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Force }
    $work = Join-Path $env:TEMP ("mydesksearch-setup-stub-" + [guid]::NewGuid().ToString('n'))
    New-Item -ItemType Directory -Path $work | Out-Null
    $numbers = @($Version.Split('.'))
    while ($numbers.Count -lt 3) { $numbers += '0' }
    $fileVersion = '{0},{1},{2},0' -f $numbers[0], $numbers[1], $numbers[2]
    if (-not (Test-Path -LiteralPath $IconPath)) { throw "program icon was not found: $IconPath" }
    $iconRc = $IconPath.Replace('\', '\\')
    $rcText = @"
1 ICON "$iconRc"
1 VERSIONINFO
FILEVERSION $fileVersion
PRODUCTVERSION $fileVersion
FILEFLAGSMASK 0x3fL
FILEFLAGS 0x0L
FILEOS 0x40004L
FILETYPE 0x1L
FILESUBTYPE 0x0L
BEGIN
    BLOCK "StringFileInfo"
    BEGIN
        BLOCK "040904B0"
        BEGIN
            VALUE "CompanyName", "MyDeskSearch"
            VALUE "FileDescription", "MyDeskSearch Setup"
            VALUE "FileVersion", "$Version"
            VALUE "InternalName", "mydesksearch-setup"
            VALUE "OriginalFilename", "mydesksearch${Version}_setup.exe"
            VALUE "ProductName", "MyDeskSearch"
            VALUE "ProductVersion", "$Version"
        END
    END
    BLOCK "VarFileInfo"
    BEGIN
        VALUE "Translation", 0x409, 1200
    END
END
"@
    $rcFile = Join-Path $work 'setup.rc'
    $resFile = Join-Path $work 'setup.res'
    [System.IO.File]::WriteAllText($rcFile, $rcText)
    & $rc.FullName /nologo /fo $resFile $rcFile
    if ($LASTEXITCODE -ne 0) { throw "version resource compile failed ($LASTEXITCODE)" }
    $stub = Join-Path $work 'stub.exe'
    & $csc /nologo /target:winexe /win32res:$resFile /r:System.IO.Compression.FileSystem.dll /r:System.Windows.Forms.dll /out:$stub $StubSource
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $stub)) { throw "setup stub compile failed ($LASTEXITCODE)" }
    $marker = [System.Text.Encoding]::ASCII.GetBytes('MYDSZIP')
    $payload = [System.IO.File]::ReadAllBytes($ZipPath)
    $output = [System.IO.File]::Open($Destination, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
    $stubStream = [System.IO.File]::OpenRead($stub)
    try {
        $stubStream.CopyTo($output)
        $output.Write($marker, 0, $marker.Length)
        $output.Write($payload, 0, $payload.Length)
    } finally {
        $stubStream.Dispose()
        $output.Dispose()
    }
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path -LiteralPath $Destination)) { throw "setup executable was not created: $Destination" }
}

$SetupName = "mydesksearch${Version}_setup.exe"
$Dist = Join-Path $Root 'dist'
New-Item -ItemType Directory -Path $Dist -Force | Out-Null
$Setup = Join-Path $Dist $SetupName
New-SetupExe -ZipPath $Zip -Destination $Setup -StubSource (Join-Path $Packaging 'SetupStub.cs') -Version $Version -IconPath (Join-Path $Packaging 'mydesksearch.ico')
$RootSetup = Join-Path $Root $SetupName
Copy-Item -LiteralPath $Setup -Destination $RootSetup -Force

$Iscc = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
    (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

if ($Iscc) {
    $innoSetup = Join-Path $Dist "MyDeskSearch-$Version-windows-x64-setup.exe"
    & $Iscc "/DMyAppVersion=$Version" "/DSourceDir=$Stage" "/DOutputDir=$Dist" (Join-Path $Packaging 'DeskSearch.iss')
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed ($LASTEXITCODE)" }
    Copy-Item -LiteralPath $innoSetup -Destination (Join-Path $Root (Split-Path $innoSetup -Leaf)) -Force
}

Write-Host "Installer directory: $Stage"
Write-Host "Zip installer: $RootZip"
Write-Host "Setup executable: $RootSetup"
