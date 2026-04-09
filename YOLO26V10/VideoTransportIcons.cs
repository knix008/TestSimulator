using System.Drawing;
using System.Drawing.Drawing2D;

namespace YOLO26V10
{
    /// <summary>?숈쁺???ъ깮 ?쒖뼱??怨좏빐?곷룄 ?ㅽ????꾩씠肄?洹몃씪?곗씠?샕룸뫁洹??뺥깭).</summary>
    internal static class VideoTransportIcons
    {
        private const int SizePx = 44;

        private static readonly Color PlayPauseLight = Color.FromArgb(59, 130, 246);
        private static readonly Color PlayPauseDark = Color.FromArgb(29, 78, 216);
        private static readonly Color StopLight = Color.FromArgb(248, 113, 113);
        private static readonly Color StopDark = Color.FromArgb(220, 38, 38);
        private static readonly Color OutlineBlue = Color.FromArgb(30, 64, 175);
        private static readonly Color OutlineRed = Color.FromArgb(153, 27, 27);

        public static readonly Bitmap Pause = CreatePause();
        public static readonly Bitmap Play = CreatePlay();
        public static readonly Bitmap Stop = CreateStop();

        private static Bitmap CreateSurface()
        {
            return new Bitmap(SizePx, SizePx, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        }

        private static void ConfigureGraphics(Graphics g)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.CompositingQuality = CompositingQuality.HighQuality;
            g.Clear(Color.Transparent);
        }

        private static GraphicsPath RoundedRect(RectangleF bounds, float radius)
        {
            var d = radius * 2f;
            var path = new GraphicsPath();
            if (radius <= 0)
            {
                path.AddRectangle(bounds);
                return path;
            }

            path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
            path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
            path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        private static Bitmap CreatePlay()
        {
            var bmp = CreateSurface();
            using (var g = Graphics.FromImage(bmp))
            {
                ConfigureGraphics(g);
                var cx = SizePx / 2f;
                var cy = SizePx / 2f;
                var r = SizePx * 0.36f;

                using (var disc = new GraphicsPath())
                {
                    disc.AddEllipse(cx - r, cy - r, r * 2f, r * 2f);
                    using (var fill = new SolidBrush(Color.FromArgb(235, 242, 255)))
                        g.FillPath(fill, disc);
                    using (var ring = new Pen(Color.FromArgb(186, 206, 252), 1.15f))
                        g.DrawPath(ring, disc);
                }

                var triW = SizePx * 0.2f;
                var triH = SizePx * 0.24f;
                var x = cx - triW * 0.28f;
                var y = cy - triH / 2f;

                using (var path = new GraphicsPath())
                {
                    path.AddLines(new[]
                    {
                        new PointF(x, y),
                        new PointF(x + triW, cy),
                        new PointF(x, y + triH),
                    });
                    path.CloseFigure();

                    using (var brush = new LinearGradientBrush(
                               new RectangleF(x - 1, y - 1, triW + 2, triH + 2),
                               PlayPauseLight,
                               PlayPauseDark,
                               LinearGradientMode.Vertical))
                    using (var pen = new Pen(OutlineBlue, 1f) { LineJoin = LineJoin.Round })
                    {
                        g.FillPath(brush, path);
                        g.DrawPath(pen, path);
                    }
                }
            }

            return bmp;
        }

        private static Bitmap CreatePause()
        {
            var bmp = CreateSurface();
            using (var g = Graphics.FromImage(bmp))
            {
                ConfigureGraphics(g);
                var cx = SizePx / 2f;
                var cy = SizePx / 2f;
                var r = SizePx * 0.36f;
                using (var disc = new GraphicsPath())
                {
                    disc.AddEllipse(cx - r, cy - r, r * 2f, r * 2f);
                    using (var fill = new SolidBrush(Color.FromArgb(235, 242, 255)))
                        g.FillPath(fill, disc);
                    using (var ring = new Pen(Color.FromArgb(186, 206, 252), 1.15f))
                        g.DrawPath(ring, disc);
                }

                var barW = SizePx * 0.14f;
                var barH = SizePx * 0.38f;
                var gap = SizePx * 0.11f;
                var x0 = cx - gap / 2f - barW;
                var y0 = (SizePx - barH) / 2f;
                var radius = barW * 0.48f;

                void DrawBar(float x)
                {
                    var rect = new RectangleF(x, y0, barW, barH);
                    using (var path = RoundedRect(rect, radius))
                    using (var brush = new LinearGradientBrush(
                               rect,
                               PlayPauseLight,
                               PlayPauseDark,
                               LinearGradientMode.Horizontal))
                    using (var pen = new Pen(OutlineBlue, 1f))
                    {
                        g.FillPath(brush, path);
                        g.DrawPath(pen, path);
                    }
                }

                DrawBar(x0);
                DrawBar(x0 + barW + gap);
            }

            return bmp;
        }

        private static Bitmap CreateStop()
        {
            var bmp = CreateSurface();
            using (var g = Graphics.FromImage(bmp))
            {
                ConfigureGraphics(g);
                var cx = SizePx / 2f;
                var cy = SizePx / 2f;
                var r = SizePx * 0.36f;
                using (var disc = new GraphicsPath())
                {
                    disc.AddEllipse(cx - r, cy - r, r * 2f, r * 2f);
                    using (var fill = new SolidBrush(Color.FromArgb(255, 241, 242)))
                        g.FillPath(fill, disc);
                    using (var ring = new Pen(Color.FromArgb(254, 202, 202), 1.15f))
                        g.DrawPath(ring, disc);
                }

                var s = SizePx * 0.34f;
                var o = (SizePx - s) / 2f;
                var rect = new RectangleF(o, o, s, s);
                var radius = s * 0.2f;

                using (var path = RoundedRect(rect, radius))
                using (var brush = new LinearGradientBrush(
                           rect,
                           StopLight,
                           StopDark,
                           LinearGradientMode.Vertical))
                using (var pen = new Pen(OutlineRed, 1f))
                {
                    g.FillPath(brush, path);
                    g.DrawPath(pen, path);
                }
            }

            return bmp;
        }
    }
}

