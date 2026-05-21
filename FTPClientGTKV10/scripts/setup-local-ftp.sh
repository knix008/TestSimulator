#!/usr/bin/env bash
# 로컬 PC(Ubuntu/Debian)에 vsftpd FTP 서비스 설치·활성화
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
    echo "이 스크립트는 root 권한이 필요합니다."
    echo "  sudo bash scripts/setup-local-ftp.sh"
    exit 1
fi

echo "[1/5] vsftpd 설치 ..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y vsftpd

echo "[2/5] 설정 백업 ..."
cp -a /etc/vsftpd.conf /etc/vsftpd.conf.bak.$(date +%Y%m%d%H%M%S) 2>/dev/null || true

echo "[3/5] vsftpd.conf 적용 ..."
cat > /etc/vsftpd.conf <<'EOF'
# FTPClientGTKV10 로컬 테스트용 기본 설정
listen=YES
listen_ipv6=NO
anonymous_enable=NO
local_enable=YES
write_enable=YES
local_umask=022
dirmessage_enable=YES
use_localtime=YES
xferlog_enable=YES
connect_from_port_20=YES
chroot_local_user=YES
allow_writeable_chroot=YES
secure_chroot_dir=/var/run/vsftpd/empty
pam_service_name=vsftpd
pasv_enable=YES
pasv_min_port=40000
pasv_max_port=40100
user_sub_token=$USER
local_root=/home/$USER
EOF

echo "[4/5] 서비스 시작 및 부팅 시 자동 실행 ..."
systemctl enable vsftpd
systemctl restart vsftpd

echo "[5/5] 방화벽(있는 경우) FTP 허용 ..."
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow 21/tcp
    ufw allow 40000:40100/tcp
fi

echo ""
echo "  ✓  FTP 서비스 활성화 완료"
echo ""
echo "  연결 정보 (FTP 클라이언트):"
echo "    프로토콜 : FTP"
echo "    호스트   : 127.0.0.1"
echo "    포트     : 21"
echo "    사용자   : $(logname 2>/dev/null || echo '본인 Linux 계정')"
echo "    비밀번호 : 해당 계정 로그인 비밀번호"
echo ""
systemctl --no-pager status vsftpd | head -5
ss -tlnp | grep -E ':21\s' || true
