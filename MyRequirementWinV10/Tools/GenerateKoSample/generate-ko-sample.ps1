# Regenerates Sample/*.reqtproj and Sample/*.xlsx sample files.
$ErrorActionPreference = "Stop"
$ToolProject = Join-Path $PSScriptRoot "GenerateKoSample.csproj"

dotnet run --project $ToolProject -c Release
