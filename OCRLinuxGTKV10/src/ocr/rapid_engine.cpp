/*
 * RapidOCR engine — PP-OCRv4 inference via ONNX Runtime C API
 *
 * Preprocessing/postprocessing: OpenCV (resize, normalize, findContours, warpPerspective)
 * Model inference: ONNX Runtime (full opset support, replaces OpenCV DNN)
 *
 * Pipeline: DBNet detection → angle classifier (optional) → CRNN + CTC recognition
 */

#include "ocr/rapid_engine.h"

#include <onnxruntime_c_api.h>

#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>

#include <leptonica/allheaders.h>

#include <algorithm>
#include <cfloat>
#include <cmath>
#include <cstring>
#include <fstream>
#include <numeric>
#include <string>
#include <vector>

// ── Global ORT API table ────────────────────────────────────────────────────
static const OrtApi *g_ort = nullptr;

/* Discard an OrtStatus that is expected to succeed (non-critical path). */
static inline void ort_ok(OrtStatus *s) {
    if (s) { g_printerr("ORT: %s\n", g_ort->GetErrorMessage(s)); g_ort->ReleaseStatus(s); }
}

static void ort_init() {
    if (!g_ort)
        g_ort = OrtGetApiBase()->GetApi(ORT_API_VERSION);
}

// ── Detection tuning ────────────────────────────────────────────────────────
static constexpr float DET_MEAN_B = 0.406f;
static constexpr float DET_MEAN_G = 0.456f;
static constexpr float DET_MEAN_R = 0.485f;
static constexpr float DET_STD_B  = 0.225f;
static constexpr float DET_STD_G  = 0.224f;
static constexpr float DET_STD_R  = 0.229f;
static constexpr float DET_DB_THRESH     = 0.3f;   /* 확률맵 이진화 임계값 */
static constexpr float DET_DB_BOX_THRESH = 0.4f;   /* 박스 신뢰도 임계값 (낮출수록 더 많이 검출) */
static constexpr float DET_DB_UNCLIP     = 1.6f;   /* 박스 확장 비율 (한글은 약간 크게) */
static constexpr int   DET_MAX_SIDE      = 960;
static constexpr int   DET_MIN_SIZE      = 3;

// ── Recognition tuning ─────────────────────────────────────────────────────
/* PP-OCRv1 Korean rec expects 32px text-line height. */
static constexpr int   REC_HEIGHT  = 32;
static constexpr int   REC_MAX_W   = 2400;
static constexpr int   CLS_W       = 192;
static constexpr int   CLS_H       = 48;
static constexpr float CLS_THRESH  = 0.9f;

// ── Engine struct ───────────────────────────────────────────────────────────
struct RapidEngine {
    OrtEnv            *env         = nullptr;
    OrtSessionOptions *sess_opts   = nullptr;
    OrtSession        *det_session = nullptr;
    OrtSession        *cls_session = nullptr;
    OrtSession        *rec_session = nullptr;
    OrtAllocator      *allocator   = nullptr;  // default, not owned
    std::vector<std::string> dict;
    bool has_cls = false;
};

// ── ORT helpers ─────────────────────────────────────────────────────────────
static OrtSession *ort_load_session(RapidEngine *eng, const char *path, GError **error) {
    OrtSession *session = nullptr;
    OrtStatus  *status  = g_ort->CreateSession(eng->env, path, eng->sess_opts, &session);
    if (status) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "ONNX Runtime: 모델 로드 실패 (%s): %s",
                    path, g_ort->GetErrorMessage(status));
        g_ort->ReleaseStatus(status);
        return nullptr;
    }
    return session;
}

/* Run a single-input, single-output ORT session.
 * input: NCHW float32 data pointer + shape
 * Returns result as a cv::Mat (dims=output_ndim, CV_32F). */
static cv::Mat ort_run(RapidEngine *eng, OrtSession *session,
                        const float *input_data, const std::vector<int64_t> &shape,
                        GError **error) {
    // Create memory info (CPU, arena allocator)
    OrtMemoryInfo *mem_info = nullptr;
    ort_ok(g_ort->CreateCpuMemoryInfo(OrtArenaAllocator, OrtMemTypeDefault, &mem_info));

    size_t num_elems = 1;
    for (auto d : shape) num_elems *= (size_t)d;

    // Wrap input data as an ORT tensor (zero-copy: data must stay valid during Run)
    OrtValue  *input_tensor = nullptr;
    OrtStatus *status = g_ort->CreateTensorWithDataAsOrtValue(
        mem_info,
        (void *)input_data,
        num_elems * sizeof(float),
        shape.data(), shape.size(),
        ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT,
        &input_tensor);
    g_ort->ReleaseMemoryInfo(mem_info);

    if (status) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "ORT tensor: %s", g_ort->GetErrorMessage(status));
        g_ort->ReleaseStatus(status);
        return cv::Mat();
    }

    // Get I/O names from session
    char *in_name  = nullptr;
    char *out_name = nullptr;
    ort_ok(g_ort->SessionGetInputName(session, 0, eng->allocator, &in_name));
    ort_ok(g_ort->SessionGetOutputName(session, 0, eng->allocator, &out_name));

    OrtValue *output_tensor = nullptr;
    status = g_ort->Run(session, nullptr,
                         (const char *const *)&in_name,
                         (const OrtValue *const *)&input_tensor, 1,
                         (const char *const *)&out_name, 1,
                         &output_tensor);

    ort_ok(g_ort->AllocatorFree(eng->allocator, in_name));
    ort_ok(g_ort->AllocatorFree(eng->allocator, out_name));
    g_ort->ReleaseValue(input_tensor);

    if (status) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "ORT 추론 실패: %s", g_ort->GetErrorMessage(status));
        g_ort->ReleaseStatus(status);
        return cv::Mat();
    }

    // Read output shape
    OrtTensorTypeAndShapeInfo *si = nullptr;
    ort_ok(g_ort->GetTensorTypeAndShape(output_tensor, &si));
    size_t ndim = 0;
    ort_ok(g_ort->GetDimensionsCount(si, &ndim));
    std::vector<int64_t> out_shape(ndim);
    ort_ok(g_ort->GetDimensions(si, out_shape.data(), ndim));
    g_ort->ReleaseTensorTypeAndShapeInfo(si);

    float *out_data = nullptr;
    ort_ok(g_ort->GetTensorMutableData(output_tensor, (void **)&out_data));

    // Copy to cv::Mat
    size_t total = 1;
    for (auto d : out_shape) total *= (size_t)d;
    std::vector<int> cv_shape(out_shape.begin(), out_shape.end());
    cv::Mat result(cv_shape, CV_32F);
    std::memcpy(result.data, out_data, total * sizeof(float));

    g_ort->ReleaseValue(output_tensor);
    return result;
}

// ── PIX → OpenCV Mat (BGR) ──────────────────────────────────────────────────
static cv::Mat pix_to_mat_bgr(PIX *pix) {
    PIX *p32 = nullptr;
    bool own = false;
    if (pixGetDepth(pix) == 32) {
        p32 = pix;
    } else {
        p32 = pixConvertTo32(pix);
        if (!p32) return cv::Mat();
        own = true;
    }

    int w   = pixGetWidth(p32);
    int h   = pixGetHeight(p32);
    int wpl = pixGetWpl(p32);
    const l_uint32 *data = pixGetData(p32);

    cv::Mat mat(h, w, CV_8UC3);
    for (int y = 0; y < h; y++) {
        const l_uint32 *row = data + (size_t)y * wpl;
        uint8_t *dst = mat.ptr<uint8_t>(y);
        for (int x = 0; x < w; x++) {
            l_uint32 px = row[x];
            // Leptonica 32-bit: R=bits[31:24], G=bits[23:16], B=bits[15:8]
            dst[x * 3 + 0] = (px >> 8)  & 0xff;  // B
            dst[x * 3 + 1] = (px >> 16) & 0xff;  // G
            dst[x * 3 + 2] = (px >> 24) & 0xff;  // R
        }
    }

    if (own) pixDestroy(&p32);
    return mat;
}

// ── Normalize BGR Mat to NCHW float blob ────────────────────────────────────
static cv::Mat make_nchw_blob(const cv::Mat &bgr_f32,
                               float mean_b, float mean_g, float mean_r,
                               float std_b,  float std_g,  float std_r) {
    // bgr_f32: H x W x 3, float [0,1]
    int h = bgr_f32.rows, w = bgr_f32.cols;
    cv::Mat blob(1 * 3 * h * w, 1, CV_32F);
    float *dst = blob.ptr<float>();

    for (int y = 0; y < h; y++) {
        const float *row = bgr_f32.ptr<float>(y);
        for (int x = 0; x < w; x++) {
            float b = row[x * 3 + 0];
            float g = row[x * 3 + 1];
            float r = row[x * 3 + 2];
            // Channel 0 = R (models expect RGB)
            dst[0 * h * w + y * w + x] = (r - mean_r) / std_r;
            dst[1 * h * w + y * w + x] = (g - mean_g) / std_g;
            dst[2 * h * w + y * w + x] = (b - mean_b) / std_b;
        }
    }
    return blob;
}

// ── 4-point sort: tl, tr, br, bl ───────────────────────────────────────────
static std::vector<cv::Point2f> sort_quad(cv::Point2f pts[4]) {
    cv::Point2f tl = pts[0], tr = pts[0], br = pts[0], bl = pts[0];
    float min_sum = FLT_MAX, max_sum = -FLT_MAX;
    float min_dif = FLT_MAX, max_dif = -FLT_MAX;
    for (int i = 0; i < 4; i++) {
        float s = pts[i].x + pts[i].y;
        float d = pts[i].x - pts[i].y;
        if (s < min_sum) { min_sum = s; tl = pts[i]; }
        if (s > max_sum) { max_sum = s; br = pts[i]; }
        if (d < min_dif) { min_dif = d; bl = pts[i]; }
        if (d > max_dif) { max_dif = d; tr = pts[i]; }
    }
    return {tl, tr, br, bl};
}

// ── Perspective crop ────────────────────────────────────────────────────────
static cv::Mat crop_region(const cv::Mat &img, const std::vector<cv::Point2f> &pts) {
    float w = std::max((float)cv::norm(pts[1] - pts[0]),
                        (float)cv::norm(pts[2] - pts[3]));
    float h = std::max((float)cv::norm(pts[3] - pts[0]),
                        (float)cv::norm(pts[2] - pts[1]));
    if (w < 1) w = 1;
    if (h < 1) h = 1;

    std::vector<cv::Point2f> dst = {
        {0, 0}, {w - 1, 0}, {w - 1, h - 1}, {0, h - 1}};
    cv::Mat M = cv::getPerspectiveTransform(
        std::vector<cv::Point2f>(pts.begin(), pts.end()), dst);
    cv::Mat cropped;
    cv::warpPerspective(img, cropped, M, cv::Size((int)w, (int)h));
    if (cropped.rows > 2 * cropped.cols)
        cv::rotate(cropped, cropped, cv::ROTATE_90_CLOCKWISE);
    return cropped;
}

// ── Box score (mean prob inside rotated rect) ───────────────────────────────
static float box_score(const cv::Mat &prob, const cv::RotatedRect &rect) {
    cv::Rect bb = rect.boundingRect() & cv::Rect(0, 0, prob.cols, prob.rows);
    if (bb.area() <= 0) return 0.f;
    cv::Mat mask = cv::Mat::zeros(bb.height, bb.width, CV_8U);
    cv::Point2f pts[4];
    rect.points(pts);
    std::vector<cv::Point> poly;
    for (int i = 0; i < 4; i++)
        poly.push_back({std::max(0, std::min(bb.width  - 1, (int)(pts[i].x - bb.x))),
                         std::max(0, std::min(bb.height - 1, (int)(pts[i].y - bb.y)))});
    cv::fillConvexPoly(mask, poly, cv::Scalar(255));
    return (float)cv::mean(prob(bb), mask)[0];
}

struct TextRegion { std::vector<cv::Point2f> pts; float score; };

// ── DBNet detection ─────────────────────────────────────────────────────────
static std::vector<TextRegion> run_detection(RapidEngine *eng, const cv::Mat &bgr,
                                              GError **error) {
    // Resize to multiple of 32, max side ≤ DET_MAX_SIDE
    int ow = bgr.cols, oh = bgr.rows;
    int tw = ow, th = oh;
    int maxs = std::max(tw, th);
    if (maxs > DET_MAX_SIDE) {
        float sc = (float)DET_MAX_SIDE / maxs;
        tw = (int)(tw * sc); th = (int)(th * sc);
    }
    tw = std::max(32, (tw / 32) * 32);
    th = std::max(32, (th / 32) * 32);

    float rw = (float)ow / tw, rh = (float)oh / th;

    cv::Mat resized;
    cv::resize(bgr, resized, {tw, th});
    cv::Mat f32;
    resized.convertTo(f32, CV_32F, 1.0 / 255.0);

    // NCHW blob with ImageNet normalisation (RGB channel order for model)
    cv::Mat blob = make_nchw_blob(f32,
        DET_MEAN_B, DET_MEAN_G, DET_MEAN_R,
        DET_STD_B,  DET_STD_G,  DET_STD_R);

    std::vector<int64_t> shape = {1, 3, (int64_t)th, (int64_t)tw};
    cv::Mat out = ort_run(eng, eng->det_session, blob.ptr<float>(), shape, error);
    if (out.empty()) return {};

    // out: [1, 1, th, tw] → probability map
    cv::Mat prob(th, tw, CV_32F, out.ptr<float>());

    cv::Mat bitmap;
    cv::threshold(prob, bitmap, DET_DB_THRESH, 255, cv::THRESH_BINARY);
    bitmap.convertTo(bitmap, CV_8U);
    cv::dilate(bitmap, bitmap, cv::getStructuringElement(cv::MORPH_RECT, {2, 2}));

    std::vector<std::vector<cv::Point>> contours;
    cv::findContours(bitmap, contours, cv::RETR_LIST, cv::CHAIN_APPROX_SIMPLE);

    std::vector<TextRegion> results;
    for (auto &c : contours) {
        if (c.size() < 4 || cv::contourArea(c) < 16) continue;
        cv::RotatedRect rr = cv::minAreaRect(c);
        if (rr.size.width < DET_MIN_SIZE || rr.size.height < DET_MIN_SIZE) continue;
        float score = box_score(prob, rr);
        if (score < DET_DB_BOX_THRESH) continue;

        // Expand (unclip)
        rr.size.width  *= DET_DB_UNCLIP;
        rr.size.height *= DET_DB_UNCLIP;
        cv::Point2f raw[4];
        rr.points(raw);

        cv::Point2f scaled[4];
        for (int i = 0; i < 4; i++) {
            scaled[i].x = std::max(0.f, std::min((float)(ow - 1), raw[i].x * rw));
            scaled[i].y = std::max(0.f, std::min((float)(oh - 1), raw[i].y * rh));
        }
        results.push_back({sort_quad(scaled), score});
    }

    // Sort top-to-bottom, left-to-right
    std::sort(results.begin(), results.end(), [](const TextRegion &a, const TextRegion &b) {
        float ay = a.pts[0].y + a.pts[1].y, by = b.pts[0].y + b.pts[1].y;
        if (std::fabs(ay - by) > 20.f) return ay < by;
        return a.pts[0].x < b.pts[0].x;
    });
    return results;
}

// ── Angle classifier ────────────────────────────────────────────────────────
static bool run_classifier(RapidEngine *eng, const cv::Mat &crop) {
    cv::Mat rsz;
    cv::resize(crop, rsz, {CLS_W, CLS_H});
    cv::Mat f32;
    rsz.convertTo(f32, CV_32F, 1.0 / 127.5, -1.0);  // (x/255-0.5)/0.5 → (x-127.5)/127.5

    // NCHW, RGB, mean=0.5 std=0.5 (symmetric)
    cv::Mat blob = make_nchw_blob(f32, 0.f, 0.f, 0.f, 1.f, 1.f, 1.f);

    GError *err = nullptr;
    std::vector<int64_t> shape = {1, 3, CLS_H, CLS_W};
    cv::Mat out = ort_run(eng, eng->cls_session, blob.ptr<float>(), shape, &err);
    g_clear_error(&err);
    if (out.empty()) return false;

    const float *d = out.ptr<float>();
    return (d[1] > CLS_THRESH && d[1] > d[0]);
}

// ── CTC greedy decode ───────────────────────────────────────────────────────
static std::string ctc_decode(const cv::Mat &out, const std::vector<std::string> &dict) {
    int T, vocab;
    const float *data;
    if (out.dims == 3) {
        T = out.size[1]; vocab = out.size[2]; data = out.ptr<float>();
    } else {
        T = out.rows;    vocab = out.cols;    data = out.ptr<float>();
    }

    std::string result;
    int prev = -1;
    for (int t = 0; t < T; t++) {
        const float *row = data + (size_t)t * vocab;
        int best = 0; float best_v = row[0];
        for (int v = 1; v < vocab; v++)
            if (row[v] > best_v) { best_v = row[v]; best = v; }
        if (best != 0 && best != prev) {
            int idx = best - 1;
            if (idx >= 0 && idx < (int)dict.size())
                result += dict[idx];
        }
        prev = best;
    }
    return result;
}

// ── CRNN recognition ────────────────────────────────────────────────────────
static std::string run_recognition(RapidEngine *eng, const cv::Mat &bgr,
                                    const std::vector<cv::Point2f> &pts) {
    cv::Mat crop = crop_region(bgr, pts);
    if (crop.empty()) return {};

    if (eng->has_cls && run_classifier(eng, crop))
        cv::rotate(crop, crop, cv::ROTATE_180);

    int tw = std::max(1, std::min(REC_MAX_W,
                (int)std::round((float)REC_HEIGHT * crop.cols / crop.rows)));
    cv::resize(crop, crop, {tw, REC_HEIGHT});

    cv::Mat f32;
    crop.convertTo(f32, CV_32F, 1.0 / 127.5, -1.0);

    cv::Mat blob = make_nchw_blob(f32, 0.f, 0.f, 0.f, 1.f, 1.f, 1.f);

    GError *err = nullptr;
    std::vector<int64_t> shape = {1, 3, REC_HEIGHT, (int64_t)tw};
    cv::Mat out = ort_run(eng, eng->rec_session, blob.ptr<float>(), shape, &err);
    g_clear_error(&err);
    if (out.empty()) return {};

    return ctc_decode(out, eng->dict);
}

// ── Public C API ────────────────────────────────────────────────────────────
RapidEngine *rapid_engine_create(
    const char *det_model,
    const char *cls_model,
    const char *rec_model,
    const char *dict_file,
    GError **error) {

    ort_init();

    auto *eng = new RapidEngine();

    // Environment
    OrtStatus *status = g_ort->CreateEnv(ORT_LOGGING_LEVEL_ERROR, "rapidocr", &eng->env);
    if (status) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "ORT env: %s", g_ort->GetErrorMessage(status));
        g_ort->ReleaseStatus(status);
        delete eng; return nullptr;
    }

    // Session options
    ort_ok(g_ort->CreateSessionOptions(&eng->sess_opts));
    ort_ok(g_ort->SetIntraOpNumThreads(eng->sess_opts, 1));
    ort_ok(g_ort->SetSessionGraphOptimizationLevel(eng->sess_opts, ORT_ENABLE_ALL));

    // Default allocator (singleton, not owned)
    ort_ok(g_ort->GetAllocatorWithDefaultOptions(&eng->allocator));

    // Load sessions
    eng->det_session = ort_load_session(eng, det_model, error);
    if (!eng->det_session) { delete eng; return nullptr; }

    if (cls_model && cls_model[0] && g_file_test(cls_model, G_FILE_TEST_EXISTS)) {
        eng->cls_session = ort_load_session(eng, cls_model, nullptr);
        eng->has_cls = (eng->cls_session != nullptr);
    }

    eng->rec_session = ort_load_session(eng, rec_model, error);
    if (!eng->rec_session) { delete eng; return nullptr; }

    // Load character dictionary
    std::ifstream f(dict_file);
    if (!f.is_open()) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_NOENT,
                    "dict 파일 없음: %s", dict_file);
        delete eng; return nullptr;
    }
    std::string line;
    while (std::getline(f, line))
        if (!line.empty()) eng->dict.push_back(line);
    if (eng->dict.empty()) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "빈 dict: %s", dict_file);
        delete eng; return nullptr;
    }

    return eng;
}

void rapid_engine_destroy(RapidEngine *engine) {
    if (!engine) return;
    if (engine->det_session) g_ort->ReleaseSession(engine->det_session);
    if (engine->cls_session) g_ort->ReleaseSession(engine->cls_session);
    if (engine->rec_session) g_ort->ReleaseSession(engine->rec_session);
    if (engine->sess_opts)   g_ort->ReleaseSessionOptions(engine->sess_opts);
    if (engine->env)         g_ort->ReleaseEnv(engine->env);
    delete engine;
}

gboolean rapid_engine_recognize(
    RapidEngine *engine,
    PIX *image,
    OcrResult *result,
    GError **error) {

    if (!engine || !image || !result) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL, "잘못된 인자");
        return FALSE;
    }

    cv::Mat bgr = pix_to_mat_bgr(image);
    if (bgr.empty()) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "이미지 변환 실패");
        return FALSE;
    }

    std::vector<TextRegion> regions = run_detection(engine, bgr, error);
    if (regions.empty() && error && *error) return FALSE;

    if (regions.empty()) {
        result->text = g_strdup(""); result->lines = nullptr; result->line_count = 0;
        return TRUE;
    }

    struct RecResult { TextRegion region; std::string text; };
    std::vector<RecResult> recs;
    for (auto &reg : regions) {
        std::string text = run_recognition(engine, bgr, reg.pts);
        while (!text.empty() && (text.back() == ' ' || text.back() == '\n'))
            text.pop_back();
        while (!text.empty() && (text.front() == ' ' || text.front() == '\n'))
            text.erase(text.begin());
        if (!text.empty()) recs.push_back({reg, std::move(text)});
    }

    result->line_count = recs.size();
    result->lines      = (OcrLine *)g_new0(OcrLine, result->line_count);
    std::string full;
    for (size_t i = 0; i < recs.size(); i++) {
        const auto &[reg, text] = recs[i];
        OcrLine *line = &result->lines[i];
        line->text       = g_strdup(text.c_str());
        line->word_count = 1;
        line->words      = (OcrWord *)g_new0(OcrWord, 1);

        float xs[4] = {reg.pts[0].x, reg.pts[1].x, reg.pts[2].x, reg.pts[3].x};
        float ys[4] = {reg.pts[0].y, reg.pts[1].y, reg.pts[2].y, reg.pts[3].y};
        float x1 = *std::min_element(xs, xs+4), y1 = *std::min_element(ys, ys+4);
        float x2 = *std::max_element(xs, xs+4), y2 = *std::max_element(ys, ys+4);

        line->words[0].text   = g_strdup(text.c_str());
        line->words[0].bounds = {x1, y1, x2-x1, y2-y1};

        if (!full.empty()) full += '\n';
        full += text;
    }
    result->text = g_strdup(full.c_str());
    return TRUE;
}
