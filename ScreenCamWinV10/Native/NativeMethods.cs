using System.Runtime.InteropServices;

namespace ScreenCamWin.Native;

internal static class NativeMethods
{
    // ── Window enumeration ───────────────────────────────────────────────────

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    // ── Borderless window drag ────────────────────────────────────────────────

    [DllImport("user32.dll")]
    public static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);

    public const int WM_NCLBUTTONDOWN = 0xA1;
    public const int HT_CAPTION       = 0x2;

    // ── Window capture ───────────────────────────────────────────────────────

    [DllImport("user32.dll")]
    public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);

    [DllImport("gdi32.dll")]
    public static extern bool BitBlt(IntPtr hdc, int xDest, int yDest, int cx, int cy,
                                     IntPtr hdcSrc, int xSrc, int ySrc, uint rop);

    [DllImport("user32.dll")]
    public static extern IntPtr GetDesktopWindow();

    [DllImport("user32.dll")]
    public static extern IntPtr GetWindowDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

    // ── Cursor ───────────────────────────────────────────────────────────────

    [DllImport("user32.dll")]
    public static extern bool GetCursorInfo(out CURSORINFO pci);

    [DllImport("user32.dll")]
    public static extern bool GetIconInfo(IntPtr hIcon, out ICONINFO piconinfo);

    [DllImport("user32.dll")]
    public static extern bool DrawIconEx(IntPtr hdc, int xLeft, int yTop, IntPtr hIcon,
                                         int cxWidth, int cyHeight, uint istepIfAniCur,
                                         IntPtr hbrFlickerFreeDraw, uint diFlags);

    // ── GDI cleanup ──────────────────────────────────────────────────────────

    [DllImport("gdi32.dll")]
    public static extern bool DeleteObject(IntPtr hObject);

    // ── Constants ────────────────────────────────────────────────────────────

    public const uint SRCCOPY             = 0x00CC0020;
    public const uint CURSOR_SHOWING      = 0x00000001;
    public const uint DI_NORMAL           = 0x0003;
    public const uint PW_RENDERFULLCONTENT = 0x00000002;

    // ── Structs ──────────────────────────────────────────────────────────────

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left, Top, Right, Bottom;
        public int Width  => Right  - Left;
        public int Height => Bottom - Top;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct CURSORINFO
    {
        public int    cbSize;
        public uint   flags;
        public IntPtr hCursor;
        public POINT  ptScreenPos;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT
    {
        public int x, y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct ICONINFO
    {
        public bool   fIcon;
        public int    xHotspot;
        public int    yHotspot;
        public IntPtr hbmMask;
        public IntPtr hbmColor;
    }

}
