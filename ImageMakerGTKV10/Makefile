# ImageMakerGTKV10 — GTK3 image compositor
#   make          의존성 확인/설치 후 빌드
#   make clean    빌드 산출물 제거

APP       := imagemaker
TARGET    := $(APP)
INCDIR    := include
SRCDIR    := src
BLDDIR    := build

CC        := gcc
CSTD      := -std=c11
WARN      := -Wall -Wextra
OPT       := -O2 -g
PTHREAD   := -pthread
PKGS      := gtk+-3.0

GTK_CFLAGS := $(shell pkg-config --cflags $(PKGS) 2>/dev/null)
GTK_LIBS   := $(shell pkg-config --libs $(PKGS) 2>/dev/null)

CFLAGS  := $(CSTD) $(WARN) $(OPT) $(PTHREAD) -I$(INCDIR) $(GTK_CFLAGS)
LDFLAGS := $(PTHREAD) -lm $(GTK_LIBS)

SRCS := $(SRCDIR)/main.c \
        $(SRCDIR)/layer.c \
        $(SRCDIR)/selection_geom.c \
        $(SRCDIR)/layer_mask.c \
        $(SRCDIR)/composite.c \
        $(SRCDIR)/canvas_view.c \
        $(SRCDIR)/main_window.c

OBJS := $(patsubst $(SRCDIR)/%.c,$(BLDDIR)/%.o,$(SRCS))
DEPS_STAMP := $(BLDDIR)/.deps-ok

UNAME_S := $(shell uname -s)

ifeq ($(UNAME_S),Linux)
  PLATFORM   := linux
  APT_DEBS   := build-essential pkg-config libgtk-3-dev
else ifeq ($(UNAME_S),Darwin)
  PLATFORM   := macos
  BREW_PREFIX := $(shell brew --prefix 2>/dev/null)
  ifneq ($(BREW_PREFIX),)
    export PKG_CONFIG_PATH := $(BREW_PREFIX)/lib/pkgconfig:$(BREW_PREFIX)/opt/gtk+3/lib/pkgconfig
    GTK_CFLAGS := $(shell PKG_CONFIG_PATH="$(PKG_CONFIG_PATH)" pkg-config --cflags $(PKGS) 2>/dev/null)
    GTK_LIBS   := $(shell PKG_CONFIG_PATH="$(PKG_CONFIG_PATH)" pkg-config --libs $(PKGS) 2>/dev/null)
    CFLAGS  := $(CSTD) $(WARN) $(OPT) $(PTHREAD) -I$(INCDIR) $(GTK_CFLAGS)
    LDFLAGS := $(PTHREAD) -lm $(GTK_LIBS)
  endif
else
  $(error Unsupported OS: $(UNAME_S))
endif

# CC_AUTO_INSTALL=0 이면 자동 설치 비활성화
CC_AUTO_INSTALL ?= 1

.PHONY: all clean _stamp_deps_check _stamp_deps_auto _do_install_linux _do_install_macos

all:
	@echo ""
	@echo "========================================"
	@echo "  ImageMakerGTKV10 — 빌드"
	@echo "========================================"
	@$(MAKE) --no-print-directory $(DEPS_STAMP) $(TARGET)
	@echo ""
	@echo "  완료: ./$(TARGET)"
	@echo "========================================"
	@echo ""

$(DEPS_STAMP):
	@mkdir -p $(BLDDIR)
ifeq ($(CC_AUTO_INSTALL),1)
	@$(MAKE) --no-print-directory _stamp_deps_auto
else
	@$(MAKE) --no-print-directory _stamp_deps_check
endif
	@touch $@

_stamp_deps_check:
	@echo "[1/3] 의존성 확인"
	@if ! pkg-config --exists $(PKGS) 2>/dev/null; then \
		echo "  ERROR: $(PKGS) 없음. libgtk-3-dev 설치 또는 make CC_AUTO_INSTALL=1"; \
		exit 1; \
	fi
	@echo "       $(PKGS) — OK"
	@echo "[2/3] 소스 컴파일 ($(words $(SRCS))개 파일)"

_stamp_deps_auto:
	@echo "[1/3] 의존성 확인"
	@if pkg-config --exists $(PKGS) 2>/dev/null; then \
		echo "       $(PKGS) — OK"; \
	else \
		echo "       $(PKGS) 없음 — $(PLATFORM) 패키지 설치 중..."; \
		$(MAKE) --no-print-directory _do_install_$(PLATFORM); \
		echo "       $(PKGS) — 설치 완료"; \
	fi
	@echo "[2/3] 소스 컴파일 ($(words $(SRCS))개 파일)"

$(TARGET): $(OBJS) | $(DEPS_STAMP)
	@echo ""
	@echo "[3/3] 링크 → $(TARGET)"
	@$(CC) $(OBJS) -o $@ $(LDFLAGS)
	@echo "       $(TARGET) 생성됨"

$(BLDDIR)/%.o: $(SRCDIR)/%.c | $(DEPS_STAMP)
	@echo "       CC  $<"
	@$(CC) $(CFLAGS) -c $< -o $@

_do_install_linux:
	@command -v apt-get >/dev/null 2>&1 || { \
		echo "  ERROR: apt-get 없음. 수동 설치: $(APT_DEBS)"; exit 1; \
	}
	@echo "       apt 패키지 설치 중..."
	@sudo apt-get update -qq
	@sudo apt-get install -y $(APT_DEBS)
	@pkg-config --exists $(PKGS) || (echo "  ERROR: $(PKGS) 설치 실패"; exit 1)

_do_install_macos:
	@command -v brew >/dev/null 2>&1 || { \
		echo "  ERROR: Homebrew 없음. brew install gtk+3 pkg-config"; exit 1; \
	}
	@echo "       Homebrew 패키지 설치 중..."
	@brew install gtk+3 pkg-config
	@PKG_CONFIG_PATH="$(BREW_PREFIX)/lib/pkgconfig:$(BREW_PREFIX)/opt/gtk+3/lib/pkgconfig" \
		pkg-config --exists $(PKGS) || (echo "  ERROR: $(PKGS) 설치 실패"; exit 1)

clean:
	@echo "정리: $(BLDDIR)/, $(TARGET) 삭제"
	@rm -rf $(BLDDIR) $(TARGET)
	@echo "clean 완료"

