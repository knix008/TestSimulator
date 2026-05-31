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

static int progress_cb(void *clientp, curl_off_t dltotal, curl_off_t dlnow, curl_off_t, curl_off_t) {
    DownloadContext *ctx = clientp;
    if (ocr_install_cancelled(ctx->install_ctx))
        return 1;
    if (dltotal > 0)
        ctx->total = dltotal;
    if (ctx->progress) {
        int pct = ctx->total > 0 ? (int)(dlnow * 100 / ctx->total) : -1;
        ctx->progress(ctx->label, pct, ctx->user_data);
    }
    return 0;
}

static gboolean download_once(const char *url, const char *destination, DownloadContext *ctx, GError **error) {
    CURL *curl = curl_easy_init();
    if (!curl) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "curl init failed");
        return FALSE;
    }

    ctx->file = fopen(destination, "wb");
    if (!ctx->file) {
        g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(errno), "Cannot write %s", destination);
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
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Download failed: %s", curl_easy_strerror(rc));
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
        .progress = progress,
        .user_data = user_data,
        .label = basename
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
    const char *folder;
    const char *file;
    const char *url;
    long min_bytes;
} ModelFileSpec;

static gboolean paddle_model_ready(const char *folder) {
    char *dir = engine_paths_paddle_model(folder);
    char *json = g_build_filename(dir, "inference.json", NULL);
    char *params = g_build_filename(dir, "inference.pdiparams", NULL);
    char *yml = g_build_filename(dir, "inference.yml", NULL);
    gboolean ok = file_size_ok(json, 500) && file_size_ok(params, 50000) && file_size_ok(yml, 500);
    g_free(json);
    g_free(params);
    g_free(yml);
    g_free(dir);
    return ok;
}

typedef struct {
    OcrInstallContext *ctx;
    int base_pct;
    int weight_pct;
    char message[384];
} BatchProgress;

static void batch_file_progress(const char *label, int pct, gpointer user_data) {
    BatchProgress *bp = user_data;
    if (pct >= 0) {
        int overall = bp->base_pct + (pct * bp->weight_pct / 100);
        ocr_install_report(bp->ctx, bp->message, overall);
    } else {
        ocr_install_report(bp->ctx, bp->message, -1);
    }
    (void)label;
}

gboolean engine_download_paddle_models(OcrInstallContext *ctx, GError **error) {
    static const ModelFileSpec specs[] = {
        {"PP-OCRv5_mobile_det", "inference.json",
         "https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det/resolve/main/inference.json", 50000},
        {"PP-OCRv5_mobile_det", "inference.pdiparams",
         "https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det/resolve/main/inference.pdiparams", 3000000},
        {"PP-OCRv5_mobile_det", "inference.yml",
         "https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det/resolve/main/inference.yml", 500},
        {"PP-LCNet_x1_0_textline_ori", "inference.json",
         "https://huggingface.co/PaddlePaddle/PP-LCNet_x1_0_textline_ori/resolve/main/inference.json", 50000},
        {"PP-LCNet_x1_0_textline_ori", "inference.pdiparams",
         "https://huggingface.co/PaddlePaddle/PP-LCNet_x1_0_textline_ori/resolve/main/inference.pdiparams", 4000000},
        {"PP-LCNet_x1_0_textline_ori", "inference.yml",
         "https://huggingface.co/PaddlePaddle/PP-LCNet_x1_0_textline_ori/resolve/main/inference.yml", 500},
        {"korean_PP-OCRv5_mobile_rec", "inference.json",
         "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec/resolve/main/inference.json", 100000},
        {"korean_PP-OCRv5_mobile_rec", "inference.pdiparams",
         "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec/resolve/main/inference.pdiparams", 10000000},
        {"korean_PP-OCRv5_mobile_rec", "inference.yml",
         "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec/resolve/main/inference.yml", 10000},
    };

    if (paddle_model_ready("PP-OCRv5_mobile_det")
        && paddle_model_ready("PP-LCNet_x1_0_textline_ori")
        && paddle_model_ready("korean_PP-OCRv5_mobile_rec"))
        return TRUE;

    ocr_install_report(ctx, "PaddleOCR 모델 다운로드를 준비합니다...", -1);

    char *cache_root = engine_paths_engines_root();
    g_mkdir_with_parents(g_build_filename(cache_root, "paddle", NULL), 0755);
    g_free(cache_root);

    gsize pending = 0;
    for (gsize i = 0; i < G_N_ELEMENTS(specs); i++) {
        const ModelFileSpec *spec = &specs[i];
        char *dir = engine_paths_paddle_model(spec->folder);
        char *dest = g_build_filename(dir, spec->file, NULL);
        g_free(dir);
        if (!file_size_ok(dest, spec->min_bytes))
            pending++;
        g_free(dest);
    }
    if (pending == 0)
        pending = 1;

    gsize done = 0;
    for (gsize i = 0; i < G_N_ELEMENTS(specs); i++) {
        const ModelFileSpec *spec = &specs[i];
        char *dir = engine_paths_paddle_model(spec->folder);
        char *dest = g_build_filename(dir, spec->file, NULL);
        g_free(dir);

        if (file_size_ok(dest, spec->min_bytes)) {
            g_free(dest);
            continue;
        }

        if (ocr_install_cancelled(ctx)) {
            g_set_error(error, G_IO_ERROR, G_IO_ERROR_CANCELLED, "Download cancelled");
            g_free(dest);
            return FALSE;
        }

        BatchProgress bp = {
            .ctx = ctx,
            .base_pct = (int)(done * 100 / pending),
            .weight_pct = (int)(100 / pending)
        };
        g_snprintf(bp.message, sizeof(bp.message), "PaddleOCR 모델 다운로드: %s (%s)",
                   spec->file, spec->folder);
        ocr_install_report(ctx, bp.message, bp.base_pct);

        if (!engine_download_file(spec->url, dest, ctx, batch_file_progress, &bp, error)) {
            g_free(dest);
            return FALSE;
        }
        if (!file_size_ok(dest, spec->min_bytes)) {
            g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                        "Invalid Paddle model file: %s/%s", spec->folder, spec->file);
            g_free(dest);
            return FALSE;
        }
        done++;
        ocr_install_report(ctx, bp.message, (int)(done * 100 / pending));
        g_free(dest);
    }

    ocr_install_report(ctx, "PaddleOCR 모델 다운로드 완료", 100);

    return paddle_model_ready("PP-OCRv5_mobile_det")
        && paddle_model_ready("PP-LCNet_x1_0_textline_ori")
        && paddle_model_ready("korean_PP-OCRv5_mobile_rec");
}

gboolean engine_download_tessdata(OcrInstallContext *ctx, GError **error) {
    char *tessdir = engine_paths_tessdata_dir();
    char *kor = g_build_filename(tessdir, "kor.traineddata", NULL);
    if (g_file_test(kor, G_FILE_TEST_EXISTS)) {
        g_free(kor);
        g_free(tessdir);
        return TRUE;
    }
    g_free(kor);

    g_mkdir_with_parents(tessdir, 0755);

    struct {
        const char *file;
        const char *url;
    } files[] = {
        {"kor.traineddata", "https://github.com/tesseract-ocr/tessdata_best/raw/main/kor.traineddata"},
        {"eng.traineddata", "https://github.com/tesseract-ocr/tessdata_best/raw/main/eng.traineddata"},
    };

    gsize pending = 0;
    for (gsize i = 0; i < G_N_ELEMENTS(files); i++) {
        char *dest = g_build_filename(tessdir, files[i].file, NULL);
        if (!g_file_test(dest, G_FILE_TEST_EXISTS))
            pending++;
        g_free(dest);
    }
    if (pending == 0)
        pending = 1;

    gsize done = 0;
    for (gsize i = 0; i < G_N_ELEMENTS(files); i++) {
        char *dest = g_build_filename(tessdir, files[i].file, NULL);
        if (!g_file_test(dest, G_FILE_TEST_EXISTS)) {
            if (ocr_install_cancelled(ctx)) {
                g_set_error(error, G_IO_ERROR, G_IO_ERROR_CANCELLED, "Download cancelled");
                g_free(dest);
                g_free(tessdir);
                return FALSE;
            }

            BatchProgress bp = {
                .ctx = ctx,
                .base_pct = (int)(done * 100 / pending),
                .weight_pct = (int)(100 / pending)
            };
            g_snprintf(bp.message, sizeof(bp.message), "Tesseract 언어 데이터 다운로드: %s", files[i].file);
            ocr_install_report(ctx, bp.message, bp.base_pct);

            if (!engine_download_file(files[i].url, dest, ctx, batch_file_progress, &bp, error)) {
                g_free(dest);
                g_free(tessdir);
                return FALSE;
            }
            done++;
            ocr_install_report(ctx, bp.message, (int)(done * 100 / pending));
        }
        g_free(dest);
    }

    ocr_install_report(ctx, "Tesseract 언어 데이터 다운로드 완료", 100);
    g_free(tessdir);
    return TRUE;
}

static gboolean run_command(const char *argv[], GCancellable *cancellable, GError **error) {
    GSubprocess *proc = g_subprocess_newv(
        (const gchar * const *)argv,
        G_SUBPROCESS_FLAGS_STDOUT_SILENCE | G_SUBPROCESS_FLAGS_STDERR_PIPE,
        error);
    if (!proc) return FALSE;

    if (cancellable)
        g_cancellable_connect(cancellable, G_CALLBACK(g_subprocess_force_exit), proc, NULL);

    gchar *stderr_out = NULL;
    GError *wait_err = NULL;
    if (!g_subprocess_wait_check(proc, cancellable, &wait_err)) {
        g_subprocess_communicate_utf8(proc, NULL, NULL, NULL, &stderr_out, NULL);
        if (wait_err && g_error_matches(wait_err, G_IO_ERROR, G_IO_ERROR_CANCELLED)) {
            g_propagate_error(error, wait_err);
        } else {
            g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "%s",
                        stderr_out ? stderr_out : (wait_err ? wait_err->message : "command failed"));
            g_clear_error(&wait_err);
        }
        g_free(stderr_out);
        g_object_unref(proc);
        return FALSE;
    }
    g_object_unref(proc);
    return TRUE;
}

static gboolean ensure_python_venv(OcrInstallContext *ctx, GError **error) {
    char *root = engine_paths_engines_root();
    char *venv_dir = g_build_filename(root, "venv", NULL);
    char *venv_py = g_build_filename(venv_dir, "bin", "python3", NULL);
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

gboolean engine_ensure_python_module(const char *module_name, OcrInstallContext *ctx, GError **error) {
    if (!ensure_python_venv(ctx, error))
        return FALSE;

    char *python = engine_paths_python_exe();
    char *pip = engine_paths_pip_exe();
    char import_cmd[128];
    g_snprintf(import_cmd, sizeof(import_cmd), "import %s", module_name);

    const char *check_argv[] = { python, "-c", import_cmd, NULL };
    GError *local = NULL;
    if (run_command(check_argv, NULL, &local)) {
        g_free(python);
        g_free(pip);
        return TRUE;
    }
    g_clear_error(&local);

    ocr_install_report(ctx, "Python OCR 패키지를 설치합니다...", -1);

    char *req_path = g_build_filename(engine_paths_app_dir(), "scripts", "requirements.txt", NULL);
    if (g_file_test(req_path, G_FILE_TEST_EXISTS)) {
        const char *pip_argv[] = { pip, "install", "-r", req_path, NULL };
        if (!run_command(pip_argv, ctx ? ctx->cancellable : NULL, error)) {
            g_free(req_path);
            g_free(python);
            g_free(pip);
            return FALSE;
        }
    } else {
        g_free(req_path);
        const char *fallback[] = { pip, "install", module_name, NULL };
        if (!run_command(fallback, ctx ? ctx->cancellable : NULL, error)) {
            g_free(python);
            g_free(pip);
            return FALSE;
        }
    }

    gboolean ok = run_command(check_argv, ctx ? ctx->cancellable : NULL, error);
    g_free(python);
    g_free(pip);
    if (ok)
        ocr_install_report(ctx, "Python OCR 패키지 설치 완료", 100);
    return ok;
}
