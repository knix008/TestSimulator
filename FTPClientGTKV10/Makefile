# ============================================================
#  FTP GTK Client – Makefile
#  Target: Linux / GTK3
#  Protocols: FTP, FTPS (libcurl), SFTP (libssh)
# ============================================================

APP     := ftpclient
SRCDIR  := src
BLDDIR  := build
RESDIR  := resources

CC      := gcc
CSTD    := -std=c11
WARN    := -Wall -Wextra -Wno-deprecated-declarations
OPT     := -O2 -g
PTHREAD := -pthread

PKGS    := gtk+-3.0 glib-2.0 libcurl

CFLAGS  := $(CSTD) $(WARN) $(OPT) $(PTHREAD) \
           $(shell pkg-config --cflags $(PKGS))
LDFLAGS := $(PTHREAD) $(shell pkg-config --libs $(PKGS))

SRCS    := $(SRCDIR)/ftp_backend.c \
           $(SRCDIR)/profile.c \
           $(SRCDIR)/file_pane.c \
           $(SRCDIR)/site_dialog.c \
           $(SRCDIR)/main_window.c \
           $(SRCDIR)/main.c

RESSRC  := $(BLDDIR)/resources.c
RESXML  := $(RESDIR)/ftpclient.gresource.xml
RESPNGS := $(RESDIR)/icon_16.png $(RESDIR)/icon_32.png \
           $(RESDIR)/icon_48.png $(RESDIR)/icon_256.png

OBJS    := $(patsubst $(SRCDIR)/%.c,$(BLDDIR)/%.o,$(SRCS)) \
           $(BLDDIR)/resources.o

.PHONY: all deps check-deps clean run install help ftp-server ftp-server-stop

all: check-deps dirs banner link done

banner:
	@echo ""
	@echo "╔══════════════════════════════════════════════╗"
	@echo "║   FTP GTK Client  –  build ($(words $(SRCS)) sources)   ║"
	@echo "╚══════════════════════════════════════════════╝"

done:
	@echo ""
	@echo "  ✓  Build complete  →  ./$(APP)"
	@echo ""

DEBS := libgtk-3-dev libglib2.0-dev libcurl4-openssl-dev pkg-config

deps:
	@echo ""
	@command -v apt-get >/dev/null 2>&1 || { \
	    echo "  apt-get not found – install manually: $(DEBS)"; exit 0; }
	@echo "[deps] Updating package lists ..."
	@sudo apt-get update -qq
	@echo "[deps] Installing build dependencies ..."
	@sudo apt-get install -y $(DEBS)
	@echo "  ✓  Dependencies installed."
	@echo ""

check-deps:
	@echo ""
	@echo "  Checking build dependencies ..."
	@for pkg in $(PKGS); do \
	    if pkg-config --exists $$pkg 2>/dev/null; then \
	        printf "    %-20s ✓  %s\n" "$$pkg" "$$(pkg-config --modversion $$pkg)"; \
	    else \
	        echo "    $$pkg  ✗  NOT FOUND  (run: make deps)"; \
	        exit 1; \
	    fi; \
	done
	@echo ""

dirs:
	@mkdir -p $(BLDDIR)

$(RESSRC): $(RESXML) $(RESPNGS) | dirs
	@printf "  [RC]  %-36s\n" "$<"
	@glib-compile-resources --sourcedir=$(RESDIR) --generate-source --target=$@ $<

$(BLDDIR)/resources.o: $(RESSRC)
	@printf "  [CC]  %-36s\n" "$<"
	@$(CC) $(CFLAGS) -c $< -o $@

link: $(OBJS)
	@echo ""
	@echo "  [LD]  Linking $(APP) ..."
	@$(CC) $(OBJS) -o $(APP) $(LDFLAGS)

$(BLDDIR)/%.o: $(SRCDIR)/%.c
	@printf "  [CC]  %-36s\n" "$<"
	@$(CC) $(CFLAGS) -c $< -o $@

run: all
	@./$(APP)

DESTDIR ?=
PREFIX  ?= /usr/local
BINDIR   = $(DESTDIR)$(PREFIX)/bin

install: all
	@install -d $(BINDIR)
	@install -m 755 $(APP) $(BINDIR)/$(APP)
	@echo "  ✓  Installed to $(BINDIR)/$(APP)"

clean:
	@rm -rf $(BLDDIR) $(APP)
	@echo "  ✓  Clean."

ftp-server:
	@echo ""
	@echo "  로컬 FTP 서비스(vsftpd) 설치·시작 (sudo 필요) ..."
	@sudo bash scripts/setup-local-ftp.sh

ftp-server-stop:
	@sudo bash scripts/stop-local-ftp.sh

help:
	@echo ""
	@echo "  make deps            – install build dependencies (sudo)"
	@echo "  make                 – build $(APP)"
	@echo "  make run             – build and launch"
	@echo "  make ftp-server      – enable local vsftpd on port 21 (sudo)"
	@echo "  make ftp-server-stop – stop local vsftpd"
	@echo "  make install         – install to \$$(PREFIX)/bin"
	@echo "  make clean           – remove build artefacts"
	@echo ""
