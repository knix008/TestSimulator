#!/usr/bin/env bash
set -euo pipefail
if [[ "$(id -u)" -ne 0 ]]; then
    echo "  sudo bash scripts/stop-local-ftp.sh"
    exit 1
fi
systemctl stop vsftpd
systemctl disable vsftpd
echo "  ✓  vsftpd 중지 및 자동 시작 해제"
