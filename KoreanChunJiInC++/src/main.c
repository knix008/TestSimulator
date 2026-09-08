/*
 * main.c - 천지인 한글 입력기 (Windows GUI)
 *
 *   메뉴 - 툴바 - 편집 영역 - 상태줄 - 천지인 키패드
 *
 * 버튼은 모두 오너 드로로 그린다. 색은 테마 표에서 가져오므로
 * 설정에서 테마를 바꾸면 전체가 즉시 다시 그려진다.
 * 설정은 HKCU\Software\Chunjiin 에 저장한다.
 */
#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <commctrl.h>
#include <windowsx.h>
#include <commdlg.h>
#include <dwmapi.h>
#include <stdio.h>
#include <string.h>
#include <wchar.h>

#include "chunjiin.h"
#include "input.h"
#include "resource.h"

/* ------------------------------------------------------------------ */
/* 컨트롤 · 명령 ID                                                    */
/* ------------------------------------------------------------------ */
#define IDC_EDIT          100
#define IDC_STATUS        101
#define IDC_KEY_BASE      200         /* 200 ~ 211 : 천지인 12키 */
#define IDC_FN_BASE       300         /* 300 ~ 305 : 기능 버튼 */

#define IDM_NEW           400
#define IDM_OPEN          401
#define IDM_SAVE          402
#define IDM_EXIT          403
#define IDM_COPY          410
#define IDM_PASTE         411
#define IDM_CLEAR         412
#define IDM_MODE_BASE     420         /* 420 ~ 424 : 입력 모드 */
#define IDM_CYCLE_MODE    425
#define IDM_THEME_BASE    430         /* 430 ~ 433 : 테마 */
#define IDM_VIEW_TOOLBAR  440
#define IDM_VIEW_STATUS   441
#define IDM_SETTINGS      442
#define IDM_CYCLE_THEME   443
#define IDM_HELP          450
#define IDM_ABOUT         451

/* 설정 창 */
#define IDC_SET_THEME     500
#define IDC_SET_FONT      501
#define IDC_SET_TAP       502
#define IDC_SET_MODE      503
#define IDC_SET_TOOLBAR   504
#define IDC_SET_STATUS    505
#define IDC_SET_OK        506
#define IDC_SET_CANCEL    507
#define IDC_SET_DEFAULT   508

#define TIMER_MULTITAP    1
#define KEY_RADIUS        12
#define CARD_RADIUS       10
#define TOOL_RADIUS       6

#ifndef DWMWA_USE_IMMERSIVE_DARK_MODE
#  define DWMWA_USE_IMMERSIVE_DARK_MODE 20
#endif

/* ------------------------------------------------------------------ */
/* 테마                                                                */
/* ------------------------------------------------------------------ */

typedef enum {
    ROLE_CONS = 0,   /* 자음 · 일반 키 */
    ROLE_VOWEL,      /* ㅣ · ㅡ */
    ROLE_MOD,        /* 문장부호 */
    ROLE_FN,         /* 기능 버튼 */
    ROLE_PRIMARY,    /* 모드 전환 */
    ROLE_TOOL,       /* 툴바 */
    ROLE_COUNT
} BtnRole;

/* 역할별 색: { 기본, 호버, 눌림, 테두리, 글자 } */
typedef struct {
    const wchar_t *name;
    BOOL     dark;
    COLORREF wnd, card, border, text, muted;
    COLORREF role[ROLE_COUNT][5];
} Theme;

static const Theme THEMES[] = {
{
    L"라이트", FALSE,
    RGB(0xF6,0xF7,0xFA), RGB(0xFF,0xFF,0xFF), RGB(0xDF,0xE3,0xEA),
    RGB(0x1F,0x23,0x28), RGB(0x6B,0x72,0x80),
    {
      { RGB(0xFF,0xFF,0xFF), RGB(0xF2,0xF5,0xFF), RGB(0xE3,0xEA,0xFD), RGB(0xDF,0xE3,0xEA), RGB(0x1F,0x23,0x28) },
      { RGB(0xED,0xF2,0xFF), RGB(0xE3,0xEB,0xFF), RGB(0xD6,0xE1,0xFD), RGB(0xD3,0xDE,0xFB), RGB(0x27,0x49,0xC9) },
      { RGB(0xF1,0xF3,0xF7), RGB(0xE9,0xEC,0xF2), RGB(0xDF,0xE3,0xEB), RGB(0xE0,0xE4,0xEB), RGB(0x4A,0x51,0x62) },
      { RGB(0xF1,0xF3,0xF7), RGB(0xE9,0xEC,0xF2), RGB(0xDF,0xE3,0xEB), RGB(0xE0,0xE4,0xEB), RGB(0x33,0x38,0x42) },
      { RGB(0x3F,0x62,0xE8), RGB(0x35,0x57,0xDD), RGB(0x2C,0x4A,0xC9), RGB(0x35,0x57,0xDD), RGB(0xFF,0xFF,0xFF) },
      { RGB(0xF6,0xF7,0xFA), RGB(0xE7,0xEC,0xF8), RGB(0xD9,0xE1,0xF5), RGB(0xF6,0xF7,0xFA), RGB(0x3B,0x42,0x50) }
    }
},
{
    L"다크", TRUE,
    RGB(0x1E,0x1F,0x22), RGB(0x17,0x18,0x1B), RGB(0x33,0x36,0x3D),
    RGB(0xE6,0xE8,0xEB), RGB(0x9A,0xA1,0xAC),
    {
      { RGB(0x24,0x26,0x2B), RGB(0x2C,0x2F,0x36), RGB(0x36,0x3A,0x43), RGB(0x38,0x3B,0x43), RGB(0xE6,0xE8,0xEB) },
      { RGB(0x21,0x30,0x4F), RGB(0x27,0x39,0x5E), RGB(0x2E,0x44,0x6F), RGB(0x33,0x45,0x6B), RGB(0xA9,0xC4,0xFF) },
      { RGB(0x1D,0x1F,0x24), RGB(0x24,0x26,0x2B), RGB(0x2B,0x2E,0x35), RGB(0x30,0x33,0x39), RGB(0xB7,0xBD,0xC7) },
      { RGB(0x1D,0x1F,0x24), RGB(0x24,0x26,0x2B), RGB(0x2B,0x2E,0x35), RGB(0x30,0x33,0x39), RGB(0xDD,0xE1,0xE7) },
      { RGB(0x3F,0x62,0xE8), RGB(0x4A,0x6D,0xF0), RGB(0x34,0x55,0xCE), RGB(0x4A,0x6D,0xF0), RGB(0xFF,0xFF,0xFF) },
      { RGB(0x1E,0x1F,0x22), RGB(0x2A,0x2D,0x34), RGB(0x34,0x38,0x40), RGB(0x1E,0x1F,0x22), RGB(0xD5,0xD9,0xE0) }
    }
},
{
    L"세피아", FALSE,
    RGB(0xF3,0xEA,0xDA), RGB(0xFB,0xF3,0xE6), RGB(0xDC,0xCD,0xB4),
    RGB(0x4A,0x3B,0x28), RGB(0x8A,0x75,0x5A),
    {
      { RGB(0xFB,0xF3,0xE6), RGB(0xF6,0xEA,0xD6), RGB(0xEE,0xDC,0xC0), RGB(0xDC,0xCD,0xB4), RGB(0x4A,0x3B,0x28) },
      { RGB(0xF3,0xE3,0xC6), RGB(0xEE,0xDA,0xB6), RGB(0xE6,0xCE,0xA2), RGB(0xD9,0xC0,0x9B), RGB(0x8A,0x5A,0x22) },
      { RGB(0xEF,0xE4,0xD0), RGB(0xE9,0xDA,0xC2), RGB(0xE0,0xCD,0xAF), RGB(0xD7,0xC6,0xAA), RGB(0x5A,0x4A,0x34) },
      { RGB(0xEF,0xE4,0xD0), RGB(0xE9,0xDA,0xC2), RGB(0xE0,0xCD,0xAF), RGB(0xD7,0xC6,0xAA), RGB(0x4A,0x3B,0x28) },
      { RGB(0xA9,0x71,0x3C), RGB(0x96,0x63,0x2F), RGB(0x85,0x54,0x27), RGB(0x96,0x63,0x2F), RGB(0xFF,0xF8,0xEC) },
      { RGB(0xF3,0xEA,0xDA), RGB(0xEA,0xDC,0xC4), RGB(0xE0,0xCE,0xB0), RGB(0xF3,0xEA,0xDA), RGB(0x5A,0x4A,0x34) }
    }
},
{
    L"고대비", TRUE,
    RGB(0x00,0x00,0x00), RGB(0x00,0x00,0x00), RGB(0xFF,0xFF,0xFF),
    RGB(0xFF,0xFF,0xFF), RGB(0xFF,0xFF,0x00),
    {
      { RGB(0x00,0x00,0x00), RGB(0x22,0x22,0x22), RGB(0x44,0x44,0x44), RGB(0xFF,0xFF,0xFF), RGB(0xFF,0xFF,0xFF) },
      { RGB(0x00,0x00,0x00), RGB(0x22,0x22,0x22), RGB(0x44,0x44,0x44), RGB(0xFF,0xFF,0x00), RGB(0xFF,0xFF,0x00) },
      { RGB(0x00,0x00,0x00), RGB(0x22,0x22,0x22), RGB(0x44,0x44,0x44), RGB(0x00,0xFF,0x00), RGB(0x00,0xFF,0x00) },
      { RGB(0x00,0x00,0x00), RGB(0x22,0x22,0x22), RGB(0x44,0x44,0x44), RGB(0xFF,0xFF,0xFF), RGB(0xFF,0xFF,0xFF) },
      { RGB(0xFF,0xFF,0x00), RGB(0xFF,0xEA,0x00), RGB(0xE6,0xD2,0x00), RGB(0xFF,0xFF,0x00), RGB(0x00,0x00,0x00) },
      { RGB(0x00,0x00,0x00), RGB(0x33,0x33,0x33), RGB(0x55,0x55,0x55), RGB(0x00,0x00,0x00), RGB(0xFF,0xFF,0x00) }
    }
}
};
#define THEME_COUNT ((int)(sizeof(THEMES) / sizeof(THEMES[0])))

/* ------------------------------------------------------------------ */
/* 설정                                                                */
/* ------------------------------------------------------------------ */

typedef struct {
    int theme;          /* 0 ~ THEME_COUNT-1 */
    int font_size;      /* 편집 영역 글꼴 높이(픽셀) */
    int multitap_ms;    /* 연타 순환이 유지되는 시간 */
    int start_mode;     /* 시작할 때의 입력 모드 */
    int show_toolbar;
    int show_status;
} Settings;

static const Settings DEFAULTS = { 0, 21, 800, MODE_HANGUL, 1, 1 };

static Settings g_set;

#define REG_PATH L"Software\\Chunjiin"

static int reg_read_int(HKEY key, const wchar_t *name, int fallback)
{
    DWORD value = 0, size = sizeof(value), type = 0;

    if (RegQueryValueExW(key, name, NULL, &type,
                         (BYTE *)&value, &size) != ERROR_SUCCESS) {
        return fallback;
    }
    return (type == REG_DWORD) ? (int)value : fallback;
}

static void reg_write_int(HKEY key, const wchar_t *name, int value)
{
    DWORD v = (DWORD)value;
    RegSetValueExW(key, name, 0, REG_DWORD, (const BYTE *)&v, sizeof(v));
}

static int clamp_int(int v, int lo, int hi)
{
    return (v < lo) ? lo : ((v > hi) ? hi : v);
}

static void settings_load(void)
{
    HKEY key;

    g_set = DEFAULTS;
    if (RegOpenKeyExW(HKEY_CURRENT_USER, REG_PATH, 0, KEY_READ, &key)
            != ERROR_SUCCESS) {
        return;
    }
    g_set.theme        = reg_read_int(key, L"Theme",       DEFAULTS.theme);
    g_set.font_size    = reg_read_int(key, L"FontSize",    DEFAULTS.font_size);
    g_set.multitap_ms  = reg_read_int(key, L"MultitapMs",  DEFAULTS.multitap_ms);
    g_set.start_mode   = reg_read_int(key, L"StartMode",   DEFAULTS.start_mode);
    g_set.show_toolbar = reg_read_int(key, L"ShowToolbar", DEFAULTS.show_toolbar);
    g_set.show_status  = reg_read_int(key, L"ShowStatus",  DEFAULTS.show_status);
    RegCloseKey(key);

    g_set.theme       = clamp_int(g_set.theme, 0, THEME_COUNT - 1);
    g_set.font_size   = clamp_int(g_set.font_size, 14, 36);
    g_set.multitap_ms = clamp_int(g_set.multitap_ms, 300, 3000);
    g_set.start_mode  = clamp_int(g_set.start_mode, 0, MODE_COUNT - 1);
}

static void settings_save(void)
{
    HKEY key;

    if (RegCreateKeyExW(HKEY_CURRENT_USER, REG_PATH, 0, NULL, 0,
                        KEY_WRITE, NULL, &key, NULL) != ERROR_SUCCESS) {
        return;
    }
    reg_write_int(key, L"Theme",       g_set.theme);
    reg_write_int(key, L"FontSize",    g_set.font_size);
    reg_write_int(key, L"MultitapMs",  g_set.multitap_ms);
    reg_write_int(key, L"StartMode",   g_set.start_mode);
    reg_write_int(key, L"ShowToolbar", g_set.show_toolbar);
    reg_write_int(key, L"ShowStatus",  g_set.show_status);
    RegCloseKey(key);
}

/* ------------------------------------------------------------------ */
/* 툴바 정의                                                           */
/* ------------------------------------------------------------------ */

typedef struct {
    int            id;
    const wchar_t *glyph;      /* Segoe MDL2 Assets 아이콘 */
    const wchar_t *tip;
    int            gap_before; /* 1 이면 앞에 구분선을 둔다 */
} ToolItem;

static const ToolItem TOOLS[] = {
    { IDM_NEW,          L"", L"새로 만들기 (Ctrl+N)", 0 },
    { IDM_OPEN,         L"", L"열기 (Ctrl+O)", 0 },
    { IDM_SAVE,         L"", L"저장 (Ctrl+S)", 0 },
    { IDM_COPY,         L"", L"복사 (Ctrl+C)", 1 },
    { IDM_PASTE,        L"", L"붙여넣기 (Ctrl+V)", 0 },
    { IDM_CLEAR,        L"", L"전체 지우기", 0 },
    { IDM_CYCLE_MODE,   L"", L"입력 모드 전환 (F2)", 1 },
    { IDM_CYCLE_THEME,  L"", L"테마 전환 (F3)", 0 },
    { IDM_SETTINGS,     L"", L"설정... (F4)", 0 },
    { IDM_ABOUT,        L"", L"프로그램 정보", 1 }
};
#define TOOL_COUNT ((int)(sizeof(TOOLS) / sizeof(TOOLS[0])))

#define TOOL_BTN   30
#define TOOL_GAP    2
#define TOOL_SEP   11
#define TOOL_BAR_H 38

/* ------------------------------------------------------------------ */
/* 전역 상태                                                           */
/* ------------------------------------------------------------------ */
static ChunjiinState g_state;

static HWND     g_main;
static HWND     g_edit;
static HWND     g_status;
static HWND     g_tip;
static HWND     g_key[KEY_COUNT];
static HWND     g_tool[TOOL_COUNT];
static HWND     g_settings_win;
static HFONT    g_font_text;
static HFONT    g_font_key;
static HFONT    g_font_ui;
static HFONT    g_font_icon;
static HBRUSH   g_br_wnd;
static HBRUSH   g_br_card;
static HBRUSH   g_br_menu;
static WNDPROC  g_edit_proc;
static WNDPROC  g_btn_proc;
static BOOL     g_swallow_char;
static int      g_label_mode = -1;
static int      g_line_height;
static HWND     g_scroll;            /* 직접 그리는 세로 스크롤바 */
static BOOL     g_scroll_drag;
static int      g_scroll_grab;
static RECT     g_card_rect;         /* 편집 영역 + 스크롤바를 감싸는 테두리 */
#define SCROLL_W 12

#define TH (&THEMES[g_set.theme])

/* 기능 버튼은 키패드 마지막 줄에 가변 폭으로 늘어놓는다. */
#define FN_COUNT 6
enum { FN_MODE = 0, FN_LEFT, FN_SPACE, FN_RIGHT, FN_ENTER, FN_BS };

static HWND g_fn[FN_COUNT];
/* 화살표 · 줄바꿈 · 지우기는 Segoe MDL2 Assets 아이콘으로 그린다 */
static const wchar_t *const FN_LABELS[FN_COUNT] = {
    L"모드", L"", L"스페이스", L"", L"", L""
};
static const BOOL FN_ICON[FN_COUNT] = { FALSE, TRUE, FALSE, TRUE, TRUE, TRUE };
static const wchar_t *const FN_TIPS[FN_COUNT] = {
    L"입력 모드 전환 (F2)", L"커서 왼쪽 (←)", L"띄어쓰기 (Space)",
    L"커서 오른쪽 (→) · 연타 순환 끊기", L"줄바꿈 (Enter)", L"지우기 (Backspace)"
};
/* 폭 비율 (합 35) */
static const int FN_WEIGHT[FN_COUNT] = { 7, 4, 10, 4, 4, 6 };
#define FN_WEIGHT_SUM 35

/* ------------------------------------------------------------------ */
/* 미리 알려 두는 함수들                                               */
/* ------------------------------------------------------------------ */
static HFONT make_font(int height, int weight, const wchar_t *face);
static void  apply_settings(void);
static void  apply_menu_theme(void);
static void  open_settings(void);
static void  relayout(void);
static void  measure_menu_item(MEASUREITEMSTRUCT *m);
static void  draw_menu_item(const DRAWITEMSTRUCT *d);
static void  update_scrollbar(void);

/* ------------------------------------------------------------------ */
/* 편집 영역 갱신                                                      */
/* ------------------------------------------------------------------ */

/* 엔진 버퍼의 \n 을 \r\n 으로 바꾸면서 커서 위치도 함께 옮긴다. */
static int engine_to_display(const wchar_t *src, int cursor, wchar_t *out, int out_len)
{
    int i, j = 0, caret = 0;

    for (i = 0; src[i] != 0 && j < out_len - 3; i++) {
        if (i == cursor) caret = j;
        if (src[i] == L'\n') {
            out[j++] = L'\r';
            out[j++] = L'\n';
        } else {
            out[j++] = src[i];
        }
    }
    if (cursor >= i) caret = j;
    out[j] = 0;
    return caret;
}

/* 편집 컨트롤의 오프셋을 엔진 버퍼 인덱스로 되돌린다. */
static int display_to_engine(const wchar_t *src, int disp_pos)
{
    int i, j = 0;

    for (i = 0; src[i] != 0; i++) {
        if (j >= disp_pos) return i;
        j += (src[i] == L'\n') ? 2 : 1;
    }
    return i;
}

/* 편집 영역의 줄 수 / 보이는 줄 수 / 맨 위 줄 */
static void scroll_metrics(int *lines, int *visible, int *first)
{
    RECT rc;

    GetClientRect(g_edit, &rc);
    *visible = (g_line_height > 0) ? (rc.bottom / g_line_height) : 1;
    if (*visible < 1) *visible = 1;
    *lines = (int)SendMessageW(g_edit, EM_GETLINECOUNT, 0, 0);
    *first = (int)SendMessageW(g_edit, EM_GETFIRSTVISIBLELINE, 0, 0);
}

/* 스크롤바 손잡이의 자리. 스크롤이 필요 없으면 FALSE. */
static BOOL thumb_rect(RECT *out)
{
    RECT rc;
    int lines, visible, first, th, y;

    if (g_scroll == NULL) return FALSE;
    GetClientRect(g_scroll, &rc);
    scroll_metrics(&lines, &visible, &first);
    if (lines <= visible) return FALSE;

    th = rc.bottom * visible / lines;
    if (th < 24) th = 24;
    if (th > rc.bottom) th = rc.bottom;
    y = (rc.bottom - th) * first / (lines - visible);

    out->left = rc.left;
    out->right = rc.right;
    out->top = y;
    out->bottom = y + th;
    return TRUE;
}

/* 내용이 넘칠 때만 스크롤바를 보인다. */
static void update_scrollbar(void)
{
    int lines, visible, first;

    if (g_edit == NULL || g_scroll == NULL || g_line_height <= 0) return;

    scroll_metrics(&lines, &visible, &first);
    ShowWindow(g_scroll, (lines > visible) ? SW_SHOW : SW_HIDE);
    InvalidateRect(g_scroll, NULL, TRUE);
}

/* 맨 위에 보일 줄을 정한다. */
static void scroll_to_line(int want)
{
    int lines, visible, first;

    scroll_metrics(&lines, &visible, &first);
    if (want > lines - visible) want = lines - visible;
    if (want < 0) want = 0;
    if (want != first) {
        SendMessageW(g_edit, EM_LINESCROLL, 0, (LPARAM)(want - first));
    }
    InvalidateRect(g_scroll, NULL, TRUE);
}

static LRESULT CALLBACK ScrollProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg) {
        case WM_PAINT: {
            PAINTSTRUCT ps;
            HDC dc = BeginPaint(hwnd, &ps);
            RECT rc, th;

            GetClientRect(hwnd, &rc);
            FillRect(dc, &rc, g_br_card);

            if (thumb_rect(&th)) {
                COLORREF c = g_scroll_drag ? TH->role[ROLE_PRIMARY][0] : TH->muted;
                HBRUSH br = CreateSolidBrush(c);
                HPEN pen = CreatePen(PS_SOLID, 1, c);
                HGDIOBJ ob = SelectObject(dc, br);
                HGDIOBJ op = SelectObject(dc, pen);

                InflateRect(&th, -3, 0);
                RoundRect(dc, th.left, th.top, th.right, th.bottom, 6, 6);
                SelectObject(dc, ob);
                SelectObject(dc, op);
                DeleteObject(br);
                DeleteObject(pen);
            }
            EndPaint(hwnd, &ps);
            return 0;
        }

        case WM_ERASEBKGND:
            return 1;

        case WM_LBUTTONDOWN: {
            RECT th;
            int y = GET_Y_LPARAM(lp);
            int lines, visible, first;

            if (!thumb_rect(&th)) return 0;
            scroll_metrics(&lines, &visible, &first);

            if (y >= th.top && y < th.bottom) {
                g_scroll_drag = TRUE;
                g_scroll_grab = y - th.top;
                SetCapture(hwnd);
            } else {
                scroll_to_line(first + ((y < th.top) ? -visible : visible));
            }
            InvalidateRect(hwnd, NULL, TRUE);
            return 0;
        }

        case WM_MOUSEMOVE: {
            RECT rc, th;
            int lines, visible, first, span, y;

            if (!g_scroll_drag) return 0;
            if (!thumb_rect(&th)) return 0;

            GetClientRect(hwnd, &rc);
            scroll_metrics(&lines, &visible, &first);
            span = rc.bottom - (th.bottom - th.top);
            if (span <= 0) return 0;

            y = GET_Y_LPARAM(lp) - g_scroll_grab;
            if (y < 0) y = 0;
            if (y > span) y = span;
            scroll_to_line((lines - visible) * y / span);
            return 0;
        }

        case WM_LBUTTONUP:
            if (g_scroll_drag) {
                g_scroll_drag = FALSE;
                ReleaseCapture();
                InvalidateRect(hwnd, NULL, TRUE);
            }
            return 0;

        case WM_MOUSEWHEEL:
            SendMessageW(g_edit, WM_MOUSEWHEEL, wp, lp);
            InvalidateRect(hwnd, NULL, TRUE);
            return 0;

        default:
            break;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

static void update_status(void)
{
    wchar_t comp[64];
    wchar_t line[256];

    if (g_status == NULL) return;
    chunjiin_composition_text(&g_state, comp, 64);
    swprintf(line, 256, L"%ls    조합 %ls    %d자",
             chunjiin_mode_name(&g_state),
             comp[0] ? comp : L"–",
             (int)wcslen(g_state.text_buffer));
    SetWindowTextW(g_status, line);
}

static void update_key_labels(void)
{
    int i;
    HMENU menu;

    if (g_label_mode == (int)g_state.now_mode) return;
    g_label_mode = (int)g_state.now_mode;

    for (i = 0; i < KEY_COUNT; i++) {
        SetWindowTextW(g_key[i], chunjiin_key_label(&g_state, i));
        InvalidateRect(g_key[i], NULL, TRUE);
    }

    menu = GetMenu(g_main);
    if (menu) {
        CheckMenuRadioItem(menu, IDM_MODE_BASE, IDM_MODE_BASE + MODE_COUNT - 1,
                           IDM_MODE_BASE + g_label_mode, MF_BYCOMMAND);
    }
}

static void refresh_ui(void)
{
    static wchar_t disp[MAX_TEXT_LEN * 2 + 4];
    int caret;

    caret = engine_to_display(g_state.text_buffer, g_state.cursor_pos,
                              disp, MAX_TEXT_LEN * 2 + 4);

    SetWindowTextW(g_edit, disp);
    SendMessageW(g_edit, EM_SETSEL, (WPARAM)caret, (LPARAM)caret);
    SendMessageW(g_edit, EM_SCROLLCARET, 0, 0);

    update_key_labels();
    update_status();
    update_scrollbar();
}

/* ------------------------------------------------------------------ */
/* 동작                                                                */
/* ------------------------------------------------------------------ */

/*
 * 연타 순환 타이머.
 * 시간이 지나면 같은 키를 다시 눌러도 순환하지 않고 새 글자로 들어간다.
 * 기다리기 싫으면 ▶ 키를 눌러 즉시 끊을 수 있다.
 */
static void arm_multitap_timer(void)
{
    SetTimer(g_main, TIMER_MULTITAP, (UINT)g_set.multitap_ms, NULL);
}

static void do_key(int key)
{
    if (key < 0 || key >= KEY_COUNT) return;
    chunjiin_process_input(&g_state, key);
    arm_multitap_timer();
    refresh_ui();
}

static void do_copy(void)
{
    size_t bytes;
    HGLOBAL mem;
    wchar_t *dst;

    if (g_state.text_buffer[0] == 0) return;
    if (!OpenClipboard(g_main)) return;

    EmptyClipboard();
    bytes = (wcslen(g_state.text_buffer) + 1) * sizeof(wchar_t);
    mem = GlobalAlloc(GMEM_MOVEABLE, bytes);
    if (mem) {
        dst = (wchar_t *)GlobalLock(mem);
        memcpy(dst, g_state.text_buffer, bytes);
        GlobalUnlock(mem);
        SetClipboardData(CF_UNICODETEXT, mem);
    }
    CloseClipboard();
}

static void do_paste(void)
{
    HANDLE h;
    const wchar_t *src;
    int i;

    if (!IsClipboardFormatAvailable(CF_UNICODETEXT)) return;
    if (!OpenClipboard(g_main)) return;

    h = GetClipboardData(CF_UNICODETEXT);
    if (h) {
        src = (const wchar_t *)GlobalLock(h);
        if (src) {
            chunjiin_commit(&g_state);
            for (i = 0; src[i] != 0; i++) {
                if (src[i] == L'\r') continue;
                chunjiin_insert_char(&g_state, src[i]);
            }
            GlobalUnlock(h);
        }
    }
    CloseClipboard();
    refresh_ui();
}

static void do_save(void)
{
    OPENFILENAMEW ofn;
    wchar_t path[MAX_PATH] = L"";
    const char *utf8;
    HANDLE file;
    DWORD written;
    static const unsigned char bom[3] = { 0xEF, 0xBB, 0xBF };

    ZeroMemory(&ofn, sizeof(ofn));
    ofn.lStructSize = sizeof(ofn);
    ofn.hwndOwner = g_main;
    ofn.lpstrFilter = L"텍스트 파일 (*.txt)\0*.txt\0모든 파일 (*.*)\0*.*\0";
    ofn.lpstrFile = path;
    ofn.nMaxFile = MAX_PATH;
    ofn.lpstrDefExt = L"txt";
    ofn.Flags = OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST;

    if (!GetSaveFileNameW(&ofn)) return;

    chunjiin_commit(&g_state);
    utf8 = wchar_to_utf8(g_state.text_buffer, wcslen(g_state.text_buffer));

    file = CreateFileW(path, GENERIC_WRITE, 0, NULL,
                       CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (file == INVALID_HANDLE_VALUE) {
        MessageBoxW(g_main, L"파일을 저장할 수 없습니다.", L"오류", MB_ICONERROR);
        return;
    }
    WriteFile(file, bom, 3, &written, NULL);
    WriteFile(file, utf8, (DWORD)strlen(utf8), &written, NULL);
    CloseHandle(file);

    refresh_ui();
}

static void do_open(void)
{
    OPENFILENAMEW ofn;
    wchar_t path[MAX_PATH] = L"";
    HANDLE file;
    DWORD size, read;
    char *raw;
    wchar_t *wide;
    int wlen, i, skip;

    ZeroMemory(&ofn, sizeof(ofn));
    ofn.lStructSize = sizeof(ofn);
    ofn.hwndOwner = g_main;
    ofn.lpstrFilter = L"텍스트 파일 (*.txt)\0*.txt\0모든 파일 (*.*)\0*.*\0";
    ofn.lpstrFile = path;
    ofn.nMaxFile = MAX_PATH;
    ofn.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST;

    if (!GetOpenFileNameW(&ofn)) return;

    file = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ, NULL,
                       OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (file == INVALID_HANDLE_VALUE) {
        MessageBoxW(g_main, L"파일을 열 수 없습니다.", L"오류", MB_ICONERROR);
        return;
    }
    size = GetFileSize(file, NULL);
    if (size == INVALID_FILE_SIZE || size > MAX_TEXT_LEN * 4) size = MAX_TEXT_LEN * 4;

    raw = (char *)HeapAlloc(GetProcessHeap(), 0, size + 1);
    if (raw == NULL) { CloseHandle(file); return; }
    ReadFile(file, raw, size, &read, NULL);
    raw[read] = 0;
    CloseHandle(file);

    skip = (read >= 3 && (unsigned char)raw[0] == 0xEF &&
                         (unsigned char)raw[1] == 0xBB &&
                         (unsigned char)raw[2] == 0xBF) ? 3 : 0;

    wlen = MultiByteToWideChar(CP_UTF8, 0, raw + skip, -1, NULL, 0);
    wide = (wchar_t *)HeapAlloc(GetProcessHeap(), 0, (size_t)wlen * sizeof(wchar_t));
    if (wide) {
        MultiByteToWideChar(CP_UTF8, 0, raw + skip, -1, wide, wlen);
        chunjiin_clear(&g_state);
        for (i = 0; wide[i] != 0; i++) {
            if (wide[i] == L'\r') continue;
            chunjiin_insert_char(&g_state, wide[i]);
        }
        HeapFree(GetProcessHeap(), 0, wide);
    }
    HeapFree(GetProcessHeap(), 0, raw);
    refresh_ui();
}

/* ------------------------------------------------------------------ */
/* 도움말 창                                                           */
/* ------------------------------------------------------------------ */

#define IDC_HELP_TEXT  600
#define IDC_HELP_CLOSE 601

static HWND  g_help_win;
static HWND  g_help_text;
static HWND  g_help_close;
static HFONT g_font_help;

static const wchar_t HELP_TEXT[] =
L"[ 키패드 ]\r\n"
L"\r\n"
L"    ㅣ      ·      ㅡ\r\n"
L"    ㄱㅋ   ㄴㄹ   ㄷㅌ\r\n"
L"    ㅂㅍ   ㅅㅎ   ㅈㅊ\r\n"
L"    . ,    ㅇㅁ   ? !\r\n"
L"\r\n"
L"\r\n"
L"[ 모음 ]\r\n"
L"\r\n"
L"  ㅣ 와 · 와 ㅡ 를 이어서 모든 모음을 만듭니다.\r\n"
L"\r\n"
L"  ㅏ = ㅣ+·        ㅑ = ㅣ+·+·        ㅐ = ㅏ+ㅣ\r\n"
L"  ㅓ = ·+ㅣ        ㅕ = ·+·+ㅣ        ㅔ = ㅓ+ㅣ\r\n"
L"  ㅗ = ·+ㅡ        ㅛ = ·+·+ㅡ        ㅚ = ㅗ+ㅣ\r\n"
L"  ㅜ = ㅡ+·        ㅠ = ㅡ+·+·        ㅟ = ㅜ+ㅣ\r\n"
L"  ㅡ = ㅡ          ㅣ = ㅣ            ㅢ = ㅡ+ㅣ\r\n"
L"  ㅘ = ㅚ+·        ㅙ = ㅘ+ㅣ         ㅝ = ㅠ+ㅣ\r\n"
L"\r\n"
L"\r\n"
L"[ 자음 ]\r\n"
L"\r\n"
L"  같은 키를 연달아 누르면 순환합니다.\r\n"
L"\r\n"
L"  ㄱ → ㅋ → ㄲ      ㄷ → ㅌ → ㄸ      ㅂ → ㅍ → ㅃ\r\n"
L"  ㅅ → ㅎ → ㅆ      ㅈ → ㅊ → ㅉ      ㄴ → ㄹ      ㅇ → ㅁ\r\n"
L"\r\n"
L"  받침 뒤에 모음을 누르면 자동으로 연음됩니다.   간 + ㅏ → 가나\r\n"
L"  겹받침은 자음을 이어 누르면 합쳐집니다.        값 = ㄱ ㅏ ㅂ ㅅ\r\n"
L"  첫 타에 안 붙는 겹받침은 한 번 더 누르면 합쳐집니다.   만 → 만ㅅ → 많\r\n"
L"\r\n"
L"\r\n"
L"[ 같은 키를 연달아 써야 할 때 ]\r\n"
L"\r\n"
L"  \"안녕\" 처럼 ㄴ 을 두 번 눌러야 하면 사이에 오른쪽 화살표 키를 누르거나\r\n"
L"  잠시 기다리세요. 순환이 끊기고 새 글자가 시작됩니다.\r\n"
L"\r\n"
L"\r\n"
L"[ 물리 키보드 ]\r\n"
L"\r\n"
L"  한글 모드에서 숫자열이 키패드에 대응합니다.\r\n"
L"\r\n"
L"    1 2 3  =  ㅣ · ㅡ            7 8 9  =  ㅂㅍ ㅅㅎ ㅈㅊ\r\n"
L"    4 5 6  =  ㄱㅋ ㄴㄹ ㄷㅌ      - 0 =  =  . ,  ㅇㅁ  ? !\r\n"
L"\r\n"
L"  숫자패드 7 8 9 / 4 5 6 / 1 2 3 / 0 도 같은 순서입니다.\r\n"
L"\r\n"
L"    Space  띄어쓰기          Backspace  한 단계 지우기\r\n"
L"    Enter  줄바꿈            Esc        조합 확정\r\n"
L"    ← →    커서 이동         Home End   줄 처음 · 끝\r\n"
L"\r\n"
L"    F1  도움말      F2  입력 모드      F3  테마      F4  설정\r\n"
L"\r\n"
L"    Ctrl+N 새로   Ctrl+O 열기   Ctrl+S 저장\r\n"
L"    Ctrl+C 복사   Ctrl+V 붙여넣기\r\n"
L"\r\n"
L"\r\n"
L"[ 영문 · 숫자 · 기호 ]\r\n"
L"\r\n"
L"  모드 버튼(F2)으로 한글, 영문 abc, 영문 ABC, 숫자, 기호 순으로 바뀝니다.\r\n"
L"  영문·숫자·기호 모드에서는 물리 키보드로 그냥 타이핑해도 됩니다.\r\n"
L"\r\n"
L"    abc  def  ghi        알파벳 26자가 위 3x3 아홉 키에 들어갑니다.\r\n"
L"    jkl  mno  pqr        마지막 줄 세 키는 자주 쓰는 기호입니다.\r\n"
L"    stu  vwx  yz         나머지 기호는 기호 모드에 36개가 있습니다.\r\n"
L"\r\n"
L"\r\n"
L"[ 설정 ]\r\n"
L"\r\n"
L"  설정 > 설정...(F4) 에서 테마, 글꼴 크기, 연타 유지 시간,\r\n"
L"  시작 입력 모드, 툴바 · 상태줄 표시를 바꿀 수 있습니다.\r\n";

static void help_layout(HWND hwnd)
{
    RECT rc;
    const int pad = 12, btn_h = 30;

    GetClientRect(hwnd, &rc);
    MoveWindow(g_help_text, pad, pad,
               rc.right - pad * 2, rc.bottom - btn_h - pad * 3, TRUE);
    MoveWindow(g_help_close, rc.right - pad - 90, rc.bottom - pad - btn_h,
               90, btn_h, TRUE);
}

static LRESULT CALLBACK HelpProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg) {
        case WM_CREATE: {
            HINSTANCE inst = ((LPCREATESTRUCTW)lp)->hInstance;

            g_font_help = make_font(-15, FW_NORMAL, L"맑은 고딕");

            g_help_text = CreateWindowExW(0, L"EDIT", HELP_TEXT,
                WS_CHILD | WS_VISIBLE | WS_VSCROLL |
                ES_MULTILINE | ES_READONLY | ES_AUTOVSCROLL,
                0, 0, 10, 10, hwnd, (HMENU)IDC_HELP_TEXT, inst, NULL);
            SendMessageW(g_help_text, WM_SETFONT, (WPARAM)g_font_help, TRUE);
            SendMessageW(g_help_text, EM_SETMARGINS,
                         EC_LEFTMARGIN | EC_RIGHTMARGIN, MAKELPARAM(12, 12));

            g_help_close = CreateWindowExW(0, L"BUTTON", L"닫기",
                WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_DEFPUSHBUTTON,
                0, 0, 10, 10, hwnd, (HMENU)IDC_HELP_CLOSE, inst, NULL);
            SendMessageW(g_help_close, WM_SETFONT, (WPARAM)g_font_help, TRUE);

            help_layout(hwnd);
            return 0;
        }

        case WM_SIZE:
            help_layout(hwnd);
            return 0;

        case WM_GETMINMAXINFO:
            ((MINMAXINFO *)lp)->ptMinTrackSize.x = 420;
            ((MINMAXINFO *)lp)->ptMinTrackSize.y = 320;
            return 0;

        case WM_COMMAND:
            if (LOWORD(wp) == IDC_HELP_CLOSE) DestroyWindow(hwnd);
            return 0;

        case WM_CTLCOLOREDIT:
            SetTextColor((HDC)wp, TH->text);
            SetBkColor((HDC)wp, TH->card);
            return (LRESULT)g_br_card;

        case WM_ERASEBKGND: {
            RECT rc;
            GetClientRect(hwnd, &rc);
            FillRect((HDC)wp, &rc, g_br_wnd);
            return 1;
        }

        case WM_CLOSE:
            DestroyWindow(hwnd);
            return 0;

        case WM_DESTROY:
            if (g_font_help) { DeleteObject(g_font_help); g_font_help = NULL; }
            g_help_win = NULL;
            SetFocus(g_edit);
            return 0;

        default:
            break;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

static void show_help(void)
{
    HINSTANCE inst = (HINSTANCE)GetWindowLongPtrW(g_main, GWLP_HINSTANCE);
    RECT rc;
    int w = 620, h = 640, x, y;

    if (g_help_win) {
        SetForegroundWindow(g_help_win);
        return;
    }

    GetWindowRect(g_main, &rc);
    x = rc.right + 12;
    y = rc.top;
    if (x + w > GetSystemMetrics(SM_CXSCREEN)) x = rc.left - w - 12;
    if (x < 0) x = 40;

    g_help_win = CreateWindowExW(0, L"ChunjiinHelp",
                                 L"천지인 한글 입력기 - 사용법",
                                 WS_OVERLAPPEDWINDOW,
                                 x, y, w, h, g_main, NULL, inst, NULL);
    if (g_help_win) {
        ShowWindow(g_help_win, SW_SHOW);
        UpdateWindow(g_help_win);
    }
}

static void show_about(void)
{
    wchar_t text[900];

    swprintf(text, 900,
        L"천지인 한글 입력기   1.0\n"
        L"\n"
        L"12키 천지인 자판으로 한글을 조합하는 Windows 프로그램입니다.\n"
        L"\n"
        L"────────────────────────────\n"
        L"\n"
        L"만든이            SHKWON  (knix008@naver.com)\n"
        L"\n"
        L"빌드              %hs  %hs\n"
        L"컴파일러          GCC %d.%d.%d\n"
        L"플랫폼            %ls\n"
        L"조합 엔진         chunjiin.c (원본을 고치지 않고 사용)\n"
        L"\n"
        L"현재 테마         %ls\n"
        L"설정 저장 위치    HKCU\\%ls",
        __DATE__, __TIME__,
        __GNUC__, __GNUC_MINOR__, __GNUC_PATCHLEVEL__,
        (sizeof(void *) == 8) ? L"64비트 Windows" : L"32비트 Windows",
        TH->name, REG_PATH);

    MessageBoxW(g_main, text, L"프로그램 정보", MB_ICONINFORMATION | MB_OK);
}

/* ------------------------------------------------------------------ */
/* 물리 키보드                                                         */
/* ------------------------------------------------------------------ */

/* 한글 모드에서 숫자열을 키패드에 대응시킨다. 없으면 -1. */
static int vk_to_key_hangul(WPARAM vk)
{
    switch (vk) {
        case '1': return 0;  case '2': return 1;  case '3': return 2;
        case '4': return 3;  case '5': return 4;  case '6': return 5;
        case '7': return 6;  case '8': return 7;  case '9': return 8;
        case VK_OEM_MINUS: return 9;
        case '0':          return 10;
        case VK_OEM_PLUS:  return 11;
        default: return -1;
    }
}

/* 숫자패드는 모든 모드에서 키패드로 쓴다. 없으면 -1. */
static int vk_to_key_numpad(WPARAM vk)
{
    switch (vk) {
        case VK_NUMPAD7: return 0;  case VK_NUMPAD8: return 1;  case VK_NUMPAD9: return 2;
        case VK_NUMPAD4: return 3;  case VK_NUMPAD5: return 4;  case VK_NUMPAD6: return 5;
        case VK_NUMPAD1: return 6;  case VK_NUMPAD2: return 7;  case VK_NUMPAD3: return 8;
        case VK_DIVIDE:   return 9;
        case VK_NUMPAD0:  return 10;
        case VK_MULTIPLY: return 11;
        default: return -1;
    }
}

static BOOL handle_keydown(WPARAM vk)
{
    BOOL ctrl = (GetKeyState(VK_CONTROL) & 0x8000) != 0;
    int key;

    if (ctrl) {
        switch (vk) {
            case 'C': do_copy();  return TRUE;
            case 'V': do_paste(); return TRUE;
            case 'S': do_save();  return TRUE;
            case 'O': do_open();  return TRUE;
            case 'N': chunjiin_clear(&g_state); refresh_ui(); return TRUE;
            default:  return FALSE;
        }
    }

    key = vk_to_key_numpad(vk);
    if (key < 0 && g_state.now_mode == MODE_HANGUL) key = vk_to_key_hangul(vk);
    if (key >= 0) { do_key(key); return TRUE; }

    switch (vk) {
        case VK_SPACE:
            chunjiin_space(&g_state); refresh_ui(); return TRUE;
        case VK_BACK:
            chunjiin_backspace(&g_state); refresh_ui(); return TRUE;
        case VK_RETURN:
            chunjiin_insert_char(&g_state, L'\n'); refresh_ui(); return TRUE;
        case VK_LEFT:
            chunjiin_move_cursor(&g_state, -1); refresh_ui(); return TRUE;
        case VK_RIGHT:
            chunjiin_move_cursor(&g_state, 1); refresh_ui(); return TRUE;
        case VK_HOME:
            chunjiin_set_cursor(&g_state, 0); refresh_ui(); return TRUE;
        case VK_END:
            chunjiin_set_cursor(&g_state, (int)wcslen(g_state.text_buffer));
            refresh_ui(); return TRUE;
        case VK_DELETE:
            if (g_state.cursor_pos < (int)wcslen(g_state.text_buffer)) {
                chunjiin_move_cursor(&g_state, 1);
                chunjiin_backspace(&g_state);
                refresh_ui();
            }
            return TRUE;
        case VK_ESCAPE:
            chunjiin_commit(&g_state); refresh_ui(); return TRUE;
        case VK_F2:
            chunjiin_cycle_mode(&g_state); refresh_ui(); return TRUE;
        case VK_F1:
            show_help(); return TRUE;
        case VK_F3:
            g_set.theme = (g_set.theme + 1) % THEME_COUNT;
            settings_save();
            apply_settings();
            return TRUE;
        case VK_F4:
            open_settings(); return TRUE;
        default:
            return FALSE;
    }
}

/* 영문/숫자/기호 모드에서는 키보드로 직접 타이핑한다. */
static BOOL handle_char(WPARAM ch)
{
    if (g_state.now_mode == MODE_HANGUL) return FALSE;
    if (ch < 32 || ch == 127) return FALSE;

    chunjiin_insert_char(&g_state, (wchar_t)ch);
    refresh_ui();
    return TRUE;
}

/* ------------------------------------------------------------------ */
/* 편집 컨트롤 서브클래스                                              */
/* ------------------------------------------------------------------ */

static LRESULT CALLBACK EditProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg) {
        case WM_KEYDOWN:
            if (handle_keydown(wp)) {
                g_swallow_char = TRUE;
                return 0;
            }
            break;

        case WM_CHAR:
            if (g_swallow_char) { g_swallow_char = FALSE; return 0; }
            handle_char(wp);
            return 0;   /* 그 밖의 문자는 무시(경고음 방지) */

        case WM_LBUTTONUP: {
            LRESULT r = CallWindowProcW(g_edit_proc, hwnd, msg, wp, lp);
            DWORD start = 0, end = 0;

            SendMessageW(hwnd, EM_GETSEL, (WPARAM)&start, (LPARAM)&end);
            chunjiin_set_cursor(&g_state,
                                display_to_engine(g_state.text_buffer, (int)start));
            refresh_ui();
            return r;
        }

        case WM_PASTE:
            do_paste();
            return 0;

        case WM_MOUSEWHEEL: {
            LRESULT r = CallWindowProcW(g_edit_proc, hwnd, msg, wp, lp);
            if (g_scroll) InvalidateRect(g_scroll, NULL, TRUE);
            return r;
        }

        default:
            break;
    }
    return CallWindowProcW(g_edit_proc, hwnd, msg, wp, lp);
}

/* ------------------------------------------------------------------ */
/* 버튼: 호버 추적 + 오너 드로                                         */
/* ------------------------------------------------------------------ */

static LRESULT CALLBACK BtnProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg) {
        case WM_MOUSEMOVE:
            if (GetWindowLongPtrW(hwnd, GWLP_USERDATA) == 0) {
                TRACKMOUSEEVENT tme;
                tme.cbSize = sizeof(tme);
                tme.dwFlags = TME_LEAVE;
                tme.hwndTrack = hwnd;
                tme.dwHoverTime = 0;
                TrackMouseEvent(&tme);
                SetWindowLongPtrW(hwnd, GWLP_USERDATA, 1);
                InvalidateRect(hwnd, NULL, TRUE);
            }
            break;

        case WM_MOUSELEAVE:
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
            InvalidateRect(hwnd, NULL, TRUE);
            break;

        default:
            break;
    }
    return CallWindowProcW(g_btn_proc, hwnd, msg, wp, lp);
}

static BOOL is_tool_id(int id)
{
    int i;
    for (i = 0; i < TOOL_COUNT; i++) {
        if (TOOLS[i].id == id) return TRUE;
    }
    return FALSE;
}

static BtnRole role_of(int id)
{
    if (id >= IDC_FN_BASE && id < IDC_FN_BASE + FN_COUNT) {
        return (id == IDC_FN_BASE + FN_MODE) ? ROLE_PRIMARY : ROLE_FN;
    }
    if (id >= IDC_KEY_BASE && id < IDC_KEY_BASE + KEY_COUNT) {
        if (g_state.now_mode != MODE_HANGUL) return ROLE_CONS;
        switch (id - IDC_KEY_BASE) {
            case 0: case 1: case 2:  return ROLE_VOWEL;
            case 9: case 11:         return ROLE_MOD;
            default:                 return ROLE_CONS;
        }
    }
    return ROLE_TOOL;
}

static void draw_button(const DRAWITEMSTRUCT *d)
{
    int id = (int)d->CtlID;
    BtnRole role = role_of(id);
    BOOL tool = is_tool_id(id);
    BOOL down = (d->itemState & ODS_SELECTED) != 0;
    BOOL hot  = GetWindowLongPtrW(d->hwndItem, GWLP_USERDATA) != 0;
    COLORREF fill = TH->role[role][down ? 2 : (hot ? 1 : 0)];
    COLORREF edge = TH->role[role][3];
    HBRUSH brush;
    HPEN pen;
    HGDIOBJ old_brush, old_pen, old_font;
    RECT rc = d->rcItem;
    wchar_t label[64];
    int radius = tool ? TOOL_RADIUS : KEY_RADIUS;

    FillRect(d->hDC, &rc, g_br_wnd);

    /* 툴바 버튼은 눌리거나 가리켰을 때만 배경을 그린다 */
    if (!tool || down || hot) {
        brush = CreateSolidBrush(fill);
        pen   = CreatePen(PS_SOLID, 1, tool ? fill : edge);
        old_brush = SelectObject(d->hDC, brush);
        old_pen   = SelectObject(d->hDC, pen);
        RoundRect(d->hDC, rc.left, rc.top, rc.right - 1, rc.bottom - 1,
                  radius, radius);
        SelectObject(d->hDC, old_brush);
        SelectObject(d->hDC, old_pen);
        DeleteObject(brush);
        DeleteObject(pen);
    }

    GetWindowTextW(d->hwndItem, label, 64);
    {   /* 아이콘 글자는 아이콘 글꼴로, 나머지는 보통 글꼴로 */
        HFONT use = g_font_key;
        if (tool) {
            use = g_font_icon;
        } else if (id >= IDC_FN_BASE && id < IDC_FN_BASE + FN_COUNT) {
            use = FN_ICON[id - IDC_FN_BASE] ? g_font_icon : g_font_ui;
        }
        old_font = SelectObject(d->hDC, use);
    }
    SetBkMode(d->hDC, TRANSPARENT);
    SetTextColor(d->hDC, TH->role[role][4]);
    if (down) OffsetRect(&rc, 0, 1);
    DrawTextW(d->hDC, label, -1, &rc,
              DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
    SelectObject(d->hDC, old_font);
}

/* ------------------------------------------------------------------ */
/* 배치                                                                */
/* ------------------------------------------------------------------ */

static int toolbar_height(void)
{
    return g_set.show_toolbar ? TOOL_BAR_H : 0;
}

static void layout(int width, int height)
{
    const int pad = 10;
    const int gap = 6;
    const int rows = 5;            /* 천지인 4행 + 기능 1행 */
    const int cols = 3;
    int status_h = g_set.show_status ? 22 : 0;
    int bar_h = toolbar_height();
    int pad_h, key_w, key_h, edit_h, y, r, c, i, span, cum, x;

    /* 툴바 */
    x = pad;
    for (i = 0; i < TOOL_COUNT; i++) {
        if (TOOLS[i].gap_before) x += TOOL_SEP;
        if (g_set.show_toolbar) {
            MoveWindow(g_tool[i], x, (TOOL_BAR_H - TOOL_BTN) / 2,
                       TOOL_BTN, TOOL_BTN, TRUE);
        }
        ShowWindow(g_tool[i], g_set.show_toolbar ? SW_SHOW : SW_HIDE);
        x += TOOL_BTN + TOOL_GAP;
    }
    if (g_status) ShowWindow(g_status, g_set.show_status ? SW_SHOW : SW_HIDE);

    pad_h = rows * 50 + (rows - 1) * gap;
    if (pad_h > height * 3 / 5) pad_h = height * 3 / 5;

    edit_h = height - bar_h - pad_h - status_h - pad * 3;
    if (edit_h < 56) edit_h = 56;

    {
        int card_x = pad, card_y = bar_h + pad;
        int card_w = width - pad * 2;

        MoveWindow(g_edit, card_x, card_y, card_w - SCROLL_W, edit_h, TRUE);
        MoveWindow(g_scroll, card_x + card_w - SCROLL_W, card_y,
                   SCROLL_W, edit_h, TRUE);
        SetRect(&g_card_rect, card_x - 1, card_y - 1,
                card_x + card_w + 1, card_y + edit_h + 1);
    }
    if (g_set.show_status) {
        MoveWindow(g_status, pad + 4, bar_h + pad + edit_h + 2,
                   width - pad * 2 - 8, status_h, TRUE);
    }

    key_w = (width - pad * 2 - gap * (cols - 1)) / cols;
    key_h = (pad_h - gap * (rows - 1)) / rows;
    y = bar_h + pad + edit_h + status_h + pad;

    for (r = 0; r < rows - 1; r++) {
        for (c = 0; c < cols; c++) {
            MoveWindow(g_key[r * cols + c],
                       pad + c * (key_w + gap), y + r * (key_h + gap),
                       key_w, key_h, TRUE);
        }
    }

    /* 마지막 줄: 기능 버튼을 비율대로 채운다 */
    span = width - pad * 2 - gap * (FN_COUNT - 1);
    y += (rows - 1) * (key_h + gap);
    cum = 0;
    for (i = 0; i < FN_COUNT; i++) {
        int x0 = pad + gap * i + span * cum / FN_WEIGHT_SUM;
        int x1 = pad + gap * i + span * (cum + FN_WEIGHT[i]) / FN_WEIGHT_SUM;
        MoveWindow(g_fn[i], x0, y, x1 - x0, key_h, TRUE);
        cum += FN_WEIGHT[i];
    }
}

static void relayout(void)
{
    RECT rc;
    GetClientRect(g_main, &rc);
    layout(rc.right, rc.bottom);
}

/* ------------------------------------------------------------------ */
/* 테마 적용                                                           */
/* ------------------------------------------------------------------ */

static HFONT make_font(int height, int weight, const wchar_t *face)
{
    return CreateFontW(height, 0, 0, 0, weight, FALSE, FALSE, FALSE,
                       DEFAULT_CHARSET, OUT_TT_PRECIS, CLIP_DEFAULT_PRECIS,
                       CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, face);
}

static void apply_settings(void)
{
    HFONT old_text = g_font_text;
    HBRUSH old_wnd = g_br_wnd, old_card = g_br_card;
    BOOL dark = TH->dark;
    HMENU menu;
    int i;

    g_font_text = make_font(-g_set.font_size, FW_NORMAL, L"맑은 고딕");
    SendMessageW(g_edit, WM_SETFONT, (WPARAM)g_font_text, TRUE);
    if (old_text) DeleteObject(old_text);

    {   /* 스크롤바가 필요한지 판단하려면 줄 높이를 알아야 한다 */
        HDC dc = GetDC(g_edit);
        HGDIOBJ old = SelectObject(dc, g_font_text);
        TEXTMETRICW tm;

        GetTextMetricsW(dc, &tm);
        g_line_height = tm.tmHeight + tm.tmExternalLeading;
        SelectObject(dc, old);
        ReleaseDC(g_edit, dc);
    }

    g_br_wnd  = CreateSolidBrush(TH->wnd);
    g_br_card = CreateSolidBrush(TH->card);
    if (old_wnd)  DeleteObject(old_wnd);
    if (old_card) DeleteObject(old_card);

    /* 제목 표시줄도 테마에 맞춘다 (Windows 10 1809 이상) */
    DwmSetWindowAttribute(g_main, DWMWA_USE_IMMERSIVE_DARK_MODE,
                          &dark, sizeof(dark));

    menu = GetMenu(g_main);
    if (menu) {
        CheckMenuRadioItem(menu, IDM_THEME_BASE, IDM_THEME_BASE + THEME_COUNT - 1,
                           IDM_THEME_BASE + g_set.theme, MF_BYCOMMAND);
        CheckMenuItem(menu, IDM_VIEW_TOOLBAR,
                      MF_BYCOMMAND | (g_set.show_toolbar ? MF_CHECKED : MF_UNCHECKED));
        CheckMenuItem(menu, IDM_VIEW_STATUS,
                      MF_BYCOMMAND | (g_set.show_status ? MF_CHECKED : MF_UNCHECKED));
    }

    apply_menu_theme();

    relayout();
    InvalidateRect(g_main, NULL, TRUE);
    for (i = 0; i < KEY_COUNT; i++) InvalidateRect(g_key[i], NULL, TRUE);
    for (i = 0; i < FN_COUNT; i++)  InvalidateRect(g_fn[i], NULL, TRUE);
    for (i = 0; i < TOOL_COUNT; i++) InvalidateRect(g_tool[i], NULL, TRUE);
    if (g_status) InvalidateRect(g_status, NULL, TRUE);
    if (g_scroll)   InvalidateRect(g_scroll, NULL, TRUE);
    if (g_help_win) InvalidateRect(g_help_win, NULL, TRUE);
    UpdateWindow(g_main);
}

/* ------------------------------------------------------------------ */
/* 설정 창                                                             */
/* ------------------------------------------------------------------ */

static const int FONT_CHOICES[] = { 16, 18, 21, 24, 28, 32 };
#define FONT_CHOICE_COUNT ((int)(sizeof(FONT_CHOICES) / sizeof(FONT_CHOICES[0])))

static const int TAP_CHOICES[] = { 400, 600, 800, 1000, 1500, 2000 };
#define TAP_CHOICE_COUNT ((int)(sizeof(TAP_CHOICES) / sizeof(TAP_CHOICES[0])))

static Settings g_set_backup;

static int index_of(const int *list, int count, int value)
{
    int i;
    for (i = 0; i < count; i++) {
        if (list[i] == value) return i;
    }
    return 0;
}

static void settings_to_controls(HWND dlg)
{
    SendDlgItemMessageW(dlg, IDC_SET_THEME, CB_SETCURSEL, g_set.theme, 0);
    SendDlgItemMessageW(dlg, IDC_SET_FONT, CB_SETCURSEL,
        index_of(FONT_CHOICES, FONT_CHOICE_COUNT, g_set.font_size), 0);
    SendDlgItemMessageW(dlg, IDC_SET_TAP, CB_SETCURSEL,
        index_of(TAP_CHOICES, TAP_CHOICE_COUNT, g_set.multitap_ms), 0);
    SendDlgItemMessageW(dlg, IDC_SET_MODE, CB_SETCURSEL, g_set.start_mode, 0);
    CheckDlgButton(dlg, IDC_SET_TOOLBAR, g_set.show_toolbar ? BST_CHECKED : BST_UNCHECKED);
    CheckDlgButton(dlg, IDC_SET_STATUS,  g_set.show_status  ? BST_CHECKED : BST_UNCHECKED);
}

static void controls_to_settings(HWND dlg)
{
    int i;

    i = (int)SendDlgItemMessageW(dlg, IDC_SET_THEME, CB_GETCURSEL, 0, 0);
    if (i >= 0) g_set.theme = i;

    i = (int)SendDlgItemMessageW(dlg, IDC_SET_FONT, CB_GETCURSEL, 0, 0);
    if (i >= 0) g_set.font_size = FONT_CHOICES[i];

    i = (int)SendDlgItemMessageW(dlg, IDC_SET_TAP, CB_GETCURSEL, 0, 0);
    if (i >= 0) g_set.multitap_ms = TAP_CHOICES[i];

    i = (int)SendDlgItemMessageW(dlg, IDC_SET_MODE, CB_GETCURSEL, 0, 0);
    if (i >= 0) g_set.start_mode = i;

    g_set.show_toolbar = (IsDlgButtonChecked(dlg, IDC_SET_TOOLBAR) == BST_CHECKED);
    g_set.show_status  = (IsDlgButtonChecked(dlg, IDC_SET_STATUS)  == BST_CHECKED);
}

static HWND set_label(HWND parent, HINSTANCE inst, const wchar_t *text,
                      int x, int y, int w, int h)
{
    HWND s = CreateWindowExW(0, L"STATIC", text, WS_CHILD | WS_VISIBLE,
                             x, y, w, h, parent, NULL, inst, NULL);
    SendMessageW(s, WM_SETFONT, (WPARAM)g_font_ui, TRUE);
    return s;
}

static HWND set_combo(HWND parent, HINSTANCE inst, int id, int x, int y, int w)
{
    HWND c = CreateWindowExW(0, L"COMBOBOX", L"",
                             WS_CHILD | WS_VISIBLE | WS_TABSTOP | WS_VSCROLL |
                             CBS_DROPDOWNLIST,
                             x, y, w, 200, parent, (HMENU)(UINT_PTR)id, inst, NULL);
    SendMessageW(c, WM_SETFONT, (WPARAM)g_font_ui, TRUE);
    return c;
}

static LRESULT CALLBACK SettingsProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg) {
        case WM_CREATE: {
            HINSTANCE inst = ((LPCREATESTRUCTW)lp)->hInstance;
            HWND h;
            wchar_t buf[64];
            int i, y = 16;

            set_label(hwnd, inst, L"테마", 20, y + 4, 110, 20);
            h = set_combo(hwnd, inst, IDC_SET_THEME, 140, y, 190);
            for (i = 0; i < THEME_COUNT; i++) {
                SendMessageW(h, CB_ADDSTRING, 0, (LPARAM)THEMES[i].name);
            }
            y += 38;

            set_label(hwnd, inst, L"글꼴 크기", 20, y + 4, 110, 20);
            h = set_combo(hwnd, inst, IDC_SET_FONT, 140, y, 190);
            for (i = 0; i < FONT_CHOICE_COUNT; i++) {
                swprintf(buf, 64, L"%d px%ls", FONT_CHOICES[i],
                         FONT_CHOICES[i] == DEFAULTS.font_size ? L"  (기본)" : L"");
                SendMessageW(h, CB_ADDSTRING, 0, (LPARAM)buf);
            }
            y += 38;

            set_label(hwnd, inst, L"연타 유지 시간", 20, y + 4, 110, 20);
            h = set_combo(hwnd, inst, IDC_SET_TAP, 140, y, 190);
            for (i = 0; i < TAP_CHOICE_COUNT; i++) {
                swprintf(buf, 64, L"%.1f 초%ls", TAP_CHOICES[i] / 1000.0,
                         TAP_CHOICES[i] == DEFAULTS.multitap_ms ? L"  (기본)" : L"");
                SendMessageW(h, CB_ADDSTRING, 0, (LPARAM)buf);
            }
            y += 38;

            set_label(hwnd, inst, L"시작 입력 모드", 20, y + 4, 110, 20);
            h = set_combo(hwnd, inst, IDC_SET_MODE, 140, y, 190);
            {
                ChunjiinState probe = g_state;
                for (i = 0; i < MODE_COUNT; i++) {
                    probe.now_mode = (InputMode)i;
                    SendMessageW(h, CB_ADDSTRING, 0,
                                 (LPARAM)chunjiin_mode_name(&probe));
                }
            }
            y += 44;

            h = CreateWindowExW(0, L"BUTTON", L"툴바 보이기",
                                WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_AUTOCHECKBOX,
                                140, y, 190, 24, hwnd,
                                (HMENU)IDC_SET_TOOLBAR, inst, NULL);
            SendMessageW(h, WM_SETFONT, (WPARAM)g_font_ui, TRUE);
            y += 28;

            h = CreateWindowExW(0, L"BUTTON", L"상태줄 보이기",
                                WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_AUTOCHECKBOX,
                                140, y, 190, 24, hwnd,
                                (HMENU)IDC_SET_STATUS, inst, NULL);
            SendMessageW(h, WM_SETFONT, (WPARAM)g_font_ui, TRUE);
            y += 42;

            h = CreateWindowExW(0, L"BUTTON", L"기본값",
                                WS_CHILD | WS_VISIBLE | WS_TABSTOP,
                                20, y, 90, 30, hwnd,
                                (HMENU)IDC_SET_DEFAULT, inst, NULL);
            SendMessageW(h, WM_SETFONT, (WPARAM)g_font_ui, TRUE);

            h = CreateWindowExW(0, L"BUTTON", L"확인",
                                WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_DEFPUSHBUTTON,
                                150, y, 88, 30, hwnd,
                                (HMENU)IDC_SET_OK, inst, NULL);
            SendMessageW(h, WM_SETFONT, (WPARAM)g_font_ui, TRUE);

            h = CreateWindowExW(0, L"BUTTON", L"취소",
                                WS_CHILD | WS_VISIBLE | WS_TABSTOP,
                                244, y, 88, 30, hwnd,
                                (HMENU)IDC_SET_CANCEL, inst, NULL);
            SendMessageW(h, WM_SETFONT, (WPARAM)g_font_ui, TRUE);

            settings_to_controls(hwnd);
            return 0;
        }

        case WM_COMMAND:
            switch (LOWORD(wp)) {
                case IDC_SET_THEME:
                case IDC_SET_FONT:
                case IDC_SET_TAP:
                    if (HIWORD(wp) != CBN_SELCHANGE) break;
                    controls_to_settings(hwnd);
                    apply_settings();       /* 고르는 즉시 미리 보인다 */
                    break;

                case IDC_SET_TOOLBAR:
                case IDC_SET_STATUS:
                    controls_to_settings(hwnd);
                    apply_settings();
                    break;

                case IDC_SET_DEFAULT:
                    g_set = DEFAULTS;
                    settings_to_controls(hwnd);
                    apply_settings();
                    break;

                case IDC_SET_OK:
                    controls_to_settings(hwnd);
                    settings_save();
                    apply_settings();
                    DestroyWindow(hwnd);
                    break;

                case IDC_SET_CANCEL:
                    g_set = g_set_backup;   /* 미리 보기를 되돌린다 */
                    apply_settings();
                    DestroyWindow(hwnd);
                    break;

                default:
                    break;
            }
            return 0;

        case WM_CTLCOLORSTATIC:
        case WM_CTLCOLORBTN:
            SetBkMode((HDC)wp, TRANSPARENT);
            return (LRESULT)GetSysColorBrush(COLOR_WINDOW);

        case WM_CLOSE:
            g_set = g_set_backup;
            apply_settings();
            DestroyWindow(hwnd);
            return 0;

        case WM_DESTROY:
            g_settings_win = NULL;
            EnableWindow(g_main, TRUE);
            SetForegroundWindow(g_main);
            SetFocus(g_edit);
            return 0;

        default:
            break;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

static void open_settings(void)
{
    HINSTANCE inst = (HINSTANCE)GetWindowLongPtrW(g_main, GWLP_HINSTANCE);
    RECT rc;
    int w = 360, h = 350, x, y;

    if (g_settings_win) {
        SetForegroundWindow(g_settings_win);
        return;
    }
    g_set_backup = g_set;

    GetWindowRect(g_main, &rc);
    x = rc.left + ((rc.right - rc.left) - w) / 2;
    y = rc.top + 60;

    g_settings_win = CreateWindowExW(
        WS_EX_DLGMODALFRAME, L"ChunjiinSettings", L"설정",
        WS_POPUP | WS_CAPTION | WS_SYSMENU | WS_VISIBLE,
        x, y, w, h, g_main, NULL, inst, NULL);

    if (g_settings_win == NULL) return;
    EnableWindow(g_main, FALSE);
}

/* ------------------------------------------------------------------ */
/* 생성                                                                */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 메뉴도 테마를 따르게 한다 (오너 드로)                               */
/* ------------------------------------------------------------------ */

#define MAX_MENU_ITEMS 48

typedef struct {
    wchar_t text[64];
    BOOL    top;        /* 메뉴 바에 놓인 항목인가 */
} MenuItemData;

static MenuItemData g_menu_items[MAX_MENU_ITEMS];
static int g_menu_item_count;

/* "저장(&S)...\tCtrl+S" 를 이름과 단축키로 나눈다. */
static void split_menu_text(const wchar_t *src, wchar_t *label, wchar_t *accel)
{
    const wchar_t *tab = wcschr(src, L'\t');

    accel[0] = 0;
    if (tab == NULL) {
        wcsncpy(label, src, 63);
        label[63] = 0;
        return;
    }
    {
        size_t n = (size_t)(tab - src);
        if (n > 63) n = 63;
        wmemcpy(label, src, n);
        label[n] = 0;
        wcsncpy(accel, tab + 1, 31);
        accel[31] = 0;
    }
}

/* 메뉴 전체를 오너 드로로 바꾸고, 항목 문자열을 따로 보관한다. */
static void ownerdraw_menu(HMENU menu, BOOL top)
{
    int n = GetMenuItemCount(menu);
    int i;

    for (i = 0; i < n; i++) {
        MENUITEMINFOW mi;
        wchar_t buf[64];
        MenuItemData *d;
        BOOL separator;

        ZeroMemory(&mi, sizeof(mi));
        mi.cbSize = sizeof(mi);
        mi.fMask = MIIM_STRING | MIIM_SUBMENU | MIIM_FTYPE | MIIM_STATE;
        mi.dwTypeData = buf;
        mi.cch = 63;
        buf[0] = 0;
        if (!GetMenuItemInfoW(menu, i, TRUE, &mi)) continue;

        if (mi.hSubMenu) ownerdraw_menu(mi.hSubMenu, FALSE);
        if (g_menu_item_count >= MAX_MENU_ITEMS) continue;

        separator = (mi.fType & MFT_SEPARATOR) != 0;

        d = &g_menu_items[g_menu_item_count++];
        d->top = top;
        if (separator) {
            d->text[0] = 0;
        } else {
            wcsncpy(d->text, buf, 63);
            d->text[63] = 0;
        }

        ZeroMemory(&mi, sizeof(mi));
        mi.cbSize = sizeof(mi);
        mi.fMask = MIIM_FTYPE | MIIM_DATA | MIIM_STATE;
        mi.fType = MFT_OWNERDRAW;          /* 구분선도 직접 그린다 */
        mi.fState = separator ? MFS_DISABLED : MFS_ENABLED;
        mi.dwItemData = (ULONG_PTR)d;
        SetMenuItemInfoW(menu, i, TRUE, &mi);
    }
}

static void measure_menu_item(MEASUREITEMSTRUCT *m)
{
    const MenuItemData *d = (const MenuItemData *)m->itemData;
    HDC dc = GetDC(g_main);
    HGDIOBJ old = SelectObject(dc, g_font_ui);
    wchar_t label[64], accel[32];
    RECT rc = { 0, 0, 0, 0 };

    if (d == NULL || d->text[0] == 0) {
        m->itemWidth = 8;
        m->itemHeight = 7;
        SelectObject(dc, old);
        ReleaseDC(g_main, dc);
        return;
    }

    split_menu_text(d->text, label, accel);
    DrawTextW(dc, label, -1, &rc, DT_CALCRECT | DT_SINGLELINE);

    if (d->top) {
        m->itemWidth  = (UINT)(rc.right + 10);
        m->itemHeight = (UINT)GetSystemMetrics(SM_CYMENU);
    } else {
        RECT ar = { 0, 0, 0, 0 };
        if (accel[0]) {
            DrawTextW(dc, accel, -1, &ar, DT_CALCRECT | DT_SINGLELINE | DT_NOPREFIX);
        }
        m->itemWidth  = (UINT)(28 + rc.right + (accel[0] ? ar.right + 28 : 0) + 18);
        m->itemHeight = 26;
    }
    SelectObject(dc, old);
    ReleaseDC(g_main, dc);
}

static void draw_menu_item(const DRAWITEMSTRUCT *d)
{
    const MenuItemData *item = (const MenuItemData *)d->itemData;
    RECT rc = d->rcItem;
    BOOL sel = (d->itemState & (ODS_SELECTED | ODS_HOTLIGHT)) != 0;
    BOOL dis = (d->itemState & (ODS_DISABLED | ODS_GRAYED)) != 0;
    BOOL chk = (d->itemState & ODS_CHECKED) != 0;
    /* 니모닉 밑줄은 그리지 않는다. "파일(F)" 처럼 글자만 보이면 충분하다. */
    UINT fmt = DT_SINGLELINE | DT_VCENTER | DT_HIDEPREFIX;
    wchar_t label[64], accel[32];
    HGDIOBJ old_font;
    COLORREF fg;

    if (item == NULL) return;

    if (item->text[0] == 0) {                       /* 구분선 */
        HPEN pen = CreatePen(PS_SOLID, 1, TH->border);
        HGDIOBJ op;
        int y = (rc.top + rc.bottom) / 2;

        FillRect(d->hDC, &rc, g_br_menu);
        op = SelectObject(d->hDC, pen);
        MoveToEx(d->hDC, rc.left + 10, y, NULL);
        LineTo(d->hDC, rc.right - 10, y);
        SelectObject(d->hDC, op);
        DeleteObject(pen);
        return;
    }

    if (sel && !dis) {
        HBRUSH bg = CreateSolidBrush(TH->role[ROLE_PRIMARY][0]);
        FillRect(d->hDC, &rc, bg);
        DeleteObject(bg);
        fg = TH->role[ROLE_PRIMARY][4];
    } else {
        FillRect(d->hDC, &rc, g_br_menu);
        fg = dis ? TH->muted : TH->text;
    }

    split_menu_text(item->text, label, accel);
    old_font = SelectObject(d->hDC, g_font_ui);
    SetBkMode(d->hDC, TRANSPARENT);
    SetTextColor(d->hDC, fg);

    if (item->top) {
        DrawTextW(d->hDC, label, -1, &rc, fmt | DT_CENTER);
    } else {
        RECT tr = rc;

        if (chk) {
            RECT cr = rc;
            cr.right = cr.left + 26;
            DrawTextW(d->hDC, L"\x2713", -1, &cr,
                      DT_SINGLELINE | DT_VCENTER | DT_CENTER | DT_NOPREFIX);
        }
        tr.left += 28;
        DrawTextW(d->hDC, label, -1, &tr, fmt | DT_LEFT);

        if (accel[0]) {
            RECT ar = rc;
            ar.right -= 16;
            if (!sel) SetTextColor(d->hDC, TH->muted);
            DrawTextW(d->hDC, accel, -1, &ar,
                      DT_SINGLELINE | DT_VCENTER | DT_RIGHT | DT_NOPREFIX);
        }
    }
    SelectObject(d->hDC, old_font);
}

/* 메뉴 배경 브러시를 지금 테마 색으로 바꾼다. */
static void apply_menu_theme(void)
{
    HMENU menu = GetMenu(g_main);
    HBRUSH old = g_br_menu;
    MENUINFO mi;

    g_br_menu = CreateSolidBrush(TH->wnd);
    if (menu) {
        ZeroMemory(&mi, sizeof(mi));
        mi.cbSize = sizeof(mi);
        mi.fMask = MIM_BACKGROUND | MIM_APPLYTOSUBMENUS;
        mi.hbrBack = g_br_menu;
        SetMenuInfo(menu, &mi);
    }
    if (old) DeleteObject(old);
    DrawMenuBar(g_main);
}

static void build_menu(HWND hwnd)
{
    HMENU bar   = CreateMenu();
    HMENU file  = CreatePopupMenu();
    HMENU edit  = CreatePopupMenu();
    HMENU mode  = CreatePopupMenu();
    HMENU conf  = CreatePopupMenu();
    HMENU theme = CreatePopupMenu();
    HMENU help  = CreatePopupMenu();
    int i;
    static const wchar_t *const MODE_NAMES[MODE_COUNT] = {
        L"한글(&K)", L"영문 소문자(&L)", L"영문 대문자(&U)",
        L"숫자(&N)", L"기호(&S)"
    };

    AppendMenuW(file, MF_STRING, IDM_NEW,  L"새로 만들기(&N)\tCtrl+N");
    AppendMenuW(file, MF_STRING, IDM_OPEN, L"열기(&O)...\tCtrl+O");
    AppendMenuW(file, MF_STRING, IDM_SAVE, L"저장(&S)...\tCtrl+S");
    AppendMenuW(file, MF_SEPARATOR, 0, NULL);
    AppendMenuW(file, MF_STRING, IDM_EXIT, L"끝내기(&X)");

    AppendMenuW(edit, MF_STRING, IDM_COPY,  L"복사(&C)\tCtrl+C");
    AppendMenuW(edit, MF_STRING, IDM_PASTE, L"붙여넣기(&V)\tCtrl+V");
    AppendMenuW(edit, MF_SEPARATOR, 0, NULL);
    AppendMenuW(edit, MF_STRING, IDM_CLEAR, L"전체 지우기(&D)");

    for (i = 0; i < MODE_COUNT; i++) {
        AppendMenuW(mode, MF_STRING, IDM_MODE_BASE + i, MODE_NAMES[i]);
    }
    AppendMenuW(mode, MF_SEPARATOR, 0, NULL);
    AppendMenuW(mode, MF_STRING, IDM_CYCLE_MODE, L"다음 모드(&X)\tF2");

    for (i = 0; i < THEME_COUNT; i++) {
        AppendMenuW(theme, MF_STRING, IDM_THEME_BASE + i, THEMES[i].name);
    }
    AppendMenuW(theme, MF_SEPARATOR, 0, NULL);
    AppendMenuW(theme, MF_STRING, IDM_CYCLE_THEME, L"다음 테마(&X)	F3");
    AppendMenuW(conf, MF_POPUP, (UINT_PTR)theme, L"테마(&T)");
    AppendMenuW(conf, MF_SEPARATOR, 0, NULL);
    AppendMenuW(conf, MF_STRING, IDM_VIEW_TOOLBAR, L"툴바 보이기(&B)");
    AppendMenuW(conf, MF_STRING, IDM_VIEW_STATUS,  L"상태줄 보이기(&L)");
    AppendMenuW(conf, MF_SEPARATOR, 0, NULL);
    AppendMenuW(conf, MF_STRING, IDM_SETTINGS, L"설정(&P)...\tF4");

    AppendMenuW(help, MF_STRING, IDM_HELP,  L"사용법(&H)\tF1");
    AppendMenuW(help, MF_STRING, IDM_ABOUT, L"정보(&A)");

    AppendMenuW(bar, MF_POPUP, (UINT_PTR)file, L"파일(&F)");
    AppendMenuW(bar, MF_POPUP, (UINT_PTR)edit, L"편집(&E)");
    AppendMenuW(bar, MF_POPUP, (UINT_PTR)mode, L"입력(&M)");
    AppendMenuW(bar, MF_POPUP, (UINT_PTR)conf, L"설정(&S)");
    AppendMenuW(bar, MF_POPUP, (UINT_PTR)help, L"도움말(&H)");

    SetMenu(hwnd, bar);

    g_menu_item_count = 0;
    ownerdraw_menu(bar, TRUE);
}

static HWND make_button(HWND parent, HINSTANCE inst, int id, const wchar_t *label)
{
    HWND h = CreateWindowExW(0, L"BUTTON", label,
                             WS_CHILD | WS_VISIBLE | BS_OWNERDRAW,
                             0, 0, 10, 10, parent,
                             (HMENU)(UINT_PTR)id, inst, NULL);
    g_btn_proc = (WNDPROC)SetWindowLongPtrW(h, GWLP_WNDPROC, (LONG_PTR)BtnProc);
    return h;
}

static void add_tip(HWND owner, const wchar_t *text)
{
    TOOLINFOW ti;

    if (g_tip == NULL) return;
    ZeroMemory(&ti, sizeof(ti));
    ti.cbSize = sizeof(ti);
    ti.uFlags = TTF_IDISHWND | TTF_SUBCLASS;
    ti.hwnd = g_main;
    ti.uId = (UINT_PTR)owner;
    ti.lpszText = (LPWSTR)text;
    SendMessageW(g_tip, TTM_ADDTOOLW, 0, (LPARAM)&ti);
}

static void create_children(HWND hwnd)
{
    HINSTANCE inst = (HINSTANCE)GetWindowLongPtrW(hwnd, GWLP_HINSTANCE);
    int i;

    g_font_key  = make_font(-20, FW_SEMIBOLD, L"맑은 고딕");
    g_font_ui   = make_font(-14, FW_NORMAL,   L"맑은 고딕");
    g_font_icon = make_font(-16, FW_NORMAL,   L"Segoe MDL2 Assets");
    g_font_text = make_font(-g_set.font_size, FW_NORMAL, L"맑은 고딕");
    g_br_wnd    = CreateSolidBrush(TH->wnd);
    g_br_card   = CreateSolidBrush(TH->card);

    g_tip = CreateWindowExW(WS_EX_TOPMOST, TOOLTIPS_CLASSW, NULL,
                            WS_POPUP | TTS_ALWAYSTIP | TTS_NOPREFIX,
                            CW_USEDEFAULT, CW_USEDEFAULT,
                            CW_USEDEFAULT, CW_USEDEFAULT,
                            hwnd, NULL, inst, NULL);
    if (g_tip) {
        SendMessageW(g_tip, TTM_SETMAXTIPWIDTH, 0, 300);
        SendMessageW(g_tip, TTM_SETDELAYTIME, TTDT_INITIAL, MAKELPARAM(400, 0));
    }

    for (i = 0; i < TOOL_COUNT; i++) {
        g_tool[i] = make_button(hwnd, inst, TOOLS[i].id, TOOLS[i].glyph);
        add_tip(g_tool[i], TOOLS[i].tip);
    }

    g_edit = CreateWindowExW(0, L"EDIT", L"",
                             /* 스크롤바는 테마에 맞춰 직접 그린다 (ScrollProc) */
                             WS_CHILD | WS_VISIBLE |
                             ES_MULTILINE | ES_AUTOVSCROLL | ES_READONLY | ES_NOHIDESEL,
                             0, 0, 10, 10, hwnd, (HMENU)IDC_EDIT, inst, NULL);
    SendMessageW(g_edit, WM_SETFONT, (WPARAM)g_font_text, TRUE);
    SendMessageW(g_edit, EM_SETMARGINS, EC_LEFTMARGIN | EC_RIGHTMARGIN,
                 MAKELPARAM(10, 10));
    g_edit_proc = (WNDPROC)SetWindowLongPtrW(g_edit, GWLP_WNDPROC, (LONG_PTR)EditProc);

    g_scroll = CreateWindowExW(0, L"ChunjiinScroll", L"",
                               WS_CHILD, 0, 0, 10, 10, hwnd, NULL, inst, NULL);

    g_status = CreateWindowExW(0, L"STATIC", L"",
                               WS_CHILD | WS_VISIBLE | SS_LEFTNOWORDWRAP | SS_CENTERIMAGE,
                               0, 0, 10, 10, hwnd, (HMENU)IDC_STATUS, inst, NULL);
    SendMessageW(g_status, WM_SETFONT, (WPARAM)g_font_ui, TRUE);

    for (i = 0; i < KEY_COUNT; i++) {
        g_key[i] = make_button(hwnd, inst, IDC_KEY_BASE + i,
                               chunjiin_key_label(&g_state, i));
    }
    for (i = 0; i < FN_COUNT; i++) {
        g_fn[i] = make_button(hwnd, inst, IDC_FN_BASE + i, FN_LABELS[i]);
        add_tip(g_fn[i], FN_TIPS[i]);
    }
}

/* ------------------------------------------------------------------ */
/* 메인 윈도우 프로시저                                                */
/* ------------------------------------------------------------------ */

static void on_command(WPARAM wp)
{
    int id = LOWORD(wp);

    if (id >= IDC_KEY_BASE && id < IDC_KEY_BASE + KEY_COUNT) {
        do_key(id - IDC_KEY_BASE);
        SetFocus(g_edit);
        return;
    }
    if (id >= IDC_FN_BASE && id < IDC_FN_BASE + FN_COUNT) {
        switch (id - IDC_FN_BASE) {
            case FN_MODE:  chunjiin_cycle_mode(&g_state); break;
            case FN_LEFT:  chunjiin_move_cursor(&g_state, -1); break;
            case FN_SPACE: chunjiin_space(&g_state); break;
            case FN_RIGHT: chunjiin_move_cursor(&g_state, 1); break;
            case FN_ENTER: chunjiin_insert_char(&g_state, L'\n'); break;
            case FN_BS:    chunjiin_backspace(&g_state); break;
            default: break;
        }
        refresh_ui();
        SetFocus(g_edit);
        return;
    }
    if (id >= IDM_MODE_BASE && id < IDM_MODE_BASE + MODE_COUNT) {
        chunjiin_set_mode(&g_state, (InputMode)(id - IDM_MODE_BASE));
        refresh_ui();
        SetFocus(g_edit);
        return;
    }
    if (id >= IDM_THEME_BASE && id < IDM_THEME_BASE + THEME_COUNT) {
        g_set.theme = id - IDM_THEME_BASE;
        settings_save();
        apply_settings();
        SetFocus(g_edit);
        return;
    }

    switch (id) {
        case IDM_NEW:
        case IDM_CLEAR:    chunjiin_clear(&g_state); refresh_ui(); break;
        case IDM_OPEN:     do_open(); break;
        case IDM_SAVE:     do_save(); break;
        case IDM_COPY:     do_copy(); break;
        case IDM_PASTE:    do_paste(); break;
        case IDM_CYCLE_MODE: chunjiin_cycle_mode(&g_state); refresh_ui(); break;
        case IDM_CYCLE_THEME:
            g_set.theme = (g_set.theme + 1) % THEME_COUNT;
            settings_save();
            apply_settings();
            break;
        case IDM_EXIT:     PostMessageW(g_main, WM_CLOSE, 0, 0); break;
        case IDM_HELP:     show_help(); break;
        case IDM_ABOUT:    show_about(); break;
        case IDM_SETTINGS: open_settings(); return;   /* 포커스는 설정 창으로 */
        case IDM_VIEW_TOOLBAR:
            g_set.show_toolbar = !g_set.show_toolbar;
            settings_save();
            apply_settings();
            break;
        case IDM_VIEW_STATUS:
            g_set.show_status = !g_set.show_status;
            settings_save();
            apply_settings();
            break;
        default:
            return;
    }
    SetFocus(g_edit);
}

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg) {
        case WM_CREATE:
            g_main = hwnd;
            chunjiin_reset(&g_state);
            chunjiin_set_mode(&g_state, (InputMode)g_set.start_mode);
            build_menu(hwnd);
            create_children(hwnd);
            apply_settings();
            refresh_ui();
            return 0;

        case WM_SIZE:
            layout(LOWORD(lp), HIWORD(lp));
            return 0;

        case WM_ERASEBKGND: {
            RECT rc;
            GetClientRect(hwnd, &rc);
            FillRect((HDC)wp, &rc, g_br_wnd);
            return 1;
        }

        case WM_PAINT: {
            PAINTSTRUCT ps;
            HDC dc = BeginPaint(hwnd, &ps);
            RECT rc;
            HPEN pen = CreatePen(PS_SOLID, 1, TH->border);
            HGDIOBJ ob, op;
            int i, x;

            /* 툴바 구분선 */
            if (g_set.show_toolbar) {
                op = SelectObject(dc, pen);
                x = 10;
                for (i = 0; i < TOOL_COUNT; i++) {
                    if (TOOLS[i].gap_before) {
                        int cx = x + TOOL_SEP / 2;
                        MoveToEx(dc, cx, 9, NULL);
                        LineTo(dc, cx, TOOL_BAR_H - 9);
                        x += TOOL_SEP;
                    }
                    x += TOOL_BTN + TOOL_GAP;
                }
                MoveToEx(dc, 0, TOOL_BAR_H - 1, NULL);
                LineTo(dc, ps.rcPaint.right, TOOL_BAR_H - 1);
                SelectObject(dc, op);
            }

            /* 편집 영역 + 스크롤바를 감싸는 카드 테두리 */
            rc = g_card_rect;
            ob = SelectObject(dc, GetStockObject(NULL_BRUSH));
            op = SelectObject(dc, pen);
            RoundRect(dc, rc.left, rc.top, rc.right, rc.bottom,
                      CARD_RADIUS, CARD_RADIUS);
            SelectObject(dc, ob);
            SelectObject(dc, op);
            DeleteObject(pen);

            EndPaint(hwnd, &ps);
            return 0;
        }

        case WM_GETMINMAXINFO:
            ((MINMAXINFO *)lp)->ptMinTrackSize.x = 430;
            ((MINMAXINFO *)lp)->ptMinTrackSize.y = 500;
            return 0;

        case WM_SETFOCUS:
            SetFocus(g_edit);
            return 0;

        case WM_COMMAND:
            on_command(wp);
            return 0;

        case WM_MEASUREITEM:
            if (((MEASUREITEMSTRUCT *)lp)->CtlType == ODT_MENU) {
                measure_menu_item((MEASUREITEMSTRUCT *)lp);
                return TRUE;
            }
            break;

        case WM_DRAWITEM:
            if (((const DRAWITEMSTRUCT *)lp)->CtlType == ODT_MENU) {
                draw_menu_item((const DRAWITEMSTRUCT *)lp);
            } else {
                draw_button((const DRAWITEMSTRUCT *)lp);
            }
            return TRUE;

        case WM_TIMER:
            if (wp == TIMER_MULTITAP) {
                KillTimer(hwnd, TIMER_MULTITAP);
                chunjiin_break_multitap(&g_state);
                update_status();
            }
            return 0;

        case WM_CTLCOLOREDIT:
            SetTextColor((HDC)wp, TH->text);
            SetBkColor((HDC)wp, TH->card);
            return (LRESULT)g_br_card;

        case WM_CTLCOLORSTATIC:
            SetTextColor((HDC)wp, TH->muted);
            SetBkColor((HDC)wp, TH->wnd);
            return (LRESULT)g_br_wnd;

        case WM_DESTROY:
            if (g_font_text) DeleteObject(g_font_text);
            if (g_font_key)  DeleteObject(g_font_key);
            if (g_font_ui)   DeleteObject(g_font_ui);
            if (g_font_icon) DeleteObject(g_font_icon);
            if (g_br_wnd)    DeleteObject(g_br_wnd);
            if (g_br_card)   DeleteObject(g_br_card);
            if (g_br_menu)   DeleteObject(g_br_menu);
            PostQuitMessage(0);
            return 0;

        default:
            break;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

/* ------------------------------------------------------------------ */
/* 진입점                                                              */
/* ------------------------------------------------------------------ */

static void register_classes(HINSTANCE inst)
{
    WNDCLASSEXW wc;

    ZeroMemory(&wc, sizeof(wc));
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = WndProc;
    wc.hInstance = inst;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = NULL;              /* WM_ERASEBKGND 에서 직접 칠한다 */
    wc.lpszClassName = L"ChunjiinMainWindow";
    wc.hIcon = (HICON)LoadImageW(inst, MAKEINTRESOURCEW(IDI_APP), IMAGE_ICON,
                                 0, 0, LR_DEFAULTSIZE);
    wc.hIconSm = (HICON)LoadImageW(inst, MAKEINTRESOURCEW(IDI_APP), IMAGE_ICON,
                                   16, 16, 0);
    RegisterClassExW(&wc);

    ZeroMemory(&wc, sizeof(wc));
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = ScrollProc;
    wc.hInstance = inst;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = NULL;
    wc.lpszClassName = L"ChunjiinScroll";
    RegisterClassExW(&wc);

    ZeroMemory(&wc, sizeof(wc));
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = HelpProc;
    wc.hInstance = inst;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = NULL;
    wc.lpszClassName = L"ChunjiinHelp";
    wc.hIcon = (HICON)LoadImageW(inst, MAKEINTRESOURCEW(IDI_APP), IMAGE_ICON,
                                 0, 0, LR_DEFAULTSIZE);
    RegisterClassExW(&wc);

    ZeroMemory(&wc, sizeof(wc));
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = SettingsProc;
    wc.hInstance = inst;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = L"ChunjiinSettings";
    wc.hIcon = (HICON)LoadImageW(inst, MAKEINTRESOURCEW(IDI_APP), IMAGE_ICON,
                                 0, 0, LR_DEFAULTSIZE);
    RegisterClassExW(&wc);
}

int WINAPI WinMain(HINSTANCE inst, HINSTANCE prev, LPSTR cmd, int show)
{
    HWND hwnd;
    MSG msg;
    INITCOMMONCONTROLSEX icc;

    (void)prev; (void)cmd;

    icc.dwSize = sizeof(icc);
    icc.dwICC = ICC_STANDARD_CLASSES | ICC_BAR_CLASSES | ICC_TAB_CLASSES;
    InitCommonControlsEx(&icc);

    settings_load();
    register_classes(inst);

    hwnd = CreateWindowExW(0, L"ChunjiinMainWindow", L"천지인 한글 입력기",
                           WS_OVERLAPPEDWINDOW,
                           CW_USEDEFAULT, CW_USEDEFAULT, 440, 720,
                           NULL, NULL, inst, NULL);
    if (hwnd == NULL) return 1;

    ShowWindow(hwnd, show);
    UpdateWindow(hwnd);

    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        if (g_settings_win && IsDialogMessageW(g_settings_win, &msg)) continue;
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    return (int)msg.wParam;
}
