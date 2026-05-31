#include "ocr/python_runner.h"
#include "ocr/engine_paths.h"
#include "ocr/result_json.h"
#include <gio/gio.h>

gboolean python_runner_recognize(
    const char *script_path,
    const char *const *extra_args,
    PIX *image,
    OcrResult *result,
    GError **error) {
    char *tmp_path = NULL;
    char *python = engine_paths_python_exe();
    GPtrArray *argv = g_ptr_array_new();

    g_ptr_array_add(argv, python);
    g_ptr_array_add(argv, g_strdup(script_path));

    tmp_path = g_strdup_printf("/tmp/ocrlinuxgtk_%d.png", (int)getpid());
    if (pixWriteAutoFormat(tmp_path, image) != 0) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Failed to write temp image");
        g_ptr_array_free(argv, TRUE);
        g_free(tmp_path);
        return FALSE;
    }
    g_ptr_array_add(argv, g_strdup(tmp_path));

    if (extra_args) {
        for (int i = 0; extra_args[i]; i++)
            g_ptr_array_add(argv, g_strdup(extra_args[i]));
    }
    g_ptr_array_add(argv, NULL);

    GSubprocess *proc = g_subprocess_newv(
        (const gchar * const *)argv->pdata,
        G_SUBPROCESS_FLAGS_STDOUT_PIPE | G_SUBPROCESS_FLAGS_STDERR_PIPE,
        error);
    g_ptr_array_free(argv, TRUE);

    if (!proc) {
        remove(tmp_path);
        g_free(tmp_path);
        return FALSE;
    }

    gchar *stdout_buf = NULL;
    gchar *stderr_buf = NULL;
    GError *wait_err = NULL;
    if (!g_subprocess_communicate_utf8(proc, NULL, NULL, &stdout_buf, &stderr_buf, &wait_err)) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "%s",
                    stderr_buf ? stderr_buf : (wait_err ? wait_err->message : "python failed"));
        g_clear_error(&wait_err);
        g_free(stdout_buf);
        g_free(stderr_buf);
        g_object_unref(proc);
        remove(tmp_path);
        g_free(tmp_path);
        return FALSE;
    }

    g_object_unref(proc);
    remove(tmp_path);
    g_free(tmp_path);

    if (!ocr_result_from_json(stdout_buf, result, error)) {
        g_free(stdout_buf);
        g_free(stderr_buf);
        return FALSE;
    }

    g_free(stdout_buf);
    g_free(stderr_buf);
    return TRUE;
}
