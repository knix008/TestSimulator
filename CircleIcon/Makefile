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
	@echo ">>> GTK+3 가 감지되지 않았습니다. 설치를 시작합니다..."
ifeq ($(OS),Darwin)
	@echo ">>> [macOS] brew install gtk+3"
	brew install gtk+3
	$(eval GTK_CFLAGS := $(shell HOMEBREW_PREFIX=$$(brew --prefix); \
	    PKG_CONFIG_PATH=$$HOMEBREW_PREFIX/lib/pkgconfig \
	    pkg-config --cflags gtk+-3.0 2>/dev/null))
	$(eval GTK_LIBS   := $(shell HOMEBREW_PREFIX=$$(brew --prefix); \
	    PKG_CONFIG_PATH=$$HOMEBREW_PREFIX/lib/pkgconfig \
	    pkg-config --libs   gtk+-3.0 2>/dev/null))
	$(eval CFLAGS  = $(GTK_CFLAGS) -Wall -Wextra -O2 -std=c11)
	$(eval LDFLAGS = $(GTK_LIBS) -lm)
else ifeq ($(OS),Linux)
	@# 배포판 패키지 관리자 자동 감지
	@if command -v apt-get >/dev/null 2>&1; then \
	    echo ">>> [Debian/Ubuntu] apt-get install libgtk-3-dev"; \
	    sudo apt-get update && sudo apt-get install -y libgtk-3-dev; \
	elif command -v dnf >/dev/null 2>&1; then \
	    echo ">>> [Fedora/RHEL] dnf install gtk3-devel"; \
	    sudo dnf install -y gtk3-devel; \
	elif command -v pacman >/dev/null 2>&1; then \
	    echo ">>> [Arch Linux] pacman -S gtk3"; \
	    sudo pacman -S --noconfirm gtk3; \
	elif command -v zypper >/dev/null 2>&1; then \
	    echo ">>> [openSUSE] zypper install gtk3-devel"; \
	    sudo zypper install -y gtk3-devel; \
	else \
	    echo "ERROR: 지원하지 않는 배포판입니다. GTK+3 개발 패키지를 수동으로 설치해주세요."; \
	    exit 1; \
	fi
	$(eval GTK_CFLAGS := $(shell pkg-config --cflags gtk+-3.0 2>/dev/null))
	$(eval GTK_LIBS   := $(shell pkg-config --libs   gtk+-3.0 2>/dev/null))
	$(eval CFLAGS  = $(GTK_CFLAGS) -Wall -Wextra -O2 -std=c11)
	$(eval LDFLAGS = $(GTK_LIBS) -lm)
else
	@echo "ERROR: 지원하지 않는 OS($(OS))입니다. GTK+3를 수동으로 설치해주세요."
	@exit 1
endif
	@echo ">>> GTK+3 설치 완료."
endif

$(TARGET): $(SRCS)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

# 명시적 의존성 설치 타깃 (make install-deps)
install-deps:
ifeq ($(OS),Darwin)
	brew install gtk+3
else ifeq ($(OS),Linux)
	@if command -v apt-get >/dev/null 2>&1; then \
	    sudo apt-get update && sudo apt-get install -y libgtk-3-dev; \
	elif command -v dnf >/dev/null 2>&1; then \
	    sudo dnf install -y gtk3-devel; \
	elif command -v pacman >/dev/null 2>&1; then \
	    sudo pacman -S --noconfirm gtk3; \
	elif command -v zypper >/dev/null 2>&1; then \
	    sudo zypper install -y gtk3-devel; \
	else \
	    echo "ERROR: 패키지 관리자를 찾을 수 없습니다."; exit 1; \
	fi
else
	@echo "ERROR: 지원하지 않는 OS($(OS))입니다."; exit 1
endif

run: $(TARGET)
	./$(TARGET)

clean:
	rm -f $(TARGET)
