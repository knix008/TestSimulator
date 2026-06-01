#include "ocr/engine_download.h"
#include "ocr/engine_paths.h"
#include <curl/curl.h>
#include <gio/gio.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

typedef struct {
    FILE *file;
    OcrInstallContext *install_ctx;
    EngineDownloadProgressFn progress;
    gpointer user_data;
    const char *label;
    curl_off_t total;
} DownloadContext;

static size_t write_cb(void *ptr, size_t size, size_t nmemb, void *userdata) {
    DownloadContext *ctx = userdata;
    return fwrite(ptr, size, nmemb, ctx->file);
}

static int progress_cb(void *clientp, curl_off_t dltotal, curl_off_t dlnow, curl_off_t u1, curl_off_t u2) {
    (void)u1; (void)u2;
    DownloadContext *ctx = clientp;
    if (ocr_install_cancelled(ctx->install_ctx)) return 1;
    if (dltotal > 0) ctx->total = dltotal;
    if (ctx->progress) {
        int pct = ctx->total > 0 ? (int)(dlnow * 100 / ctx->total) : -1;
        ctx->progress(ctx->label, pct, ctx->user_data);
    }
    return 0;
}

static gboolean download_once(const char *url, const char *destination,
                               DownloadContext *ctx, GError **error) {
    CURL *curl = curl_easy_init();
    if (!curl) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "curl init failed");
        return FALSE;
    }

    ctx->file = fopen(destination, "wb");
    if (!ctx->file) {
        g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(errno),
                    "Cannot write %s", destination);
        curl_easy_cleanup(curl);
        return FALSE;
    }

    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_USERAGENT, "OCRLinuxGTKV10/1.0");
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_cb);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, ctx);
    curl_easy_setopt(curl, CURLOPT_NOPROGRESS, 0L);
    curl_easy_setopt(curl, CURLOPT_XFERINFOFUNCTION, progress_cb);
    curl_easy_setopt(curl, CURLOPT_XFERINFODATA, ctx);

    CURLcode rc = curl_easy_perform(curl);
    fclose(ctx->file);
    ctx->file = NULL;
    curl_easy_cleanup(curl);

    if (rc == CURLE_ABORTED_BY_CALLBACK) {
        g_set_error(error, G_IO_ERROR, G_IO_ERROR_CANCELLED, "Download cancelled");
        remove(destination);
        return FALSE;
    }
    if (rc != CURLE_OK) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "Download failed: %s", curl_easy_strerror(rc));
        remove(destination);
        return FALSE;
    }
    return TRUE;
}

gboolean engine_download_file(
    const char *url,
    const char *destination,
    OcrInstallContext *ctx,
    EngineDownloadProgressFn progress,
    gpointer user_data,
    GError **error) {

    char *dir = g_path_get_dirname(destination);
    g_mkdir_with_parents(dir, 0755);
    g_free(dir);

    char *basename = g_path_get_basename(destination);
    DownloadContext dlctx = {
        .install_ctx = ctx,
        .progress    = progress,
        .user_data   = user_data,
        .label       = basename,
    };

    for (int attempt = 0; attempt < 3; attempt++) {
        if (ocr_install_cancelled(ctx)) {
            g_set_error(error, G_IO_ERROR, G_IO_ERROR_CANCELLED, "Download cancelled");
            g_free(basename);
            return FALSE;
        }
        GError *local = NULL;
        if (download_once(url, destination, &dlctx, &local)) {
            g_free(basename);
            return TRUE;
        }
        if (local) {
            if (*error) g_clear_error(error);
            g_propagate_error(error, local);
            if (g_error_matches(*error, G_IO_ERROR, G_IO_ERROR_CANCELLED)) {
                g_free(basename);
                return FALSE;
            }
        }
        g_usleep(500000 * (attempt + 1));
    }
    g_free(basename);
    return FALSE;
}

static gboolean file_size_ok(const char *path, long min_bytes) {
    struct stat st;
    return stat(path, &st) == 0 && st.st_size >= min_bytes;
}

typedef struct {
    OcrInstallContext *ctx;
    int base_pct;
    int weight_pct;
    char message[384];
} BatchProgress;

static void batch_file_progress(const char *label, int pct, gpointer user_data) {
    (void)label;
    BatchProgress *bp = user_data;
    if (pct >= 0) {
        int overall = bp->base_pct + (pct * bp->weight_pct / 100);
        ocr_install_report(bp->ctx, bp->message, overall);
    } else {
        ocr_install_report(bp->ctx, bp->message, -1);
    }
}

/*
 * Model specs type — shared by all ONNX providers.
 *
 * RapidOCR: PP-OCRv4 detection + PP-OCRv1 Korean-specific recognition.
 * PaddleOCR ONNX: PP-OCRv4 detection + PP-OCRv4 CJK recognition (한자 혼용).
 *
 * All URLs verified against https://huggingface.co/SWHL/RapidOCR (2024-06).
 * korean_dict.txt: PaddleOCR official repo (14 KB, 한글+영문+기호).
 * ppocr_keys_v1.txt: PaddleOCR official CJK dict (26 KB, Chinese+KR Hanja).
 */
typedef struct {
    const char *filename;
    const char *url;
    long min_bytes;
} RapidModelSpec;

#define HF_RAPID "https://huggingface.co/SWHL/RapidOCR/resolve/main"
#define GH_PADDLE "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils"

static const RapidModelSpec RAPID_MODELS[] = {
    /* Detection — language-agnostic PP-OCRv4 mobile */
    {
        "det.onnx",
        HF_RAPID "/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx",
        500000L
    },
    /* Angle classifier — PP-OCRv1 inference (v2.0 weights, ~570 KB) */
    {
        "cls.onnx",
        HF_RAPID "/PP-OCRv1/ch_ppocr_mobile_v2.0_cls_infer.onnx",
        100000L
    },
    /* Recognition — Korean-specific PP-OCRv1 model (~3.2 MB) */
    {
        "rec.onnx",
        HF_RAPID "/PP-OCRv1/korean_mobile_v2.0_rec_infer.onnx",
        1000000L
    },
    /* Character dictionary — Korean Hangul + English + symbols */
    {
        "korean_dict.txt",
        GH_PADDLE "/dict/korean_dict.txt",
        10000L
    },
};

gboolean engine_download_rapidocr_models(OcrInstallContext *ctx, GError **error) {
    char *dir = engine_paths_rapidocr_dir();
    g_mkdir_with_parents(dir, 0755);

    gsize n = G_N_ELEMENTS(RAPID_MODELS);

    /* Count files that still need downloading */
    gsize pending = 0;
    for (gsize i = 0; i < n; i++) {
        char *dest = g_build_filename(dir, RAPID_MODELS[i].filename, NULL);
        if (!file_size_ok(dest, RAPID_MODELS[i].min_bytes)) pending++;
        g_free(dest);
    }
    if (pending == 0) { g_free(dir); return TRUE; }

    ocr_install_report(ctx, "RapidOCR ONNX 모델 다운로드를 시작합니다...", -1);

    gsize done = 0;
    for (gsize i = 0; i < n; i++) {
        char *dest = g_build_filename(dir, RAPID_MODELS[i].filename, NULL);
        if (file_size_ok(dest, RAPID_MODELS[i].min_bytes)) {
            g_free(dest);
            continue;
        }

        if (ocr_install_cancelled(ctx)) {
            g_set_error(error, G_IO_ERROR, G_IO_ERROR_CANCELLED, "Download cancelled");
            g_free(dest); g_free(dir);
            return FALSE;
        }

        BatchProgress bp = {
            .ctx        = ctx,
            .base_pct   = (int)(done * 100 / pending),
            .weight_pct = (int)(100 / pending),
        };
        g_snprintf(bp.message, sizeof(bp.message),
                   "RapidOCR 모델 다운로드: %s", RAPID_MODELS[i].filename);
        ocr_install_report(ctx, bp.message, bp.base_pct);

        if (!engine_download_file(RAPID_MODELS[i].url, dest, ctx,
                                   batch_file_progress, &bp, error)) {
            g_free(dest); g_free(dir);
            return FALSE;
        }
        if (!file_size_ok(dest, RAPID_MODELS[i].min_bytes)) {
            g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                        "RapidOCR 모델 파일이 잘못됨: %s", RAPID_MODELS[i].filename);
            g_free(dest); g_free(dir);
            return FALSE;
        }
        done++;
        g_free(dest);
    }

    ocr_install_report(ctx, "RapidOCR 모델 다운로드 완료", 100);
    g_free(dir);
    return TRUE;
}

/*
 * PaddleOCR ONNX — PP-OCRv4 det + PP-OCRv1 Korean rec (full pipeline with CLS).
 * Uses the same Korean models as RapidOCR but always runs the angle classifier.
 * Best for documents with mixed orientations (rotated/upside-down text).
 */
static const RapidModelSpec PADDLE_ONNX_MODELS[] = {
    /* Detection — PP-OCRv4 mobile (same as RapidOCR) */
    {
        "det.onnx",
        HF_RAPID "/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx",
        500000L
    },
    /* Angle classifier — PP-OCRv1 inference (~570 KB) */
    {
        "cls.onnx",
        HF_RAPID "/PP-OCRv1/ch_ppocr_mobile_v2.0_cls_infer.onnx",
        100000L
    },
    /* Recognition — Korean-specific PP-OCRv1 (~3.2 MB) */
    {
        "rec.onnx",
        HF_RAPID "/PP-OCRv1/korean_mobile_v2.0_rec_infer.onnx",
        1000000L
    },
    /* Korean character dictionary (Hangul + English + symbols) */
    {
        "korean_dict.txt",
        GH_PADDLE "/dict/korean_dict.txt",
        10000L
    },
};

gboolean engine_download_paddle_onnx_models(OcrInstallContext *ctx, GError **error) {
    char *dir = engine_paths_paddle_onnx_dir();
    g_mkdir_with_parents(dir, 0755);

    gsize n = G_N_ELEMENTS(PADDLE_ONNX_MODELS);
    gsize pending = 0;
    for (gsize i = 0; i < n; i++) {
        char *dest = g_build_filename(dir, PADDLE_ONNX_MODELS[i].filename, NULL);
        if (!file_size_ok(dest, PADDLE_ONNX_MODELS[i].min_bytes)) pending++;
        g_free(dest);
    }
    if (pending == 0) { g_free(dir); return TRUE; }

    ocr_install_report(ctx, "PaddleOCR ONNX 모델 다운로드를 시작합니다...", -1);

    gsize done = 0;
    for (gsize i = 0; i < n; i++) {
        char *dest = g_build_filename(dir, PADDLE_ONNX_MODELS[i].filename, NULL);
        if (file_size_ok(dest, PADDLE_ONNX_MODELS[i].min_bytes)) { g_free(dest); continue; }

        if (ocr_install_cancelled(ctx)) {
            g_set_error(error, G_IO_ERROR, G_IO_ERROR_CANCELLED, "Download cancelled");
            g_free(dest); g_free(dir); return FALSE;
        }

        BatchProgress bp = {
            .ctx        = ctx,
            .base_pct   = (int)(done * 100 / pending),
            .weight_pct = (int)(100 / pending),
        };
        g_snprintf(bp.message, sizeof(bp.message),
                   "PaddleOCR ONNX 모델 다운로드: %s", PADDLE_ONNX_MODELS[i].filename);
        ocr_install_report(ctx, bp.message, bp.base_pct);

        if (!engine_download_file(PADDLE_ONNX_MODELS[i].url, dest, ctx,
                                   batch_file_progress, &bp, error)) {
            g_free(dest); g_free(dir); return FALSE;
        }
        if (!file_size_ok(dest, PADDLE_ONNX_MODELS[i].min_bytes)) {
            g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                        "PaddleOCR ONNX 모델 파일이 잘못됨: %s", PADDLE_ONNX_MODELS[i].filename);
            g_free(dest); g_free(dir); return FALSE;
        }
        done++;
        g_free(dest);
    }

    ocr_install_report(ctx, "PaddleOCR ONNX 모델 다운로드 완료", 100);
    g_free(dir);
    return TRUE;
}

gboolean engine_download_tessdata(OcrInstallContext *ctx, GError **error) {
    char *tessdir = engine_paths_tessdata_dir();
    char *kor = g_build_filename(tessdir, "kor.traineddata", NULL);
    if (g_file_test(kor, G_FILE_TEST_EXISTS)) {
        g_free(kor); g_free(tessdir);
        return TRUE;
    }
    g_free(kor);
    g_mkdir_with_parents(tessdir, 0755);

    struct { const char *file; const char *url; } files[] = {
        {"kor.traineddata", "https://github.com/tesseract-ocr/tessdata_best/raw/main/kor.traineddata"},
        {"eng.traineddata", "https://github.com/tesseract-ocr/tessdata_best/raw/main/eng.traineddata"},
    };

    gsize pending = 0;
    for (gsize i = 0; i < G_N_ELEMENTS(files); i++) {
        char *dest = g_build_filename(tessdir, files[i].file, NULL);
        if (!g_file_test(dest, G_FILE_TEST_EXISTS)) pending++;
        g_free(dest);
    }
    if (pending == 0) pending = 1;

    gsize done = 0;
    for (gsize i = 0; i < G_N_ELEMENTS(files); i++) {
        char *dest = g_build_filename(tessdir, files[i].file, NULL);
        if (!g_file_test(dest, G_FILE_TEST_EXISTS)) {
            if (ocr_install_cancelled(ctx)) {
                g_set_error(error, G_IO_ERROR, G_IO_ERROR_CANCELLED, "Download cancelled");
                g_free(dest); g_free(tessdir);
                return FALSE;
            }
            BatchProgress bp = {
                .ctx        = ctx,
                .base_pct   = (int)(done * 100 / pending),
                .weight_pct = (int)(100 / pending),
            };
            g_snprintf(bp.message, sizeof(bp.message),
                       "Tesseract 언어 데이터 다운로드: %s", files[i].file);
            ocr_install_report(ctx, bp.message, bp.base_pct);
            if (!engine_download_file(files[i].url, dest, ctx,
                                       batch_file_progress, &bp, error)) {
                g_free(dest); g_free(tessdir);
                return FALSE;
            }
            done++;
        }
        g_free(dest);
    }

    ocr_install_report(ctx, "Tesseract 언어 데이터 다운로드 완료", 100);
    g_free(tessdir);
    return TRUE;
}

/* ── EasyOCR: Python venv + pip install ───────────────────────────────── */

static void subprocess_force_exit_cb(GCancellable *cancellable, gpointer user_data) {
    (void)cancellable;
    if (G_IS_SUBPROCESS(user_data))
        g_subprocess_force_exit(G_SUBPROCESS(user_data));
}

static gboolean run_command(const char *argv[], GCancellable *cancellable, GError **error) {
    GSubprocess *proc = g_subprocess_newv(
        (const gchar *const *)argv,
        G_SUBPROCESS_FLAGS_STDOUT_SILENCE | G_SUBPROCESS_FLAGS_STDERR_PIPE,
        error);
    if (!proc) return FALSE;

    gulong cancel_handler = 0;
    if (cancellable) {
        cancel_handler = g_cancellable_connect(
            cancellable,
            G_CALLBACK(subprocess_force_exit_cb),
            g_object_ref(proc),
            (GDestroyNotify)g_object_unref);
    }

    gchar *stderr_out = NULL;
    GError *wait_err  = NULL;
    if (!g_subprocess_wait_check(proc, cancellable, &wait_err)) {
        g_subprocess_communicate_utf8(proc, NULL, NULL, NULL, &stderr_out, NULL);
        if (cancel_handler)
            g_cancellable_disconnect(cancellable, cancel_handler);
        if (wait_err && g_error_matches(wait_err, G_IO_ERROR, G_IO_ERROR_CANCELLED))
            g_propagate_error(error, wait_err);
        else {
            g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "%s",
                        stderr_out ? stderr_out
                                   : (wait_err ? wait_err->message : "command failed"));
            g_clear_error(&wait_err);
        }
        g_free(stderr_out);
        g_object_unref(proc);
        return FALSE;
    }
    if (cancel_handler)
        g_cancellable_disconnect(cancellable, cancel_handler);
    g_object_unref(proc);
    return TRUE;
}

static gboolean ensure_python_venv(OcrInstallContext *ctx, GError **error) {
    char *root     = engine_paths_engines_root();
    char *venv_dir = g_build_filename(root, "venv", NULL);
    char *venv_py  = g_build_filename(venv_dir, "bin", "python3", NULL);
    g_free(root);

    if (g_file_test(venv_py, G_FILE_TEST_IS_EXECUTABLE)) {
        g_free(venv_dir);
        g_free(venv_py);
        return TRUE;
    }
    g_free(venv_py);

    ocr_install_report(ctx, "Python 가상 환경을 생성합니다...", -1);
    g_mkdir_with_parents(venv_dir, 0755);
    const char *create_argv[] = { "python3", "-m", "venv", venv_dir, NULL };
    gboolean ok = run_command(create_argv, ctx ? ctx->cancellable : NULL, error);
    g_free(venv_dir);
    return ok;
}

gboolean engine_python_can_import(const char *module_name, GError **error) {
    if (!module_name) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL, "module_name is NULL");
        return FALSE;
    }
    if (!ensure_python_venv(NULL, error)) return FALSE;

    char *python = engine_paths_python_exe();
    char import_cmd[128];
    g_snprintf(import_cmd, sizeof(import_cmd), "import %s", module_name);
    const char *check_argv[] = { python, "-c", import_cmd, NULL };
    gboolean ok = run_command(check_argv, NULL, error);
    g_free(python);
    return ok;
}

gboolean engine_ensure_python_module(
    const char *module_name,
    OcrInstallContext *ctx,
    GError **error) {

    if (!ensure_python_venv(ctx, error)) return FALSE;

    char *python = engine_paths_python_exe();
    char *pip    = engine_paths_pip_exe();

    GError *local = NULL;
    if (engine_python_can_import(module_name, &local)) {
        g_clear_error(&local);
        g_free(python);
        g_free(pip);
        return TRUE;
    }
    g_clear_error(&local);

    ocr_install_report(ctx, "Python OCR 패키지를 설치합니다...", -1);

    char *app_dir  = engine_paths_app_dir();
    char *req_path = g_build_filename(app_dir, "scripts", "requirements.txt", NULL);
    g_free(app_dir);

    gboolean ok;
    if (g_file_test(req_path, G_FILE_TEST_EXISTS)) {
        const char *pip_argv[] = { pip, "install", "-r", req_path, NULL };
        ok = run_command(pip_argv, ctx ? ctx->cancellable : NULL, error);
    } else {
        const char *fallback[] = { pip, "install", module_name, NULL };
        ok = run_command(fallback, ctx ? ctx->cancellable : NULL, error);
    }
    g_free(req_path);

    if (ok) {
        ok = engine_python_can_import(module_name, error);
        if (ok)
            ocr_install_report(ctx, "Python OCR 패키지 설치 완료", 100);
    }
    g_free(python);
    g_free(pip);
    return ok;
}
