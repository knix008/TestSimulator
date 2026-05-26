#include "rembg_onnx.h"

#include <float.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

#include <glib/gstdio.h>

#ifdef HAVE_LIBSOUP
#include <libsoup/soup.h>
#endif

#ifdef HAVE_ONNXRUNTIME
#include <onnxruntime_c_api.h>
#endif

#define REMBG_APP_NAME "ImageViewerGTK"

typedef struct {
    const char *id;
    const char *display_name;
    const char *filename;
    const char *url;
    int input_size;
    const char *md5_hex;
    const char *sha256_hex;
} RembgModelDef;

static const RembgModelDef k_models[REMBG_MODEL_COUNT] = {
    [REMBG_MODEL_U2NET] = {
        "u2net",
        "u2net (기본)",
        "u2net.onnx",
        "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx",
        320,
        "60024c5c889badc19c04ad937298a77b",
        NULL,
    },
    [REMBG_MODEL_BRIA_RMBG2] = {
        "bria-rmbg-2.0",
        "RMBG 2.0 (rembg2)",
        "bria-rmbg-2.0.onnx",
        "https://github.com/danielgatis/rembg/releases/download/v0.0.0/bria-rmbg-2.0.onnx",
        1024,
        NULL,
        "5b486f08200f513f460da46dd701db5fbb47d79b4be4b708a19444bcd4e79958",
    },
};

static void rembg_report(RembgProgressFn progress, gpointer user_data, int pct,
                         const char *msg) {
    if (progress) {
        progress(pct, msg, user_data);
    }
}

#ifdef HAVE_ONNXRUNTIME
static const OrtApi *g_ort;
static OrtEnv *g_env;
static OrtSession *g_session;
static char *g_session_model_path;
static RembgModelId g_session_model = REMBG_MODEL_COUNT;
static char *g_input_name;
static char *g_output_name;
static GMutex g_session_lock;
static gboolean g_ort_inited;

static void rembg_ort_check(OrtStatus *status, GError **err, const char *ctx) {
    if (!status) {
        return;
    }
    const char *msg = g_ort->GetErrorMessage(status);
    if (err) {
        *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED, "%s: %s",
                           ctx ? ctx : "ONNX", msg ? msg : "unknown");
    }
    g_ort->ReleaseStatus(status);
}

static void rembg_ort_release(OrtStatus *status) {
    if (status) {
        g_ort->ReleaseStatus(status);
    }
}

static gboolean rembg_ort_init(GError **err) {
    if (g_ort_inited) {
        return TRUE;
    }
    const OrtApiBase *api_base = OrtGetApiBase();
    if (!api_base) {
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED,
                               "ONNX Runtime API를 로드할 수 없습니다.");
        }
        return FALSE;
    }
    g_ort = api_base->GetApi(ORT_API_VERSION);
    if (!g_ort) {
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED,
                               "ONNX Runtime API 버전이 맞지 않습니다.");
        }
        return FALSE;
    }
    OrtStatus *st = g_ort->CreateEnv(ORT_LOGGING_LEVEL_WARNING, REMBG_APP_NAME,
                                     &g_env);
    if (st) {
        rembg_ort_check(st, err, "CreateEnv");
        return FALSE;
    }
    g_mutex_init(&g_session_lock);
    g_ort_inited = TRUE;
    return TRUE;
}

static char *rembg_pick_output_name(OrtSession *session, OrtAllocator *alloc) {
    size_t n_outputs = 0;
    OrtStatus *st = g_ort->SessionGetOutputCount(session, &n_outputs);
    if (st) {
        g_ort->ReleaseStatus(st);
        return NULL;
    }

    char *best = NULL;
    gint64 best_elements = G_MAXINT64;

    for (size_t i = 0; i < n_outputs; i++) {
        char *name = NULL;
        st = g_ort->SessionGetOutputName(session, i, alloc, &name);
        if (st || !name) {
            rembg_ort_check(st, NULL, "SessionGetOutputName");
            continue;
        }

        OrtTypeInfo *type_info = NULL;
        st = g_ort->SessionGetOutputTypeInfo(session, i, &type_info);
        if (st || !type_info) {
            rembg_ort_release(g_ort->AllocatorFree(alloc, name));
            rembg_ort_check(st, NULL, "SessionGetOutputTypeInfo");
            continue;
        }

        const OrtTensorTypeAndShapeInfo *tensor_info = NULL;
        st = g_ort->CastTypeInfoToTensorInfo(type_info, &tensor_info);
        if (!st && tensor_info) {
            size_t dim_count = 0;
            rembg_ort_release(g_ort->GetDimensionsCount(tensor_info, &dim_count));
            if (dim_count == 4) {
                gint64 dims[4];
                rembg_ort_release(g_ort->GetDimensions(tensor_info, dims, 4));
                if (dims[0] == 1 && dims[1] == 1) {
                    gint64 elements = 1;
                    for (size_t d = 0; d < 4; d++) {
                        gint64 dim = dims[d] <= 0 ? 1 : dims[d];
                        elements *= dim;
                    }
                    if (elements < best_elements) {
                        best_elements = elements;
                        g_free(best);
                        best = g_strdup(name);
                    }
                }
            }
        }
        g_ort->ReleaseTypeInfo(type_info);
        rembg_ort_release(g_ort->AllocatorFree(alloc, name));
    }

    if (!best && n_outputs > 0) {
        st = g_ort->SessionGetOutputName(session, 0, alloc, &best);
        rembg_ort_check(st, NULL, "SessionGetOutputName");
    }
    return best;
}

static gboolean rembg_ensure_session(const char *model_path, RembgModelId model,
                                     GError **err) {
    if (!rembg_ort_init(err)) {
        return FALSE;
    }

    g_mutex_lock(&g_session_lock);
    if (g_session && g_session_model_path &&
        g_strcmp0(g_session_model_path, model_path) == 0 &&
        g_session_model == model) {
        g_mutex_unlock(&g_session_lock);
        return TRUE;
    }

    if (g_session) {
        g_ort->ReleaseSession(g_session);
        g_session = NULL;
    }
    g_free(g_session_model_path);
    g_session_model_path = NULL;
    g_free(g_input_name);
    g_input_name = NULL;
    g_free(g_output_name);
    g_output_name = NULL;
    g_session_model = REMBG_MODEL_COUNT;

    OrtSessionOptions *opts = NULL;
    OrtStatus *st = g_ort->CreateSessionOptions(&opts);
    if (st) {
        g_mutex_unlock(&g_session_lock);
        rembg_ort_check(st, err, "CreateSessionOptions");
        return FALSE;
    }

    st = g_ort->CreateSession(g_env, model_path, opts, &g_session);
    g_ort->ReleaseSessionOptions(opts);
    if (st) {
        g_mutex_unlock(&g_session_lock);
        rembg_ort_check(st, err, "CreateSession");
        return FALSE;
    }

    OrtAllocator *alloc = NULL;
    st = g_ort->GetAllocatorWithDefaultOptions(&alloc);
    if (st) {
        g_ort->ReleaseSession(g_session);
        g_session = NULL;
        g_mutex_unlock(&g_session_lock);
        rembg_ort_check(st, err, "GetAllocator");
        return FALSE;
    }

    st = g_ort->SessionGetInputName(g_session, 0, alloc, &g_input_name);
    if (st) {
        g_ort->ReleaseSession(g_session);
        g_session = NULL;
        g_mutex_unlock(&g_session_lock);
        rembg_ort_check(st, err, "SessionGetInputName");
        return FALSE;
    }

    g_output_name = rembg_pick_output_name(g_session, alloc);
    if (!g_output_name) {
        g_ort->ReleaseSession(g_session);
        g_session = NULL;
        g_free(g_input_name);
        g_input_name = NULL;
        g_mutex_unlock(&g_session_lock);
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED,
                               "ONNX 출력 텐서 이름을 찾을 수 없습니다.");
        }
        return FALSE;
    }

    g_session_model_path = g_strdup(model_path);
    g_session_model = model;
    g_mutex_unlock(&g_session_lock);
    return TRUE;
}

static GdkPixbuf *rembg_flatten_on_black(const GdkPixbuf *src) {
    int w = gdk_pixbuf_get_width(src);
    int h = gdk_pixbuf_get_height(src);
    GdkPixbuf *dst = gdk_pixbuf_new(GDK_COLORSPACE_RGB, FALSE, 8, w, h);
    if (!dst) {
        return NULL;
    }
    gdk_pixbuf_fill(dst, 0x000000ff);
    gdk_pixbuf_composite(src, dst, 0, 0, w, h, 0, 0, 1.0, 1.0,
                         GDK_INTERP_BILINEAR, 255);
    return dst;
}

static GdkPixbuf *rembg_resize_square(const GdkPixbuf *src, int size) {
    GdkPixbuf *dst = gdk_pixbuf_new(GDK_COLORSPACE_RGB, FALSE, 8, size, size);
    if (!dst) {
        return NULL;
    }
    int sw = gdk_pixbuf_get_width(src);
    int sh = gdk_pixbuf_get_height(src);
    gdk_pixbuf_scale(src, dst, 0, 0, size, size, 0, 0, (double)size / sw,
                     (double)size / sh, GDK_INTERP_HYPER);
    return dst;
}

static float *rembg_build_input_tensor(const GdkPixbuf *rgb, int size,
                                       RembgProgressFn progress,
                                       gpointer user_data) {
    static const float mean[] = {0.485f, 0.456f, 0.406f};
    static const float std[] = {0.229f, 0.224f, 0.225f};

    int w = gdk_pixbuf_get_width(rgb);
    int h = gdk_pixbuf_get_height(rgb);
    int rs = gdk_pixbuf_get_rowstride(rgb);
    int nc = gdk_pixbuf_get_n_channels(rgb);
    guchar *px = gdk_pixbuf_get_pixels(rgb);

    float max_pixel = 1e-6f;
    for (int y = 0; y < h; y++) {
        guchar *row = px + y * rs;
        for (int x = 0; x < w; x++) {
            guchar *p = row + x * nc;
            max_pixel = MAX(max_pixel, MAX(p[0], MAX(p[1], p[2])));
        }
    }

    size_t count = (size_t)3 * (size_t)size * (size_t)size;
    float *data = g_malloc(count * sizeof(float));

    for (int y = 0; y < size; y++) {
        guchar *row = px + y * rs;
        for (int x = 0; x < size; x++) {
            guchar *p = row + x * nc;
            float r = (p[0] / max_pixel - mean[0]) / std[0];
            float g = (p[1] / max_pixel - mean[1]) / std[1];
            float b = (p[2] / max_pixel - mean[2]) / std[2];
            data[0 * size * size + y * size + x] = r;
            data[1 * size * size + y * size + x] = g;
            data[2 * size * size + y * size + x] = b;
        }
        if (y % 64 == 0) {
            int pct = 15 + y * 10 / MAX(1, size);
            rembg_report(progress, user_data, pct, "이미지 전처리 중...");
        }
    }
    return data;
}

static guchar *rembg_run_mask_inference(const float *input_data, int size,
                                        const RembgModelDef *def,
                                        RembgProgressFn progress,
                                        gpointer user_data, GError **err) {
    rembg_report(progress, user_data, 45, "AI 추론 중...");

    OrtMemoryInfo *mem_info = NULL;
    OrtStatus *st = g_ort->CreateCpuMemoryInfo(OrtArenaAllocator, OrtMemTypeDefault,
                                               &mem_info);
    if (st) {
        rembg_ort_check(st, err, "CreateCpuMemoryInfo");
        return NULL;
    }

    int64_t dims[] = {1, 3, size, size};
    size_t tensor_bytes = (size_t)3 * (size_t)size * (size_t)size * sizeof(float);
    OrtValue *input_tensor = NULL;
    st = g_ort->CreateTensorWithDataAsOrtValue(
        mem_info, (void *)input_data, tensor_bytes, dims, 4,
        ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT, &input_tensor);
    g_ort->ReleaseMemoryInfo(mem_info);
    if (st) {
        rembg_ort_check(st, err, "CreateTensor");
        return NULL;
    }

    const char *input_names[] = {g_input_name};
    const char *output_names[] = {g_output_name};
    OrtValue *output_tensor = NULL;

    g_mutex_lock(&g_session_lock);
    st = g_ort->Run(g_session, NULL, input_names, (const OrtValue *const *)&input_tensor,
                    1, output_names, 1, &output_tensor);
    g_mutex_unlock(&g_session_lock);
    g_ort->ReleaseValue(input_tensor);

    if (st) {
        rembg_ort_check(st, err, "Run");
        return NULL;
    }

    rembg_report(progress, user_data, 65, "마스크 생성 중...");

    float *out_data = NULL;
    st = g_ort->GetTensorMutableData(output_tensor, (void **)&out_data);
    if (st) {
        g_ort->ReleaseValue(output_tensor);
        rembg_ort_check(st, err, "GetTensorMutableData");
        return NULL;
    }

    OrtTensorTypeAndShapeInfo *shape_info = NULL;
    st = g_ort->GetTensorTypeAndShape(output_tensor, &shape_info);
    if (st) {
        g_ort->ReleaseValue(output_tensor);
        rembg_ort_check(st, err, "GetTensorTypeAndShape");
        return NULL;
    }

    size_t dim_count = 0;
    rembg_ort_release(g_ort->GetDimensionsCount(shape_info, &dim_count));
    gint64 dims_out[4] = {1, 1, size, size};
    if (dim_count >= 2) {
        rembg_ort_release(g_ort->GetDimensions(shape_info, dims_out, dim_count));
    }
    g_ort->ReleaseTensorTypeAndShapeInfo(shape_info);

    int mh = (int)(dim_count >= 4 ? dims_out[2] : dims_out[dim_count - 2]);
    int mw = (int)(dim_count >= 4 ? dims_out[3] : dims_out[dim_count - 1]);
    if (mh < 1) {
        mh = size;
    }
    if (mw < 1) {
        mw = size;
    }

    float vmin = FLT_MAX;
    float vmax = -FLT_MAX;
    for (int y = 0; y < mh; y++) {
        for (int x = 0; x < mw; x++) {
            float v = out_data[y * mw + x];
            vmin = MIN(vmin, v);
            vmax = MAX(vmax, v);
        }
    }

    float range = MAX(vmax - vmin, 1e-8f);
    guchar *mask_small = g_malloc((size_t)mh * (size_t)mw);
    for (int y = 0; y < mh; y++) {
        for (int x = 0; x < mw; x++) {
            float raw = out_data[y * mw + x];
            float norm = CLAMP((raw - vmin) / range, 0.0f, 1.0f);
            mask_small[y * mw + x] = (guchar)(norm * 255.0f);
        }
        if (y % 16 == 0) {
            int pct = 65 + y * 15 / MAX(1, mh);
            rembg_report(progress, user_data, pct, "마스크 생성 중...");
        }
    }
    g_ort->ReleaseValue(output_tensor);
    (void)def;
    return mask_small;
}

static void rembg_blur_mask(guchar *mask, int w, int h) {
    guchar *tmp = g_malloc((size_t)w * (size_t)h);
    int radius = 1;
    for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
            int sum = 0;
            int n = 0;
            for (int dy = -radius; dy <= radius; dy++) {
                for (int dx = -radius; dx <= radius; dx++) {
                    int ny = y + dy;
                    int nx = x + dx;
                    if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
                        sum += mask[ny * w + nx];
                        n++;
                    }
                }
            }
            tmp[y * w + x] = (guchar)(sum / MAX(1, n));
        }
    }
    memcpy(mask, tmp, (size_t)w * (size_t)h);
    g_free(tmp);
}

static guchar *rembg_resize_mask(const guchar *small, int sw, int sh, int tw,
                                 int th) {
    guchar *rgb = g_malloc((size_t)sw * (size_t)sh * 3);
    for (int i = 0; i < sw * sh; i++) {
        rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = small[i];
    }
    GdkPixbuf *src = gdk_pixbuf_new_from_data(
        rgb, GDK_COLORSPACE_RGB, FALSE, 8, sw, sh, sw * 3, NULL, NULL);
    if (!src) {
        g_free(rgb);
        return NULL;
    }

    GdkPixbuf *scaled = gdk_pixbuf_scale_simple(src, tw, th, GDK_INTERP_HYPER);
    g_object_unref(src);
    g_free(rgb);
    if (!scaled) {
        return NULL;
    }

    int w = gdk_pixbuf_get_width(scaled);
    int h = gdk_pixbuf_get_height(scaled);
    guchar *out = g_malloc((size_t)w * (size_t)h);
    guchar *px = gdk_pixbuf_get_pixels(scaled);
    int rs = gdk_pixbuf_get_rowstride(scaled);
    for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
            out[y * w + x] = px[y * rs + x * 3];
        }
    }
    g_object_unref(scaled);
    return out;
}

static void rembg_apply_mask(GdkPixbuf *image, const guchar *mask,
                             RembgProgressFn progress, gpointer user_data) {
    int w = gdk_pixbuf_get_width(image);
    int h = gdk_pixbuf_get_height(image);
    int rs = gdk_pixbuf_get_rowstride(image);
    int nc = gdk_pixbuf_get_n_channels(image);
    guchar *px = gdk_pixbuf_get_pixels(image);

    for (int y = 0; y < h; y++) {
        guchar *row = px + y * rs;
        for (int x = 0; x < w; x++) {
            guchar *p = row + x * nc;
            if (nc > 3) {
                p[3] = mask[y * w + x];
            }
        }
        if (y % 64 == 0) {
            int pct = 85 + y * 14 / MAX(1, h);
            rembg_report(progress, user_data, pct, "배경 제거 적용 중...");
        }
    }
}
#endif /* HAVE_ONNXRUNTIME */

static char *rembg_models_dir_cached;

const char *rembg_onnx_models_directory(void) {
    if (!rembg_models_dir_cached) {
        char *data = g_build_filename(g_get_user_data_dir(), "ImageViewerGTK",
                                      "models", NULL);
        g_mkdir_with_parents(data, 0755);
        rembg_models_dir_cached = data;
    }
    return rembg_models_dir_cached;
}

static char *rembg_model_path(RembgModelId model) {
    if (model < 0 || model >= REMBG_MODEL_COUNT) {
        return NULL;
    }
    const RembgModelDef *m = &k_models[model];

#ifdef APP_ROOT_DIR
    char *bundled = g_build_filename(APP_ROOT_DIR, "models", m->filename, NULL);
    if (g_file_test(bundled, G_FILE_TEST_IS_REGULAR)) {
        return bundled;
    }
    g_free(bundled);
#endif

    char *writable = g_build_filename(rembg_onnx_models_directory(), m->filename,
                                      NULL);
    if (g_file_test(writable, G_FILE_TEST_IS_REGULAR)) {
        return writable;
    }
    g_free(writable);
    return g_build_filename(rembg_onnx_models_directory(), m->filename, NULL);
}

gboolean rembg_onnx_is_supported(void) {
#ifdef HAVE_ONNXRUNTIME
    return TRUE;
#else
    return FALSE;
#endif
}

gboolean rembg_onnx_model_installed(RembgModelId model) {
    char *path = rembg_model_path(model);
    gboolean ok = path && g_file_test(path, G_FILE_TEST_IS_REGULAR);
    g_free(path);
    return ok;
}

const char *rembg_onnx_model_display_name(RembgModelId model) {
    if (model < 0 || model >= REMBG_MODEL_COUNT) {
        return "unknown";
    }
    return k_models[model].display_name;
}

static gboolean rembg_verify_checksum(const char *path, const RembgModelDef *m) {
    GChecksum *cs;
    GError *err = NULL;
    gsize len = 0;
    guchar *data = NULL;
    if (!g_file_get_contents(path, (char **)&data, &len, &err)) {
        g_clear_error(&err);
        return FALSE;
    }

    gboolean ok = TRUE;
    if (m->sha256_hex) {
        cs = g_checksum_new(G_CHECKSUM_SHA256);
        g_checksum_update(cs, data, len);
        const char *hex = g_checksum_get_string(cs);
        ok = g_ascii_strcasecmp(hex, m->sha256_hex) == 0;
        g_checksum_free(cs);
    } else if (m->md5_hex) {
        cs = g_checksum_new(G_CHECKSUM_MD5);
        g_checksum_update(cs, data, len);
        const char *hex = g_checksum_get_string(cs);
        ok = g_ascii_strcasecmp(hex, m->md5_hex) == 0;
        g_checksum_free(cs);
    }
    g_free(data);
    return ok;
}

static gboolean rembg_download_url(const char *url, const char *dest,
                                   RembgProgressFn progress, gpointer user_data,
                                   GError **err) {
    rembg_report(progress, user_data, 0, "모델 다운로드 준비 중...");

#ifdef HAVE_LIBSOUP
    SoupSession *session = soup_session_new();
    SoupMessage *msg = soup_message_new("GET", url);
    if (!session || !msg) {
        g_clear_object(&session);
        g_clear_object(&msg);
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED,
                               "HTTP 세션을 만들 수 없습니다.");
        }
        return FALSE;
    }

    GInputStream *stream = soup_session_send(session, msg, NULL, err);
    if (!stream) {
        g_object_unref(session);
        g_object_unref(msg);
        return FALSE;
    }

    char *tmp = g_strconcat(dest, ".download", NULL);
    GFile *out_file = g_file_new_for_path(tmp);
    GOutputStream *out = G_OUTPUT_STREAM(
        g_file_replace(out_file, NULL, FALSE, G_FILE_CREATE_REPLACE_DESTINATION,
                       NULL, err));
    g_object_unref(out_file);

    if (!out) {
        g_object_unref(stream);
        g_object_unref(session);
        g_object_unref(msg);
        g_free(tmp);
        return FALSE;
    }

    goffset total = soup_message_headers_get_content_length(
        soup_message_get_response_headers(msg));
    gsize chunk_size = 65536;
    guchar *buf = g_malloc(chunk_size);
    gsize nread;
    goffset done = 0;

    while (g_input_stream_read(stream, buf, chunk_size, NULL, &nread, err) &&
           nread > 0) {
        if (!g_output_stream_write(out, buf, nread, NULL, err)) {
            break;
        }
        done += nread;
        if (total > 0) {
            int pct = (int)CLAMP(done * 99 / total, 0, 99);
            rembg_report(progress, user_data, pct, "모델 다운로드 중...");
        }
    }
    g_free(buf);
    g_output_stream_close(out, NULL, NULL);
    g_object_unref(out);
    g_object_unref(stream);
    g_object_unref(session);
    g_object_unref(msg);

    if (err && *err) {
        g_unlink(tmp);
        g_free(tmp);
        return FALSE;
    }

    g_unlink(dest);
    if (g_rename(tmp, dest) != 0) {
        g_free(tmp);
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED,
                               "다운로드 파일 이동 실패");
        }
        return FALSE;
    }
    g_free(tmp);
    rembg_report(progress, user_data, 100, "다운로드 완료");
    return TRUE;
#else
    /* curl 폴백 (Python rembg 아님) */
    gchar *argv[] = {"curl", "-fL", "--progress-bar", "-o", (gchar *)dest,
                     (gchar *)url, NULL};
    if (!g_find_program_in_path("curl")) {
        if (err) {
            *err = g_error_new(
                G_FILE_ERROR, G_FILE_ERROR_FAILED,
                "모델 다운로드에 libsoup 또는 curl이 필요합니다.\n"
                "  sudo apt install libsoup2.4-dev\n"
                "또는 curl을 설치하세요.");
        }
        return FALSE;
    }
    gint wait_status = 0;
    if (!g_spawn_sync(NULL, argv, NULL, G_SPAWN_SEARCH_PATH, NULL, NULL, NULL,
                      NULL, &wait_status, err)) {
        return FALSE;
    }
    rembg_report(progress, user_data, 100, "다운로드 완료");
    return TRUE;
#endif
}

gboolean rembg_onnx_ensure_model(RembgModelId model, RembgProgressFn progress,
                                 gpointer user_data, GError **err) {
    if (model < 0 || model >= REMBG_MODEL_COUNT) {
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_INVAL, "알 수 없는 모델");
        }
        return FALSE;
    }

    const RembgModelDef *m = &k_models[model];
    char *path = rembg_model_path(model);
    if (g_file_test(path, G_FILE_TEST_IS_REGULAR) && rembg_verify_checksum(path, m)) {
        g_free(path);
        rembg_report(progress, user_data, 100, "모델 준비됨");
        return TRUE;
    }
    if (g_file_test(path, G_FILE_TEST_EXISTS)) {
        g_unlink(path);
    }

    rembg_report(progress, user_data, 0, m->display_name);
    gboolean ok = rembg_download_url(m->url, path, progress, user_data, err);
    if (ok && !rembg_verify_checksum(path, m)) {
        g_unlink(path);
        ok = FALSE;
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED,
                               "다운로드한 모델 checksum 검증 실패");
        }
    }
    g_free(path);
    return ok;
}

void rembg_onnx_invalidate_session(void) {
#ifdef HAVE_ONNXRUNTIME
    g_mutex_lock(&g_session_lock);
    if (g_session) {
        g_ort->ReleaseSession(g_session);
        g_session = NULL;
    }
    g_free(g_session_model_path);
    g_session_model_path = NULL;
    g_free(g_input_name);
    g_input_name = NULL;
    g_free(g_output_name);
    g_output_name = NULL;
    g_session_model = REMBG_MODEL_COUNT;
    g_mutex_unlock(&g_session_lock);
#endif
}

GdkPixbuf *rembg_onnx_remove_background(GdkPixbuf *source, RembgModelId model,
                                        RembgProgressFn progress,
                                        gpointer user_data, GError **err) {
#ifndef HAVE_ONNXRUNTIME
    (void)source;
    (void)model;
    (void)progress;
    (void)user_data;
    if (err) {
        *err = g_error_new(
            G_FILE_ERROR, G_FILE_ERROR_FAILED,
            "ONNX Runtime 없이 빌드되었습니다.\n"
            "ONNXRUNTIME_ROOT 를 지정하고 다시 make 하세요.\n"
            "예: ONNXRUNTIME_ROOT=/opt/onnxruntime make");
    }
    return NULL;
#else
    if (!source) {
        return NULL;
    }
    if (model < 0 || model >= REMBG_MODEL_COUNT) {
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_INVAL, "알 수 없는 모델");
        }
        return NULL;
    }

    char *model_path = rembg_model_path(model);
    if (!model_path || !g_file_test(model_path, G_FILE_TEST_IS_REGULAR)) {
        g_free(model_path);
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_NOENT,
                               "ONNX 모델이 없습니다. 먼저 다운로드를 실행하세요.");
        }
        return NULL;
    }

    rembg_report(progress, user_data, 5, "AI 모델 준비 중...");
    if (!rembg_ensure_session(model_path, model, err)) {
        g_free(model_path);
        return NULL;
    }
    g_free(model_path);

    const RembgModelDef *def = &k_models[model];
    int orig_w = gdk_pixbuf_get_width(source);
    int orig_h = gdk_pixbuf_get_height(source);
    int size = def->input_size;

    rembg_report(progress, user_data, 15, "이미지 전처리 중...");
    GdkPixbuf *flat = rembg_flatten_on_black(source);
    if (!flat) {
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED, "이미지 준비 실패");
        }
        return NULL;
    }
    GdkPixbuf *resized = rembg_resize_square(flat, size);
    g_object_unref(flat);
    if (!resized) {
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED, "리사이즈 실패");
        }
        return NULL;
    }

    float *input = rembg_build_input_tensor(resized, size, progress, user_data);
    g_object_unref(resized);
    if (!input) {
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED, "입력 텐서 생성 실패");
        }
        return NULL;
    }

    guchar *mask_small = rembg_run_mask_inference(input, size, def, progress,
                                                  user_data, err);
    g_free(input);
    if (!mask_small) {
        return NULL;
    }

    rembg_report(progress, user_data, 80, "마스크 크기 조정 중...");
    rembg_blur_mask(mask_small, size, size);
    guchar *mask_full = rembg_resize_mask(mask_small, size, size, orig_w, orig_h);
    g_free(mask_small);
    if (!mask_full) {
        if (err) {
            *err = g_error_new(G_FILE_ERROR, G_FILE_ERROR_FAILED, "마스크 리사이즈 실패");
        }
        return NULL;
    }

    GdkPixbuf *result =
        gdk_pixbuf_new(GDK_COLORSPACE_RGB, TRUE, 8, orig_w, orig_h);
    if (!result) {
        g_free(mask_full);
        return NULL;
    }
    gdk_pixbuf_copy_area(source, 0, 0, orig_w, orig_h, result, 0, 0);
    rembg_apply_mask(result, mask_full, progress, user_data);
    g_free(mask_full);

    rembg_report(progress, user_data, 100, "AI 배경 제거 완료");
    return result;
#endif
}
