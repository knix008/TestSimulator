APP_NAME    := ftpserver
BUILD_DIR   := build
SRC_DIR     := src
PREFIX      := .

PACKAGES    := libgtk-3-dev libssl-dev libssh-dev libjson-c-dev

CC          := gcc
CFLAGS      := $(shell pkg-config --cflags gtk+-3.0  2>/dev/null) \
               $(shell pkg-config --cflags libssh    2>/dev/null) \
               $(shell pkg-config --cflags openssl   2>/dev/null) \
               -I$(SRC_DIR) \
               -Wall -Wextra -Wno-unused-parameter -Wno-deprecated-declarations \
               -Wno-format-truncation \
               -DWITH_SERVER \
               -O2 -g -pthread
LDFLAGS     := $(shell pkg-config --libs gtk+-3.0  2>/dev/null) \
               $(shell pkg-config --libs libssh    2>/dev/null) \
               $(shell pkg-config --libs openssl   2>/dev/null) \
               -ljson-c -lpthread

SRCS        := $(wildcard $(SRC_DIR)/*.c)
OBJS        := $(patsubst $(SRC_DIR)/%.c,$(BUILD_DIR)/%.o,$(SRCS))
TARGET      := $(PREFIX)/$(APP_NAME)

# ── ANSI colour codes ──────────────────────────────────────────────────────
RESET  := \033[0m
BOLD   := \033[1m
GREEN  := \033[1;32m
YELLOW := \033[1;33m
CYAN   := \033[1;36m
RED    := \033[1;31m
BLUE   := \033[1;34m

.PHONY: all clean install-packages check-packages

# ── Default target: check packages → build ────────────────────────────────
all: check-packages $(TARGET)
	@printf "$(GREEN)╔══════════════════════════════════════╗$(RESET)\n"
	@printf "$(GREEN)║  ✔  빌드 완료: %-22s║$(RESET)\n" "$(TARGET)"
	@printf "$(GREEN)╚══════════════════════════════════════╝$(RESET)\n"
	@printf "$(CYAN)  실행 방법: ./$(APP_NAME)$(RESET)\n\n"

# ── Package check / auto-install ──────────────────────────────────────────
check-packages: | $(BUILD_DIR)
	@printf "\n$(CYAN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)\n"
	@printf "$(BOLD)[1/3] 의존 패키지 확인 중...$(RESET)\n"
	@missing=""; \
	for pkg in $(PACKAGES); do \
		if dpkg -s "$$pkg" >/dev/null 2>&1; then \
			printf "  $(GREEN)✔$(RESET)  $$pkg\n"; \
		else \
			printf "  $(RED)✘$(RESET)  $$pkg\n"; \
			missing="$$missing $$pkg"; \
		fi; \
	done; \
	if [ -n "$$missing" ]; then \
		printf "\n$(YELLOW)  → 누락된 패키지를 설치합니다:$(RESET)$$missing\n"; \
		printf "$(YELLOW)  (sudo 패스워드 입력이 필요할 수 있습니다)$(RESET)\n\n"; \
		sudo apt-get install -y $$missing || { \
			printf "\n$(RED)  패키지 설치 실패!$(RESET)\n"; \
			printf "  터미널에서 직접 실행해 주세요:\n"; \
			printf "$(BOLD)    sudo apt-get install -y$$missing$(RESET)\n\n"; \
			exit 1; \
		}; \
		printf "$(GREEN)  ✔  패키지 설치 완료$(RESET)\n"; \
	fi
	@printf "$(CYAN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)\n\n"

# ── Linking ───────────────────────────────────────────────────────────────
$(TARGET): $(OBJS)
	@printf "$(BLUE)[3/3] 링킹: $(APP_NAME)$(RESET)\n"
	@$(CC) -o $@ $^ $(LDFLAGS)

# ── Compilation ───────────────────────────────────────────────────────────
$(BUILD_DIR)/%.o: $(SRC_DIR)/%.c | $(BUILD_DIR)
	@printf "$(BOLD)[2/3]$(RESET) 컴파일: $<\n"
	@$(CC) $(CFLAGS) -c -o $@ $<

$(BUILD_DIR):
	@mkdir -p $(BUILD_DIR)

# ── Explicit package install (for manual use) ─────────────────────────────
install-packages:
	@printf "$(YELLOW)패키지 설치 중: $(PACKAGES)$(RESET)\n"
	sudo apt-get update
	sudo apt-get install -y $(PACKAGES)

# ── Clean ─────────────────────────────────────────────────────────────────
clean:
	@printf "$(RED)빌드 산출물 삭제 중...$(RESET)\n"
	@rm -rf $(BUILD_DIR)
	@printf "$(GREEN)✔  정리 완료$(RESET)\n"
