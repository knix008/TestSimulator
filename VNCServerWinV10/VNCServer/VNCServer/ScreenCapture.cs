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

    // 캡처 영역 설정
    private static Rectangle? _captureArea = null;
    private static int _imageQuality = 75;

    /// <summary>
    /// 캡처 영역 설정 (null이면 전체 화면)
    /// </summary>
    public static void SetCaptureArea(Rectangle? area)
    {
        _captureArea = area;
    }

    /// <summary>
    /// 이미지 품질 설정 (1-100)
    /// </summary>
    public static void SetImageQuality(int quality)
    {
        _imageQuality = Math.Clamp(quality, 1, 100);
    }

    public static Bitmap CaptureScreen()
    {
        Rectangle bounds = _captureArea ?? GetScreenBounds();
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

    /// <summary>
    /// 화면을 캡처하고 설정된 품질로 압축
    /// </summary>
    public static byte[] CaptureScreenAsJpeg()
    {
        using (var bitmap = CaptureScreen())
        {
            return ImageCompressor.EncodeJpeg(bitmap, _imageQuality);
        }
    }

    /// <summary>
    /// 특정 영역을 캡처하고 압축
    /// </summary>
    public static byte[] CaptureAreaAsJpeg(Rectangle area)
    {
        using (var bitmap = CaptureScreen(area))
        {
            return ImageCompressor.EncodeJpeg(bitmap, _imageQuality);
        }
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
