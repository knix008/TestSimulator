# ==============================================================
#  MyClock GTK — Makefile
#  Usage:
#    make deps      — install all build dependencies (sudo apt/brew)
#    make           — build the project
#    make run       — build and run (software renderer, no GPU warnings)
#    make install   — install binary and data files
#    make clean     — remove build artefacts
#    make uninstall — remove installed files
# ==============================================================

# ── ANSI colour palette ────────────────────────────────────
BOLD    := \033[1m
RED     := \033[1;31m
GREEN   := \033[1;32m
YELLOW  := \033[1;33m
BLUE    := \033[1;34m
MAGENTA := \033[1;35m
CYAN    := \033[1;36m
WHITE   := \033[0;37m
RESET   := \033[0m

# ── Toolchain ──────────────────────────────────────────────
CC   := gcc
PKGS := gtk4 json-glib-1.0

CFLAGS  = -std=c17 -Wall -Wextra $(shell pkg-config --cflags $(PKGS)) \
          -DMYCLOCK_PKGDATADIR='"$(DATADIR)"'
LDFLAGS = $(shell pkg-config --libs $(PKGS)) -lm -lX11

DEPFLAGS = -MMD -MP

# ── Paths ──────────────────────────────────────────────────
TARGET   := myclock
SRCDIR   := src
BUILDDIR := build

PREFIX  := /usr/local
BINDIR  := $(PREFIX)/bin
DATADIR := $(PREFIX)/share/myclock

# ── Source & object lists ──────────────────────────────────
SOURCES := \
	$(SRCDIR)/main.c \
	$(SRCDIR)/main_window.c \
	$(SRCDIR)/side_panel.c \
	$(SRCDIR)/widgets/analog_clock.c \
	$(SRCDIR)/widgets/seven_segment.c \
	$(SRCDIR)/widgets/dot_matrix.c \
	$(SRCDIR)/widgets/world_time_panel.c \
	$(SRCDIR)/models/settings.c \
	$(SRCDIR)/models/city_database.c \
	$(SRCDIR)/services/timer_service.c \
	$(SRCDIR)/services/stopwatch_service.c \
	$(SRCDIR)/dialogs/add_alarm_dialog.c \
	$(SRCDIR)/dialogs/add_world_time_dialog.c \
	$(SRCDIR)/dialogs/alarm_notification.c \
	$(SRCDIR)/dialogs/calendar_event_dialog.c

OBJECTS := $(patsubst $(SRCDIR)/%.c, $(BUILDDIR)/%.o, $(SOURCES))
DEPS    := $(OBJECTS:.o=.d)

# ── Package lists per platform ─────────────────────────────
OS := $(shell uname -s)

APT_PACKAGES := \
	gcc \
	make \
	pkg-config \
	libgtk-4-dev \
	libjson-glib-dev

BREW_PACKAGES := \
	pkg-config \
	gtk4 \
	json-glib

# ==============================================================
#  Targets
# ==============================================================

.PHONY: all deps auto-deps check-deps run clean install uninstall help

# ── Default: build ─────────────────────────────────────────
all: auto-deps $(TARGET)
	@printf "$(GREEN)$(BOLD)✔  Build complete  →  $(TARGET)$(RESET)\n"

# ── Install build dependencies ─────────────────────────────
deps:
ifeq ($(OS),Darwin)
	@printf "$(CYAN)$(BOLD)▶  Installing build dependencies via Homebrew...$(RESET)\n"
	@command -v brew >/dev/null 2>&1 || { \
		printf "$(RED)$(BOLD)✗  Homebrew not found. Install from https://brew.sh$(RESET)\n"; \
		exit 1; \
	}
	@brew install $(BREW_PACKAGES)
	@printf "$(GREEN)$(BOLD)✔  All dependencies are installed.$(RESET)\n"
else
	@printf "$(CYAN)$(BOLD)▶  Updating package index...$(RESET)\n"
	@sudo apt-get update -qq
	@printf "$(CYAN)$(BOLD)▶  Installing build dependencies...$(RESET)\n"
	@sudo apt-get install -y $(APT_PACKAGES) \
		| grep -E "^(Get|Inst|Unpack|Setting)" || true
	@printf "$(GREEN)$(BOLD)✔  All dependencies are installed.$(RESET)\n"
endif

# ── Auto-install deps if missing, then verify ──────────────
auto-deps:
	@if ! command -v pkg-config >/dev/null 2>&1 || ! pkg-config --exists $(PKGS) 2>/dev/null; then \
		printf "$(YELLOW)$(BOLD)▶  Missing dependencies detected — installing...$(RESET)\n"; \
		$(MAKE) deps; \
	fi

# ── Preflight check (manual verify) ───────────────────────
check-deps:
	@command -v pkg-config >/dev/null 2>&1 || { \
		printf "$(RED)$(BOLD)✗  pkg-config not found. Run: make deps$(RESET)\n"; \
		exit 1; \
	}
	@pkg-config --exists $(PKGS) 2>/dev/null || { \
		printf "$(RED)$(BOLD)✗  Required pkg-config packages not found. Run: make deps$(RESET)\n"; \
		exit 1; \
	}
	@printf "$(GREEN)$(BOLD)✔  All dependencies are present.$(RESET)\n"

# ── Run (software renderer avoids GPU/EGL warnings) ───────
run: all
	@GSK_RENDERER=cairo ./$(TARGET)

# ── Link ───────────────────────────────────────────────────
$(TARGET): $(OBJECTS)
	@printf "$(MAGENTA)$(BOLD)  LINK    $(WHITE)$@$(RESET)\n"
	@$(CC) $^ $(LDFLAGS) -o $@

# ── Compile ────────────────────────────────────────────────
$(BUILDDIR)/%.o: $(SRCDIR)/%.c
	@mkdir -p $(@D)
	@printf "$(BLUE)$(BOLD)  CC      $(WHITE)$<$(RESET)\n"
	@$(CC) $(CFLAGS) $(DEPFLAGS) -I$(SRCDIR) -c $< -o $@

# Auto-generated header dependency files
-include $(DEPS)

# ── Clean ──────────────────────────────────────────────────
clean:
	@printf "$(YELLOW)$(BOLD)▶  Cleaning build artefacts...$(RESET)\n"
	@rm -rf $(BUILDDIR) $(TARGET)
	@printf "$(GREEN)$(BOLD)✔  Clean complete.$(RESET)\n"

# ── Install ────────────────────────────────────────────────
install: all
	@printf "$(CYAN)$(BOLD)▶  Installing to $(PREFIX)...$(RESET)\n"
	@install -Dm755 $(TARGET)          $(BINDIR)/$(TARGET)
	@install -Dm644 data/myclock.css   $(DATADIR)/myclock.css
	@install -Dm644 data/themes/*.css -t $(DATADIR)/themes/
	@printf "$(GREEN)$(BOLD)✔  Installed → $(BINDIR)/$(TARGET)$(RESET)\n"

# ── Uninstall ──────────────────────────────────────────────
uninstall:
	@printf "$(YELLOW)$(BOLD)▶  Uninstalling $(TARGET)...$(RESET)\n"
	@rm -f  $(BINDIR)/$(TARGET)
	@rm -rf $(DATADIR)
	@printf "$(GREEN)$(BOLD)✔  Uninstall complete.$(RESET)\n"

# ── Help ───────────────────────────────────────────────────
help:
	@printf "$(BOLD)MyClock GTK — available targets$(RESET)\n"
	@printf "  $(CYAN)make deps$(RESET)       Install all build dependencies via apt/brew\n"
	@printf "  $(CYAN)make$(RESET)            Build the project  (default)\n"
	@printf "  $(CYAN)make run$(RESET)        Build and run with software renderer\n"
	@printf "  $(CYAN)make install$(RESET)    Install binary and data files to $(PREFIX)\n"
	@printf "  $(CYAN)make uninstall$(RESET)  Remove installed files\n"
	@printf "  $(CYAN)make clean$(RESET)      Remove build artefacts\n"
	@printf "  $(CYAN)make help$(RESET)       Show this message\n"
