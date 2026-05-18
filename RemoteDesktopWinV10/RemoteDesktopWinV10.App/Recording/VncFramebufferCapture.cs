using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using RemoteViewing.Vnc;
using RemoteViewing.Windows.Forms;

namespace RemoteDesktopWinV10.App.Recording;

/// <summary>VNC 프레임버퍼를 Media Foundation RGB32(BGRA) 버퍼로 복사한다.</summary>
internal static class VncFramebufferCapture
{
    public static bool TryCopyRgb32(
        VncFramebuffer framebuffer,
        int encodeWidth,
        int encodeHeight,
        byte[] destination,
        Bitmap scratchBitmap)
    {
        var needed = encodeWidth * encodeHeight * 4;
        if (destination.Length < needed
            || scratchBitmap.Width != encodeWidth
            || scratchBitmap.Height != encodeHeight)
        {
            return false;
        }

        lock (framebuffer.SyncRoot)
        {
            if (framebuffer.Width < encodeWidth || framebuffer.Height < encodeHeight)
            {
                return false;
            }

            var region = new VncRectangle(0, 0, encodeWidth, encodeHeight);
            VncBitmap.CopyFromFramebuffer(framebuffer, region, scratchBitmap, 0, 0);
        }

        CopyBitmapToBgra(scratchBitmap, encodeWidth, encodeHeight, destination);
        return true;
    }

    private static void CopyBitmapToBgra(Bitmap bitmap, int width, int height, byte[] destination)
    {
        var rect = new Rectangle(0, 0, width, height);
        var data = bitmap.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        try
        {
            var rowBytes = width * 4;
            for (var y = 0; y < height; y++)
            {
                var src = IntPtr.Add(data.Scan0, y * data.Stride);
                // MFVideoFormat_RGB32 은 bottom-up 저장(첫 행 = 이미지 아래쪽)을 기대한다.
                // VncBitmap 은 top-down 이므로 행 순서를 반전해서 복사한다.
                var dstOffset = (height - 1 - y) * rowBytes;
                Marshal.Copy(src, destination, dstOffset, rowBytes);
            }
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
    }
}
