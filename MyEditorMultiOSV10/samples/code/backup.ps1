# PowerShell — parameters, pipelines, objects
param(
    [Parameter(Mandatory)] [string] $Source,
    [string] $Destination = "$env:TEMP\backup"
)

New-Item -ItemType Directory -Force -Path $Destination | Out-Null
Get-ChildItem -Path $Source -File -Recurse |
    Where-Object { $_.Length -gt 0 } |
    ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $Destination
        Write-Host ("copied {0} ({1:N0} bytes)" -f $_.Name, $_.Length)
    }
