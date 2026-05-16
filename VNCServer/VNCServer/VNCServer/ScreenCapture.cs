using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace VNCServer.VNCServer;

public class ScreenCapture
{
    [DllImport("user32.dll")]
    private static extern IntPtr GetDesktopWindow();

    [DllImport("user32.dll")]
    private static extern IntPtr GetWindowDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    private static extern bool BitBlt(IntPtr hdcDest, int nXDest, int nYDest,
        int nWidth, int nHeight, IntPtr hdcSrc, int nXSrc, int nYSrc, int dwRop);

    private const int SRCCOPY = 0x00CC0020;

    public static Bitmap CaptureScreen()
    {
        Rectangle bounds = GetScreenBounds();
        return CaptureScreen(bounds);
    }

    public static Bitmap CaptureScreen(Rectangle bounds)
    {
        Bitmap bitmap = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
        
        using (Graphics graphics = Graphics.FromImage(bitmap))
        {
            IntPtr desktopDC = IntPtr.Zero;
            IntPtr hDC = IntPtr.Zero;
            
            try
            {
                IntPtr desktopWindow = GetDesktopWindow();
                desktopDC = GetWindowDC(desktopWindow);
                hDC = graphics.GetHdc();

                BitBlt(hDC, 0, 0, bounds.Width, bounds.Height,
                    desktopDC, bounds.X, bounds.Y, SRCCOPY);
            }
            finally
            {
                if (hDC != IntPtr.Zero)
                {
                    graphics.ReleaseHdc(hDC);
                }
                if (desktopDC != IntPtr.Zero)
                {
                    ReleaseDC(IntPtr.Zero, desktopDC);
                }
            }
        }

        return bitmap;
    }

    public static Rectangle GetScreenBounds()
    {
        int minX = int.MaxValue;
        int minY = int.MaxValue;
        int maxX = int.MinValue;
        int maxY = int.MinValue;

        foreach (Screen screen in Screen.AllScreens)
        {
            minX = Math.Min(minX, screen.Bounds.X);
            minY = Math.Min(minY, screen.Bounds.Y);
            maxX = Math.Max(maxX, screen.Bounds.Right);
            maxY = Math.Max(maxY, screen.Bounds.Bottom);
        }

        return new Rectangle(minX, minY, maxX - minX, maxY - minY);
    }
}
