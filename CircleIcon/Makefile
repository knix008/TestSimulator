CC     = gcc
TARGET = circle_icon
SRCS   = main.c

# ── OS 감지 ──────────────────────────────────────────────────────────────────
OS := $(shell uname -s)

# ── macOS: Homebrew PKG_CONFIG_PATH 자동 추가 ────────────────────────────────
ifeq ($(OS),Darwin)
    HOMEBREW_PREFIX := $(shell brew --prefix 2>/dev/null || echo /opt/homebrew)
    export PKG_CONFIG_PATH := $(HOMEBREW_PREFIX)/lib/pkgconfig:$(PKG_CONFIG_PATH)
endif

# ── GTK+3 플래그 감지 ─────────────────────────────────────────────────────────
GTK_CFLAGS := $(shell pkg-config --cflags gtk+-3.0 2>/dev/null)
GTK_LIBS   := $(shell pkg-config --libs   gtk+-3.0 2>/dev/null)

CFLAGS  = $(GTK_CFLAGS) -Wall -Wextra -O2 -std=c11
LDFLAGS = $(GTK_LIBS) -lm

.PHONY: all clean run install-deps check-deps

# ── 기본 타깃: GTK 없으면 자동으로 설치 후 빌드 ─────────────────────────────
all: check-deps $(TARGET)

# GTK 설치 여부 확인 → 없으면 OS별 설치 명령 실행
check-deps:
ifeq ($(GTK_CFLAGS),)
	@echo ""
	@echo "============================================================"
	@echo "  GTK+3 가 감지되지 않았습니다. 설치를 시작합니다..."
	@echo "  OS: $(OS)"
	@echo "============================================================"
ifeq ($(OS),Darwin)
	@echo "  [macOS] Homebrew로 gtk+3 설치 중..."
	@echo "  명령: brew install gtk+3"
	@echo "------------------------------------------------------------"
	@brew install gtk+3
	$(eval GTK_CFLAGS := $(shell HOMEBREW_PREFIX=$$(brew --prefix); \
	    PKG_CONFIG_PATH=$$HOMEBREW_PREFIX/lib/pkgconfig \
	    pkg-config --cflags gtk+-3.0 2>/dev/null))
	$(eval GTK_LIBS   := $(shell HOMEBREW_PREFIX=$$(brew --prefix); \
	    PKG_CONFIG_PATH=$$HOMEBREW_PREFIX/lib/pkgconfig \
	    pkg-config --libs   gtk+-3.0 2>/dev/null))
	$(eval CFLAGS  = $(GTK_CFLAGS) -Wall -Wextra -O2 -std=c11)
	$(eval LDFLAGS = $(GTK_LIBS) -lm)
else ifeq ($(OS),Linux)
	@if command -v apt-get >/dev/null 2>&1; then \
	    echo "  [Debian/Ubuntu] apt-get으로 libgtk-3-dev 설치 중..."; \
	    echo "  명령: sudo apt-get install libgtk-3-dev"; \
	    echo "------------------------------------------------------------"; \
	    sudo apt-get update && sudo apt-get install -y libgtk-3-dev; \
	elif command -v dnf >/dev/null 2>&1; then \
	    echo "  [Fedora/RHEL] dnf으로 gtk3-devel 설치 중..."; \
	    echo "  명령: sudo dnf install gtk3-devel"; \
	    echo "------------------------------------------------------------"; \
	    sudo dnf install -y gtk3-devel; \
	elif command -v pacman >/dev/null 2>&1; then \
	    echo "  [Arch Linux] pacman으로 gtk3 설치 중..."; \
	    echo "  명령: sudo pacman -S gtk3"; \
	    echo "------------------------------------------------------------"; \
	    sudo pacman -S --noconfirm gtk3; \
	elif command -v zypper >/dev/null 2>&1; then \
	    echo "  [openSUSE] zypper로 gtk3-devel 설치 중..."; \
	    echo "  명령: sudo zypper install gtk3-devel"; \
	    echo "------------------------------------------------------------"; \
	    sudo zypper install -y gtk3-devel; \
	else \
	    echo "  ERROR: 지원하지 않는 배포판입니다."; \
	    echo "  GTK+3 개발 패키지를 수동으로 설치해주세요."; \
	    echo "============================================================"; \
	    exit 1; \
	fi
	$(eval GTK_CFLAGS := $(shell pkg-config --cflags gtk+-3.0 2>/dev/null))
	$(eval GTK_LIBS   := $(shell pkg-config --libs   gtk+-3.0 2>/dev/null))
	$(eval CFLAGS  = $(GTK_CFLAGS) -Wall -Wextra -O2 -std=c11)
	$(eval LDFLAGS = $(GTK_LIBS) -lm)
else
	@echo "  ERROR: 지원하지 않는 OS ($(OS)) 입니다."
	@echo "  GTK+3를 수동으로 설치한 후 다시 시도해주세요."
	@echo "============================================================"
	@exit 1
endif
	@echo "============================================================"
	@echo "  GTK+3 설치 완료."
	@echo "============================================================"
	@echo ""
else
	@echo "[check-deps] GTK+3 감지됨 — 설치 불필요"
endif

$(TARGET): $(SRCS)
	@echo ""
	@echo "============================================================"
	@echo "  빌드 시작: $(TARGET)"
	@echo "  소스 파일: $(SRCS)"
	@echo "  컴파일러:  $(CC)"
	@echo "  최적화:    -O2  표준: c11"
	@echo "============================================================"
	@echo "  컴파일 중..."
	@$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)
	@echo "------------------------------------------------------------"
	@echo "  빌드 성공: ./$(TARGET)"
	@echo "  실행 방법: make run  또는  ./$(TARGET) [이미지파일]"
	@echo "============================================================"
	@echo ""

# 명시적 의존성 설치 타깃 (make install-deps)
install-deps:
	@echo ""
	@echo "============================================================"
	@echo "  GTK+3 설치 (OS: $(OS))"
	@echo "============================================================"
ifeq ($(OS),Darwin)
	@echo "  명령: brew install gtk+3"
	@echo "------------------------------------------------------------"
	@brew install gtk+3
else ifeq ($(OS),Linux)
	@if command -v apt-get >/dev/null 2>&1; then \
	    echo "  명령: sudo apt-get install libgtk-3-dev"; \
	    echo "------------------------------------------------------------"; \
	    sudo apt-get update && sudo apt-get install -y libgtk-3-dev; \
	elif command -v dnf >/dev/null 2>&1; then \
	    echo "  명령: sudo dnf install gtk3-devel"; \
	    echo "------------------------------------------------------------"; \
	    sudo dnf install -y gtk3-devel; \
	elif command -v pacman >/dev/null 2>&1; then \
	    echo "  명령: sudo pacman -S gtk3"; \
	    echo "------------------------------------------------------------"; \
	    sudo pacman -S --noconfirm gtk3; \
	elif command -v zypper >/dev/null 2>&1; then \
	    echo "  명령: sudo zypper install gtk3-devel"; \
	    echo "------------------------------------------------------------"; \
	    sudo zypper install -y gtk3-devel; \
	else \
	    echo "  ERROR: 패키지 관리자를 찾을 수 없습니다."; \
	    echo "============================================================"; \
	    exit 1; \
	fi
else
	@echo "  ERROR: 지원하지 않는 OS ($(OS)) 입니다."
	@echo "============================================================"
	@exit 1
endif
	@echo "============================================================"
	@echo "  설치 완료."
	@echo "============================================================"
	@echo ""

run: $(TARGET)
	@echo "  실행: ./$(TARGET)"
	@echo "------------------------------------------------------------"
	@./$(TARGET)

clean:
	@echo "  정리 중: $(TARGET) 삭제"
	@rm -f $(TARGET)
	@echo "  완료."
