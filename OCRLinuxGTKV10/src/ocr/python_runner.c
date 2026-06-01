#include "ocr/python_runner.h"
#include "ocr/engine_paths.h"
#include "ocr/result_json.h"
#include <gio/gio.h>
#include <stdio.h>

/*
 * EasyOCR subprocess를 반드시 메인 스레드에서 실행해야 합니다.
 *
 * g_subprocess_communicate_utf8_async()는 내부적으로 default GMainContext를
 * 사용합니다. OCR 스레드에서 직접 호출하면 g_main_loop_run()과 충돌하여
 * 완료 콜백이 영원히 오지 않습니다 (데드락).
 *
 * 해결: subprocess 생성과 비동기 통신을 g_idle_add()로 메인 스레드에 위임하고,
 * OCR 스레드는 GCond로 완료를 기다립니다.
 */

typedef struct {
    /* 입력 */
    const gchar *const *argv;   /* NULL-terminated, 수명은 호출자가 보장 */
    char                tmp_path[256];

    /* 출력 */
    gchar   *stdout_buf;
    gchar   *stderr_buf;
    GError  *error;
    gboolean ok;

    /* 동기화 */
    GMutex   mutex;
    GCond    cond;
    gboolean done;
} SubprocData;

/* 메인 스레드: 비동기 통신 완료 콜백 */
static void communicate_done_cb(GObject *src, GAsyncResult *res, gpointer user_data) {
    SubprocData *d = user_data;
    GSubprocess *proc = G_SUBPROCESS(src);

    d->ok = g_subprocess_communicate_utf8_finish(proc, res,
                &d->stdout_buf, &d->stderr_buf, &d->error);

    /* OCR 스레드를 깨운다 */
    g_mutex_lock(&d->mutex);
    d->done = TRUE;
    g_cond_signal(&d->cond);
    g_mutex_unlock(&d->mutex);
}

/* 메인 스레드: subprocess 생성 + 비동기 통신 시작 */
static gboolean start_subprocess_idle(gpointer user_data) {
    SubprocData *d = user_data;
    GError *err = NULL;

    GSubprocess *proc = g_subprocess_newv(
        d->argv,
        G_SUBPROCESS_FLAGS_STDOUT_PIPE | G_SUBPROCESS_FLAGS_STDERR_PIPE,
        &err);

    if (!proc) {
        g_mutex_lock(&d->mutex);
        d->ok    = FALSE;
        d->error = err;
        d->done  = TRUE;
        g_cond_signal(&d->cond);
        g_mutex_unlock(&d->mutex);
        return G_SOURCE_REMOVE;
    }

    /* 비동기 통신 — 메인 루프에서 완료될 때 communicate_done_cb 호출 */
    g_subprocess_communicate_utf8_async(proc, NULL, NULL, communicate_done_cb, d);
    g_object_unref(proc);   /* communicate_utf8_async가 자체 참조 보유 */

    return G_SOURCE_REMOVE;
}

gboolean python_runner_recognize(
    const char *script_path,
    const char *const *extra_args,
    PIX *image,
    OcrResult *result,
    GError **error) {

    /* 임시 이미지 파일 */
    char tmp_path[256];
    g_snprintf(tmp_path, sizeof(tmp_path), "/tmp/ocrlinuxgtk_%d.png", (int)getpid());
    if (pixWriteAutoFormat(tmp_path, image) != 0) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "임시 이미지 저장 실패");
        return FALSE;
    }

    /* argv 구성 (NULL 종료) */
    char *python = engine_paths_python_exe();
    GPtrArray *argv_arr = g_ptr_array_new_with_free_func(g_free);
    g_ptr_array_add(argv_arr, python);
    g_ptr_array_add(argv_arr, g_strdup(script_path));
    g_ptr_array_add(argv_arr, g_strdup(tmp_path));
    if (extra_args)
        for (int i = 0; extra_args[i]; i++)
            g_ptr_array_add(argv_arr, g_strdup(extra_args[i]));
    g_ptr_array_add(argv_arr, NULL);

    SubprocData d = {0};
    d.argv = (const gchar *const *)argv_arr->pdata;
    g_strlcpy(d.tmp_path, tmp_path, sizeof(d.tmp_path));
    g_mutex_init(&d.mutex);
    g_cond_init(&d.cond);

    /* 메인 스레드에 subprocess 시작을 위임 */
    g_idle_add(start_subprocess_idle, &d);

    /* OCR 스레드는 완료될 때까지 대기 */
    g_mutex_lock(&d.mutex);
    while (!d.done)
        g_cond_wait(&d.cond, &d.mutex);
    g_mutex_unlock(&d.mutex);

    /* 정리 */
    g_ptr_array_free(argv_arr, TRUE);
    remove(tmp_path);
    g_mutex_clear(&d.mutex);
    g_cond_clear(&d.cond);

    if (!d.ok) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "%s",
                    d.stderr_buf ? d.stderr_buf
                                 : (d.error ? d.error->message : "python 실행 실패"));
        g_clear_error(&d.error);
        g_free(d.stdout_buf);
        g_free(d.stderr_buf);
        return FALSE;
    }

    gboolean parsed = ocr_result_from_json(d.stdout_buf, result, error);
    g_free(d.stdout_buf);
    g_free(d.stderr_buf);
    return parsed;
}
