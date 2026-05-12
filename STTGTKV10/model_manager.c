#include "model_manager.h"

#include <curl/curl.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <errno.h>

#ifdef __APPLE__
#define MODELS_SUBDIR "Library/Application Support/sttgtk/models"
#else
#define MODELS_SUBDIR ".local/share/sttgtk/models"
#endif

#define HF_BASE "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/"
#define UA "sttgtk/1.0 libcurl"

static const WhisperModel MODELS[] = {
    {"tiny", "Tiny (~75 MB)", "ggml-tiny.bin", 75},
    {"base", "Base (~142 MB)", "ggml-base.bin", 142},
    {"small", "Small (~466 MB)", "ggml-small.bin", 466},
    {"medium", "Medium (~1.5 GB)", "ggml-medium.bin", 1500},
    {"large-v3-turbo", "Large-v3-Turbo (~1.6 GB)", "ggml-large-v3-turbo.bin", 1600},
    {"large-v3", "Large-v3 (~3.1 GB)", "ggml-large-v3.bin", 3100},
};

static const int N_MODELS = (int)(sizeof(MODELS) / sizeof(MODELS[0]));

const WhisperModel *model_list(int *out_count)
{
    if (out_count)
        *out_count = N_MODELS;
    return MODELS;
}

static char *models_dir(void)
{
    const char *home = getenv("HOME");
    if (!home)
        return NULL;
    size_t len = strlen(home) + strlen(MODELS_SUBDIR) + 2;
    char *dir = malloc(len);
    snprintf(dir, len, "%s/%s", home, MODELS_SUBDIR);
    return dir;
}

static void mkdir_p(const char *path)
{
    char tmp[4096];
    strncpy(tmp, path, sizeof(tmp) - 1);
    tmp[sizeof(tmp) - 1] = '\0';
    for (char *p = tmp + 1; *p; p++)
    {
        if (*p == '/')
        {
            *p = '\0';
            mkdir(tmp, 0755);
            *p = '/';
        }
    }
    mkdir(tmp, 0755);
}

char *model_path(const WhisperModel *m)
{
    char *dir = models_dir();
    if (!dir)
        return NULL;
    size_t len = strlen(dir) + strlen(m->filename) + 2;
    char *path = malloc(len);
    snprintf(path, len, "%s/%s", dir, m->filename);
    free(dir);
    return path;
}

int model_is_ready(const WhisperModel *m)
{
    char *path = model_path(m);
    if (!path)
        return 0;
    struct stat st;
    int ok = (stat(path, &st) == 0 && st.st_size > 1024 * 1024);
    free(path);
    return ok;
}

/* --- Download implementation --- */

typedef struct
{
    const WhisperModel *model;
    model_progress_cb_t progress_cb;
    model_done_cb_t done_cb;
    void *userdata;
} DownloadTask;

typedef struct
{
    FILE *fp;
    model_progress_cb_t progress_cb;
    void *userdata;
} DlState;

static int xfer_cb(void *clientp, curl_off_t dltotal, curl_off_t dlnow,
                   curl_off_t ultotal, curl_off_t ulnow)
{
    (void)ultotal;
    (void)ulnow;
    DlState *st = (DlState *)clientp;
    if (dltotal > 0 && st->progress_cb)
        st->progress_cb((double)dlnow / (double)dltotal, st->userdata);
    return 0;
}

static size_t write_cb(void *ptr, size_t size, size_t nmemb, void *userdata)
{
    DlState *st = (DlState *)userdata;
    return fwrite(ptr, size, nmemb, st->fp);
}

static void *download_thread(void *arg)
{
    DownloadTask *task = (DownloadTask *)arg;
    const WhisperModel *m = task->model;

    char *dir = models_dir();
    mkdir_p(dir);
    free(dir);

    char *dest = model_path(m);
    size_t tmplen = strlen(dest) + 5;
    char *tmp_path = malloc(tmplen);
    snprintf(tmp_path, tmplen, "%s.tmp", dest);

    FILE *fp = fopen(tmp_path, "wb");
    if (!fp)
    {
        if (task->done_cb)
            task->done_cb(0, task->userdata);
        free(dest);
        free(tmp_path);
        free(task);
        return NULL;
    }

    char url[1024];
    snprintf(url, sizeof(url), "%s%s", HF_BASE, m->filename);

    DlState state = {.fp = fp, .progress_cb = task->progress_cb, .userdata = task->userdata};

    CURL *curl = curl_easy_init();
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_USERAGENT, UA);
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
    curl_easy_setopt(curl, CURLOPT_NOPROGRESS, 0L);
    curl_easy_setopt(curl, CURLOPT_XFERINFOFUNCTION, xfer_cb);
    curl_easy_setopt(curl, CURLOPT_XFERINFODATA, &state);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_cb);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &state);

    CURLcode res = curl_easy_perform(curl);
    curl_easy_cleanup(curl);
    fclose(fp);

    int success = (res == CURLE_OK);
    if (success)
        rename(tmp_path, dest);
    else
        remove(tmp_path);

    if (task->done_cb)
        task->done_cb(success, task->userdata);

    free(dest);
    free(tmp_path);
    free(task);
    return NULL;
}

void model_download_async(const WhisperModel *m,
                          model_progress_cb_t progress_cb,
                          model_done_cb_t done_cb,
                          void *userdata)
{
    DownloadTask *task = calloc(1, sizeof(DownloadTask));
    task->model = m;
    task->progress_cb = progress_cb;
    task->done_cb = done_cb;
    task->userdata = userdata;

    pthread_t tid;
    pthread_create(&tid, NULL, download_thread, task);
    pthread_detach(tid);
}
