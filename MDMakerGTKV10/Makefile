# ── MD Maker GTK — Makefile ─────────────────────────────────────────
# Targets:
#   make deps   – check & install all required packages
#   make        – build the binary (runs 'deps' first)
#   make clean  – remove build artefacts
#   make run    – build and run the program
# ─────────────────────────────────────────────────────────────────────

APP      := mdmaker
SRCDIR   := src
BDIR     := build

SRCS := $(wildcard $(SRCDIR)/*.c)
OBJS := $(patsubst $(SRCDIR)/%.c,$(BDIR)/%.o,$(SRCS))

# ── OS detection ─────────────────────────────────────────────────────
UNAME := $(shell uname -s)

ifeq ($(UNAME),Darwin)
  OS_NAME := macOS
  PKG_MGR := brew
  export PKG_CONFIG_PATH := $(shell brew --prefix 2>/dev/null)/lib/pkgconfig:$(PKG_CONFIG_PATH)
else
  OS_NAME := Linux
  ifneq ($(shell which apt-get 2>/dev/null),)
    PKG_MGR := apt
  else ifneq ($(shell which dnf 2>/dev/null),)
    PKG_MGR := dnf
  else ifneq ($(shell which pacman 2>/dev/null),)
    PKG_MGR := pacman
  else
    PKG_MGR := unknown
  endif
endif

# ── pkg-config: pick webkit variant ──────────────────────────────────
WEBKIT_PC := $(shell \
  if pkg-config --exists webkit2gtk-4.1 2>/dev/null; then \
    echo webkit2gtk-4.1; \
  elif pkg-config --exists webkit2gtk-4.0 2>/dev/null; then \
    echo webkit2gtk-4.0; \
  fi)

PKGS_CORE := gtk+-3.0 $(WEBKIT_PC)
PKGS_ZIP  := libzip

# Evaluate each group separately so a missing libzip doesn't suppress GTK flags
PKG_CFLAGS  := $(shell pkg-config --cflags $(PKGS_CORE) 2>/dev/null) \
               $(shell pkg-config --cflags $(PKGS_ZIP)  2>/dev/null)
PKG_LDFLAGS := $(shell pkg-config --libs   $(PKGS_CORE) 2>/dev/null) \
               $(shell pkg-config --libs   $(PKGS_ZIP)  2>/dev/null)

CFLAGS  := -Wall -Wextra -O2 -g $(PKG_CFLAGS)
LDFLAGS := $(PKG_LDFLAGS) -lcmark

CC := gcc

# ── colour output ─────────────────────────────────────────────────────
RED   := \033[0;31m
GREEN := \033[0;32m
CYAN  := \033[0;36m
RESET := \033[0m

# ─────────────────────────────────────────────────────────────────────
.PHONY: all deps check-deps install-deps compile clean run

all: deps compile

# ── dependency check ─────────────────────────────────────────────────
check-deps:
	@printf "\n$(CYAN)── Checking dependencies ($(OS_NAME) / $(PKG_MGR)) ──$(RESET)\n\n"
	@printf "$(CYAN)GTK3:$(RESET)\n"
	@pkg-config --exists gtk+-3.0 2>/dev/null \
	  && printf "  $(GREEN)✔$(RESET)  gtk+-3.0\n" \
	  || printf "  $(RED)✘$(RESET)  gtk+-3.0 not found\n"
	@printf "$(CYAN)WebKitGTK:$(RESET)\n"
	@pkg-config --exists webkit2gtk-4.1 2>/dev/null \
	  && printf "  $(GREEN)✔$(RESET)  webkit2gtk-4.1\n" \
	  || { pkg-config --exists webkit2gtk-4.0 2>/dev/null \
	    && printf "  $(GREEN)✔$(RESET)  webkit2gtk-4.0\n" \
	    || printf "  $(RED)✘$(RESET)  webkit2gtk not found (need 4.0 or 4.1)\n"; }
	@printf "$(CYAN)libcmark:$(RESET)\n"
	@echo '#include <cmark.h>' | $(CC) -x c - -c -o /dev/null 2>/dev/null \
	  && printf "  $(GREEN)✔$(RESET)  libcmark\n" \
	  || printf "  $(RED)✘$(RESET)  libcmark not found\n"
	@printf "$(CYAN)libzip (Word export):$(RESET)\n"
	@pkg-config --exists libzip 2>/dev/null \
	  && printf "  $(GREEN)✔$(RESET)  libzip\n" \
	  || printf "  $(RED)✘$(RESET)  libzip not found\n"
	@printf "\n"

# ── dependency install ────────────────────────────────────────────────
install-deps:
	@printf "$(CYAN)── Installing missing packages ──$(RESET)\n"
ifeq ($(UNAME),Darwin)
	@command -v brew >/dev/null 2>&1 \
	  || { printf "$(RED)Homebrew not installed.$(RESET) See https://brew.sh\n"; exit 1; }
	@pkg-config --exists gtk+-3.0 2>/dev/null || brew install gtk+3
	@(pkg-config --exists webkit2gtk-4.1 2>/dev/null \
	  || pkg-config --exists webkit2gtk-4.0 2>/dev/null) \
	  || brew install webkit2gtk
	@echo '#include <cmark.h>' | $(CC) -x c - -c -o /dev/null 2>/dev/null \
	  || brew install cmark
	@pkg-config --exists libzip 2>/dev/null || brew install libzip
else ifeq ($(PKG_MGR),apt)
	@PKGS_MISSING=""; \
	pkg-config --exists gtk+-3.0 2>/dev/null || PKGS_MISSING="$$PKGS_MISSING libgtk-3-dev"; \
	(pkg-config --exists webkit2gtk-4.1 2>/dev/null \
	  || pkg-config --exists webkit2gtk-4.0 2>/dev/null) \
	  || PKGS_MISSING="$$PKGS_MISSING libwebkit2gtk-4.1-dev"; \
	echo '#include <cmark.h>' | $(CC) -x c - -c -o /dev/null 2>/dev/null \
	  || PKGS_MISSING="$$PKGS_MISSING libcmark-dev"; \
	pkg-config --exists libzip 2>/dev/null \
	  || PKGS_MISSING="$$PKGS_MISSING libzip-dev"; \
	if [ -n "$$PKGS_MISSING" ]; then \
	  printf "Installing:$$PKGS_MISSING\n"; \
	  sudo apt-get update -qq && sudo apt-get install -y $$PKGS_MISSING; \
	else \
	  printf "  $(GREEN)All packages already installed.$(RESET)\n"; \
	fi
else ifeq ($(PKG_MGR),dnf)
	@PKGS_MISSING=""; \
	pkg-config --exists gtk+-3.0 2>/dev/null || PKGS_MISSING="$$PKGS_MISSING gtk3-devel"; \
	(pkg-config --exists webkit2gtk-4.1 2>/dev/null \
	  || pkg-config --exists webkit2gtk-4.0 2>/dev/null) \
	  || PKGS_MISSING="$$PKGS_MISSING webkitgtk6.0-devel"; \
	echo '#include <cmark.h>' | $(CC) -x c - -c -o /dev/null 2>/dev/null \
	  || PKGS_MISSING="$$PKGS_MISSING cmark-devel"; \
	pkg-config --exists libzip 2>/dev/null \
	  || PKGS_MISSING="$$PKGS_MISSING libzip-devel"; \
	if [ -n "$$PKGS_MISSING" ]; then \
	  printf "Installing:$$PKGS_MISSING\n"; \
	  sudo dnf install -y $$PKGS_MISSING; \
	else \
	  printf "  $(GREEN)All packages already installed.$(RESET)\n"; \
	fi
else ifeq ($(PKG_MGR),pacman)
	@PKGS_MISSING=""; \
	pkg-config --exists gtk+-3.0 2>/dev/null || PKGS_MISSING="$$PKGS_MISSING gtk3"; \
	(pkg-config --exists webkit2gtk-4.1 2>/dev/null \
	  || pkg-config --exists webkit2gtk-4.0 2>/dev/null) \
	  || PKGS_MISSING="$$PKGS_MISSING webkit2gtk-4.1"; \
	echo '#include <cmark.h>' | $(CC) -x c - -c -o /dev/null 2>/dev/null \
	  || PKGS_MISSING="$$PKGS_MISSING cmark"; \
	pkg-config --exists libzip 2>/dev/null \
	  || PKGS_MISSING="$$PKGS_MISSING libzip"; \
	if [ -n "$$PKGS_MISSING" ]; then \
	  printf "Installing:$$PKGS_MISSING\n"; \
	  sudo pacman -S --noconfirm $$PKGS_MISSING; \
	else \
	  printf "  $(GREEN)All packages already installed.$(RESET)\n"; \
	fi
else
	@printf "$(RED)Unknown package manager. Install manually:$(RESET)\n"
	@printf "  • libgtk-3-dev        (GTK3 dev headers)\n"
	@printf "  • libwebkit2gtk-4.1-dev or libwebkit2gtk-4.0-dev\n"
	@printf "  • libcmark-dev        (cmark.h + -lcmark)\n"
	@printf "  • libzip-dev          (zip.h + -lzip)\n"
endif
	@printf "\n"

deps: check-deps install-deps

# ── compile ───────────────────────────────────────────────────────────
compile: $(APP)
	@printf "$(GREEN)Build complete:$(RESET) ./$(APP)\n"

$(APP): $(OBJS)
	@printf "  [ $(CYAN)LD$(RESET) ]  $@\n"
	@$(CC) $^ $(LDFLAGS) -o $@

$(BDIR)/%.o: $(SRCDIR)/%.c | $(BDIR)
	@printf "  [ $(CYAN)CC$(RESET) ]  $<\n"
	@$(CC) $(CFLAGS) -c $< -o $@

$(BDIR):
	@mkdir -p $(BDIR)

# ── utility ───────────────────────────────────────────────────────────
clean:
	rm -rf $(BDIR) $(APP)

run: compile
	LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 ./$(APP)
