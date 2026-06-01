#include "ocr/python_runner.h"
#include "ocr/engine_paths.h"
#include "ocr/result_json.h"
#include <gio/gio.h>
#include <stdio.h>

gboolean python_runner_recognize(
    const char *script_path,
    const char *const *extra_args,
    PIX *image,
    OcrResult *result,
    GError **error) {

    char *tmp_path = g_strdup_printf("/tmp/ocrlinuxgtk_%d.png", (int)getpid());
    if (pixWriteAutoFormat(tmp_path, image) != 0) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "임시 이미지 저장 실패");
        g_free(tmp_path);
        return FALSE;
    }

    char *python = engine_paths_python_exe();
    GPtrArray *argv = g_ptr_array_new_with_free_func(g_free);
    g_ptr_array_add(argv, python);
    g_ptr_array_add(argv, g_strdup(script_path));
    g_ptr_array_add(argv, g_strdup(tmp_path));
    if (extra_args)
        for (int i = 0; extra_args[i]; i++)
            g_ptr_array_add(argv, g_strdup(extra_args[i]));
    g_ptr_array_add(argv, NULL);

    GSubprocess *proc = g_subprocess_newv(
        (const gchar *const *)argv->pdata,
        G_SUBPROCESS_FLAGS_STDOUT_PIPE | G_SUBPROCESS_FLAGS_STDERR_PIPE,
        error);
    g_ptr_array_free(argv, TRUE);

    if (!proc) {
        remove(tmp_path);
        g_free(tmp_path);
        return FALSE;
    }

    gchar *stdout_buf = NULL, *stderr_buf = NULL;
    GError *wait_err = NULL;
    gboolean ok = g_subprocess_communicate_utf8(proc, NULL, NULL,
                                                 &stdout_buf, &stderr_buf, &wait_err);
    g_object_unref(proc);
    remove(tmp_path);
    g_free(tmp_path);

    if (!ok) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "%s",
                    stderr_buf ? stderr_buf
                               : (wait_err ? wait_err->message : "python 실행 실패"));
        g_clear_error(&wait_err);
        g_free(stdout_buf);
        g_free(stderr_buf);
        return FALSE;
    }

    gboolean parsed = ocr_result_from_json(stdout_buf, result, error);
    g_free(stdout_buf);
    g_free(stderr_buf);
    return parsed;
}
