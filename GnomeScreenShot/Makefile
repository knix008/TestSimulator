# Enhanced Screenshot - Makefile

NAME    = Enhanced Screenshot
VERSION = 1.0.0
CC      = gcc
CFLAGS  = -Wall -Wextra -g \
          `pkg-config --cflags gtk+-3.0 gdk-x11-3.0 cairo x11 xfixes xcomposite gio-2.0`
LDFLAGS = \
          `pkg-config --libs gtk+-3.0 gdk-x11-3.0 cairo x11 xfixes xcomposite gio-2.0` \
          -lm

SRCDIR  = src
OBJDIR  = obj
TARGET  = screenshot

SOURCES = $(wildcard $(SRCDIR)/*.c)
OBJECTS = $(patsubst $(SRCDIR)/%.c,$(OBJDIR)/%.o,$(SOURCES))

DISTRO := $(shell . /etc/os-release 2>/dev/null && echo $$ID || echo "unknown")

.PHONY: all clean install deps install-deps check-deps help run debug flatpak flatpak-run

all: info $(TARGET)

info:
	@echo "========================================"
	@echo "  $(NAME) v$(VERSION)"
	@echo "  CC      : $(CC)"
	@echo "  CFLAGS  : -Wall -Wextra -g [pkg-config]"
	@echo "  TARGET  : $(TARGET)"
	@echo "  SOURCES : $(words $(SOURCES)) file(s)"
	@echo "========================================"

$(TARGET): $(OBJECTS)
	@echo "[LD]  $(TARGET)"
	@$(CC) $(OBJECTS) -o $@ $(LDFLAGS)
	@echo "----------------------------------------"
	@echo "  Build complete: ./$(TARGET)"
	@echo "----------------------------------------"

$(OBJDIR)/%.o: $(SRCDIR)/%.c | $(OBJDIR)
	@echo "[CC]  $<"
	@$(CC) $(CFLAGS) -c $< -o $@

$(OBJDIR):
	@mkdir -p $(OBJDIR)

clean:
	@echo "[RM]  $(OBJDIR)/ $(TARGET)"
	@rm -rf $(OBJDIR) $(TARGET)
	@echo "  Clean complete."

install: $(TARGET)
	@echo "[INSTALL]  /usr/local/bin/$(TARGET)"
	@install -D $(TARGET) $(DESTDIR)/usr/local/bin/$(TARGET)

check-deps:
	@echo "Checking dependencies..."
	@pkg-config --exists gtk+-3.0    || { echo "  ERROR: gtk+-3.0 not found";    exit 1; }
	@pkg-config --exists gdk-x11-3.0 || { echo "  ERROR: gdk-x11-3.0 not found"; exit 1; }
	@pkg-config --exists cairo       || { echo "  ERROR: cairo not found";       exit 1; }
	@pkg-config --exists x11         || { echo "  ERROR: x11 not found";         exit 1; }
	@pkg-config --exists xfixes      || { echo "  ERROR: xfixes not found";      exit 1; }
	@pkg-config --exists xcomposite  || { echo "  ERROR: xcomposite not found";  exit 1; }
	@pkg-config --exists gio-2.0     || { echo "  ERROR: gio-2.0 not found";     exit 1; }
	@echo "  All dependencies found."

deps: install-deps

install-deps:
	@echo "Detected distribution: $(DISTRO)"
	@if [ "$(DISTRO)" = "ubuntu" ] || [ "$(DISTRO)" = "debian" ] || [ "$(DISTRO)" = "linuxmint" ]; then \
		echo "Installing build dependencies..."; \
		sudo apt-get update && sudo apt-get install -y \
			build-essential pkg-config \
			libgtk-3-dev libcairo2-dev \
			libx11-dev libxfixes-dev libxcomposite-dev \
			libglib2.0-dev \
			flatpak flatpak-builder; \
		echo "Adding Flathub repository..."; \
		flatpak remote-add --if-not-exists --user flathub https://flathub.org/repo/flathub.flatpakrepo || true; \
	elif [ "$(DISTRO)" = "fedora" ] || [ "$(DISTRO)" = "rhel" ] || [ "$(DISTRO)" = "centos" ]; then \
		sudo dnf install -y gcc make pkg-config \
			gtk3-devel cairo-devel \
			libX11-devel libXfixes-devel libXcomposite-devel \
			glib2-devel \
			flatpak flatpak-builder; \
		flatpak remote-add --if-not-exists --user flathub https://flathub.org/repo/flathub.flatpakrepo || true; \
	elif [ "$(DISTRO)" = "arch" ] || [ "$(DISTRO)" = "manjaro" ]; then \
		sudo pacman -S --needed --noconfirm \
			base-devel pkg-config gtk3 cairo \
			libx11 libxfixes libxcomposite glib2 \
			flatpak flatpak-builder; \
		flatpak remote-add --if-not-exists --user flathub https://flathub.org/repo/flathub.flatpakrepo || true; \
	else \
		echo "Unsupported distro '$(DISTRO)'. Install the dev packages for:"; \
		echo "  gtk+-3.0, cairo, x11, xfixes, xcomposite, gio-2.0, flatpak, flatpak-builder"; \
		exit 1; \
	fi
	@echo "Dependencies installed. Run 'make' to build."

run: $(TARGET)
	@./$(TARGET)

debug: $(TARGET)
	@G_MESSAGES_DEBUG=all ./$(TARGET)

flatpak:
	@echo "Building Flatpak package..."
	@if [ ! -f "flatpak-build.sh" ]; then \
		echo "ERROR: flatpak-build.sh not found"; \
		exit 1; \
	fi
	@chmod +x flatpak-build.sh
	@./flatpak-build.sh

flatpak-run:
	@flatpak run org.custom.Screenshot

help:
	@echo "$(NAME) v$(VERSION) - Build System"
	@echo ""
	@echo "  make               Build native binary"
	@echo "  make run           Build and run native"
	@echo "  make debug         Run with debug output"
	@echo "  make deps          Install system dependencies"
	@echo "  make check-deps    Verify dependencies are present"
	@echo "  make flatpak       Build and install Flatpak package"
	@echo "  make flatpak-run   Run Flatpak version"
	@echo "  make clean         Remove build artefacts"
	@echo "  make install       Install to /usr/local/bin"
