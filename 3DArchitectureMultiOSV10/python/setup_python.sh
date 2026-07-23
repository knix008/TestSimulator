#!/usr/bin/env bash
# 3D Architecture Viewer - AI Python 환경 설정 (macOS / Linux)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

echo "============================================================"
echo " 3D Architecture Viewer - AI Python 환경 설정"
echo "============================================================"
echo

# ── Python 확인 ─────────────────────────────────────────────
if command -v python3 &>/dev/null; then
    PYTHON=python3
    PIP=pip3
elif command -v python &>/dev/null; then
    PYTHON=python
    PIP=pip
else
    echo "[오류] Python이 설치되어 있지 않습니다."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "       brew install python3 또는 https://www.python.org/ 에서 설치하세요."
    else
        echo "       sudo apt install python3 python3-pip 또는 배포판 패키지 관리자를 사용하세요."
    fi
    exit 1
fi

PY_VER=$($PYTHON --version 2>&1)
echo "[OK] $PY_VER 감지됨"

# ── pip 확인 ────────────────────────────────────────────────
$PYTHON -m pip --version &>/dev/null || {
    echo "[오류] pip을 찾을 수 없습니다."
    exit 1
}
echo "[OK] pip 감지됨"

# ── 가상환경 선택 ────────────────────────────────────────────
echo
echo "가상환경(venv)을 생성하시겠습니까? (Y/n)"
echo "  Y: $VENV_DIR 에 격리된 환경 생성 (권장)"
echo "  N: 시스템 Python에 전역 설치"
read -r -p "선택 [Y]: " USE_VENV
USE_VENV="${USE_VENV:-Y}"

if [[ "$USE_VENV" =~ ^[Yy]$ ]]; then
    if [ ! -d "$VENV_DIR" ]; then
        echo
        echo "[진행] 가상환경 생성 중..."
        $PYTHON -m venv "$VENV_DIR"
    else
        echo "[OK] 기존 가상환경 재사용: $VENV_DIR"
    fi
    PYTHON="$VENV_DIR/bin/python"
    PIP="$VENV_DIR/bin/pip"
fi

# ── 패키지 설치 ──────────────────────────────────────────────
echo
echo "[진행] 패키지 설치 중 (requirements.txt)..."
$PIP install --upgrade pip --quiet
$PIP install -r "$SCRIPT_DIR/requirements.txt"

# ── 설치 검증 ────────────────────────────────────────────────
echo
echo "[진행] 설치 검증 중..."
if $PYTHON -c "import flask, flask_cors, onnxruntime, PIL, numpy" &>/dev/null; then
    echo "[OK] 모든 핵심 패키지 정상 설치됨"
else
    echo "[경고] 일부 패키지 검증 실패. 오류를 확인하세요."
fi

if $PYTHON -c "from PyQt5.QtWidgets import QApplication" &>/dev/null 2>&1; then
    echo "[OK] PyQt5 정상 설치됨"
elif $PYTHON -c "from PyQt6.QtWidgets import QApplication" &>/dev/null 2>&1; then
    echo "[OK] PyQt6 정상 설치됨"
else
    echo "[정보] PyQt 없음 - 헤드리스 모드로 실행됩니다"
fi

# ── 실행 스크립트 생성 ───────────────────────────────────────
START_SH="$SCRIPT_DIR/start_server.sh"
cat > "$START_SH" <<EOF
#!/usr/bin/env bash
echo "AI 서버 시작 중..."
"$PYTHON" "$SCRIPT_DIR/ai_server.py"
EOF
chmod +x "$START_SH"

echo
echo "============================================================"
echo " 설정 완료!"
echo
echo " AI 서버 실행:  python/start_server.sh"
echo " 또는 직접:     $PYTHON python/ai_server.py"
echo
echo " Electron 앱을 실행하면 AI 서버가 자동으로 시작됩니다."
echo "============================================================"
