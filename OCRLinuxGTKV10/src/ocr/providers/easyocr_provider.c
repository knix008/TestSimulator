/*
 * EasyOCR 영속 프로세스 프로바이더
 *
 * easyocr_server.py를 한 번 시작하고 살려 둡니다.
 * 모델은 최초 시작 시 한 번만 로딩되며, 이후 인식은 stdin/stdout
 * 라인 프로토콜로 이미지 경로를 전달받아 JSON 결과를 반환합니다.
 *
 * 프로토콜 (줄 단위):
 *   시작: Python → {"status":"loading","message":"..."}* → {"status":"ready"}
 *          또는 {"status":"error","message":"..."}
 *   인식: C → <image_path>\n
 *          Python → <json_result>\n
 */
#include "ocr/ocr_provider.h"
#include "ocr/ocr_provider_ids.h"
#include "ocr/engine_paths.h"
#include "ocr/engine_download.h"
#include "ocr/engine_install.h"
#include "ocr/result_json.h"
#include <gio/gio.h>
#include <glib/gstdio.h>
#include <stdio.h>

typedef struct {
    OcrProvider       base;
    GSubprocess      *proc;
    GOutputStream    *stdin_pipe;
    GDataInputStream *stdout_pipe;
    GMutex            io_lock;
} EasyOcrProvider;

static void easyocr_clear_ready_marker(void) {
    char *marker = engine_paths_easyocr_ready_marker();
    g_remove(marker);
    g_free(marker);
}

static gboolean easyocr_write_ready_marker(void) {
    char *marker = engine_paths_easyocr_ready_marker();
    char *dir    = g_path_get_dirname(marker);
    g_mkdir_with_parents(dir, 0755);
    gboolean ok = g_file_set_contents(marker, "ok\n", -1, NULL);
    g_free(dir);
    g_free(marker);
    return ok;
}

/* JSON 한 줄에서 "message" 값 추출 (간단 파싱) */
static char *easyocr_parse_json_message(const char *line) {
    const char *key = strstr(line, "\"message\"");
    if (!key) return NULL;
    const char *start = strchr(key, ':');
    if (!start) return NULL;
    start = strchr(start, '"');
    if (!start) return NULL;
    start++;
    const char *end = strchr(start, '"');
    if (!end || end <= start) return NULL;
    return g_strndup(start, (gsize)(end - start));
}

static void easyocr_report_line(OcrInstallContext *ctx, const char *line) {
    if (!ctx || !line) return;
    if (strstr(line, "\"loading\"")) {
        char *msg = easyocr_parse_json_message(line);
        ocr_install_report(ctx, msg ? msg : "EasyOCR 준비 중...", -1);
        g_free(msg);
    }
}

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
        ep->stdin_pipe = NULL;
    }
}

/* ── 프로세스 시작 + 모델 로딩 대기 ───────────────────────────────── */
static gboolean easyocr_start(EasyOcrProvider *ep, OcrInstallContext *ctx, GError **error) {
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
    ep->stdin_pipe  = g_subprocess_get_stdin_pipe(proc);
    ep->stdout_pipe = g_data_input_stream_new(g_subprocess_get_stdout_pipe(proc));

    GCancellable *cancel = ctx ? ctx->cancellable : NULL;

    for (;;) {
        if (ctx && ocr_install_cancelled(ctx)) {
            g_set_error(error, G_IO_ERROR, G_IO_ERROR_CANCELLED, "EasyOCR 설치가 취소되었습니다");
            easyocr_stop(ep);
            return FALSE;
        }

        GError *local = NULL;
        gsize len = 0;
        gchar *line = g_data_input_stream_read_line(ep->stdout_pipe, &len, cancel, &local);

        if (!line) {
            if (local && g_error_matches(local, G_IO_ERROR, G_IO_ERROR_CANCELLED)) {
                g_propagate_error(error, local);
            } else {
                g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                            "EasyOCR 서버 응답 없음: %s",
                            local ? local->message : "프로세스가 예기치 않게 종료됨");
                if (local) g_error_free(local);
            }
            easyocr_stop(ep);
            return FALSE;
        }

        easyocr_report_line(ctx, line);

        if (strstr(line, "\"ready\"")) {
            g_free(line);
            return TRUE;
        }

        if (strstr(line, "\"error\"")) {
            char *msg = easyocr_parse_json_message(line);
            g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                        "EasyOCR 서버 초기화 실패: %s",
                        msg ? msg : line);
            g_free(msg);
            g_free(line);
            easyocr_stop(ep);
            return FALSE;
        }

        g_free(line);
    }
}

static gboolean easyocr_env_ready(void) {
    char *marker = engine_paths_easyocr_ready_marker();
    gboolean ready = g_file_test(marker, G_FILE_TEST_EXISTS);
    g_free(marker);
    return ready;
}

/* ── is_installed ──────────────────────────────────────────────────── */
static gboolean easyocr_is_installed(const OcrProvider *provider) {
    (void)provider;
    return easyocr_env_ready();
}

/* ── ensure_installed ──────────────────────────────────────────────── */
static gboolean easyocr_ensure_installed(OcrProvider *provider,
                                          OcrInstallContext *ctx,
                                          GError **error) {
    EasyOcrProvider *ep = (EasyOcrProvider *)provider;
    g_mutex_lock(&ep->io_lock);

    /* 이미 준비됨 — 서버만 연결 (재설치·모델 재로딩 생략) */
    if (easyocr_env_ready()) {
        if (!ep->proc) {
            ocr_install_report(ctx, "EasyOCR 서버 연결 중...", -1);
            if (!easyocr_start(ep, ctx, error)) {
                easyocr_clear_ready_marker();
                g_mutex_unlock(&ep->io_lock);
                return FALSE;
            }
        }
        ocr_install_report(ctx, "EasyOCR 준비 완료", 100);
        g_mutex_unlock(&ep->io_lock);
        return TRUE;
    }

    easyocr_clear_ready_marker();

    char *models = engine_paths_easyocr_models_dir();
    g_mkdir_with_parents(models, 0755);
    g_free(models);

    ocr_install_report(ctx, "Python 가상 환경 및 EasyOCR 패키지 확인...", 10);
    if (!engine_ensure_python_module("easyocr", ctx, error)) {
        easyocr_clear_ready_marker();
        g_mutex_unlock(&ep->io_lock);
        return FALSE;
    }

    ocr_install_report(ctx, "EasyOCR 모델을 초기화합니다 (최초 1회)...", 40);

    if (!easyocr_start(ep, ctx, error)) {
        easyocr_clear_ready_marker();
        g_mutex_unlock(&ep->io_lock);
        return FALSE;
    }

    if (!easyocr_write_ready_marker()) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "EasyOCR 준비 표시 파일을 쓸 수 없습니다");
        easyocr_clear_ready_marker();
        easyocr_stop(ep);
        g_mutex_unlock(&ep->io_lock);
        return FALSE;
    }

    ocr_install_report(ctx, "EasyOCR 준비 완료", 100);
    g_mutex_unlock(&ep->io_lock);
    return TRUE;
}

/* ── recognize ─────────────────────────────────────────────────────── */
static gboolean easyocr_recognize(OcrProvider *provider,
                                   PIX *image,
                                   OcrResult *result,
                                   GError **error) {
    EasyOcrProvider *ep = (EasyOcrProvider *)provider;
    g_mutex_lock(&ep->io_lock);

    for (int attempt = 0; attempt < 2; attempt++) {
        if (!ep->proc) {
            if (!easyocr_start(ep, NULL, error)) {
                if (attempt == 0) {
                    g_clear_error(error);
                    continue;
                }
                g_mutex_unlock(&ep->io_lock);
                return FALSE;
            }
        }

        char tmp_path[256];
        g_snprintf(tmp_path, sizeof(tmp_path), "/tmp/ocrlinuxgtk_easy_%d_%d.png", (int)getpid(), attempt);
        if (pixWriteAutoFormat(tmp_path, image) != 0) {
            g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "임시 이미지 저장 실패");
            g_mutex_unlock(&ep->io_lock);
            return FALSE;
        }

        char *msg = g_strdup_printf("%s\n", tmp_path);
        gsize written = 0;
        GError *io_err = NULL;
        gboolean ok = g_output_stream_write_all(ep->stdin_pipe, msg,
                                                 strlen(msg), &written, NULL, &io_err);
        g_free(msg);

        if (!ok) {
            remove(tmp_path);
            g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                        "EasyOCR 서버 통신 실패 (stdin): %s",
                        io_err ? io_err->message : "알 수 없는 오류");
            g_clear_error(&io_err);
            easyocr_stop(ep);
            easyocr_clear_ready_marker();
            if (attempt == 0) {
                g_clear_error(error);
                continue;
            }
            g_mutex_unlock(&ep->io_lock);
            return FALSE;
        }

        for (;;) {
            gsize len = 0;
            gchar *line = g_data_input_stream_read_line(ep->stdout_pipe, &len, NULL, &io_err);

            if (!line) {
                remove(tmp_path);
                g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                            "EasyOCR 서버 응답 없음 (stdout): %s",
                            io_err ? io_err->message : "프로세스 종료됨");
                g_clear_error(&io_err);
                easyocr_stop(ep);
                easyocr_clear_ready_marker();
                if (attempt == 0) {
                    g_clear_error(error);
                    break;
                }
                g_mutex_unlock(&ep->io_lock);
                return FALSE;
            }

            g_strstrip(line);
            if (!line[0]) {
                g_free(line);
                continue;
            }
            if (line[0] != '{') {
                g_free(line);
                continue;
            }

            gboolean parsed = ocr_result_from_json(line, result, error);
            g_free(line);
            remove(tmp_path);
            if (!parsed && attempt == 0) {
                g_clear_error(error);
                easyocr_stop(ep);
                easyocr_clear_ready_marker();
                break;
            }
            g_mutex_unlock(&ep->io_lock);
            return parsed;
        }
    }

    g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "EasyOCR 일시 오류 (재시도 실패)");
    g_mutex_unlock(&ep->io_lock);
    return FALSE;
}

/* ── destroy ───────────────────────────────────────────────────────── */
static void easyocr_destroy(OcrProvider *provider) {
    EasyOcrProvider *ep = (EasyOcrProvider *)provider;
    g_mutex_lock(&ep->io_lock);
    easyocr_stop(ep);
    g_mutex_unlock(&ep->io_lock);
    g_mutex_clear(&ep->io_lock);
    g_free(ep);
}

/* ── 생성 ──────────────────────────────────────────────────────────── */
OcrProvider *easyocr_provider_create(void) {
    EasyOcrProvider *ep = g_new0(EasyOcrProvider, 1);
    g_mutex_init(&ep->io_lock);
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
