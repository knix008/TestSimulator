
APP_NAME = youtube
SRC = main.c gst_helper.c

# System packages required to build and run.
# Run 'make install-deps' once (with sudo) before building.
APT_DEPS := libgtk-3-dev \
            libgstreamer1.0-dev \
            libgstreamer-plugins-base1.0-dev \
            gstreamer1.0-gtk3 \
            gstreamer1.0-plugins-good \
            gstreamer1.0-plugins-bad \
            gstreamer1.0-libav \
            ffmpeg \
            nodejs \
            python3-pip

GTK_PKG := $(shell if pkg-config --exists gtk4; then echo gtk4; elif pkg-config --exists gtk+-3.0; then echo gtk+-3.0; fi)

ifeq ($(strip $(GTK_PKG)),)
$(error GTK development package not found. Run 'make install-deps' first.)
endif

GTK_CFLAGS  := $(shell pkg-config --cflags $(GTK_PKG))
GTK_LIBS    := $(shell pkg-config --libs   $(GTK_PKG))
GST_CFLAGS  := $(shell pkg-config --cflags gstreamer-1.0 gstreamer-video-1.0)
GST_LIBS    := $(shell pkg-config --libs   gstreamer-1.0 gstreamer-video-1.0)

CFLAGS  += $(GTK_CFLAGS)  $(GST_CFLAGS)
LDFLAGS += $(GTK_LIBS)    $(GST_LIBS)

.PHONY: all run clean install-deps

all: $(APP_NAME)

$(APP_NAME): $(SRC)
	$(CC) $(SRC) -o $(APP_NAME) $(CFLAGS) $(LDFLAGS)

run: $(APP_NAME)
	./$(APP_NAME)

clean:
	rm -f $(APP_NAME)

# Run this once to install all build-time and runtime dependencies.
# Requires sudo (will prompt for password in the terminal).
install-deps:
	@echo "=== Installing system packages ==="
	@missing=""; \
	for pkg in $(APT_DEPS); do \
		dpkg -s $$pkg >/dev/null 2>&1 || missing="$$missing $$pkg"; \
	done; \
	if [ -n "$$missing" ]; then \
		echo "Installing:$$missing"; \
		sudo apt-get install -y $$missing; \
	else \
		echo "All system packages already installed."; \
	fi
	@echo "=== Installing / updating yt-dlp ==="
	@if ! command -v yt-dlp >/dev/null 2>&1; then \
		pip3 install yt-dlp --break-system-packages; \
	else \
		echo "yt-dlp already installed: $$(yt-dlp --version)"; \
	fi
	@echo "=== Registering nodejs as yt-dlp JS runtime ==="
	@if command -v node >/dev/null 2>&1; then \
		mkdir -p "$$HOME/.config/yt-dlp"; \
		echo "--js-runtimes nodejs" >> "$$HOME/.config/yt-dlp/config"; \
		echo "nodejs registered with yt-dlp."; \
	fi
