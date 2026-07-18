@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 가 필요합니다. https://nodejs.org 에서 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo 의존성 설치 중...
  call npm install
  if errorlevel 1 (
    echo npm install 실패
    pause
    exit /b 1
  )
)

echo ISO Maker 시작...
call npm start
