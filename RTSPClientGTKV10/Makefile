SHELL := /bin/bash

OS := $(shell uname -s)
APP := rtspclient
SRC := main.c app_ui.c media_core.c youtube_service.c
CORE_PKGS := gtk+-3.0 gstreamer-1.0 gstreamer-video-1.0
WEBKIT_PKG_CANDIDATES := webkit2gtk-4.1 webkit2gtk-4.0
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
	@echo "  make                    - Check deps, install missing ones, then build"
	@echo "  make deps-ensure        - Check deps, install missing ones automatically"
	@echo "  make deps-check         - Check all dependencies"
	@echo "  make deps-check-core    - Check core build/runtime dependencies"
	@echo "  make deps-check-youtube - Check YouTube dependency only (yt-dlp)"
	@echo "  make deps-install       - Install all dependencies"
	@echo "  make deps-install-core  - Install core dependencies only"
	@echo "  make deps-install-youtube - Install YouTube dependency only"
	@echo "  make build        - Build C GTK player"
	@echo "  make run          - Build and run player"
	@echo "  make clean        - Remove build output"

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
	webkit_pkg=""; \
	for candidate in $(WEBKIT_PKG_CANDIDATES); do \
		if pkg-config --exists $$candidate; then \
			webkit_pkg="$$candidate"; \
			break; \
		fi; \
	done; \
	if [ -z "$$webkit_pkg" ]; then \
		echo "  MISSING: webkit2gtk pkg-config module (tried: $(WEBKIT_PKG_CANDIDATES))"; \
		missing=1; \
	else \
		echo "  OK: $$webkit_pkg"; \
	fi; \
	if [ $$missing -eq 1 ]; then \
		echo ""; \
		echo "Core dependencies are missing. Run: make deps-install-core"; \
		exit 1; \
	fi; \
	echo "Core dependencies look good."

deps-check-youtube:
	@echo "[Check] youtube dependency..."
	@command -v yt-dlp >/dev/null 2>&1 && { \
		echo "  OK: yt-dlp"; \
	} || { \
		echo "  MISSING: yt-dlp"; \
		echo "Install with: make deps-install-youtube"; \
		exit 1; \
	}

deps-install: deps-install-core deps-install-youtube
	@echo "[Install] completed. Run: make deps-check"

deps-install-core:
ifeq ($(OS),Linux)
	@echo "[Linux] Installing core dependencies using apt..."
	@sudo apt update
	@webkit_pkg=""; \
	if apt-cache show libwebkit2gtk-4.1-dev >/dev/null 2>&1; then \
		webkit_pkg="libwebkit2gtk-4.1-dev"; \
	elif apt-cache show libwebkit2gtk-4.0-dev >/dev/null 2>&1; then \
		webkit_pkg="libwebkit2gtk-4.0-dev"; \
	fi; \
	if [ -z "$$webkit_pkg" ]; then \
		echo "No suitable WebKit dev package found (tried 4.1-dev, 4.0-dev)."; \
		echo "Please install WebKitGTK dev package manually for your distro."; \
		exit 1; \
	fi; \
	echo "Using WebKit package: $$webkit_pkg"; \
	sudo apt install -y \
		build-essential pkg-config \
		libgtk-3-dev \
		libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev \
		gstreamer1.0-tools gstreamer1.0-gtk3 \
		gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
		gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly \
		gstreamer1.0-libav \
		ca-certificates \
		$$webkit_pkg
else ifeq ($(OS),Darwin)
	@echo "[macOS] Installing core dependencies using Homebrew..."
	@command -v brew >/dev/null 2>&1 || { echo "Homebrew is required: https://brew.sh"; exit 1; }
	@brew update
	@brew install pkg-config gtk+3 webkitgtk gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad gst-libav
	@echo "Using Homebrew prefix: $$(brew --prefix)"
	@echo "If pkg-config still fails, run:"
	@echo "  export PKG_CONFIG_PATH=$$(brew --prefix)/lib/pkgconfig:$$(brew --prefix)/share/pkgconfig"
else
	@echo "Unsupported OS: $(OS)"
	@exit 1
endif

deps-install-youtube:
ifeq ($(OS),Linux)
	@echo "[Linux] Installing YouTube dependency..."
	@sudo apt update
	@sudo apt install -y yt-dlp
else ifeq ($(OS),Darwin)
	@echo "[macOS] Installing YouTube dependency..."
	@command -v brew >/dev/null 2>&1 || { echo "Homebrew is required: https://brew.sh"; exit 1; }
	@brew install yt-dlp
else
	@echo "Unsupported OS: $(OS)"
	@exit 1
endif

build:
	@echo "[Build] compiling $(APP)..."
	@webkit_pkg=""; \
	for candidate in $(WEBKIT_PKG_CANDIDATES); do \
		if pkg-config --exists $$candidate; then \
			webkit_pkg="$$candidate"; \
			break; \
		fi; \
	done; \
	[ -n "$$webkit_pkg" ] || { \
		echo "Missing WebKit pkg-config module (tried: $(WEBKIT_PKG_CANDIDATES))."; \
		echo "Run: make deps-install-core"; \
		exit 1; \
	}; \
	pkg-config --exists $(CORE_PKGS) $$webkit_pkg || { \
		echo "Missing pkg-config modules. Run: make deps-install"; \
		if [ "$(OS)" = "Darwin" ]; then \
			echo "macOS hint: export PKG_CONFIG_PATH=$$(brew --prefix)/lib/pkgconfig:$$(brew --prefix)/share/pkgconfig"; \
		fi; \
		echo "Then verify with: make deps-check"; \
		exit 1; \
	}; \
	$(CC) $(CFLAGS) $(SRC) -o $(APP) $$(pkg-config --cflags --libs $(CORE_PKGS) $$webkit_pkg)
	@echo "[Build] done: ./$(APP)"

run: build
	@echo "[Run] starting ./$(APP)"
	@./$(APP)

clean:
	@rm -f "$(APP)"
