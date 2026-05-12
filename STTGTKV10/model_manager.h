#pragma once

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    const char *name;
    const char *display_name;
    const char *filename;
    int         size_mb;
} WhisperModel;

typedef void (*model_progress_cb_t)(double fraction, void *userdata);
typedef void (*model_done_cb_t)(int success, void *userdata);

const WhisperModel *model_list(int *out_count);
char               *model_path(const WhisperModel *m);   /* caller must free */
int                 model_is_ready(const WhisperModel *m);
void                model_download_async(const WhisperModel    *m,
                                         model_progress_cb_t    progress_cb,
                                         model_done_cb_t        done_cb,
                                         void                  *userdata);

#ifdef __cplusplus
}
#endif
