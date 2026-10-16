@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if "%~1"=="" (
  echo Usage: run_cpp.bat WAV [THRESHOLD] [MODEL_DIR]
  echo Example: run_cpp.bat data\audio\출근\0001.wav 0.70
  goto fail
)
set "EXE=%~dp0cpp\build\msvc\Release\kws_infer.exe"
if not exist "%EXE%" set "EXE=%~dp0cpp\build\Release\kws_infer.exe"
if not exist "%EXE%" set "EXE=%~dp0cpp\build\kws_infer.exe"
if not exist "%EXE%" (
  echo kws_infer.exe was not found. Build it first:
  echo   build_cpp.bat download
  goto fail
)
if defined ONNXRUNTIME_ROOT set "PATH=%ONNXRUNTIME_ROOT%\lib;%ONNXRUNTIME_ROOT%\bin;%PATH%"
set "MODEL=%~dp0models\latest"
if not "%~3"=="" set "MODEL=%~3"
"%EXE%" "%MODEL%" "%~1" %2
if errorlevel 1 goto fail
echo.
pause
exit /b 0
:fail
pause
exit /b 1
