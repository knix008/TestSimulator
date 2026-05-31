APP=myocr
BUILD_DIR=build
STEPS=5

MAIN_SRC=src/main.c

CORE_SRC= \
	src/app/ocr_app.c \
	src/image/image_loader.c \
	src/image/pdf_renderer.c \
	src/image/preprocessor.c \
	src/util/app_settings.c \
	src/util/result_save.c \
	src/ocr/ocr_types.c \
	src/ocr/ocr_provider.c \
	src/ocr/ocr_service.c \
	src/ocr/ocr_box_transform.c \
	src/ocr/ocr_result_scorer.c \
	src/ocr/ocr_text_postprocessor.c \
	src/ocr/engine_paths.c \
	src/ocr/engine_install.c \
	src/ocr/engine_download.c \
	src/ocr/result_json.c \
	src/ocr/python_runner.c \
	src/ocr/providers/tesseract_provider.c \
	src/ocr/providers/paddle_provider.c \
	src/ocr/providers/easyocr_provider.c

GTK_SRC= \
	src/gtk/gtk_app.c \
	src/gtk/gtk_main_window.c \
	src/gtk/gtk_install_progress.c \
	src/gtk/gtk_app_icon.c \
	src/gtk/gtk_pixbuf_util.c

CORE_OBJS=$(patsubst src/%.c,$(BUILD_DIR)/%.o,$(CORE_SRC))
GTK_OBJS=$(patsubst src/%.c,$(BUILD_DIR)/%.o,$(GTK_SRC))
MAIN_OBJ=$(BUILD_DIR)/main.o
ALL_OBJS=$(MAIN_OBJ) $(CORE_OBJS) $(GTK_OBJS)

PKG_CFLAGS=`pkg-config --cflags gtk+-3.0 tesseract lept poppler-glib json-glib-1.0 libcurl gio-2.0 cairo`
PKG_LIBS=`pkg-config --libs gtk+-3.0 tesseract lept poppler-glib json-glib-1.0 libcurl gio-2.0 cairo`

CC=gcc
CFLAGS=$(PKG_CFLAGS) -Iinclude -O2 -Wall -std=gnu11
LDFLAGS=$(PKG_LIBS) -lm

# ── 색상 (NO_COLOR=1 이면 비활성) ─────────────────────────────────────────
ifeq ($(NO_COLOR),)
  ESC=\033
  C_RESET=$(ESC)[0m
  C_BOLD=$(ESC)[1m
  C_DIM=$(ESC)[2m
  C_GREEN=$(ESC)[32m
  C_CYAN=$(ESC)[36m
  C_YELLOW=$(ESC)[33m
  C_BLUE=$(ESC)[34m
  C_MAGENTA=$(ESC)[35m
else
  C_RESET=
  C_BOLD=
  C_DIM=
  C_GREEN=
  C_CYAN=
  C_YELLOW=
  C_BLUE=
  C_MAGENTA=
endif

define STEP
@printf "$(C_CYAN)$(C_BOLD)[$(1)/$(STEPS)]$(C_RESET) $(C_YELLOW)$(2)$(C_RESET)\n"
endef

define OK
@printf "       $(C_GREEN)✔$(C_RESET) $(1)\n"
endef

define INFO
@printf "       $(C_BLUE)→$(C_RESET) $(1)\n"
endef

define BANNER
@printf "\n$(C_MAGENTA)$(C_BOLD)▶ OCRLinuxGTKV10 빌드$(C_RESET)\n\n"
endef

.PHONY: all deps clean install-scripts app-icon test-ocr \
        stage-scripts stage-core stage-gtk stage-link stage-done \
        core-objs gtk-objs

SMOKE_TEST=ocr_smoke_test
SMOKE_OBJ=$(BUILD_DIR)/tools/ocr_smoke_test.o
ICON=assets/myocr.png
APP_ICON=$(APP).png

all: stage-scripts stage-core stage-gtk stage-link stage-done

stage-scripts: install-scripts app-icon
	$(call BANNER)
	$(call STEP,1,스크립트 준비)
	$(call OK,paddle_ocr · easyocr_ocr · icon)

stage-core:
	$(call STEP,2,코어 모듈 컴파일)
	$(call INFO,app · image · ocr · util)
	@$(MAKE) --no-print-directory core-objs
	$(call OK,$(words $(CORE_OBJS) $(MAIN_OBJ))개 오브젝트)

stage-gtk:
	$(call STEP,3,GTK UI 컴파일)
	$(call INFO,gtk_app · main_window · pixbuf_util)
	@$(MAKE) --no-print-directory gtk-objs
	$(call OK,$(words $(GTK_OBJS))개 오브젝트)

stage-link: $(APP)
	$(call STEP,4,실행 파일 링크)
	$(call OK,$(APP))

stage-done:
	$(call STEP,5,빌드 완료)
	@printf "       $(C_GREEN)$(C_BOLD)✔ $(APP)$(C_RESET) $(C_DIM)준비됨$(C_RESET)\n\n"

core-objs: $(CORE_OBJS) $(MAIN_OBJ)
gtk-objs: $(GTK_OBJS)

$(APP): $(ALL_OBJS) $(ICON)
	@$(CC) $(ALL_OBJS) -o $@ $(LDFLAGS)
	@cp $(ICON) $(APP_ICON)

$(BUILD_DIR)/%.o: src/%.c
	@mkdir -p $(dir $@)
	@$(CC) $(CFLAGS) -c $< -o $@

install-scripts:
	@chmod +x scripts/paddle_ocr.py scripts/easyocr_ocr.py 2>/dev/null || true

app-icon:
	@python3 scripts/gen_app_icon.py > /dev/null

echo_os:
	@uname

deps:
	@printf "\n$(C_MAGENTA)$(C_BOLD)▶ 의존성 설치$(C_RESET)\n\n"
	@printf "$(C_CYAN)$(C_BOLD)[1/2]$(C_RESET) $(C_YELLOW)OS 및 패키지 매니저 감지$(C_RESET)\n"
	@if [ -f /etc/debian_version ]; then \
	  printf "       $(C_BLUE)→$(C_RESET) apt 기반 설치\n"; \
	  sudo apt-get update && sudo apt-get install -y build-essential pkg-config \
	    libgtk-3-dev libtesseract-dev libleptonica-dev libpoppler-glib-dev \
	    libjson-glib-dev libcurl4-openssl-dev python3 python3-pip libcairo2-dev; \
	elif [ -f /etc/redhat-release ]; then \
	  printf "       $(C_BLUE)→$(C_RESET) dnf 기반 설치\n"; \
	  sudo dnf install -y gcc pkgconf-pkg-config gtk3-devel tesseract-devel \
	    leptonica-devel poppler-glib-devel json-glib-devel libcurl-devel python3 python3-pip cairo-devel; \
	elif [ -f /etc/arch-release ]; then \
	  printf "       $(C_BLUE)→$(C_RESET) pacman 기반 설치\n"; \
	  sudo pacman -Sy --noconfirm base-devel gtk3 tesseract tesseract-data-eng tesseract-data-kor \
	    leptonica poppler-glib json-glib curl python python-pip cairo; \
	elif [ "$$(uname)" = "Darwin" ]; then \
	  printf "       $(C_BLUE)→$(C_RESET) Homebrew 기반 설치\n"; \
	  brew install gtk+3 tesseract poppler json-glib curl python3 cairo; \
	else \
	  printf "       $(C_YELLOW)!$(C_RESET) 지원하지 않는 OS — 수동 설치 필요\n"; \
	  exit 1; \
	fi
	@printf "       $(C_GREEN)✔$(C_RESET) 시스템 패키지 설치 완료\n\n"
	@printf "$(C_CYAN)$(C_BOLD)[2/2]$(C_RESET) $(C_YELLOW)Python OCR 엔진 (선택)$(C_RESET)\n"
	@printf "       $(C_DIM)python3 -m pip install --user -r scripts/requirements.txt$(C_RESET)\n\n"

clean:
	@printf "$(C_YELLOW)[clean]$(C_RESET) 빌드 산출물 제거\n"
	@rm -rf $(BUILD_DIR) $(APP) $(SMOKE_TEST)
	@printf "       $(C_GREEN)✔$(C_RESET) clean 완료\n"

test-ocr: core-objs $(SMOKE_OBJ)
	@printf "\n$(C_MAGENTA)$(C_BOLD)▶ OCR 엔진 테스트$(C_RESET)\n\n"
	@printf "$(C_CYAN)[1/2]$(C_RESET) $(C_YELLOW)테스트 이미지 생성$(C_RESET)\n"
	@python3 scripts/gen_test_image.py > /dev/null
	@printf "       $(C_GREEN)✔$(C_RESET) scripts/test_sample.png\n\n"
	@printf "$(C_CYAN)[2/2]$(C_RESET) $(C_YELLOW)엔진별 OCR 실행$(C_RESET)\n"
	@$(CC) $(SMOKE_OBJ) $(CORE_OBJS) -o $(SMOKE_TEST) $(LDFLAGS)
	@./$(SMOKE_TEST)
	@printf "\n"
