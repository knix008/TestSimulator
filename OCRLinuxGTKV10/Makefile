APP=myocr
BUILD_DIR=build
MODELS_DIR=models
STEPS=7

MAIN_SRC=src/main.c

CORE_C_SRC= \
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
	src/ocr/providers/rapid_provider.c \
	src/ocr/providers/paddle_onnx_provider.c \
	src/ocr/providers/easyocr_provider.c \
	src/ocr/providers/tesseract_provider.c \
	src/ocr/python_runner.c

CORE_CXX_SRC= \
	src/ocr/rapid_engine.cpp

GTK_SRC= \
	src/gtk/gtk_app.c \
	src/gtk/gtk_main_window.c \
	src/gtk/gtk_install_progress.c \
	src/gtk/gtk_app_icon.c \
	src/gtk/gtk_pixbuf_util.c

CORE_C_OBJS=$(patsubst src/%.c,$(BUILD_DIR)/%.o,$(CORE_C_SRC))
CORE_CXX_OBJS=$(patsubst src/%.cpp,$(BUILD_DIR)/%.o,$(CORE_CXX_SRC))
CORE_OBJS=$(CORE_C_OBJS) $(CORE_CXX_OBJS)
GTK_OBJS=$(patsubst src/%.c,$(BUILD_DIR)/%.o,$(GTK_SRC))
MAIN_OBJ=$(BUILD_DIR)/main.o
ALL_OBJS=$(MAIN_OBJ) $(CORE_OBJS) $(GTK_OBJS)

# ── Platform detection ─────────────────────────────────────────────────────
UNAME_S=$(shell uname -s)
UNAME_M=$(shell uname -m)

# ── ONNX Runtime ───────────────────────────────────────────────────────────
ORT_VERSION=1.20.1
ORT_DIR=third_party/onnxruntime

ifeq ($(UNAME_S),Darwin)
  ifeq ($(UNAME_M),arm64)
    ORT_PKG=onnxruntime-osx-arm64-$(ORT_VERSION).tgz
  else
    ORT_PKG=onnxruntime-osx-x86_64-$(ORT_VERSION).tgz
  endif
else
  ORT_PKG=onnxruntime-linux-x64-$(ORT_VERSION).tgz
endif
ORT_URL=https://github.com/microsoft/onnxruntime/releases/download/v$(ORT_VERSION)/$(ORT_PKG)
ORT_STAMP=$(ORT_DIR)/.stamp

ORT_CFLAGS=-I$(ORT_DIR)/include
ifeq ($(UNAME_S),Darwin)
  ORT_LIBS=-L$(ORT_DIR)/lib -lonnxruntime \
    -Wl,-rpath,$(abspath $(ORT_DIR)/lib)
else
  ORT_LIBS=-L$(ORT_DIR)/lib -lonnxruntime \
    -Wl,-rpath,$(abspath $(ORT_DIR)/lib)
endif

ifeq ($(UNAME_S),Darwin)
  BREW_PREFIX=$(shell brew --prefix 2>/dev/null || echo /opt/homebrew)
  export PKG_CONFIG_PATH:=$(BREW_PREFIX)/lib/pkgconfig:$(PKG_CONFIG_PATH)
  OPENCV_CFLAGS=$(shell pkg-config --cflags opencv4 2>/dev/null || echo "-I$(BREW_PREFIX)/include/opencv4")
  OPENCV_LIBS=$(shell pkg-config --libs opencv4 2>/dev/null || \
    echo "-L$(BREW_PREFIX)/lib -lopencv_core -lopencv_imgproc -lopencv_imgcodecs")
  PKG_CFLAGS=$(shell pkg-config --cflags gtk+-3.0 tesseract lept poppler-glib json-glib-1.0 libcurl gio-2.0 cairo)
  PKG_LIBS=$(shell pkg-config --libs   gtk+-3.0 tesseract lept poppler-glib json-glib-1.0 libcurl gio-2.0 cairo)
else
  OPENCV_CFLAGS=$(shell pkg-config --cflags opencv4)
  # opencv4 only needs core+imgproc (no DNN) — avoid linking unused modules
  OPENCV_LIBS=-lopencv_core -lopencv_imgproc
  PKG_CFLAGS=$(shell pkg-config --cflags gtk+-3.0 tesseract lept poppler-glib json-glib-1.0 libcurl gio-2.0 cairo)
  PKG_LIBS=$(shell pkg-config --libs   gtk+-3.0 tesseract lept poppler-glib json-glib-1.0 libcurl gio-2.0 cairo)
endif

CC=gcc
CXX=g++
CFLAGS=$(PKG_CFLAGS) -Iinclude -O2 -Wall -std=gnu11
CXXFLAGS=$(PKG_CFLAGS) $(OPENCV_CFLAGS) $(ORT_CFLAGS) -Iinclude -O2 -Wall -std=c++17
LDFLAGS=$(PKG_LIBS) $(OPENCV_LIBS) $(ORT_LIBS) -lm -lstdc++

CURL_CMD=curl -fsSL --retry 3 --retry-delay 2

# ── 색상 ──────────────────────────────────────────────────────────────────
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
  C_RESET= C_BOLD= C_DIM= C_GREEN= C_CYAN= C_YELLOW= C_BLUE= C_MAGENTA=
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
define DLOK
@printf "       $(C_GREEN)✔$(C_RESET) $(1) ($(2))\n"
endef
define DLSKIP
@printf "       $(C_DIM)·$(C_RESET) $(1) 이미 존재\n"
endef

# ── HuggingFace / GitHub model URLs (verified 2024-06) ────────────────────
HF=https://huggingface.co/SWHL/RapidOCR/resolve/main
GH=https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils

# RapidOCR: PP-OCRv4 det + PP-OCRv1 Korean rec (한국어 특화)
RAPID_DIR=$(MODELS_DIR)/rapidocr
RAPID_DET=$(RAPID_DIR)/det.onnx
RAPID_CLS=$(RAPID_DIR)/cls.onnx
RAPID_REC=$(RAPID_DIR)/rec.onnx
RAPID_DICT=$(RAPID_DIR)/korean_dict.txt

# PaddleOCR ONNX: PP-OCRv4 det + PP-OCRv1 Korean rec + CLS (각도 보정 포함)
PADDLE_DIR=$(MODELS_DIR)/paddle_onnx
PADDLE_DET=$(PADDLE_DIR)/det.onnx
PADDLE_CLS=$(PADDLE_DIR)/cls.onnx
PADDLE_REC=$(PADDLE_DIR)/rec.onnx
PADDLE_DICT=$(PADDLE_DIR)/korean_dict.txt

ICON=assets/myocr.png
APP_ICON=$(APP).png
SMOKE_TEST=ocr_smoke_test
SMOKE_OBJ=$(BUILD_DIR)/tools/ocr_smoke_test.o

.PHONY: all deps clean models models-rapidocr models-paddle easyocr-scripts ort \
        stage-ort stage-models stage-easyocr stage-core stage-gtk stage-link stage-done \
        core-objs gtk-objs

# ── 기본 빌드: ORT → 모델 → EasyOCR → 컴파일 → 링크 ──────────────────────
all: stage-ort stage-models stage-easyocr stage-core stage-gtk stage-link stage-done

# ── ONNX Runtime 다운로드 ──────────────────────────────────────────────────
$(ORT_STAMP):
	@mkdir -p $(ORT_DIR)
	@printf "       \033[34m↓\033[0m ONNX Runtime v$(ORT_VERSION)\n"
	@$(CURL_CMD) -o /tmp/$(ORT_PKG) "$(ORT_URL)"
	@tar -xf /tmp/$(ORT_PKG) -C $(ORT_DIR) --strip-components=1
	@rm -f /tmp/$(ORT_PKG)
	@touch $(ORT_STAMP)

ort: $(ORT_STAMP)

stage-ort:
	$(call BANNER)
	$(call STEP,1,ONNX Runtime 준비)
	@$(MAKE) --no-print-directory ort
	$(call OK,ONNX Runtime v$(ORT_VERSION))

stage-models:
	$(call STEP,2,ONNX 모델 다운로드)
	@$(MAKE) --no-print-directory models
	$(call OK,모델 준비 완료)

stage-easyocr:
	$(call STEP,3,EasyOCR 스크립트 준비)
	@$(MAKE) --no-print-directory easyocr-scripts
	$(call OK,EasyOCR 스크립트)

stage-core:
	$(call STEP,4,코어 모듈 컴파일)
	$(call INFO,app · image · ocr · util · rapid_engine · python_runner)
	@$(MAKE) --no-print-directory core-objs
	$(call OK,$(words $(CORE_OBJS) $(MAIN_OBJ))개 오브젝트)

stage-gtk:
	$(call STEP,5,GTK UI 컴파일)
	$(call INFO,gtk_app · main_window · pixbuf_util)
	@$(MAKE) --no-print-directory gtk-objs
	$(call OK,$(words $(GTK_OBJS))개 오브젝트)

stage-link: $(APP)
	$(call STEP,6,실행 파일 링크)
	$(call OK,$(APP))

stage-done:
	$(call STEP,7,빌드 완료)
	@printf "       $(C_GREEN)$(C_BOLD)✔ $(APP)$(C_RESET) $(C_DIM)준비됨$(C_RESET)\n\n"

# ── 모델 다운로드 타깃 ─────────────────────────────────────────────────────
models: models-rapidocr models-paddle

define DOWNLOAD_MODEL
	@if [ ! -f "$(2)" ]; then \
	  printf "       \033[34m↓\033[0m $(1)\n"; \
	  $(CURL_CMD) -o $(2) "$(3)" || { printf "       \033[31m✗\033[0m 다운로드 실패: $(1)\n"; exit 1; }; \
	else \
	  printf "       \033[2m·\033[0m $(1) 이미 존재\n"; \
	fi
endef

models-rapidocr:
	@mkdir -p $(RAPID_DIR)
	$(call INFO,RapidOCR 모델 \(PP-OCRv4 det + PP-OCRv1 Korean rec\))
	$(call DOWNLOAD_MODEL,det.onnx (PP-OCRv4\, ~4.6 MB),$(RAPID_DET),$(HF)/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx)
	$(call DOWNLOAD_MODEL,cls.onnx (PP-OCRv1\, ~0.6 MB),$(RAPID_CLS),$(HF)/PP-OCRv1/ch_ppocr_mobile_v2.0_cls_infer.onnx)
	$(call DOWNLOAD_MODEL,rec.onnx (Korean PP-OCRv1\, ~3.2 MB),$(RAPID_REC),$(HF)/PP-OCRv1/korean_mobile_v2.0_rec_infer.onnx)
	$(call DOWNLOAD_MODEL,korean_dict.txt,$(RAPID_DICT),$(GH)/dict/korean_dict.txt)

models-paddle:
	@mkdir -p $(PADDLE_DIR)
	$(call INFO,PaddleOCR ONNX 모델 \(PP-OCRv4 det + PP-OCRv1 Korean rec + CLS\))
	$(call DOWNLOAD_MODEL,det.onnx (PP-OCRv4\, ~4.6 MB),$(PADDLE_DET),$(HF)/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx)
	$(call DOWNLOAD_MODEL,cls.onnx (PP-OCRv1\, ~0.6 MB),$(PADDLE_CLS),$(HF)/PP-OCRv1/ch_ppocr_mobile_v2.0_cls_infer.onnx)
	$(call DOWNLOAD_MODEL,rec.onnx (Korean PP-OCRv1\, ~3.2 MB),$(PADDLE_REC),$(HF)/PP-OCRv1/korean_mobile_v2.0_rec_infer.onnx)
	$(call DOWNLOAD_MODEL,korean_dict.txt,$(PADDLE_DICT),$(GH)/dict/korean_dict.txt)

# EasyOCR Python 스크립트 실행 권한
easyocr-scripts:
	@chmod +x scripts/easyocr_server.py scripts/easyocr_ocr.py 2>/dev/null || true

# ── 컴파일 규칙 ──────────────────────────────────────────────────────────
core-objs: $(CORE_OBJS) $(MAIN_OBJ)
gtk-objs: $(GTK_OBJS)

$(APP): $(ALL_OBJS) $(ICON)
	@$(CXX) $(ALL_OBJS) -o $@ $(LDFLAGS)
	@cp $(ICON) $(APP_ICON)

$(BUILD_DIR)/%.o: src/%.c
	@mkdir -p $(dir $@)
	@$(CC) $(CFLAGS) -c $< -o $@

$(BUILD_DIR)/%.o: src/%.cpp
	@mkdir -p $(dir $@)
	@$(CXX) $(CXXFLAGS) -c $< -o $@

# ── 의존성 설치 (make deps) ───────────────────────────────────────────────
#   설치되는 패키지:
#     - GTK3, GLib/GIO, Cairo, Pango
#     - Tesseract OCR + Leptonica
#     - Poppler (PDF), json-glib, libcurl
#     - OpenCV (이미지 전처리)
#     - Python3 + pip + venv (EasyOCR 전용)
#     - g++ (C++17 컴파일러)
#   ONNX Runtime은 'make' 실행 시 GitHub에서 자동 다운로드됩니다.
deps:
	@printf "\n$(C_MAGENTA)$(C_BOLD)▶ 의존성 설치$(C_RESET)\n\n"
	@printf "$(C_CYAN)$(C_BOLD)[1/2]$(C_RESET) $(C_YELLOW)시스템 패키지 설치$(C_RESET)\n"
	@if [ "$$(uname)" = "Darwin" ]; then \
	  printf "       $(C_BLUE)→$(C_RESET) Homebrew 기반 설치\n"; \
	  brew install \
	    pkg-config gcc g++ \
	    gtk+3 glib cairo pango \
	    tesseract leptonica \
	    poppler json-glib curl \
	    opencv \
	    python3; \
	elif [ -f /etc/debian_version ]; then \
	  printf "       $(C_BLUE)→$(C_RESET) apt 기반 설치 (Ubuntu/Debian)\n"; \
	  sudo apt-get update && sudo apt-get install -y \
	    build-essential pkg-config g++ \
	    libgtk-3-dev \
	    libglib2.0-dev libcairo2-dev \
	    libtesseract-dev \
	    libleptonica-dev \
	    libpoppler-glib-dev \
	    libjson-glib-dev \
	    libcurl4-openssl-dev \
	    libopencv-dev \
	    python3 python3-pip python3-venv; \
	elif [ -f /etc/redhat-release ]; then \
	  printf "       $(C_BLUE)→$(C_RESET) dnf 기반 설치 (Fedora/RHEL)\n"; \
	  sudo dnf install -y \
	    gcc gcc-c++ pkgconf-pkg-config \
	    gtk3-devel \
	    glib2-devel cairo-devel \
	    tesseract-devel \
	    leptonica-devel \
	    poppler-glib-devel \
	    json-glib-devel \
	    libcurl-devel \
	    opencv-devel \
	    python3 python3-pip; \
	elif [ -f /etc/arch-release ]; then \
	  printf "       $(C_BLUE)→$(C_RESET) pacman 기반 설치 (Arch Linux)\n"; \
	  sudo pacman -Sy --noconfirm \
	    base-devel \
	    gtk3 \
	    glib2 cairo \
	    tesseract tesseract-data-eng tesseract-data-kor \
	    leptonica \
	    poppler-glib json-glib curl \
	    opencv \
	    python python-pip; \
	else \
	  printf "       $(C_YELLOW)!$(C_RESET) 지원하지 않는 OS — 수동 설치 필요\n"; \
	  exit 1; \
	fi
	@printf "       $(C_GREEN)✔$(C_RESET) 시스템 패키지 설치 완료\n\n"
	@printf "$(C_CYAN)$(C_BOLD)[2/2]$(C_RESET) $(C_YELLOW)ONNX Runtime 준비$(C_RESET)\n"
	@$(MAKE) --no-print-directory ort
	@printf "       $(C_GREEN)✔$(C_RESET) ONNX Runtime v$(ORT_VERSION)\n"
	@printf "       $(C_DIM)EasyOCR Python 패키지는 첫 OCR 실행 시 자동 설치됩니다.$(C_RESET)\n\n"

# ── 정리 ─────────────────────────────────────────────────────────────────
clean:
	@printf "$(C_YELLOW)[clean]$(C_RESET) 빌드 산출물 제거\n"
	@rm -rf $(BUILD_DIR) $(APP) $(APP_ICON) $(SMOKE_TEST)
	@printf "       $(C_GREEN)✔$(C_RESET) clean 완료\n"

clean-models:
	@printf "$(C_YELLOW)[clean-models]$(C_RESET) 다운로드된 모델 제거\n"
	@rm -rf $(MODELS_DIR)
	@printf "       $(C_GREEN)✔$(C_RESET) 모델 제거 완료\n"

test-ocr: core-objs $(SMOKE_OBJ)
	@printf "\n$(C_MAGENTA)$(C_BOLD)▶ OCR 엔진 테스트$(C_RESET)\n\n"
	@$(CXX) $(SMOKE_OBJ) $(CORE_OBJS) -o $(SMOKE_TEST) $(LDFLAGS)
	@./$(SMOKE_TEST) samples/Test01.png
	@printf "\n"

echo_os:
	@uname
