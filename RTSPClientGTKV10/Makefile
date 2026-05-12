SHELL := /bin/bash

OS := $(shell uname -s)
APP := rtspclient
SRC := main.c app_ui.c media_core.c youtube_service.c
CORE_PKGS := gtk+-3.0 gstreamer-1.0 gstreamer-video-1.0
CC ?= cc
CFLAGS += -O2 -Wall -Wextra -std=c11

ifeq ($(OS),Darwin)
BREW_PREFIX := $(shell brew --prefix 2>/dev/null)
ifneq ($(BREW_PREFIX),)
export PKG_CONFIG_PATH := $(BREW_PREFIX)/lib/pkgconfig:$(BREW_PREFIX)/share/pkgconfig:$(PKG_CONFIG_PATH)
endif
endif

.PHONY: all help deps-ensure deps-check deps-check-core deps-check-youtube deps-install deps-install-core deps-install-youtube build run clean

all:
	@echo "========================================"
	@echo "[STEP 1/3] Ensuring dependencies"
	@echo "========================================"
	@$(MAKE) deps-ensure
	@echo "========================================"
	@echo "[STEP 2/3] Building executable"
	@echo "========================================"
	@$(MAKE) build
	@echo "========================================"
	@echo "[STEP 3/3] Done"
	@echo "Output: ./$(APP)"
	@echo "========================================"

help:
	@echo "Targets:"
	@echo "  make                      - Check deps, install missing ones, then build"
	@echo "  make deps-ensure          - Check deps, install missing ones automatically"
	@echo "  make deps-check           - Check all dependencies"
	@echo "  make deps-check-core      - Check core build/runtime dependencies"
	@echo "  make deps-check-youtube   - Check YouTube dependency only (yt-dlp)"
	@echo "  make deps-install         - Install all dependencies"
	@echo "  make deps-install-core    - Install core dependencies only"
	@echo "  make deps-install-youtube - Install YouTube dependency only"
	@echo "  make build                - Build C GTK player"
	@echo "  make run                  - Build and run player"
	@echo "  make clean                - Remove build output"

deps-ensure:
	@echo "[Ensure] checking dependencies..."
	@$(MAKE) -s deps-check >/dev/null 2>&1 && { \
		echo "Dependencies already satisfied."; \
	} || { \
		echo "Missing dependencies detected. Installing..."; \
		if [ "$(OS)" = "Linux" ] && ! [ -t 0 ]; then \
			echo "Non-interactive shell detected."; \
			echo "Please run this in an interactive terminal:"; \
			echo "  make deps-install"; \
			echo "Then run:"; \
			echo "  make"; \
			exit 1; \
		fi; \
		$(MAKE) deps-install || { \
			echo "Dependency installation failed. Please run: make deps-install"; \
			exit 1; \
		}; \
		echo "Re-checking dependencies..."; \
		$(MAKE) deps-check; \
	}

deps-check: deps-check-core deps-check-youtube
	@echo "[Check] all dependencies look good."

deps-check-core:
	@echo "[Check] commands..."
	@missing=0; \
	for cmd in pkg-config gst-launch-1.0; do \
		if ! command -v $$cmd >/dev/null 2>&1; then \
			echo "  MISSING: $$cmd"; missing=1; \
		else \
			echo "  OK: $$cmd"; \
		fi; \
	done; \
	echo "[Check] pkg-config modules..."; \
	for mod in $(CORE_PKGS); do \
		if ! pkg-config --exists $$mod; then \
			echo "  MISSING: $$mod"; missing=1; \
		else \
			echo "  OK: $$mod"; \
		fi; \
	done; \
	if [ $$missing -eq 1 ]; then \
		echo ""; \
		echo "Core dependencies are missing. Run: make deps-install-core"; \
		exit 1; \
	fi; \
	echo "Core dependencies look good."

deps-check-youtube:
	@echo "[Check] youtube dependencies..."
	@missing=0; \
	for cmd in yt-dlp node ffmpeg; do \
		if ! command -v $$cmd >/dev/null 2>&1; then \
			echo "  MISSING: $$cmd"; missing=1; \
		else \
			echo "  OK: $$cmd ($$($$cmd --version 2>&1 | head -1))"; \
		fi; \
	done; \
	if [ $$missing -eq 1 ]; then \
		echo "Install with: make deps-install-youtube"; \
		exit 1; \
	fi; \
	yt_line=$$(yt-dlp --version 2>&1 | head -1); \
	if echo "$$yt_line" | grep -qE '^20(2[0-3]|24)\.'; then \
		echo "  WARNING: yt-dlp가 오래되었습니다 ($$yt_line). YouTube 403이 날 수 있습니다."; \
		echo "           최신 바이너리 설치: make deps-install-youtube"; \
	fi

deps-install: deps-install-core deps-install-youtube
	@echo "[Install] completed. Run: make deps-check"

deps-install-core:
ifeq ($(OS),Linux)
	@echo "[Linux] Installing core dependencies using apt..."
	@sudo apt update
	@sudo apt install -y \
		build-essential pkg-config \
		libgtk-3-dev \
		libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev \
		gstreamer1.0-tools gstreamer1.0-gtk3 \
		gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
		gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly \
		gstreamer1.0-libav \
		ca-certificates
else ifeq ($(OS),Darwin)
	@echo "[macOS] Installing core dependencies using Homebrew..."
	@command -v brew >/dev/null 2>&1 || { echo "Homebrew is required: https://brew.sh"; exit 1; }
	@brew update
	@brew install pkg-config gtk+3 gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad gst-libav
	@echo "Using Homebrew prefix: $$(brew --prefix)"
	@echo "If pkg-config still fails, run:"
	@echo "  export PKG_CONFIG_PATH=$$(brew --prefix)/lib/pkgconfig:$$(brew --prefix)/share/pkgconfig"
else
	@echo "Unsupported OS: $(OS)"
	@exit 1
endif

deps-install-youtube:
ifeq ($(OS),Linux)
	@echo "[Linux] YouTube: ffmpeg·nodejs 설치 및 최신 yt-dlp(GitHub) 설치..."
	@sudo apt update
	@sudo apt install -y curl ca-certificates ffmpeg nodejs
	@curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /tmp/yt-dlp-install.bin
	@chmod 755 /tmp/yt-dlp-install.bin
	@if sudo install -m 755 /tmp/yt-dlp-install.bin /usr/local/bin/yt-dlp; then \
		echo "Installed: $$(command -v yt-dlp) ($$(yt-dlp --version 2>&1 | head -1))"; \
	else \
		mkdir -p "$$HOME/.local/bin"; \
		install -m 755 /tmp/yt-dlp-install.bin "$$HOME/.local/bin/yt-dlp"; \
		echo "Installed: $$HOME/.local/bin/yt-dlp ($$($$HOME/.local/bin/yt-dlp --version 2>&1 | head -1))"; \
		echo "PATH 앞에 ~/.local/bin 이 오도록 해 주세요 (예: export PATH=\"$$HOME/.local/bin:$$PATH\")."; \
	fi
	@rm -f /tmp/yt-dlp-install.bin
	@echo "=== Optional: yt-dlp 사용자 설정에 JS 런타임(쉘에서 yt-dlp 쓸 때) ==="
	@mkdir -p "$$HOME/.config/yt-dlp"; \
	config_file="$$HOME/.config/yt-dlp/config"; \
	if [ -f "$$config_file" ]; then \
		grep -v "js-runtimes" "$$config_file" > "$$config_file.tmp" && mv "$$config_file.tmp" "$$config_file"; \
	fi; \
	if command -v node >/dev/null 2>&1; then \
		echo "--js-runtimes node" >> "$$config_file"; \
		echo "Wrote --js-runtimes node to $$config_file (앱은 --ignore-config 사용)"; \
	fi
else ifeq ($(OS),Darwin)
	@echo "[macOS] Installing YouTube dependency..."
	@command -v brew >/dev/null 2>&1 || { echo "Homebrew is required: https://brew.sh"; exit 1; }
	@brew install yt-dlp node ffmpeg
	@brew upgrade yt-dlp 2>/dev/null || true
	@echo "=== Configuring yt-dlp JavaScript runtime ==="
	@mkdir -p "$$HOME/.config/yt-dlp"; \
	config_file="$$HOME/.config/yt-dlp/config"; \
	if [ -f "$$config_file" ]; then \
		grep -v "js-runtimes" "$$config_file" > "$$config_file.tmp" && mv "$$config_file.tmp" "$$config_file"; \
	fi; \
	if command -v node >/dev/null 2>&1; then \
		echo "--js-runtimes node" >> "$$config_file"; \
		echo "yt-dlp configured to use node $$(node --version)"; \
	fi
else
	@echo "Unsupported OS: $(OS)"
	@exit 1
endif

build:
	@echo "[Build] compiling $(APP)..."
	@pkg-config --exists $(CORE_PKGS) || { \
		echo "Missing pkg-config modules. Run: make deps-install"; \
		if [ "$(OS)" = "Darwin" ]; then \
			echo "macOS hint: export PKG_CONFIG_PATH=$$(brew --prefix)/lib/pkgconfig:$$(brew --prefix)/share/pkgconfig"; \
		fi; \
		echo "Then verify with: make deps-check"; \
		exit 1; \
	}; \
	$(CC) $(CFLAGS) $(SRC) -o $(APP) $$(pkg-config --cflags --libs $(CORE_PKGS))
	@echo "[Build] done: ./$(APP)"

run: build
	@echo "[Run] starting ./$(APP)"
	@./$(APP)

clean:
	@rm -f "$(APP)"
