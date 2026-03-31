# PandocLinux 의존성 설치 및 빌드 스크립트 (정리본)
set -e

echo "======================================"
echo "  PandocLinux 의존성 설치 스크립트"
echo "======================================"
echo ""

# --- OS 감지 ---
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
else
    OS="linux"
fi

# 1. 패키지 목록/환경 업데이트
echo "[1/7] 패키지 목록/환경 업데이트..."
if [[ "$OS" == "linux" ]]; then
    sudo apt-get update -qq
elif [[ "$OS" == "macos" ]]; then
    if ! command -v brew &>/dev/null; then
        echo "Homebrew가 필요합니다. https://brew.sh/ 참고 후 설치하세요."
        exit 1
    fi
    brew update
fi

# 2. 빌드 도구 설치
echo "[2/7] 빌드 도구 설치 (컴파일러, cmake, pkg-config)..."
if [[ "$OS" == "linux" ]]; then
    sudo apt-get install -y build-essential cmake pkg-config
elif [[ "$OS" == "macos" ]]; then
    for pkg in cmake pkg-config gcc; do
        brew list --formula | grep -qx "$pkg" && echo "  → $pkg 이미 설치됨" || brew install "$pkg"
    done
fi
echo "  → GCC  : $(gcc --version | head -1)"
echo "  → CMake: $(cmake --version | head -1)"

# 3. GTK3 설치
echo "[3/7] GTK3 개발 라이브러리 설치..."
if [[ "$OS" == "linux" ]]; then
    sudo apt-get install -y libgtk-3-dev
elif [[ "$OS" == "macos" ]]; then
    brew list --formula | grep -qx "gtk+3" && echo "  → gtk+3 이미 설치됨" || brew install gtk+3
fi
echo "  → GTK3 버전: $(pkg-config --modversion gtk+-3.0)"

# 4. Pandoc 설치
echo "[4/7] Pandoc 설치..."
if command -v pandoc &>/dev/null; then
    echo "  → Pandoc 이미 설치됨: $(pandoc --version | head -1)"
else
    if [[ "$OS" == "linux" ]]; then
        sudo apt-get install -y pandoc
    elif [[ "$OS" == "macos" ]]; then
        brew install pandoc
    fi
    echo "  → Pandoc 설치 완료: $(pandoc --version | head -1)"
fi

# 5. PDF 출력용 LaTeX(xelatex) 설치
echo "[5/7] PDF 출력용 LaTeX(xelatex) 의존성 검사..."
if ! command -v xelatex >/dev/null 2>&1; then
    if [[ "$OS" == "linux" ]]; then
        echo "  → texlive-xetex 패키지가 필요합니다. 설치를 진행합니다."
        sudo apt-get install -y texlive-xetex texlive-fonts-recommended texlive-lang-cjk
        echo "  → LaTeX(xelatex) 설치 완료"
    elif [[ "$OS" == "macos" ]]; then
        if brew list --cask | grep -qE '^mactex(-no-gui)?$'; then
            echo "  → MacTeX 이미 설치됨"
        else
            echo "  → MacTeX(xelatex 포함) 설치를 진행합니다. (용량 큼)"
            brew install --cask mactex-no-gui
            echo "  → MacTeX 설치 완료"
        fi
        if ! command -v xelatex >/dev/null 2>&1; then
            echo "  → 경고: xelatex가 PATH에 없습니다. ~/.zshrc 또는 ~/.bash_profile에 다음을 추가하세요:"
            echo '     export PATH="/Library/TeX/texbin:$PATH"'
        fi
    fi
else
    echo "  → xelatex 이미 설치됨"
fi

# 6. Noto Sans CJK KR/Mono CJK KR 폰트 설치
echo "[6/7] Noto Sans CJK KR 및 Mono CJK KR 폰트 설치..."
if [[ "$OS" == "linux" ]]; then
    if ! fc-list | grep -q "NotoSansCJK"; then
        echo "  → Noto Sans CJK KR 폰트 설치 중..."
        sudo apt-get install -y fonts-noto-cjk
        echo "  → Noto Sans CJK KR 폰트 설치 완료"
    else
        echo "  → Noto Sans CJK KR 폰트 이미 설치됨"
    fi
elif [[ "$OS" == "macos" ]]; then
    if ! fc-list | grep -q "NotoSansCJK"; then
        echo "  → Noto Sans CJK KR 폰트 설치 중..."
        brew install --cask font-noto-sans-cjk-kr
        brew install --cask font-noto-sans-mono-cjk-kr
        echo "  → Noto Sans CJK KR/Mono CJK KR 폰트 설치 완료"
    else
        echo "  → Noto Sans CJK KR 폰트 이미 설치됨"
    fi
fi

# 7. (macOS) GTK3 아이콘/테마 및 pixbuf 로더 환경
if [[ "$OS" == "macos" ]]; then
    echo "[7/7] GTK3 아이콘/테마 및 pixbuf 로더 환경 구성..."
    PIXBUF_NEEDS_UPDATE=false
    for pkg in adwaita-icon-theme librsvg; do
        if brew list --formula | grep -qx "$pkg"; then
            echo "  → $pkg 이미 설치됨"
        else
            brew install "$pkg"
            PIXBUF_NEEDS_UPDATE=true
        fi
    done
    if $PIXBUF_NEEDS_UPDATE && command -v gdk-pixbuf-query-loaders >/dev/null 2>&1; then
        PIXBUF_CACHE="$(brew --prefix)/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache"
        gdk-pixbuf-query-loaders > /tmp/loaders.cache
        if [[ -w "$PIXBUF_CACHE" ]]; then
            mv /tmp/loaders.cache "$PIXBUF_CACHE"
        else
            sudo mv /tmp/loaders.cache "$PIXBUF_CACHE"
        fi
        echo "  → pixbuf 로더 캐시 갱신 완료"
    fi
    echo "  → Adwaita 아이콘, librsvg, pixbuf 로더 캐시 갱신 완료"
fi

# --- 빌드 ---
echo ""
echo "======================================"
echo "  프로젝트 빌드 (Makefile)"
echo "======================================"
if [[ "$OS" == "macos" ]]; then
    export PKG_CONFIG_PATH="/opt/homebrew/lib/pkgconfig:/usr/local/lib/pkgconfig:$PKG_CONFIG_PATH"
fi
make

# --- 실행 안내 ---
echo ""
echo "======================================"
if [[ "$OS" == "macos" ]]; then
    BIN_NAME="pandoc_macos"
else
    BIN_NAME="pandoc_linux"
fi
echo "  빌드 완료! 실행 방법:"
echo "    ./$BIN_NAME"
echo "======================================"
