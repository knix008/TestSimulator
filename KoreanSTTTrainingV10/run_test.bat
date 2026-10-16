@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
call "%~dp0scripts\setup_python.bat"
if errorlevel 1 goto fail
if "%~1"=="" (
  echo Usage: run_test.bat WAV [THRESHOLD] [--engine onnx^|pytorch] [--model modelscresnet1]
  echo Example: run_test.bat data\audio\출근\0001.wav 0.70
  goto fail
)
"%PY%" -m kws.infer %*
if errorlevel 1 goto fail
echo.
pause
exit /b 0
:fail
pause
exit /b 1
