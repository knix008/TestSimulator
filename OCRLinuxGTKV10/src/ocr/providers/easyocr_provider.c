/*
 * EasyOCR 영속 프로세스 프로바이더
 *
 * easyocr_server.py를 한 번 시작하고 살려 둡니다.
 * 모델은 최초 시작 시 한 번만 로딩되며, 이후 인식은 stdin/stdout
 * 라인 프로토콜로 이미지 경로를 전달받아 JSON 결과를 반환합니다.
 *
 * 프로토콜 (줄 단위):
 *   시작: Python → {"status":"ready"} 또는 {"status":"error",...}
 *   인식: C → <image_path>\n
 *          Python → <json_result>\n
 */
#include "ocr/ocr_provider.h"
#include "ocr/ocr_provider_ids.h"
#include "ocr/engine_paths.h"
#include "ocr/engine_download.h"
#include "ocr/result_json.h"
#include <gio/gio.h>
#include <stdio.h>

typedef struct {
    OcrProvider       base;
    GSubprocess      *proc;
    GOutputStream    *stdin_pipe;
    GDataInputStream *stdout_pipe;
} EasyOcrProvider;

/* ── 프로세스 정리 ─────────────────────────────────────────────────── */
static void easyocr_stop(EasyOcrProvider *ep) {
    if (ep->stdout_pipe) {
        g_object_unref(ep->stdout_pipe);
        ep->stdout_pipe = NULL;
    }
    if (ep->proc) {
        g_subprocess_force_exit(ep->proc);
        g_object_unref(ep->proc);
        ep->proc = NULL;
        ep->stdin_pipe = NULL;  /* owned by proc */
    }
}

/* ── 프로세스 시작 + 모델 로딩 대기 ───────────────────────────────── */
static gboolean easyocr_start(EasyOcrProvider *ep, GError **error) {
    easyocr_stop(ep);

    char *script = engine_paths_script("easyocr_server.py");
    if (!g_file_test(script, G_FILE_TEST_IS_REGULAR)) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_NOENT,
                    "easyocr_server.py 없음: %s", script);
        g_free(script);
        return FALSE;
    }

    char *python    = engine_paths_python_exe();
    char *model_dir = engine_paths_easyocr_models_dir();

    const char *argv[] = { python, script, model_dir, NULL };
    GSubprocess *proc = g_subprocess_newv(argv,
        G_SUBPROCESS_FLAGS_STDIN_PIPE  |
        G_SUBPROCESS_FLAGS_STDOUT_PIPE |
        G_SUBPROCESS_FLAGS_STDERR_SILENCE,
        error);

    g_free(python);
    g_free(script);
    g_free(model_dir);

    if (!proc) return FALSE;

    ep->proc        = proc;
    ep->stdin_pipe  = g_subprocess_get_stdin_pipe(proc);  /* owned by proc */
    ep->stdout_pipe = g_data_input_stream_new(g_subprocess_get_stdout_pipe(proc));

    /*
     * 첫 줄은 시작 신호: {"status":"ready"} 또는 {"status":"error",...}
     * 모델 로딩 중 OCR 스레드가 여기서 블로킹됩니다 (메인 루프는 정상 실행).
     */
    GError *local = NULL;
    gsize len = 0;
    gchar *line = g_data_input_stream_read_line(ep->stdout_pipe, &len, NULL, &local);

    if (!line) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "EasyOCR 서버 응답 없음: %s",
                    local ? local->message : "프로세스가 예기치 않게 종료됨");
        g_clear_error(&local);
        easyocr_stop(ep);
        return FALSE;
    }

    if (!strstr(line, "\"ready\"")) {
        /* 오류 메시지 파싱 */
        const char *msg = strstr(line, "\"message\":");
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "EasyOCR 서버 초기화 실패: %s",
                    msg ? msg : line);
        g_free(line);
        easyocr_stop(ep);
        return FALSE;
    }

    g_free(line);
    return TRUE;
}

/* ── is_installed ──────────────────────────────────────────────────── */
static gboolean easyocr_is_installed(const OcrProvider *provider) {
    (void)provider;
    char *models = engine_paths_easyocr_models_dir();
    gboolean has_dir = g_file_test(models, G_FILE_TEST_IS_DIR);
    g_free(models);
    return has_dir;
}

/* ── ensure_installed ──────────────────────────────────────────────── */
static gboolean easyocr_ensure_installed(OcrProvider *provider,
                                          OcrInstallContext *ctx,
                                          GError **error) {
    (void)provider;
    char *models = engine_paths_easyocr_models_dir();
    g_mkdir_with_parents(models, 0755);
    g_free(models);
    if (!engine_ensure_python_module("easyocr", ctx, error))
        return FALSE;

    /*
     * 설치 후 서버를 미리 시작하여 모델을 로딩합니다.
     * install 진행 다이얼로그가 열린 상태에서 로딩 시간을 소화합니다.
     */
    ocr_install_report(ctx, "EasyOCR 모델을 초기화합니다 (최초 1회, 약 30–60초)...", -1);

    EasyOcrProvider *ep = (EasyOcrProvider *)provider;
    if (!ep->proc) {
        if (!easyocr_start(ep, error))
            return FALSE;
    }

    ocr_install_report(ctx, "EasyOCR 준비 완료", 100);
    return TRUE;
}

/* ── recognize ─────────────────────────────────────────────────────── */
static gboolean easyocr_recognize(OcrProvider *provider,
                                   PIX *image,
                                   OcrResult *result,
                                   GError **error) {
    EasyOcrProvider *ep = (EasyOcrProvider *)provider;

    /* 프로세스가 없거나 죽었으면 재시작 */
    if (!ep->proc) {
        if (!easyocr_start(ep, error)) return FALSE;
    }

    /* 임시 이미지 저장 */
    char tmp_path[256];
    g_snprintf(tmp_path, sizeof(tmp_path), "/tmp/ocrlinuxgtk_easy_%d.png", (int)getpid());
    if (pixWriteAutoFormat(tmp_path, image) != 0) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "임시 이미지 저장 실패");
        return FALSE;
    }

    /* 이미지 경로 전송 (OCR 스레드에서 블로킹 write) */
    char *msg = g_strdup_printf("%s\n", tmp_path);
    gsize written = 0;
    GError *io_err = NULL;
    gboolean ok = g_output_stream_write_all(ep->stdin_pipe, msg,
                                             strlen(msg), &written, NULL, &io_err);
    g_free(msg);
    remove(tmp_path);

    if (!ok) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "EasyOCR 서버 통신 실패 (stdin): %s",
                    io_err ? io_err->message : "알 수 없는 오류");
        g_clear_error(&io_err);
        easyocr_stop(ep);   /* 프로세스 재시작을 위해 정리 */
        return FALSE;
    }

    /* JSON 결과 한 줄 읽기 (OCR 스레드에서 블로킹 read) */
    gsize len = 0;
    gchar *line = g_data_input_stream_read_line(ep->stdout_pipe, &len, NULL, &io_err);

    if (!line) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "EasyOCR 서버 응답 없음 (stdout): %s",
                    io_err ? io_err->message : "프로세스 종료됨");
        g_clear_error(&io_err);
        easyocr_stop(ep);
        return FALSE;
    }

    gboolean parsed = ocr_result_from_json(line, result, error);
    g_free(line);
    return parsed;
}

/* ── destroy ───────────────────────────────────────────────────────── */
static void easyocr_destroy(OcrProvider *provider) {
    EasyOcrProvider *ep = (EasyOcrProvider *)provider;
    easyocr_stop(ep);
    g_free(ep);
}

/* ── 생성 ──────────────────────────────────────────────────────────── */
OcrProvider *easyocr_provider_create(void) {
    EasyOcrProvider *ep = g_new0(EasyOcrProvider, 1);
    ep->base.vtable = (OcrProviderVTable){
        .id               = OCR_PROVIDER_EASYOCR,
        .display_name     = "EasyOCR (한·영, Python)",
        .description      = "EasyOCR ko+en · 영속 서버 · 최초 실행 시 모델 로딩 후 빠름",
        .is_installed     = easyocr_is_installed,
        .ensure_installed = easyocr_ensure_installed,
        .recognize        = easyocr_recognize,
        .destroy          = easyocr_destroy,
    };
    return &ep->base;
}
