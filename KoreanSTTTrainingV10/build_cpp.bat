@echo off
setlocal
cd /d "%~dp0"
if not "%~1"=="" set "ONNXRUNTIME_ROOT=%~1"
if not exist "cpp\build" mkdir "cpp\build"

set "GPP="
where g++ >nul 2>&1 && set "GPP=g++"
if not defined GPP if exist "C:\Msys64\ucrt64\bin\g++.exe" set "GPP=C:\Msys64\ucrt64\bin\g++.exe"
if not defined GPP (
  echo g++ was not found. test_logmel was not built.
  goto infer
)
"%GPP%" -std=c++17 -O2 -static -I cpp -o cpp\build\test_logmel.exe cpp\test_logmel.cpp
if errorlevel 1 (
  "%GPP%" -std=c++17 -O2 -I cpp -o cpp\build\test_logmel.exe cpp\test_logmel.cpp
)
if errorlevel 1 (
  echo test_logmel build failed.
  goto fail
)
echo Built cpp\build\test_logmel.exe

:infer
if /i "%~1"=="download" set "ONNXRUNTIME_ROOT="
if /i "%~1"=="download" goto build_infer
if not defined ONNXRUNTIME_ROOT if exist "third_party\onnxruntime\include\onnxruntime_cxx_api.h" goto build_infer
if not defined ONNXRUNTIME_ROOT (
  echo.
  echo kws_infer was not built. Pass the ONNX Runtime directory, or download the official package:
  echo   build_cpp.bat C:\path\to\onnxruntime
  echo   build_cpp.bat download
  exit /b 0
)
:build_infer
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build_kws_infer.ps1"
if errorlevel 1 goto fail
echo Built kws_infer. onnxruntime.dll was copied next to the exe.
exit /b 0
:fail
pause
exit /b 1
