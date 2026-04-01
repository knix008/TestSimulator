@echo off
setlocal
cd /d "%~dp0"
python "%~dp0python\download_and_export_onnx.py" %*
set EXITCODE=%ERRORLEVEL%
if %EXITCODE% neq 0 exit /b %EXITCODE%
