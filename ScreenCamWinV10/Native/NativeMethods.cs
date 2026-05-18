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

    // ── VFW / ICM ────────────────────────────────────────────────────────────

    [DllImport("msvfw32.dll")]
    public static extern IntPtr ICOpen(uint fccType, uint fccHandler, uint dwMode);

    [DllImport("msvfw32.dll")]
    public static extern int ICClose(IntPtr hic);

    [DllImport("msvfw32.dll", CharSet = CharSet.Unicode)]
    public static extern int ICGetInfo(IntPtr hic, ref ICINFO lpicinfo, int cb);

    [DllImport("msvfw32.dll")]
    public static extern bool ICInfo(uint fccType, uint fccHandler, ref ICINFO lpicinfo);

    [DllImport("msvfw32.dll")]
    public static extern int ICCompressGetFormat(IntPtr hic, IntPtr lpbiInput, IntPtr lpbiOutput);

    [DllImport("msvfw32.dll")]
    public static extern int ICCompressGetSize(IntPtr hic, IntPtr lpbiInput, IntPtr lpbiOutput);

    [DllImport("msvfw32.dll")]
    public static extern int ICCompressBegin(IntPtr hic, IntPtr lpbiInput, IntPtr lpbiOutput);

    [DllImport("msvfw32.dll")]
    public static extern int ICCompress(
        IntPtr hic, uint dwFlags,
        IntPtr lpbiOutput, IntPtr lpData,
        IntPtr lpbiInput,  IntPtr lpBits,
        out uint lpckid,   out uint lpdwFlags,
        int lFrameNum,     uint dwFrameSize,
        uint dwQuality,    IntPtr lpbiPrev, IntPtr lpPrev);

    [DllImport("msvfw32.dll")]
    public static extern int ICCompressEnd(IntPtr hic);

    // ── Constants ────────────────────────────────────────────────────────────

    public const uint SRCCOPY             = 0x00CC0020;
    public const uint CURSOR_SHOWING      = 0x00000001;
    public const uint DI_NORMAL           = 0x0003;
    public const uint PW_RENDERFULLCONTENT = 0x00000002;
    public const uint ICMODE_COMPRESS     = 1;
    public const uint ICTYPE_VIDEO        = 0x73646976; // 'vids'

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

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct ICINFO
    {
        public uint  dwSize;
        public uint  fccType;
        public uint  fccHandler;
        public uint  dwFlags;
        public uint  dwVersion;
        public uint  dwVersionICM;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 16)]
        public string szName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string szDescription;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string szDriver;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    public static uint FourCCToUInt(string fourcc)
    {
        if (fourcc.Length < 4) fourcc = fourcc.PadRight(4);
        return (uint)fourcc[0] | ((uint)fourcc[1] << 8) |
               ((uint)fourcc[2] << 16) | ((uint)fourcc[3] << 24);
    }
}
