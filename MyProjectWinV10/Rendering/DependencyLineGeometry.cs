using MyProject.Models;
using MyProject.Theme;
using System.Drawing.Drawing2D;

namespace MyProject.Rendering
{
    public static class DependencyLineGeometry
    {
        public static List<Point> BuildPath(DependencyType type, int fromX, int fromY, int toX, int toY)
        {
            return type switch
            {
                DependencyType.FS => BuildFSPath(fromX, fromY, toX, toY),
                DependencyType.FF => BuildFFPath(fromX, fromY, toX, toY),
                DependencyType.SS => BuildSSPath(fromX, fromY, toX, toY),
                DependencyType.SF => BuildSFPath(fromX, fromY, toX, toY),
                _ => BuildFSPath(fromX, fromY, toX, toY)
            };
        }

        public static void DrawPath(Graphics g, Color color, IReadOnlyList<Point> pts, int arrowSize = 6, bool endArrow = true)
        {
            if (pts.Count < 2) return;

            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var pen = new Pen(color, 1.5f) { EndCap = LineCap.NoAnchor };
            g.DrawLines(pen, pts.ToArray());

            if (endArrow)
            {
                var last = pts[^1];
                var prev = pts[^2];
                DrawArrowHead(g, color, prev, last, arrowSize);
            }
        }

        public static void DrawPreview(Graphics g, Rectangle bounds, DependencyType type, Color? lineColor = null)
        {
            if (bounds.Width < 8 || bounds.Height < 8) return;

            lineColor ??= AppTheme.DependencyLine;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            int barH = Math.Max(4, bounds.Height / 5);
            int padX = 2;
            int topY = bounds.Y + bounds.Height / 4 - barH / 2;
            int bottomY = bounds.Y + bounds.Height * 3 / 4 - barH / 2;
            int innerW = bounds.Width - padX * 2;

            var predBar = type switch
            {
                DependencyType.SS or DependencyType.SF =>
                    new Rectangle(bounds.X + padX + innerW / 4, topY, innerW * 2 / 5, barH),
                _ =>
                    new Rectangle(bounds.X + padX, topY, innerW * 2 / 5, barH)
            };

            var succBar = type switch
            {
                DependencyType.FF or DependencyType.SF =>
                    new Rectangle(bounds.X + padX + innerW / 3, bottomY, innerW * 3 / 5, barH),
                DependencyType.SS =>
                    new Rectangle(bounds.X + padX, bottomY, innerW * 2 / 5, barH),
                _ =>
                    new Rectangle(bounds.X + padX + innerW * 2 / 5, bottomY, innerW * 2 / 5, barH)
            };

            using var barBrush = new SolidBrush(Color.FromArgb(180, 100, 120, 150));
            g.FillRectangle(barBrush, predBar);
            g.FillRectangle(barBrush, succBar);

            int fromX = type switch
            {
                DependencyType.SS or DependencyType.SF => predBar.Left,
                _ => predBar.Right
            };
            int fromY = predBar.Top + predBar.Height / 2;
            int toX = type switch
            {
                DependencyType.FF or DependencyType.SF => succBar.Right,
                _ => succBar.Left
            };
            int toY = succBar.Top + succBar.Height / 2;

            var pts = BuildPath(type, fromX, fromY, toX, toY);
            DrawPath(g, lineColor.Value, pts, arrowSize: 5);
        }

        private static List<Point> BuildFSPath(int fromX, int fromY, int toX, int toY)
        {
            const int gap = 8;
            var pts = new List<Point>
            {
                new(fromX, fromY),
                new(fromX + gap, fromY)
            };

            if (toX > fromX + gap * 2)
            {
                pts.Add(new Point(fromX + gap, toY));
                pts.Add(new Point(toX, toY));
            }
            else
            {
                int midY = (fromY + toY) / 2;
                pts.Add(new Point(fromX + gap, midY));
                pts.Add(new Point(toX - gap, midY));
                pts.Add(new Point(toX - gap, toY));
                pts.Add(new Point(toX, toY));
            }

            return pts;
        }

        private static List<Point> BuildFFPath(int fromX, int fromY, int toX, int toY)
        {
            const int gap = 12;
            int rightEdge = Math.Max(fromX, toX) + gap;
            return new List<Point>
            {
                new(fromX, fromY),
                new(rightEdge, fromY),
                new(rightEdge, toY),
                new(toX, toY)
            };
        }

        private static List<Point> BuildSSPath(int fromX, int fromY, int toX, int toY)
        {
            const int gap = 12;
            int leftEdge = Math.Min(fromX, toX) - gap;
            return new List<Point>
            {
                new(fromX, fromY),
                new(leftEdge, fromY),
                new(leftEdge, toY),
                new(toX, toY)
            };
        }

        private static List<Point> BuildSFPath(int fromX, int fromY, int toX, int toY)
        {
            const int gap = 12;
            int routeX = Math.Max(fromX, toX) + gap;
            return new List<Point>
            {
                new(fromX, fromY),
                new(routeX, fromY),
                new(routeX, toY),
                new(toX, toY)
            };
        }

        private static void DrawArrowHead(Graphics g, Color color, Point from, Point to, int size)
        {
            double angle = Math.Atan2(to.Y - from.Y, to.X - from.X);
            double a1 = angle + Math.PI * 0.75;
            double a2 = angle - Math.PI * 0.75;

            var head = new Point[]
            {
                to,
                new((int)(to.X + size * Math.Cos(a1)), (int)(to.Y + size * Math.Sin(a1))),
                new((int)(to.X + size * Math.Cos(a2)), (int)(to.Y + size * Math.Sin(a2)))
            };

            using var brush = new SolidBrush(color);
            g.FillPolygon(brush, head);
        }
    }
}
