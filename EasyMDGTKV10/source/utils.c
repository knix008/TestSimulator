/**
 * EasyMD GTK
 * utils.c - Shared logging helpers and small utilities.
 *
 * Belongs to the GTK-free core layer; needs _POSIX_C_SOURCE for localtime_r
 * when built without GTK headers in the include path.
 */
#define _POSIX_C_SOURCE 200809L

#include "utils.h"

#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <strings.h>
#include <time.h>

static void log_with_tag(const char *tag, const char *fmt, va_list ap) {
    char    timebuf[32];
    time_t  now = time(NULL);
    struct tm tmv;
    localtime_r(&now, &tmv);
    strftime(timebuf, sizeof(timebuf), "%H:%M:%S", &tmv);
    fprintf(stderr, "[%s] %-5s ", timebuf, tag);
    vfprintf(stderr, fmt, ap);
    fputc('\n', stderr);
}

void utils_log_info(const char *fmt, ...) {
    va_list ap; va_start(ap, fmt);
    log_with_tag("INFO", fmt, ap);
    va_end(ap);
}

void utils_log_warn(const char *fmt, ...) {
    va_list ap; va_start(ap, fmt);
    log_with_tag("WARN", fmt, ap);
    va_end(ap);
}

void utils_log_error(const char *fmt, ...) {
    va_list ap; va_start(ap, fmt);
    log_with_tag("ERROR", fmt, ap);
    va_end(ap);
}

const char *utils_get_extension(const char *path) {
    if (!path) return NULL;
    const char *dot = strrchr(path, '.');
    const char *slash = strrchr(path, '/');
    if (!dot || (slash && dot < slash)) return NULL;
    return dot + 1;
}

gboolean utils_str_has_suffix_ci(const char *s, const char *suffix) {
    if (!s || !suffix) return FALSE;
    size_t ls = strlen(s);
    size_t lu = strlen(suffix);
    if (lu > ls) return FALSE;
    return strcasecmp(s + ls - lu, suffix) == 0;
}

/* Register dialog CSS on the default screen once.
 *
 * Key facts about GTK3 CSS cascade:
 *   1. GTK3 does NOT support !important — the parser rejects it with
 *      "Junk at end of value", dropping the entire rule silently.
 *   2. Provider priority (our USER+10 = 810) beats the theme's THEME
 *      priority (200) for ALL rules, regardless of selector specificity.
 *      So we don't need !important — we just need valid CSS.
 *
 * Color scheme — consistent contrast:
 *   Light body  (#f5f5fb)  → dark text  (#1e1e2e)
 *   Dark buttons (#3a3a50) → light text (#f0f0f0)
 *   Light header (#dcdcec) → dark icon  (#1e1e2e)  — titlebutton X visible
 *   White entry  (#ffffff) → dark text  (#1e1e2e)
 *   Light treeview         → dark text  (#1e1e2e)
 */
void utils_apply_dialog_css(GtkWidget *dialog) {
    (void)dialog;

    static gboolean registered = FALSE;
    if (registered) return;
    registered = TRUE;

#define ALL_DLG \
    "dialog, messagedialog, filechooser, aboutdialog"
#define DC(sel) \
    "dialog "        sel ","  \
    "messagedialog " sel ","  \
    "filechooser "   sel ","  \
    "aboutdialog "   sel

    GtkCssProvider *provider = gtk_css_provider_new();
    gtk_css_provider_load_from_data(provider,

        /* ── 배경 ───────────────────────────────────────────────── */
        ALL_DLG " { background-color: #f5f5fb; color: #1e1e2e; }"
        ALL_DLG " > * { background-color: #f5f5fb; color: #1e1e2e; }"

        /* ── 모든 라벨 ── */
        DC("label") " { color: #1e1e2e; }"

        /* messagedialog 주/부 텍스트 */
        "messagedialog .primary   { color: #0d0d1a; font-weight: bold; }"
        "messagedialog .secondary { color: #2a2a40; }"

        /* ── 일반 버튼 ── 어두운 배경 + 흰 글 */
        DC("button")                   " { background-color: #3a3a50;"
                                       "   color: #f0f0f0; border: 1px solid #5a5a78; }"
        DC("button.text-button")       " { background-color: #3a3a50;"
                                       "   color: #f0f0f0; border: 1px solid #5a5a78; }"
        DC("button.image-button")      " { background-color: #3a3a50;"
                                       "   color: #f0f0f0; border: 1px solid #5a5a78; }"
        DC("button.image-text-button") " { background-color: #3a3a50;"
                                       "   color: #f0f0f0; border: 1px solid #5a5a78; }"
        DC("button.flat")              " { background-color: transparent; color: #1e1e2e; }"

        DC("button label")                   " { color: #f0f0f0; }"
        DC("button.text-button label")       " { color: #f0f0f0; }"
        DC("button.image-button label")      " { color: #f0f0f0; }"
        DC("button.image-text-button label") " { color: #f0f0f0; }"
        DC("button.flat label")              " { color: #1e1e2e; }"

        DC("button:hover")             " { background-color: #4a4a65; }"
        DC("button.text-button:hover") " { background-color: #4a4a65; }"

        /* ── 강조 버튼 (OK / 열기 / 저장) ──────────────────────── */
        DC("button.suggested-action")             " { background-color: #4444bb;"
                                                  "   color: #ffffff; border-color: #3333aa; }"
        DC("button.suggested-action.text-button") " { background-color: #4444bb; color: #ffffff; }"
        DC("button.suggested-action label")             " { color: #ffffff; }"
        DC("button.suggested-action.text-button label") " { color: #ffffff; }"
        DC("button.suggested-action:hover") " { background-color: #5555cc; }"

        /* ── 파괴 버튼 (버리기 / 삭제) ─────────────────────────── */
        DC("button.destructive-action")             " { background-color: #bb2222;"
                                                    "   color: #ffffff; border-color: #991111; }"
        DC("button.destructive-action.text-button") " { background-color: #bb2222; color: #ffffff; }"
        DC("button.destructive-action label")             " { color: #ffffff; }"
        DC("button.destructive-action.text-button label") " { color: #ffffff; }"
        DC("button.destructive-action:hover") " { background-color: #cc3333; }"

        /* ── 헤더바 — 밝은 배경 + 어두운 아이콘 (X 버튼 가시성) ─ */
        DC("headerbar") " { background-color: #dcdcec; color: #1e1e2e; }"
        DC("headerbar label") " { color: #1e1e2e; }"

        /* titlebutton (X 닫기 버튼): transparent bg, dark icon */
        DC("headerbar button.titlebutton")
            " { background-color: transparent; color: #1e1e2e;"
            "   border: none; -gtk-icon-shadow: none; }"
        DC("headerbar button.close")
            " { background-color: transparent; color: #1e1e2e;"
            "   border: none; -gtk-icon-shadow: none; }"
        DC("headerbar button.titlebutton label") " { color: #1e1e2e; }"
        DC("headerbar button.close label")       " { color: #1e1e2e; }"
        DC("headerbar button.titlebutton:hover")
            " { background-color: rgba(0,0,0,0.12); }"
        DC("headerbar button.close:hover")
            " { background-color: rgba(180,40,40,0.25); }"

        /* ── filechooser 경로바 (.linked 버튼 포함) ──────────────
         *   Yaru-dark: filechooser .path-bar.linked > button { ... }
         *   우리 provider priority(810) > theme(200) → 우선 적용됨  */
        "filechooser .path-bar button,"
        "filechooser .path-bar.linked > button,"
        "filechooser .path-bar button.text-button {"
        "  background-color: #dcdcec; color: #1e1e2e; border-color: #aaaacc; }"
        "filechooser .path-bar button label,"
        "filechooser .path-bar.linked > button label {"
        "  color: #1e1e2e; }"
        "filechooser .path-bar button:hover,"
        "filechooser .path-bar.linked > button:hover {"
        "  background-color: #c8c8e0; }"

        /* ── filechooser 파일 종류 콤보박스 ─────────────────────── */
        "filechooser combobox button,"
        "filechooser combobox button.combo {"
        "  background-color: #3a3a50; color: #f0f0f0; border: 1px solid #5a5a78; }"
        "filechooser combobox button label,"
        "filechooser combobox button.combo label {"
        "  color: #f0f0f0; }"

        /* ── 입력창 ─────────────────────────────────────────────── */
        DC("entry") " { background-color: #ffffff; color: #1e1e2e;"
                    "   border: 1px solid #8888aa; caret-color: #1e1e2e; }"

        /* ── 트리뷰 ─────────────────────────────────────────────── */
        DC("treeview")              " { background-color: #f0f0f8; color: #1e1e2e; }"
        DC("treeview row")          " { background-color: #f0f0f8; color: #1e1e2e; }"
        DC("treeview row:nth-child(even)") " { background-color: #e8e8f4; }"
        DC("treeview row:hover")    " { background-color: #d8d8ee; }"
        DC("treeview row:selected") " { background-color: #4444bb; color: #ffffff; }"

        /* ── GtkTextView (About 라이선스 텍스트) ────────────────── */
        DC("textview")      " { background-color: #ffffff; color: #1e1e2e; }"
        DC("textview text") " { background-color: #ffffff; color: #1e1e2e; }"

        /* ── notebook (About 다이얼로그 탭) ─────────────────────── */
        DC("notebook")             " { background-color: #f5f5fb; }"
        DC("notebook tab")         " { background-color: #dcdcec; color: #1e1e2e; }"
        DC("notebook tab:checked") " { background-color: #f5f5fb; color: #1e1e2e; }"
        DC("notebook tab label")   " { color: #1e1e2e; }"
        DC("notebook stack")       " { background-color: #f5f5fb; }"

        /* ── scrolledwindow / viewport ─────────────────────────── */
        DC("scrolledwindow")          " { background-color: #f5f5fb; }"
        DC("scrolledwindow viewport") " { background-color: #f5f5fb; }",

        -1, NULL);

#undef ALL_DLG
#undef DC

    gtk_style_context_add_provider_for_screen(
        gdk_screen_get_default(),
        GTK_STYLE_PROVIDER(provider),
        GTK_STYLE_PROVIDER_PRIORITY_USER + 10);
    g_object_unref(provider);
}
