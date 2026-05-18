using ScreenCamWin.Models;
using ScreenCamWin.Native;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace ScreenCamWin.Core;

/// <summary>
/// Captures screen / window bitmaps and overlays the mouse cursor.
/// All GDI operations are serialized via a static lock.
/// </summary>
internal static class ScreenCapture
{
    // Prevents GDI resource conflicts between preview (UI thread) and recording (bg thread)
    private static readonly object _captureLock = new();
    // ── Public API ───────────────────────────────────────────────────────────

    public static Bitmap Capture(WindowInfo target)
    {
        lock (_captureLock)
        {
            if (!target.IsDesktop && !NativeMethods.IsWindow(target.Handle))
                return CaptureDesktop(); // fallback to desktop if window is gone

            return target.IsDesktop
                ? CaptureDesktop()
                : CaptureWindow(target.Handle);
        }
    }

    public static void DrawCursor(Bitmap bitmap, WindowInfo target)
    {
        var ci = new NativeMethods.CURSORINFO
        {
            cbSize = Marshal.SizeOf<NativeMethods.CURSORINFO>()
        };
        if (!NativeMethods.GetCursorInfo(out ci)) return;
        if (ci.flags != NativeMethods.CURSOR_SHOWING) return;

        // Determine capture-area origin
        int originX = 0, originY = 0;
        if (!target.IsDesktop)
        {
            NativeMethods.GetWindowRect(target.Handle, out var wr);
            originX = wr.Left;
            originY = wr.Top;
        }

        NativeMethods.GetIconInfo(ci.hCursor, out var ii);

        int cx = ci.ptScreenPos.x - ii.xHotspot - originX;
        int cy = ci.ptScreenPos.y - ii.yHotspot - originY;

        using var g = Graphics.FromImage(bitmap);
        IntPtr hdc = g.GetHdc();
        try
        {
            NativeMethods.DrawIconEx(hdc, cx, cy, ci.hCursor, 0, 0, 0, IntPtr.Zero, NativeMethods.DI_NORMAL);
        }
        finally
        {
            g.ReleaseHdc(hdc);
        }

        // Free temporary GDI objects from GetIconInfo
        if (ii.hbmMask  != IntPtr.Zero) NativeMethods.DeleteObject(ii.hbmMask);
        if (ii.hbmColor != IntPtr.Zero) NativeMethods.DeleteObject(ii.hbmColor);
    }

    public static (int Width, int Height) GetDimensions(WindowInfo target)
    {
        if (target.IsDesktop)
        {
            var bounds = Screen.PrimaryScreen!.Bounds;
            return (bounds.Width, bounds.Height);
        }
        NativeMethods.GetWindowRect(target.Handle, out var r);
        return (Math.Max(r.Width, 2), Math.Max(r.Height, 2));
    }

    /// <summary>Converts a Bitmap to BGR24 top-down byte array (for MF H.264 NV12 conversion).</summary>
    public static byte[] ToBgr24TopDown(Bitmap src, int width, int height)
    {
        Bitmap? resized = null;
        if (src.Width != width || src.Height != height) { resized = new Bitmap(src, width, height); src = resized; }
        byte[] buffer = new byte[width * height * 3];
        var bd = src.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        try
        {
            int rowBytes = width * 3;
            for (int y = 0; y < height; y++)
                Marshal.Copy(bd.Scan0 + y * bd.Stride, buffer, y * rowBytes, rowBytes);
        }
        finally { src.UnlockBits(bd); resized?.Dispose(); }
        return buffer;
    }

    /// <summary>Converts a Bitmap to BGR24 bottom-up byte array (for VFW ICM codecs and AVI).</summary>
    public static byte[] ToBgr24BottomUp(Bitmap src, int width, int height)
    {
        Bitmap? resized = null;
        if (src.Width != width || src.Height != height)
        {
            resized = new Bitmap(src, width, height);
            src = resized;
        }

        byte[] buffer = new byte[width * height * 3];
        var bd = src.LockBits(new Rectangle(0, 0, width, height),
                              ImageLockMode.ReadOnly,
                              PixelFormat.Format24bppRgb);
        try
        {
            int rowBytes = width * 3;
            for (int y = 0; y < height; y++)
            {
                IntPtr rowPtr = bd.Scan0 + y * bd.Stride;
                int dstOffset = (height - 1 - y) * rowBytes; // flip rows
                Marshal.Copy(rowPtr, buffer, dstOffset, rowBytes);
            }
        }
        finally
        {
            src.UnlockBits(bd);
            resized?.Dispose();
        }
        return buffer;
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private static Bitmap CaptureDesktop()
    {
        var bounds = Screen.PrimaryScreen!.Bounds;
        var bmp = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size, CopyPixelOperation.SourceCopy);
        return bmp;
    }

    private static Bitmap CaptureWindow(IntPtr hWnd)
    {
        NativeMethods.GetWindowRect(hWnd, out var r);
        int w = Math.Max(r.Width, 2);
        int h = Math.Max(r.Height, 2);

        var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.Clear(Color.Black);

        IntPtr hdc = g.GetHdc();
        try
        {
            bool ok = NativeMethods.PrintWindow(hWnd, hdc, NativeMethods.PW_RENDERFULLCONTENT);
            if (!ok)
            {
                // Fallback: BitBlt from screen DC
                IntPtr screenDC = NativeMethods.GetWindowDC(IntPtr.Zero);
                NativeMethods.BitBlt(hdc, 0, 0, w, h, screenDC, r.Left, r.Top, NativeMethods.SRCCOPY);
                NativeMethods.ReleaseDC(IntPtr.Zero, screenDC);
            }
        }
        finally
        {
            g.ReleaseHdc(hdc);
        }
        return bmp;
    }
}
