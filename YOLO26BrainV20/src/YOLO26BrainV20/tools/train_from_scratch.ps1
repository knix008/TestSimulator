#Requires -Version 5.1
<#
.SYNOPSIS
  Installs Python training dependencies and runs pipeline_train_brain.py (download -> train -> ONNX).

.EXAMPLE
  .\train_from_scratch.ps1
  .\train_from_scratch.ps1 --epochs 50 --skip-download
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

python -m pip install -r requirements-train.txt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

python .\pipeline_train_brain.py @args
exit $LASTEXITCODE
