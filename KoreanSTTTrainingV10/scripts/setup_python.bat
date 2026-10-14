@echo off
rem Shared setup. Call from a project-root script. Sets PY.
cd /d "%~dp0.."
set "PY=%CD%\.venv\Scripts\python.exe"
set "PYTHONIOENCODING=utf-8"
if not exist "%PY%" (
  echo Creating a Python 3.13 virtual environment...
  py -3.13 -c "import sys" >nul 2>&1
  if not errorlevel 1 (
    py -3.13 -m venv .venv
  ) else (
    py -3.12 -m venv .venv
  )
  if errorlevel 1 (
    echo Could not create a virtual environment. Install Python 3.12 or 3.13.
    exit /b 1
  )
)
"%PY%" -c "import numpy,sounddevice,soundfile,torch,onnxruntime" >nul 2>&1
if errorlevel 1 (
  echo Installing packages. The first run can take several minutes.
  "%PY%" -m pip install --upgrade pip
  if errorlevel 1 exit /b 1
  "%PY%" -m pip install -r "%CD%\requirements.txt"
  if errorlevel 1 (
    echo Package installation failed.
    exit /b 1
  )
)
exit /b 0
