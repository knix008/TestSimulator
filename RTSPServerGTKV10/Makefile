APP := rtspserver
SRC := main.c gtk_player.c rtsp_server.c
PKGS := gtk+-3.0 gstreamer-1.0 gstreamer-video-1.0 gstreamer-rtsp-server-1.0 gstreamer-rtsp-1.0

.PHONY: all run clean deps deps-linux deps-macos

all: $(APP)
	@echo "[Done] Build complete: $(APP)"

$(APP): $(SRC)
	@echo "[1/2] Preparing build..."
	@echo "[2/2] Compiling application..."
	@$(CC) -Wall -Wextra -O2 $^ -o $@ $$(pkg-config --cflags --libs $(PKGS))

run: $(APP)
	@if [ -z "$(VIDEO)" ]; then \
		echo "[Run] Starting app (player + RTSP server)..."; \
		./$(APP); \
	else \
		echo "[Run] Starting app with startup file..."; \
		./$(APP) "$(VIDEO)"; \
	fi

clean:
	@echo "[Clean] Removing build outputs..."
	@rm -f $(APP)
	@echo "[Done] Clean complete."

deps:
	@echo "[Deps] Detecting operating system..."
	@case "$$(uname -s)" in \
		Linux) $(MAKE) deps-linux ;; \
		Darwin) $(MAKE) deps-macos ;; \
		*) echo "Unsupported OS: $$(uname -s)"; exit 1 ;; \
	esac

deps-linux:
	@echo "[Linux] Installing GTK/GStreamer dependencies via apt..."
	@echo "[1/2] Updating package index..."
	@sudo apt-get update
	@echo "[2/2] Installing required packages..."
	@sudo apt-get install -y \
		build-essential pkg-config \
		libgtk-3-dev \
		libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev \
		libgstrtspserver-1.0-dev \
		gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
		gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav
	@echo "[Done] Linux dependencies installed."

deps-macos:
	@echo "[macOS] Installing GTK/GStreamer dependencies via Homebrew..."
	@echo "[1/2] Updating Homebrew..."
	@brew update
	@echo "[2/2] Installing required packages..."
	@brew install pkg-config gtk+3 gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav gst-rtsp-server
	@echo "[Done] macOS dependencies installed."
