SHELL := /bin/bash

OS  := $(shell uname -s)
APP := sttgtk

CC  ?= gcc
CXX ?= g++

# ── Third-party paths ──────────────────────────────────────────────────────
THIRD_PARTY     := third_party
WHISPER_SRC     := $(THIRD_PARTY)/whisper.cpp
WHISPER_INSTALL := $(THIRD_PARTY)/install
WHISPER_STAMP   := $(WHISPER_INSTALL)/.whisper_built

# ── Source files ───────────────────────────────────────────────────────────
C_SRCS   := main.c app_ui.c audio_capture.c model_manager.c video_player.c
CXX_SRCS := stt_core.cpp
C_OBJS   := $(C_SRCS:.c=.o)
CXX_OBJS := $(CXX_SRCS:.cpp=.o)
OBJS     := $(C_OBJS) $(CXX_OBJS)

# ── Parallel build jobs ────────────────────────────────────────────────────
ifeq ($(OS),Darwin)
  NPROC := $(shell sysctl -n hw.ncpu 2>/dev/null || echo 4)
else
  NPROC := $(shell nproc 2>/dev/null || echo 4)
endif

# ── macOS: Homebrew pkg-config path ───────────────────────────────────────
ifeq ($(OS),Darwin)
  BREW_PREFIX := $(shell brew --prefix 2>/dev/null)
  ifneq ($(BREW_PREFIX),)
    export PKG_CONFIG_PATH := $(BREW_PREFIX)/lib/pkgconfig:$(BREW_PREFIX)/share/pkgconfig:$(PKG_CONFIG_PATH)
  endif
endif

# ── System package groups ──────────────────────────────────────────────────
SYS_PKGS    := gtk+-3.0 portaudio-2.0 libcurl gstreamer-1.0 gstreamer-app-1.0

# ── Compile / link flags ──────────────────────────────────────────────────
SYS_CFLAGS  := $(shell pkg-config --cflags $(SYS_PKGS) 2>/dev/null)
SYS_LDFLAGS := $(shell pkg-config --libs   $(SYS_PKGS) 2>/dev/null)

WHISPER_PC_PATH := $(WHISPER_INSTALL)/lib/pkgconfig
WHISPER_PC_OK   := $(shell PKG_CONFIG_PATH=$(WHISPER_PC_PATH) pkg-config --exists whisper 2>/dev/null && echo yes)

ifeq ($(WHISPER_PC_OK),yes)
  WHISPER_CFLAGS  := $(shell PKG_CONFIG_PATH=$(WHISPER_PC_PATH) pkg-config --cflags whisper)
else
  WHISPER_CFLAGS  := -I$(WHISPER_INSTALL)/include
endif
WHISPER_LDFLAGS := -L$(WHISPER_INSTALL)/lib \
  -Wl,--start-group -lwhisper -lggml-cpu -lggml-base -lggml -Wl,--end-group -lgomp -lm

CFLAGS   := -O2 -Wall -Wextra -std=c11   $(SYS_CFLAGS) $(WHISPER_CFLAGS)
CXXFLAGS := -O2 -Wall -Wextra -std=c++17 $(SYS_CFLAGS) $(WHISPER_CFLAGS)
LDFLAGS  := $(SYS_LDFLAGS) $(WHISPER_LDFLAGS) -lpthread

# ═══════════════════════════════════════════════════════════════════════════
# Main targets
# ═══════════════════════════════════════════════════════════════════════════
.PHONY: all help deps-ensure deps-check deps-install \
        whisper-build build run clean clean-all

all:
	@echo ""
	@echo "╔══════════════════════════════════════════╗"
	@echo "║  STT Korean – 빌드 시작                  ║"
	@echo "╚══════════════════════════════════════════╝"
	@echo ""
	@echo "━━━ [1/3] 의존성 확인 및 설치 ━━━━━━━━━━━━━━━━━━"
	@$(MAKE) --no-print-directory deps-ensure
	@echo ""
	@echo "━━━ [2/3] whisper.cpp 라이브러리 빌드 ━━━━━━━━━━"
	@if [ -f "$(WHISPER_STAMP)" ]; then \
		echo "  whisper.cpp 라이브러리가 이미 빌드되어 있습니다."; \
	else \
		$(MAKE) --no-print-directory whisper-build; \
	fi
	@echo ""
	@echo "━━━ [3/3] 애플리케이션 빌드 ━━━━━━━━━━━━━━━━━━━━"
	@$(MAKE) --no-print-directory build
	@echo ""
	@echo "╔══════════════════════════════════════════╗"
	@echo "║  빌드 완료  →  ./$(APP)                    ║"
	@echo "║  실행       →  make run                   ║"
	@echo "╚══════════════════════════════════════════╝"
	@echo ""

help:
	@echo ""
	@echo "사용 가능한 targets:"
	@echo "  make              의존성 설치 → whisper.cpp 빌드 → 앱 빌드"
	@echo "  make deps-check   의존성 상태 확인 (설치 안 함)"
	@echo "  make deps-install 모든 의존성 설치"
	@echo "  make deps-ensure  의존성 확인 후 부족하면 자동 설치"
	@echo "  make whisper-build whisper.cpp 라이브러리 빌드"
	@echo "  make build        애플리케이션만 컴파일 (whisper 먼저 필요)"
	@echo "  make run          빌드 후 실행"
	@echo "  make clean        오브젝트 파일 및 바이너리 제거"
	@echo "  make clean-all    third_party/ 포함 전체 제거"
	@echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Dependency management
# ═══════════════════════════════════════════════════════════════════════════

# ── deps-ensure: check → install if missing → re-check ───────────────────
deps-ensure:
	@if $(MAKE) --no-print-directory -s deps-check >/dev/null 2>&1; then \
		echo "  모든 의존성이 이미 설치되어 있습니다."; \
	else \
		echo "  누락된 의존성을 발견했습니다. 설치를 시작합니다..."; \
		echo ""; \
		if [ "$(OS)" = "Linux" ] && ! [ -t 1 ]; then \
			echo "  [주의] 비대화형 쉘에서는 자동 설치가 불가합니다."; \
			echo "         터미널에서  make deps-install  을 먼저 실행하세요."; \
			exit 1; \
		fi; \
		$(MAKE) --no-print-directory deps-install; \
		echo ""; \
		echo "  설치 후 재확인 중..."; \
		$(MAKE) --no-print-directory deps-check; \
	fi

# ── deps-check: show status of every required tool & library ─────────────
deps-check:
	@echo "  의존성 검사 중..."
	@echo ""
	@fail=0; \
	\
	echo "  ┌─ 빌드 도구 ─────────────────────────────────────┐"; \
	for cmd in gcc g++ cmake git pkg-config; do \
		if command -v $$cmd >/dev/null 2>&1; then \
			ver=$$($$cmd --version 2>&1 | head -1); \
			printf "  │  %-12s  %-40s│\n" "[OK] $$cmd" "$$ver"; \
		else \
			printf "  │  %-12s  %-40s│\n" "[NG] $$cmd" "(설치 필요)"; \
			fail=1; \
		fi; \
	done; \
	echo "  └─────────────────────────────────────────────────┘"; \
	echo ""; \
	\
	if [ "$(OS)" = "Linux" ]; then \
		echo "  ┌─ Linux 유틸리티 ────────────────────────────────┐"; \
		for cmd in pactl awk gst-inspect-1.0; do \
			if command -v $$cmd >/dev/null 2>&1; then \
				ver=$$($$cmd --version 2>&1 | head -1 || echo ""); \
				printf "  │  %-18s  %-34s│\n" "[OK] $$cmd" "$$ver"; \
			else \
				printf "  │  %-18s  %-34s│\n" "[NG] $$cmd" "(설치 필요)"; \
				fail=1; \
			fi; \
		done; \
		echo "  └─────────────────────────────────────────────────┘"; \
		echo ""; \
		echo "  ┌─ GStreamer 플러그인 ────────────────────────────┐"; \
		if command -v gst-inspect-1.0 >/dev/null 2>&1; then \
			for plugin in gtksink decodebin appsink audioconvert avdec_h264; do \
				if gst-inspect-1.0 $$plugin >/dev/null 2>&1; then \
					printf "  │  %-18s  %-34s│\n" "[OK] $$plugin" ""; \
				else \
					printf "  │  %-18s  %-34s│\n" "[NG] $$plugin" "(패키지 설치 필요)"; \
					fail=1; \
				fi; \
			done; \
		else \
			printf "  │  %-18s  %-34s│\n" "[--] 플러그인 검사" "(gst-inspect-1.0 없음)"; \
			fail=1; \
		fi; \
		echo "  └─────────────────────────────────────────────────┘"; \
		echo ""; \
	fi; \
	\
	echo "  ┌─ 라이브러리 (pkg-config) ───────────────────────┐"; \
	if command -v pkg-config >/dev/null 2>&1; then \
		for mod in $(SYS_PKGS); do \
			if pkg-config --exists $$mod 2>/dev/null; then \
				ver=$$(pkg-config --modversion $$mod 2>/dev/null); \
				printf "  │  %-16s %-38s│\n" "[OK] $$mod" "$$ver"; \
			else \
				printf "  │  %-16s %-38s│\n" "[NG] $$mod" "(설치 필요)"; \
				fail=1; \
			fi; \
		done; \
	else \
		for mod in $(SYS_PKGS); do \
			printf "  │  %-16s %-38s│\n" "[--] $$mod" "(pkg-config 없음)"; \
		done; \
		fail=1; \
	fi; \
	echo "  └─────────────────────────────────────────────────┘"; \
	echo ""; \
	\
	if [ $$fail -eq 0 ]; then \
		echo "  ✓  모든 의존성이 충족됩니다."; \
	else \
		echo "  ✗  누락된 항목이 있습니다. 다음 명령으로 설치하세요:"; \
		echo "       make deps-install"; \
		exit 1; \
	fi

# ── deps-install: install everything via apt (Linux) or brew (macOS) ─────
deps-install:
ifeq ($(OS),Linux)
	@echo "  [Linux] apt-get 으로 패키지를 설치합니다..."
	@echo ""
	sudo apt-get update -qq
	sudo apt-get install -y \
		build-essential \
		g++ \
		cmake \
		git \
		pkg-config \
		ca-certificates \
		libgtk-3-dev \
		portaudio19-dev \
		libcurl4-openssl-dev \
		pulseaudio-utils \
		libgstreamer1.0-dev \
		libgstreamer-plugins-base1.0-dev \
		gstreamer1.0-plugins-base \
		gstreamer1.0-plugins-good \
		gstreamer1.0-plugins-bad \
		gstreamer1.0-gtk3 \
		gstreamer1.0-libav \
		gstreamer1.0-tools
	@echo ""
	@echo "  [Linux] 설치 완료."
else ifeq ($(OS),Darwin)
	@echo "  [macOS] Homebrew 로 패키지를 설치합니다..."
	@command -v brew >/dev/null 2>&1 || { \
		echo "  Homebrew 가 없습니다. https://brew.sh 에서 설치하세요."; \
		exit 1; }
	@echo ""
	brew update
	brew install \
		cmake \
		git \
		pkg-config \
		gtk+3 \
		portaudio \
		curl \
		gstreamer \
		gst-plugins-base \
		gst-plugins-good \
		gst-plugins-bad \
		gst-libav
	@echo ""
	@echo "  [macOS] 설치 완료."
else
	@echo "  지원하지 않는 OS: $(OS)"; exit 1
endif

# ═══════════════════════════════════════════════════════════════════════════
# whisper.cpp library build
# ═══════════════════════════════════════════════════════════════════════════
whisper-build: $(WHISPER_STAMP)

$(WHISPER_STAMP):
	@if [ ! -d "$(WHISPER_SRC)" ]; then \
		echo "  whisper.cpp 소스를 다운로드합니다 (GitHub, depth=1)..."; \
		git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git \
			"$(WHISPER_SRC)"; \
		echo "  다운로드 완료."; \
	else \
		echo "  whisper.cpp 소스가 이미 있습니다. 빌드를 계속합니다."; \
	fi
	@echo ""
	@echo "  cmake 구성 중..."
	@cmake -S "$(WHISPER_SRC)" -B "$(WHISPER_SRC)/build" \
		-DCMAKE_INSTALL_PREFIX="$(abspath $(WHISPER_INSTALL))" \
		-DCMAKE_BUILD_TYPE=Release \
		-DBUILD_SHARED_LIBS=OFF \
		-DWHISPER_BUILD_TESTS=OFF \
		-DWHISPER_BUILD_EXAMPLES=OFF \
		-DGGML_BUILD_TESTS=OFF \
		-DGGML_BUILD_EXAMPLES=OFF \
		>/dev/null 2>&1 && echo "  cmake 구성 완료." || \
		{ echo "  [오류] cmake 구성 실패."; exit 1; }
	@echo "  컴파일 중 ($(NPROC)개 병렬 작업)..."
	@cmake --build "$(WHISPER_SRC)/build" -j$(NPROC) \
		>/dev/null 2>&1 && echo "  컴파일 완료." || \
		{ echo "  [오류] 컴파일 실패."; exit 1; }
	@echo "  라이브러리를 설치합니다..."
	@cmake --install "$(WHISPER_SRC)/build" >/dev/null 2>&1
	@mkdir -p "$(WHISPER_INSTALL)"
	@touch "$(WHISPER_STAMP)"
	@echo "  whisper.cpp 라이브러리 준비 완료."

# ═══════════════════════════════════════════════════════════════════════════
# Application build
# ═══════════════════════════════════════════════════════════════════════════
$(C_OBJS) $(CXX_OBJS): $(WHISPER_STAMP)

%.o: %.c
	@echo "  [컴파일]  $<"
	@$(CC) $(CFLAGS) -c $< -o $@

%.o: %.cpp
	@echo "  [컴파일]  $<"
	@$(CXX) $(CXXFLAGS) -c $< -o $@

build: $(OBJS)
	@echo "  [링크]    $(APP)"
	@$(CXX) $(OBJS) -o $(APP) $(LDFLAGS)
	@echo "  [완료]    ./$(APP)"

# ═══════════════════════════════════════════════════════════════════════════
# Run / Clean
# ═══════════════════════════════════════════════════════════════════════════
run: build
	@echo ""
	@echo "  STT Korean 시작..."
	@echo ""
	@./$(APP)

clean:
	@echo "  [삭제]  오브젝트 파일 및 바이너리..."
	@rm -f $(OBJS) $(APP)
	@echo "  [완료]"

clean-all: clean
	@echo "  [삭제]  third_party/..."
	@rm -rf $(THIRD_PARTY)
	@echo "  [완료]"
