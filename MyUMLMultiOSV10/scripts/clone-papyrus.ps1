param(
    [string]$RepositoryUrl = "https://gitlab.eclipse.org/eclipse/papyrus/org.eclipse.papyrus-desktop.git",
    [string]$Destination = "vendor/org.eclipse.papyrus-desktop"
)

$ErrorActionPreference = "Stop"

if (Test-Path $Destination) {
    Write-Host "Papyrus Desktop reference repository already exists at $Destination"
    exit 0
}

New-Item -ItemType Directory -Path (Split-Path $Destination) -Force | Out-Null
git clone $RepositoryUrl $Destination

Write-Host "Papyrus Desktop reference repository cloned to $Destination"
Write-Host "Use this repository for file format analysis only. Do not include Java/Eclipse RCP runtime code in the product."