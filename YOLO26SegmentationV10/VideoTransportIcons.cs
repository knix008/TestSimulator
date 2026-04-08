using System.Drawing;
using System.Drawing.Drawing2D;

namespace YOLO26SegmentationV10
{
    /// <summary>동영상 일시정지 / 재생 / 중지 버튼용 비트맵 아이콘.</summary>
    internal static class VideoTransportIcons
    {
        private const int SizePx = 48;

        public static readonly Bitmap Pause = CreatePause();
        public static readonly Bitmap Play = CreatePlay();
        public static readonly Bitmap Stop = CreateStop();

        private static Bitmap CreateBlank()
        {
            return new Bitmap(SizePx, SizePx, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        }

        private static Bitmap CreatePause()
        {
            var bmp = CreateBlank();
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);
                using (var b = new SolidBrush(Color.FromArgb(48, 48, 52)))
                {
                    var barW = SizePx / 7;
                    var gap = SizePx / 5;
                    var h = SizePx * 3 / 5;
                    var y = (SizePx - h) / 2;
                    var x0 = SizePx / 2 - gap / 2 - barW;
                    g.FillRectangle(b, x0, y, barW, h);
                    g.FillRectangle(b, x0 + barW + gap, y, barW, h);
                }
            }

            return bmp;
        }

        private static Bitmap CreatePlay()
        {
            var bmp = CreateBlank();
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);
                using (var b = new SolidBrush(Color.FromArgb(48, 48, 52)))
                {
                    var w = SizePx * 12 / 25;
                    var h = SizePx * 14 / 25;
                    var x = SizePx / 2 - w / 3;
                    var y = (SizePx - h) / 2;
                    g.FillPolygon(b, new[]
                    {
                        new PointF(x, y),
                        new PointF(x + w, y + h / 2f),
                        new PointF(x, y + h),
                    });
                }
            }

            return bmp;
        }

        private static Bitmap CreateStop()
        {
            var bmp = CreateBlank();
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);
                using (var b = new SolidBrush(Color.FromArgb(48, 48, 52)))
                {
                    var s = SizePx * 11 / 20;
                    var o = (SizePx - s) / 2f;
                    g.FillRectangle(b, o, o, s, s);
                }
            }

            return bmp;
        }
    }
}
