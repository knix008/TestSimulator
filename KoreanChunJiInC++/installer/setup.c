/*
 * setup.c - 천지인 한글 입력기 설치 프로그램
 *
 * chunjiin.exe 를 리소스로 품고 있다가 설치 폴더에 풀어 놓고,
 * 시작 메뉴 / 바탕 화면 바로 가기와 "앱 및 기능" 등록 정보를 만든다.
 * 관리자 권한이 필요 없도록 사용자 폴더에 설치한다.
 *
 *   setup.exe               설치 창을 띄운다
 *   setup.exe /S            조용히 기본 위치에 설치한다
 *   setup.exe /uninstall    제거한다 (설치 폴더의 uninstall.exe 가 이것)
 */
#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN
#define COBJMACROS

#include <windows.h>
#include <shlobj.h>
#include <shellapi.h>
#include <objidl.h>
#include <commctrl.h>
#include <stdio.h>
#include <string.h>

#include "setup_res.h"

#define APP_NAME      L"천지인 한글 입력기"
#define APP_EXE       L"chunjiin.exe"
#define APP_KEY       L"ChunjiinHangulInput"
#define APP_VERSION   L"1.0.0"
#define APP_PUBLISHER L"KoreanChunJiIn"
#define UNINST_EXE    L"uninstall.exe"
#define LNK_NAME      L"천지인 한글 입력기.lnk"

#define IDC_PATH      1001
#define IDC_BROWSE    1002
#define IDC_DESKTOP   1003
#define IDC_INSTALL   1004
#define IDC_CANCEL    1005

static HWND  g_dlg;
static HFONT g_font;
static HFONT g_font_title;

/* ------------------------------------------------------------------ */
/* 경로 도우미                                                         */
/* ------------------------------------------------------------------ */

static void default_dir(wchar_t *out)
{
    wchar_t base[MAX_PATH] = L"";

    if (FAILED(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, base))) {
        GetEnvironmentVariableW(L"LOCALAPPDATA", base, MAX_PATH);
    }
    swprintf(out, MAX_PATH, L"%ls\\Programs\\Chunjiin", base);
}

/* 중간 폴더까지 모두 만든다 */
static BOOL make_dirs(const wchar_t *path)
{
    wchar_t buf[MAX_PATH];
    size_t i;

    wcsncpy(buf, path, MAX_PATH - 1);
    buf[MAX_PATH - 1] = 0;

    for (i = 3; buf[i] != 0; i++) {
        if (buf[i] == L'\\') {
            buf[i] = 0;
            CreateDirectoryW(buf, NULL);
            buf[i] = L'\\';
        }
    }
    CreateDirectoryW(buf, NULL);
    return GetFileAttributesW(path) != INVALID_FILE_ATTRIBUTES;
}

static void join(wchar_t *out, const wchar_t *dir, const wchar_t *name)
{
    swprintf(out, MAX_PATH, L"%ls\\%ls", dir, name);
}

/* ------------------------------------------------------------------ */
/* 리소스에 담긴 실행 파일 풀기                                        */
/* ------------------------------------------------------------------ */

static BOOL extract_app(const wchar_t *dest)
{
    HRSRC   res;
    HGLOBAL mem;
    const void *data;
    DWORD size, written;
    HANDLE file;

    res = FindResourceW(NULL, MAKEINTRESOURCEW(IDR_APP_EXE), RT_RCDATA);
    if (res == NULL) return FALSE;

    size = SizeofResource(NULL, res);
    mem  = LoadResource(NULL, res);
    if (mem == NULL || size == 0) return FALSE;
    data = LockResource(mem);
    if (data == NULL) return FALSE;

    file = CreateFileW(dest, GENERIC_WRITE, 0, NULL,
                       CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (file == INVALID_HANDLE_VALUE) return FALSE;

    WriteFile(file, data, size, &written, NULL);
    CloseHandle(file);
    return written == size;
}

/* ------------------------------------------------------------------ */
/* 바로 가기                                                           */
/* ------------------------------------------------------------------ */

static BOOL make_shortcut(const wchar_t *link, const wchar_t *target,
                          const wchar_t *workdir, const wchar_t *desc)
{
    IShellLinkW  *sl = NULL;
    IPersistFile *pf = NULL;
    HRESULT hr;

    hr = CoCreateInstance(&CLSID_ShellLink, NULL, CLSCTX_INPROC_SERVER,
                          &IID_IShellLinkW, (void **)&sl);
    if (FAILED(hr)) return FALSE;

    IShellLinkW_SetPath(sl, target);
    IShellLinkW_SetWorkingDirectory(sl, workdir);
    IShellLinkW_SetIconLocation(sl, target, 0);
    IShellLinkW_SetDescription(sl, desc);

    hr = IShellLinkW_QueryInterface(sl, &IID_IPersistFile, (void **)&pf);
    if (SUCCEEDED(hr)) {
        hr = IPersistFile_Save(pf, link, TRUE);
        IPersistFile_Release(pf);
    }
    IShellLinkW_Release(sl);
    return SUCCEEDED(hr);
}

static BOOL shell_dir(int csidl, wchar_t *out)
{
    return SUCCEEDED(SHGetFolderPathW(NULL, csidl, NULL, 0, out));
}

/* ------------------------------------------------------------------ */
/* 제거 정보 등록                                                      */
/* ------------------------------------------------------------------ */

#define UNINST_ROOT L"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\"

static void reg_str(HKEY key, const wchar_t *name, const wchar_t *value)
{
    RegSetValueExW(key, name, 0, REG_SZ, (const BYTE *)value,
                   (DWORD)((wcslen(value) + 1) * sizeof(wchar_t)));
}

static void register_uninstall(const wchar_t *dir)
{
    wchar_t sub[256], exe[MAX_PATH], uninst[MAX_PATH], cmd[MAX_PATH + 32];
    HKEY key;
    DWORD one = 1;

    swprintf(sub, 256, L"%ls%ls", UNINST_ROOT, APP_KEY);
    if (RegCreateKeyExW(HKEY_CURRENT_USER, sub, 0, NULL, 0,
                        KEY_WRITE, NULL, &key, NULL) != ERROR_SUCCESS) {
        return;
    }
    join(exe, dir, APP_EXE);
    join(uninst, dir, UNINST_EXE);
    swprintf(cmd, MAX_PATH + 32, L"\"%ls\" /uninstall", uninst);

    reg_str(key, L"DisplayName",     APP_NAME);
    reg_str(key, L"DisplayVersion",  APP_VERSION);
    reg_str(key, L"Publisher",       APP_PUBLISHER);
    reg_str(key, L"DisplayIcon",     exe);
    reg_str(key, L"InstallLocation", dir);
    reg_str(key, L"UninstallString", cmd);
    RegSetValueExW(key, L"NoModify", 0, REG_DWORD, (const BYTE *)&one, sizeof(one));
    RegSetValueExW(key, L"NoRepair", 0, REG_DWORD, (const BYTE *)&one, sizeof(one));
    RegCloseKey(key);
}

static void unregister_uninstall(void)
{
    wchar_t sub[256];
    swprintf(sub, 256, L"%ls%ls", UNINST_ROOT, APP_KEY);
    RegDeleteKeyW(HKEY_CURRENT_USER, sub);
}

/* ------------------------------------------------------------------ */
/* 설치 / 제거                                                         */
/* ------------------------------------------------------------------ */

static BOOL do_install(const wchar_t *dir, BOOL desktop_link, wchar_t *err, size_t err_len)
{
    wchar_t exe[MAX_PATH], uninst[MAX_PATH], self[MAX_PATH];
    wchar_t folder[MAX_PATH], link[MAX_PATH];

    if (!make_dirs(dir)) {
        swprintf(err, err_len, L"폴더를 만들 수 없습니다.\n%ls", dir);
        return FALSE;
    }

    join(exe, dir, APP_EXE);
    if (!extract_app(exe)) {
        swprintf(err, err_len, L"프로그램 파일을 복사하지 못했습니다.\n"
                               L"실행 중이면 먼저 닫아 주세요.");
        return FALSE;
    }

    /* 자기 자신을 제거 프로그램으로 남겨 둔다 */
    GetModuleFileNameW(NULL, self, MAX_PATH);
    join(uninst, dir, UNINST_EXE);
    CopyFileW(self, uninst, FALSE);

    CoInitialize(NULL);
    if (shell_dir(CSIDL_PROGRAMS, folder)) {
        join(link, folder, LNK_NAME);
        make_shortcut(link, exe, dir, APP_NAME);
    }
    if (desktop_link && shell_dir(CSIDL_DESKTOPDIRECTORY, folder)) {
        join(link, folder, LNK_NAME);
        make_shortcut(link, exe, dir, APP_NAME);
    }
    CoUninitialize();

    register_uninstall(dir);
    return TRUE;
}

static void do_uninstall(BOOL silent)
{
    wchar_t self[MAX_PATH], dir[MAX_PATH], exe[MAX_PATH];
    wchar_t folder[MAX_PATH], link[MAX_PATH], cmd[MAX_PATH * 2];
    wchar_t *slash;
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;

    if (!silent &&
        MessageBoxW(NULL, APP_NAME L" 을(를) 제거할까요?",
                    L"제거", MB_ICONQUESTION | MB_YESNO) != IDYES) {
        return;
    }

    GetModuleFileNameW(NULL, self, MAX_PATH);
    wcscpy(dir, self);
    slash = wcsrchr(dir, L'\\');
    if (slash) *slash = 0;

    join(exe, dir, APP_EXE);
    DeleteFileW(exe);

    if (shell_dir(CSIDL_PROGRAMS, folder)) {
        join(link, folder, LNK_NAME);
        DeleteFileW(link);
    }
    if (shell_dir(CSIDL_DESKTOPDIRECTORY, folder)) {
        join(link, folder, LNK_NAME);
        DeleteFileW(link);
    }
    unregister_uninstall();

    /* 실행 중인 자기 자신과 폴더는 잠깐 뒤에 지운다 */
    swprintf(cmd, MAX_PATH * 2,
             L"cmd.exe /c ping 127.0.0.1 -n 3 >nul & del /q \"%ls\" & rmdir \"%ls\"",
             self, dir);
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    if (CreateProcessW(NULL, cmd, NULL, NULL, FALSE,
                       CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
    }

    if (!silent) {
        MessageBoxW(NULL, L"제거했습니다.", APP_NAME, MB_ICONINFORMATION);
    }
}

/* ------------------------------------------------------------------ */
/* 설치 창                                                             */
/* ------------------------------------------------------------------ */

static void browse_dir(HWND owner)
{
    BROWSEINFOW bi;
    LPITEMIDLIST id;
    wchar_t path[MAX_PATH];

    ZeroMemory(&bi, sizeof(bi));
    bi.hwndOwner = owner;
    bi.lpszTitle = L"설치할 폴더를 고르세요";
    bi.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE;

    id = SHBrowseForFolderW(&bi);
    if (id == NULL) return;

    if (SHGetPathFromIDListW(id, path)) {
        SetDlgItemTextW(owner, IDC_PATH, path);
    }
    CoTaskMemFree(id);
}

static void run_install(HWND hwnd)
{
    wchar_t dir[MAX_PATH], err[512], exe[MAX_PATH];
    BOOL desktop;

    GetDlgItemTextW(hwnd, IDC_PATH, dir, MAX_PATH);
    if (dir[0] == 0) {
        MessageBoxW(hwnd, L"설치 폴더를 지정해 주세요.", APP_NAME, MB_ICONWARNING);
        return;
    }
    desktop = (IsDlgButtonChecked(hwnd, IDC_DESKTOP) == BST_CHECKED);

    EnableWindow(GetDlgItem(hwnd, IDC_INSTALL), FALSE);
    SetCursor(LoadCursor(NULL, IDC_WAIT));

    if (!do_install(dir, desktop, err, 512)) {
        MessageBoxW(hwnd, err, L"설치 실패", MB_ICONERROR);
        EnableWindow(GetDlgItem(hwnd, IDC_INSTALL), TRUE);
        return;
    }

    join(exe, dir, APP_EXE);
    if (MessageBoxW(hwnd,
                    L"설치가 끝났습니다.\n지금 실행할까요?",
                    APP_NAME, MB_ICONINFORMATION | MB_YESNO) == IDYES) {
        ShellExecuteW(NULL, L"open", exe, NULL, dir, SW_SHOWNORMAL);
    }
    DestroyWindow(hwnd);
}

static LRESULT CALLBACK SetupProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg) {
        case WM_CREATE: {
            HINSTANCE inst = ((LPCREATESTRUCTW)lp)->hInstance;
            wchar_t dir[MAX_PATH];
            HWND h;

            g_font = CreateFontW(-14, 0, 0, 0, FW_NORMAL, 0, 0, 0,
                                 DEFAULT_CHARSET, OUT_TT_PRECIS, CLIP_DEFAULT_PRECIS,
                                 CLEARTYPE_QUALITY, DEFAULT_PITCH, L"맑은 고딕");
            g_font_title = CreateFontW(-22, 0, 0, 0, FW_SEMIBOLD, 0, 0, 0,
                                 DEFAULT_CHARSET, OUT_TT_PRECIS, CLIP_DEFAULT_PRECIS,
                                 CLEARTYPE_QUALITY, DEFAULT_PITCH, L"맑은 고딕");

            h = CreateWindowExW(0, L"STATIC", APP_NAME,
                                WS_CHILD | WS_VISIBLE,
                                24, 22, 380, 30, hwnd, NULL, inst, NULL);
            SendMessageW(h, WM_SETFONT, (WPARAM)g_font_title, TRUE);

            h = CreateWindowExW(0, L"STATIC",
                                L"12키 천지인 자판으로 한글을 입력하는 프로그램입니다.\n"
                                L"관리자 권한 없이 사용자 폴더에 설치됩니다.",
                                WS_CHILD | WS_VISIBLE,
                                24, 56, 380, 36, hwnd, NULL, inst, NULL);
            SendMessageW(h, WM_SETFONT, (WPARAM)g_font, TRUE);

            h = CreateWindowExW(0, L"STATIC", L"설치 폴더",
                                WS_CHILD | WS_VISIBLE,
                                24, 106, 100, 20, hwnd, NULL, inst, NULL);
            SendMessageW(h, WM_SETFONT, (WPARAM)g_font, TRUE);

            default_dir(dir);
            h = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", dir,
                                WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL,
                                24, 128, 300, 26, hwnd,
                                (HMENU)IDC_PATH, inst, NULL);
            SendMessageW(h, WM_SETFONT, (WPARAM)g_font, TRUE);

            h = CreateWindowExW(0, L"BUTTON", L"찾아보기",
                                WS_CHILD | WS_VISIBLE | WS_TABSTOP,
                                332, 128, 72, 26, hwnd,
                                (HMENU)IDC_BROWSE, inst, NULL);
            SendMessageW(h, WM_SETFONT, (WPARAM)g_font, TRUE);

            h = CreateWindowExW(0, L"BUTTON", L"바탕 화면에 바로 가기 만들기",
                                WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_AUTOCHECKBOX,
                                24, 168, 300, 24, hwnd,
                                (HMENU)IDC_DESKTOP, inst, NULL);
            SendMessageW(h, WM_SETFONT, (WPARAM)g_font, TRUE);
            CheckDlgButton(hwnd, IDC_DESKTOP, BST_CHECKED);

            h = CreateWindowExW(0, L"BUTTON", L"설치",
                                WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_DEFPUSHBUTTON,
                                224, 214, 88, 30, hwnd,
                                (HMENU)IDC_INSTALL, inst, NULL);
            SendMessageW(h, WM_SETFONT, (WPARAM)g_font, TRUE);

            h = CreateWindowExW(0, L"BUTTON", L"취소",
                                WS_CHILD | WS_VISIBLE | WS_TABSTOP,
                                318, 214, 88, 30, hwnd,
                                (HMENU)IDC_CANCEL, inst, NULL);
            SendMessageW(h, WM_SETFONT, (WPARAM)g_font, TRUE);
            return 0;
        }

        case WM_CTLCOLORSTATIC:
            SetBkMode((HDC)wp, TRANSPARENT);
            return (LRESULT)GetSysColorBrush(COLOR_WINDOW);

        case WM_COMMAND:
            switch (LOWORD(wp)) {
                case IDC_BROWSE:  browse_dir(hwnd); return 0;
                case IDC_INSTALL: run_install(hwnd); return 0;
                case IDC_CANCEL:  DestroyWindow(hwnd); return 0;
                default: break;
            }
            return 0;

        case WM_CLOSE:
            DestroyWindow(hwnd);
            return 0;

        case WM_DESTROY:
            if (g_font) DeleteObject(g_font);
            if (g_font_title) DeleteObject(g_font_title);
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

static BOOL has_arg(const wchar_t *cmdline, const wchar_t *flag)
{
    const wchar_t *p = cmdline;
    size_t n = wcslen(flag);

    while ((p = wcsstr(p, flag)) != NULL) {
        if ((p[n] == 0 || p[n] == L' ')) return TRUE;
        p += n;
    }
    return FALSE;
}

int WINAPI WinMain(HINSTANCE inst, HINSTANCE prev, LPSTR cmd, int show)
{
    const wchar_t *cmdline = GetCommandLineW();
    WNDCLASSEXW wc;
    MSG msg;
    RECT rc;
    int w = 430, h = 300, x, y;

    (void)prev; (void)cmd;

    if (has_arg(cmdline, L"/uninstall")) {
        do_uninstall(has_arg(cmdline, L"/S"));
        return 0;
    }
    if (has_arg(cmdline, L"/S")) {
        wchar_t dir[MAX_PATH], err[512];
        default_dir(dir);
        return do_install(dir, TRUE, err, 512) ? 0 : 1;
    }

    InitCommonControls();

    ZeroMemory(&wc, sizeof(wc));
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = SetupProc;
    wc.hInstance = inst;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = L"ChunjiinSetup";
    wc.hIcon = (HICON)LoadImageW(inst, MAKEINTRESOURCEW(IDI_SETUP), IMAGE_ICON,
                                 0, 0, LR_DEFAULTSIZE);
    wc.hIconSm = (HICON)LoadImageW(inst, MAKEINTRESOURCEW(IDI_SETUP), IMAGE_ICON,
                                   16, 16, 0);
    if (!RegisterClassExW(&wc)) return 1;

    SystemParametersInfoW(SPI_GETWORKAREA, 0, &rc, 0);
    x = rc.left + (rc.right - rc.left - w) / 2;
    y = rc.top + (rc.bottom - rc.top - h) / 2;

    g_dlg = CreateWindowExW(0, wc.lpszClassName, APP_NAME L" 설치",
                            (WS_OVERLAPPEDWINDOW & ~WS_MAXIMIZEBOX & ~WS_THICKFRAME),
                            x, y, w, h, NULL, NULL, inst, NULL);
    if (g_dlg == NULL) return 1;

    ShowWindow(g_dlg, show);
    UpdateWindow(g_dlg);

    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        if (!IsDialogMessageW(g_dlg, &msg)) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
    return 0;
}
