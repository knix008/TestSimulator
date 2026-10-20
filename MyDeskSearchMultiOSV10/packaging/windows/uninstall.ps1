$here = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $here 'install.ps1') -UninstallOnly @args
exit $LASTEXITCODE
