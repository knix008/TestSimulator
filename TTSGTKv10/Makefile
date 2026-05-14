# ─────────────────────────────────────────────────────────────────────────────
# TTS Simulator — Makefile
#
# Quick start:
#   make setup           — install deps + download Sherpa + build (host)
#   make run             — run with Korean locale
#
# Sherpa-ONNX (scripts/ delegates):
#   make sherpa-lib      — download pre-built library  → scripts/sherpa-install.sh
#   make sherpa-from-src — build from source           → scripts/sherpa-build.sh
#   make sherpa-model    — download Korean VITS model  → scripts/sherpa-model.sh
#
# Cross-compilation (ARM):
#   make setup       ARCH=aarch64   — ARM64 (aarch64-linux-gnu)
#   make setup       ARCH=armhf     — ARM32 (arm-linux-gnueabihf)
#   make sherpa-from-src ARCH=aarch64
#   make build       ARCH=aarch64   SYSROOT=/path/to/sysroot
#
# All targets:
#   make help
# ─────────────────────────────────────────────────────────────────────────────

UNAME_S := $(shell uname -s)
NPROC   := $(shell nproc 2>/dev/null || sysctl -n hw.ncpu)

# ─── Architecture & cross-compilation ────────────────────────────────────────

ARCH    ?= native
SYSROOT ?=

ifeq ($(ARCH),aarch64)
  CROSS_PREFIX := aarch64-linux-gnu-
else ifeq ($(ARCH),armhf)
  CROSS_PREFIX := arm-linux-gnueabihf-
else
  CROSS_PREFIX :=
endif

CC  := $(CROSS_PREFIX)cc
CXX := $(CROSS_PREFIX)c++

# ─── Compiler flags ───────────────────────────────────────────────────────────

CFLAGS := -std=gnu11 -Wall -Wextra -Wno-unused-parameter

ifneq ($(SYSROOT),)
  CFLAGS  += --sysroot=$(SYSROOT)
  LDFLAGS += --sysroot=$(SYSROOT)
endif

# ─── macOS: Homebrew pkg-config path ─────────────────────────────────────────

ifeq ($(UNAME_S),Darwin)
HOMEBREW_PREFIX := $(shell brew --prefix 2>/dev/null)
ifneq ($(HOMEBREW_PREFIX),)
export PKG_CONFIG_PATH := \
    $(HOMEBREW_PREFIX)/lib/pkgconfig:$(HOMEBREW_PREFIX)/share/pkgconfig:$(PKG_CONFIG_PATH)
CFLAGS  += -I$(HOMEBREW_PREFIX)/include
LDFLAGS += -L$(HOMEBREW_PREFIX)/lib
endif
endif

# ─── pkg-config packages ──────────────────────────────────────────────────────

PKGS := gtk+-3.0 espeak-ng gstreamer-1.0 gstreamer-audio-1.0 gstreamer-app-1.0 sndfile

SHERPA_DIR := deps/sherpa-onnx

CFLAGS  += $(shell pkg-config --cflags $(PKGS)) -Isrc -I$(SHERPA_DIR)/include
LDFLAGS += $(shell pkg-config --libs   $(PKGS)) -lmp3lame -lm -lpthread \
           -L$(SHERPA_DIR)/lib -lsherpa-onnx-c-api -lonnxruntime \
           -Wl,-rpath,$(abspath $(SHERPA_DIR)/lib)

# ─── Sources & objects ────────────────────────────────────────────────────────

BUILD_DIR := build
BINARY    := gtktts
PREFIX    := /usr/local

SRCS := src/main.c           \
        src/app.c            \
        src/tts_engine.c     \
        src/tts_espeak.c     \
        src/tts_sherpa.c     \
        src/audio_player.c   \
        src/file_saver.c     \
        src/ui.c             \
        src/waveform_widget.c

OBJS := $(patsubst src/%.c,$(BUILD_DIR)/%.o,$(SRCS))
DEPS := $(OBJS:.o=.d)

# ─── Default language ─────────────────────────────────────────────────────────

LANG_ENV := LANG=ko_KR.UTF-8 LC_ALL=ko_KR.UTF-8

# ─── Phony targets ────────────────────────────────────────────────────────────

.PHONY: all setup check-deps deps build \
        sherpa-lib sherpa-from-src sherpa-model \
        install run clean distclean cross-deps help

all: check-deps build ## Check dependencies and build

setup: deps sherpa-lib sherpa-model build ## Full setup: deps + Sherpa + model + build

# ─── Help ─────────────────────────────────────────────────────────────────────

help: ## Show this help
	@echo "Usage: make [target] [ARCH=native|aarch64|armhf] [SYSROOT=path] [PREFIX=/usr/local]"
	@echo ""
	@echo "Targets:"
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  %-18s %s\n", $$1, $$2}'
	@echo ""
	@echo "Sherpa scripts (also usable standalone):"
	@echo "  scripts/sherpa-install.sh [ARCH]           — pre-built library"
	@echo "  scripts/sherpa-build.sh   [ARCH] [SYSROOT] — build from source"
	@echo "  scripts/sherpa-model.sh   [MODEL_DIR]      — Korean VITS model"

# ─── Dependency check ─────────────────────────────────────────────────────────

check-deps: ## Verify required libraries (pkg-config)
	@echo ">>> Checking dependencies (ARCH=$(ARCH))..."
	@command -v pkg-config >/dev/null 2>&1 \
		|| { echo "ERROR: pkg-config not found. Run: make deps"; exit 1; }
	@ok=1; \
	for pkg in $(PKGS); do \
		printf "  %-40s" "$$pkg"; \
		if pkg-config --exists "$$pkg" 2>/dev/null; then \
			echo "OK"; \
		else \
			echo "MISSING"; ok=0; \
		fi; \
	done; \
	[ $$ok -eq 1 ] || { echo ""; echo "Run: make deps"; exit 1; }
	@printf "  %-40s" "libmp3lame"; \
	echo 'int main(void){return 0;}' \
		| $(CC) -x c - -lmp3lame -o /dev/null 2>/dev/null \
		&& echo "OK" \
		|| { echo "MISSING"; echo "Run: make deps"; exit 1; }
	@printf "  %-40s" "sherpa-onnx ($(SHERPA_DIR)/lib)"; \
	[ -f "$(SHERPA_DIR)/lib/libsherpa-onnx-c-api.so" ] \
		&& echo "OK" \
		|| { echo "MISSING"; echo "Run: make sherpa-lib  OR  make sherpa-from-src"; exit 1; }

# ─── System packages ──────────────────────────────────────────────────────────

deps: ## Install system packages (apt / brew)
ifeq ($(UNAME_S),Darwin)
	@echo ">>> [macOS] Installing via brew..."
	@command -v brew >/dev/null 2>&1 \
		|| { echo "ERROR: Homebrew not found — https://brew.sh"; exit 1; }
	brew install --quiet \
		pkg-config cmake git \
		gtk+3 espeak-ng \
		gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad \
		libsndfile lame
else
	@echo ">>> [Linux] Installing via apt-get..."
	sudo apt-get update -qq
	sudo apt-get install -y \
		build-essential cmake git pkg-config \
		libgtk-3-dev libespeak-ng-dev \
		libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev \
		libsndfile1-dev libmp3lame-dev \
		gstreamer1.0-plugins-good gstreamer1.0-plugins-bad \
		gstreamer1.0-pulseaudio \
		wget curl locales
	@sudo locale-gen ko_KR.UTF-8
	@sudo update-locale LANG=ko_KR.UTF-8
ifneq ($(CROSS_PREFIX),)
	@echo ">>> Installing cross-compiler for $(ARCH)..."
	sudo apt-get install -y \
		gcc-$(CROSS_PREFIX:%-%=%) g++-$(CROSS_PREFIX:%-%=%)
endif
endif
	@echo ">>> Dependencies ready."

cross-deps: ## Install ARM cross-compilers (Linux only)
	sudo apt-get install -y \
		gcc-aarch64-linux-gnu g++-aarch64-linux-gnu \
		gcc-arm-linux-gnueabihf g++-arm-linux-gnueabihf
	@echo ">>> Cross-compilers installed."

# ─── Build ────────────────────────────────────────────────────────────────────

$(BUILD_DIR)/%.o: src/%.c
	@mkdir -p $(@D)
	@printf "  [CC] %s\n" "$<"
	@$(CC) $(CFLAGS) -MMD -MP -c $< -o $@

$(BINARY): $(OBJS)
	@echo "  [LD] $(BINARY)"
	@$(CC) $(OBJS) $(LDFLAGS) -o $@

build: $(BINARY) ## Compile all sources
	@echo ">>> Binary: $(BINARY)  (ARCH=$(ARCH))"

-include $(DEPS)

# ─── Install ──────────────────────────────────────────────────────────────────

install: build ## Install binary to PREFIX/bin
	@echo ">>> Installing to $(PREFIX)/bin/..."
	install -d $(PREFIX)/bin
	install -m 755 $(BINARY) $(PREFIX)/bin/

# ─── Sherpa-ONNX (delegate to scripts/) ──────────────────────────────────────

sherpa-lib: ## Pre-built library download  [scripts/sherpa-install.sh]
	@bash scripts/sherpa-install.sh "$(ARCH)"

sherpa-from-src: ## Build from source, cross-compile  [scripts/sherpa-build.sh]
	@bash scripts/sherpa-build.sh "$(ARCH)" "$(SYSROOT)"

sherpa-model: ## Download Korean VITS model  [scripts/sherpa-model.sh]
	@bash scripts/sherpa-model.sh

# ─── Run ──────────────────────────────────────────────────────────────────────

run: ## Run with Korean locale (host only)
	@[ -f "$(BINARY)" ] || { echo "Not built. Run: make build"; exit 1; }
	$(LANG_ENV) ./$(BINARY)

# ─── Clean ────────────────────────────────────────────────────────────────────

clean: ## Remove build artifacts
	rm -rf $(BUILD_DIR) $(BINARY)
	@echo ">>> Cleaned."

distclean: clean ## Remove build + models + Sherpa libs + source
	rm -rf models/ deps/
	@echo ">>> Removed models/ and deps/"
