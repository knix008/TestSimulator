#!/usr/bin/env bash
# 아이콘 그림을 깨뜨리는 호출을 가려낸다.
# 시험마다 탐색기를 새로 띄워 기준을 맞춘다. 한 번 깨지면 다시 띄울 때까지 깨진 채로 남기 때문이다.
#
#   tools/icon-trial.sh "이름" VAR=1 VAR2=1
#
# npm run pack 으로 빌드한 src-tauri/target/release/MyDeskBox.exe 를 띄운다.

set -u
label="$1"; shift

# 이 저장소에서 빌드한 MyDeskBox 만 끝낸다. 설치해서 쓰는 MyDeskBox 는 건드리지 않는다.
stop_dev() {
  powershell.exe -NoProfile -Command 'Get-Process MyDeskBox,mydeskbox -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*src-tauri*target*" } | Stop-Process -Force' >/dev/null 2>&1 || true
}

stop_dev
powershell.exe -NoProfile -Command "Stop-Process -Name explorer -Force; Start-Sleep -Milliseconds 2500; if (-not (Get-Process -Name explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }" >/dev/null 2>&1
sleep 8

before=$(node tools/icon-check.js 2>&1 | tail -1)
env "$@" src-tauri/target/release/MyDeskBox.exe > /dev/null 2>&1 &
sleep 13
after=$(node tools/icon-check.js 2>&1 | tail -1)
stop_dev

printf '%-40s 앞: %-30s 뒤: %s\n' "$label" "$before" "$after"
