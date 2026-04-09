using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using OpenCvSharp;

namespace YOLO26V10.Segmentation
{
    internal static class MatBitmapUtil
    {
        /// <summary>OpenCV BGR 8-bit Mat ??GDI+ 24bpp (硫붾え由??쒖꽌 ?명솚).</summary>
        public static Bitmap ToBitmapBgr(Mat src)
        {
            if (src == null || src.Empty())
                throw new ArgumentException("鍮??꾨젅?꾩엯?덈떎.", nameof(src));

            using (var converted = src.Channels() == 4 ? src.CvtColor(ColorConversionCodes.BGRA2BGR) : null)
            {
                var work = converted ?? src;
                if (work.Type() != MatType.CV_8UC3)
                    throw new NotSupportedException("CV_8UC3 ?먮뒗 CV_8UC4(BGRA)留?吏?먰빀?덈떎.");

                return ToBitmapBgrCore(work);
            }
        }

        private static Bitmap ToBitmapBgrCore(Mat src)
        {
            var w = src.Width;
            var h = src.Height;
            var bmp = new Bitmap(w, h, PixelFormat.Format24bppRgb);
            var rect = new Rectangle(0, 0, w, h);
            var bd = bmp.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
            try
            {
                var dstStride = bd.Stride;
                var rowBytes = w * 3;
                var rowBuf = new byte[dstStride];
                for (var y = 0; y < h; y++)
                {
                    Marshal.Copy(src.Ptr(y), rowBuf, 0, rowBytes);
                    if (dstStride > rowBytes)
                        Array.Clear(rowBuf, rowBytes, dstStride - rowBytes);
                    Marshal.Copy(rowBuf, 0, IntPtr.Add(bd.Scan0, y * dstStride), dstStride);
                }
            }
            finally
            {
                bmp.UnlockBits(bd);
            }

            return bmp;
        }

        /// <summary>VideoWriter??BGR <see cref="Mat"/> (CV_8UC3). 24bpp/32bpp 鍮꾪듃留?吏??</summary>
        public static Mat BitmapToMatBgr(Bitmap bmp)
        {
            if (bmp == null)
                throw new ArgumentNullException(nameof(bmp));

            var rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
            if (bmp.PixelFormat == PixelFormat.Format24bppRgb)
            {
                var m = new Mat(bmp.Height, bmp.Width, MatType.CV_8UC3);
                var bd = bmp.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
                try
                {
                    var rowBytes = bmp.Width * 3;
                    var rowBuf = new byte[rowBytes];
                    for (var y = 0; y < bmp.Height; y++)
                    {
                        Marshal.Copy(IntPtr.Add(bd.Scan0, y * bd.Stride), rowBuf, 0, rowBytes);
                        Marshal.Copy(rowBuf, 0, m.Ptr(y), rowBytes);
                    }
                }
                finally
                {
                    bmp.UnlockBits(bd);
                }

                return m;
            }

            if (bmp.PixelFormat == PixelFormat.Format32bppArgb || bmp.PixelFormat == PixelFormat.Format32bppRgb)
            {
                using (var m4 = new Mat(bmp.Height, bmp.Width, MatType.CV_8UC4))
                {
                    var bd = bmp.LockBits(rect, ImageLockMode.ReadOnly, bmp.PixelFormat);
                    try
                    {
                        var rowBytes = bmp.Width * 4;
                        var rowBuf = new byte[rowBytes];
                        for (var y = 0; y < bmp.Height; y++)
                        {
                            Marshal.Copy(IntPtr.Add(bd.Scan0, y * bd.Stride), rowBuf, 0, rowBytes);
                            Marshal.Copy(rowBuf, 0, m4.Ptr(y), rowBytes);
                        }
                    }
                    finally
                    {
                        bmp.UnlockBits(bd);
                    }

                    using (var bgr = m4.CvtColor(ColorConversionCodes.BGRA2BGR))
                        return bgr.Clone();
                }
            }

            using (var conv = bmp.Clone(rect, PixelFormat.Format24bppRgb))
                return BitmapToMatBgr(conv);
        }
    }
}

