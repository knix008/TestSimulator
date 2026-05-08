using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Forms;

namespace ScreenCaptureMaster
{
    public class ScreenCapture
    {
        [DllImport("user32.dll")]
        private static extern IntPtr GetDesktopWindow();

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        private static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, int nFlags);

        [DllImport("user32.dll")]
        private static extern IntPtr GetWindowDC(IntPtr hwnd);

        [DllImport("user32.dll")]
        private static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int nWidth, int nHeight);

        [DllImport("gdi32.dll")]
        private static extern IntPtr SelectObject(IntPtr hdc, IntPtr hObject);

        [DllImport("gdi32.dll")]
        private static extern bool BitBlt(IntPtr hdcDest, int nXDest, int nYDest, int nWidth, int nHeight,
            IntPtr hdcSrc, int nXSrc, int nYSrc, int dwRop);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr hObject);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteDC(IntPtr hdc);

        private const int SRCCOPY = 0x00CC0020;
        private const int PW_RENDERFULLCONTENT = 0x00000002;

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        /// <summary>
        /// Captures the entire screen
        /// </summary>
        /// <returns>Bitmap of the captured screen</returns>
        public static Bitmap CaptureFullScreen()
        {
            Rectangle bounds = GetScreenBounds();
            return CaptureRegion(bounds);
        }

        /// <summary>
        /// Captures a specific region of the screen
        /// </summary>
        /// <param name="region">The region to capture</param>
        /// <returns>Bitmap of the captured region</returns>
        public static Bitmap CaptureRegion(Rectangle region)
        {
            IntPtr desktopWindow = GetDesktopWindow();
            IntPtr desktopDC = GetWindowDC(desktopWindow);
            IntPtr memoryDC = CreateCompatibleDC(desktopDC);
            IntPtr bitmap = CreateCompatibleBitmap(desktopDC, region.Width, region.Height);
            IntPtr oldBitmap = SelectObject(memoryDC, bitmap);

            BitBlt(memoryDC, 0, 0, region.Width, region.Height, desktopDC, region.X, region.Y, SRCCOPY);

            SelectObject(memoryDC, oldBitmap);
            DeleteDC(memoryDC);
            ReleaseDC(desktopWindow, desktopDC);

            Bitmap result = Image.FromHbitmap(bitmap);
            DeleteObject(bitmap);

            return result;
        }

        /// <summary>
        /// Captures a specific window by handle.
        /// Uses PrintWindow to capture even when the window is occluded/minimized.
        /// </summary>
        /// <param name="windowHandle">Target window handle (HWND)</param>
        /// <returns>Bitmap of the captured window</returns>
        public static Bitmap CaptureWindow(IntPtr windowHandle)
        {
            if (windowHandle == IntPtr.Zero)
                throw new ArgumentException("Invalid window handle.", nameof(windowHandle));

            if (!GetWindowRect(windowHandle, out RECT rect))
                throw new InvalidOperationException("Failed to get target window bounds.");

            int width = rect.Right - rect.Left;
            int height = rect.Bottom - rect.Top;
            if (width <= 0 || height <= 0)
                throw new InvalidOperationException("Target window has invalid size.");

            IntPtr desktopWindow = GetDesktopWindow();
            IntPtr desktopDC = GetWindowDC(desktopWindow);
            IntPtr memoryDC = IntPtr.Zero;
            IntPtr bitmap = IntPtr.Zero;
            IntPtr oldBitmap = IntPtr.Zero;

            try
            {
                memoryDC = CreateCompatibleDC(desktopDC);
                bitmap = CreateCompatibleBitmap(desktopDC, width, height);
                oldBitmap = SelectObject(memoryDC, bitmap);

                bool success = PrintWindow(windowHandle, memoryDC, PW_RENDERFULLCONTENT);
                if (!success)
                {
                    // Some windows do not support PrintWindow. Try Windows Graphics Capture first.
                    try
                    {
                        return WindowsGraphicsCaptureHelper.CaptureWindow(windowHandle);
                    }
                    catch
                    {
                        // Last fallback: copy visible screen area.
                        BitBlt(memoryDC, 0, 0, width, height, desktopDC, rect.Left, rect.Top, SRCCOPY);
                    }
                }

                Bitmap result = Image.FromHbitmap(bitmap);
                return result;
            }
            finally
            {
                if (oldBitmap != IntPtr.Zero && memoryDC != IntPtr.Zero)
                    SelectObject(memoryDC, oldBitmap);
                if (memoryDC != IntPtr.Zero)
                    DeleteDC(memoryDC);
                if (desktopDC != IntPtr.Zero)
                    ReleaseDC(desktopWindow, desktopDC);
                if (bitmap != IntPtr.Zero)
                    DeleteObject(bitmap);
            }
        }

        /// <summary>
        /// Saves the bitmap to a file
        /// </summary>
        /// <param name="bitmap">The bitmap to save</param>
        /// <param name="filePath">The file path to save to</param>
        /// <param name="format">The image format (default: PNG)</param>
        public static void SaveBitmap(Bitmap bitmap, string filePath, ImageFormat format = null)
        {
            if (format == null)
                format = ImageFormat.Png;

            string directory = Path.GetDirectoryName(filePath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            bitmap.Save(filePath, format);
        }

        /// <summary>
        /// Gets the bounds of all screens combined
        /// </summary>
        /// <returns>Rectangle representing all screen bounds</returns>
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

        /// <summary>
        /// Generates a unique filename for a screenshot
        /// </summary>
        /// <param name="basePath">The base directory path</param>
        /// <param name="extension">The file extension (default: png)</param>
        /// <returns>A unique file path</returns>
        public static string GenerateUniqueFileName(string basePath, string extension = "png")
        {
            string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            string fileName = $"Screenshot_{timestamp}.{extension}";
            string fullPath = Path.Combine(basePath, fileName);

            int counter = 1;
            while (File.Exists(fullPath))
            {
                fileName = $"Screenshot_{timestamp}_{counter}.{extension}";
                fullPath = Path.Combine(basePath, fileName);
                counter++;
            }

            return fullPath;
        }
    }
}
