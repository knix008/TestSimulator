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
if not defined ONNXRUNTIME_ROOT (
  echo.
  echo kws_infer was not built. Pass the ONNX Runtime directory:
  echo   build_cpp.bat C:\path\to\onnxruntime
  exit /b 0
)
where cmake >nul 2>&1
if errorlevel 1 (
  echo cmake is required to build kws_infer.
  goto fail
)
cmake -S cpp -B cpp\build -DONNXRUNTIME_ROOT="%ONNXRUNTIME_ROOT%"
if errorlevel 1 goto fail
cmake --build cpp\build --config Release
if errorlevel 1 goto fail
echo Built kws_infer. Copy onnxruntime.dll next to the exe.
exit /b 0
:fail
pause
exit /b 1
