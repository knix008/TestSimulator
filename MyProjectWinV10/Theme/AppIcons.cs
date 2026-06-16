using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace MyProject.Theme
{
    public static class AppIcons
    {
        private const int Size = 20;

        private static Bitmap Make(Action<Graphics> draw)
        {
            var bmp = new Bitmap(Size, Size, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            using var g = Graphics.FromImage(bmp);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            draw(g);
            return bmp;
        }

        public static Bitmap New => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            // Document body
            var pts = new Point[] { new(4,1), new(4,19), new(16,19), new(16,5), new(12,1), new(4,1) };
            g.DrawPolygon(p, pts);
            // Dog ear
            g.DrawLine(p, 12, 1, 12, 5);
            g.DrawLine(p, 12, 5, 16, 5);
            // Lines
            g.DrawLine(p, 6, 9, 14, 9);
            g.DrawLine(p, 6, 12, 14, 12);
            g.DrawLine(p, 6, 15, 11, 15);
        });

        public static Bitmap Open => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            using var b = new SolidBrush(Color.White);
            // Folder body
            var body = new Point[] { new(2,7), new(2,17), new(18,17), new(18,7), new(2,7) };
            g.DrawPolygon(p, body);
            // Folder tab
            var tab = new Point[] { new(2,7), new(7,7), new(9,4), new(13,4), new(13,7) };
            g.DrawLines(p, tab);
            // Arrow up (open)
            var arrow = new Point[] { new(10,8), new(10,14), new(7,11), new(10,8), new(13,11), new(10,14) };
            g.DrawLines(p, new Point[] { new(7,12), new(10,8), new(13,12) });
            g.DrawLine(p, 10, 8, 10, 15);
        });

        public static Bitmap Save => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            using var b = new SolidBrush(Color.White);
            // Disk outer
            g.DrawRectangle(p, 2, 2, 16, 16);
            // Label area
            g.FillRectangle(new SolidBrush(Color.FromArgb(180, 255, 255, 255)), 4, 2, 9, 6);
            // Bottom write area
            g.DrawRectangle(p, 5, 11, 10, 6);
            // Spiral lines
            g.DrawLine(p, 8, 4, 8, 7);
        });

        public static Bitmap AddTask => Make(g =>
        {
            using var p = new Pen(Color.White, 2f);
            g.DrawLine(p, 10, 3, 10, 17);
            g.DrawLine(p, 3, 10, 17, 10);
        });

        public static Bitmap AddSubtask => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            using var ap = new Pen(Color.White, 2f);
            g.DrawLine(p, 6, 5, 17, 5);
            g.DrawLine(p, 9, 9, 17, 9);
            g.DrawLine(p, 9, 13, 17, 13);
            g.DrawLine(ap, 3, 9, 7, 9);
            g.DrawLine(ap, 5, 7, 5, 11);
        });

        public static Bitmap ExpandCollapse => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            using var ap = new Pen(Color.White, 2f);
            g.DrawLine(p, 8, 5, 17, 5);
            g.DrawLine(p, 8, 10, 17, 10);
            g.DrawLine(p, 8, 15, 17, 15);
            g.DrawLine(ap, 3, 7, 6, 10);
            g.DrawLine(ap, 3, 13, 6, 10);
        });

        public static Bitmap Delete => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            // Trash can
            g.DrawRectangle(p, 4, 6, 12, 12);
            g.DrawLine(p, 2, 6, 18, 6);
            g.DrawLine(p, 7, 4, 13, 4);
            g.DrawLine(p, 7, 10, 7, 15);
            g.DrawLine(p, 10, 10, 10, 15);
            g.DrawLine(p, 13, 10, 13, 15);
        });

        public static Bitmap Indent => Make(g =>
        {
            using var linePen = new Pen(Color.White, 1.5f);
            using var arrowBrush = new SolidBrush(Color.White);
            // Parent row
            g.DrawLine(linePen, 2, 5, 18, 5);
            // Indented child rows
            g.DrawLine(linePen, 10, 10, 18, 10);
            g.DrawLine(linePen, 10, 15, 18, 15);
            // Hierarchy elbow
            g.DrawLine(linePen, 8, 5, 8, 10);
            g.DrawLine(linePen, 8, 10, 10, 10);
            // Prominent right-pointing chevron
            g.FillPolygon(arrowBrush, new Point[] { new(2, 7), new(7, 10), new(2, 13) });
        });

        public static Bitmap Outdent => Make(g =>
        {
            using var linePen = new Pen(Color.White, 1.5f);
            using var arrowBrush = new SolidBrush(Color.White);
            // Parent row
            g.DrawLine(linePen, 2, 5, 18, 5);
            // Outdented child rows (left aligned)
            g.DrawLine(linePen, 2, 10, 12, 10);
            g.DrawLine(linePen, 2, 15, 12, 15);
            // Hierarchy elbow lifting child to parent level
            g.DrawLine(linePen, 8, 10, 8, 5);
            // Prominent left-pointing chevron
            g.FillPolygon(arrowBrush, new Point[] { new(18, 7), new(13, 10), new(18, 13) });
        });

        public static Bitmap ZoomIn => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawEllipse(p, 2, 2, 11, 11);
            g.DrawLine(p, 11, 11, 17, 17);
            g.DrawLine(p, 7, 7, 7, 11);  // vertical
            g.DrawLine(p, 5, 9, 9, 9);   // horizontal
        });

        public static Bitmap ZoomOut => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawEllipse(p, 2, 2, 11, 11);
            g.DrawLine(p, 11, 11, 17, 17);
            g.DrawLine(p, 5, 9, 9, 9);
        });

        public static Bitmap ZoomDefault => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawEllipse(p, 2, 2, 11, 11);
            g.DrawLine(p, 11, 11, 17, 17);
            g.DrawLine(p, 5, 7, 9, 7);
            g.DrawLine(p, 5, 10, 9, 10);
        });

        public static Bitmap Today => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 2, 4, 16, 14);
            g.DrawLine(p, 2, 8, 18, 8);
            g.DrawLine(p, 6, 2, 6, 6);
            g.DrawLine(p, 14, 2, 14, 6);
            using var todayPen = new Pen(Color.FromArgb(255, 100, 100), 1.5f);
            g.DrawRectangle(todayPen, 9, 10, 4, 5);
        });

        public static Bitmap Properties => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 2, 2, 16, 16);
            g.DrawLine(p, 5, 7, 15, 7);
            g.DrawLine(p, 5, 10, 15, 10);
            g.DrawLine(p, 5, 13, 11, 13);
        });

        public static Bitmap Notes => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            var rect = new Rectangle(3, 3, 14, 14);
            using var grad = new LinearGradientBrush(rect, Color.FromArgb(255, 252, 220), Color.FromArgb(255, 238, 170), LinearGradientMode.Vertical);
            g.FillRectangle(grad, rect);
            g.DrawRectangle(p, rect);
            float fold = 4f;
            g.DrawLine(p, rect.Right - fold, rect.Top, rect.Right, rect.Top + fold);
            g.DrawLine(p, rect.Right - fold, rect.Top, rect.Right - fold, rect.Top + fold);
            g.DrawLine(p, rect.Right - fold, rect.Top + fold, rect.Right, rect.Top + fold);
            g.DrawLine(p, 5, 8, 13, 8);
            g.DrawLine(p, 5, 11, 11, 11);
        });

        public static Bitmap Link => Make(g =>
        {
            using var p = new Pen(Color.White, 1.8f);
            // Chain link icon
            g.DrawLine(p, 4, 10, 16, 10);
            // Arrow head
            var pts = new Point[] { new(13, 7), new(16, 10), new(13, 13) };
            g.DrawLines(p, pts);
            // Circles (anchor points)
            g.DrawEllipse(p, 2, 8, 4, 4);
            g.DrawEllipse(p, 14, 8, 4, 4);
        });

        public static Bitmap Unlink => Make(g =>
        {
            using var p = new Pen(Color.White, 1.8f);
            g.DrawEllipse(p, 2, 8, 4, 4);
            g.DrawEllipse(p, 14, 8, 4, 4);
            g.DrawLine(p, 5, 7, 15, 13);
            using var xp = new Pen(Color.White, 2.2f);
            g.DrawLine(xp, 8, 5, 12, 9);
            g.DrawLine(xp, 12, 5, 8, 9);
        });

        public static Bitmap Report => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 3, 1, 14, 18);
            g.DrawLine(p, 6, 6, 14, 6);
            g.DrawLine(p, 6, 9, 14, 9);
            g.DrawLine(p, 6, 12, 14, 12);
            // Chart bars
            using var b = new SolidBrush(Color.FromArgb(180, 255, 255, 255));
            g.FillRectangle(b, 6, 14, 3, 4);
            g.FillRectangle(b, 10, 12, 3, 6);
            g.FillRectangle(new SolidBrush(Color.FromArgb(100, 255, 255, 255)), 6, 6, 8, 8);
        });

        public static Bitmap Excel => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 2, 2, 16, 16);
            g.DrawLine(p, 2, 7, 18, 7);
            g.DrawLine(p, 7, 7, 7, 18);
            using var b = new SolidBrush(Color.FromArgb(180, 255, 255, 255));
            g.FillRectangle(b, 3, 3, 3, 3);
            g.FillRectangle(b, 8, 3, 3, 3);
            g.FillRectangle(b, 13, 3, 3, 3);
            g.FillRectangle(b, 3, 8, 3, 3);
            g.FillRectangle(b, 8, 8, 3, 3);
            g.FillRectangle(b, 13, 8, 3, 3);
        });

        public static Bitmap Print => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 3, 6, 14, 9);
            g.DrawRectangle(p, 5, 12, 10, 6);
            g.DrawRectangle(p, 5, 2, 10, 5);
            g.DrawEllipse(p, 13, 8, 2, 2);
        });

        public static Bitmap File => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 3, 2, 14, 16);
            g.DrawLine(p, 3, 6, 17, 6);
            g.DrawLine(p, 6, 9, 14, 9);
            g.DrawLine(p, 6, 12, 14, 12);
            g.DrawLine(p, 6, 15, 11, 15);
        });

        public static Bitmap SaveAs => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 2, 2, 12, 12);
            g.FillRectangle(new SolidBrush(Color.FromArgb(180, 255, 255, 255)), 3, 2, 7, 4);
            g.DrawRectangle(p, 4, 9, 8, 5);
            using var ap = new Pen(Color.White, 1.8f);
            g.DrawLine(ap, 14, 14, 18, 10);
            g.DrawLine(ap, 14, 14, 17, 14);
            g.DrawLine(ap, 14, 14, 14, 17);
        });

        public static Bitmap Exit => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 3, 3, 10, 14);
            g.DrawLine(p, 3, 3, 13, 3);
            using var ap = new Pen(Color.White, 2f);
            g.DrawLine(ap, 12, 10, 18, 10);
            g.DrawLine(ap, 15, 7, 18, 10);
            g.DrawLine(ap, 15, 13, 18, 10);
        });

        public static Bitmap Edit => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            var pts = new Point[] { new(14, 3), new(17, 6), new(7, 16), new(3, 17), new(4, 13), new(14, 3) };
            g.DrawPolygon(p, pts);
            g.DrawLine(p, 4, 13, 7, 16);
        });

        public static Bitmap View => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            var eye = new Point[] { new(2, 10), new(10, 4), new(18, 10), new(10, 16), new(2, 10) };
            g.DrawPolygon(p, eye);
            g.DrawEllipse(p, 8, 8, 4, 4);
        });

        public static Bitmap Calendar => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 3, 4, 14, 14);
            g.DrawLine(p, 3, 8, 17, 8);
            g.DrawLine(p, 7, 2, 7, 6);
            g.DrawLine(p, 13, 2, 13, 6);
            g.FillRectangle(new SolidBrush(Color.White), 6, 11, 3, 3);
            g.FillRectangle(new SolidBrush(Color.White), 11, 11, 3, 3);
        });

        public static Bitmap CalendarWeekly => Make(g =>
        {
            using var p = new Pen(Color.White, 1.3f);
            g.DrawRectangle(p, 2, 4, 16, 14);
            g.DrawLine(p, 2, 8, 18, 8);
            using var row = new SolidBrush(Color.FromArgb(210, 255, 255, 255));
            g.FillRectangle(row, 3, 9, 14, 4);
            for (int c = 0; c < 7; c++)
            {
                int x = 3 + c * 2;
                g.DrawRectangle(p, x, 10, 2, 2);
            }
        });

        public static Bitmap CalendarMonthly => Make(g =>
        {
            using var p = new Pen(Color.White, 1.2f);
            g.DrawRectangle(p, 2, 3, 16, 15);
            g.DrawLine(p, 2, 7, 18, 7);
            for (int r = 1; r <= 4; r++)
                g.DrawLine(p, 3, 3 + r * 3, 17, 3 + r * 3);
            for (int c = 1; c <= 5; c++)
                g.DrawLine(p, 2 + c * 3, 7, 2 + c * 3, 17);
        });

        public static Bitmap CalendarYearly => Make(g =>
        {
            using var p = new Pen(Color.White, 1.1f);
            for (int row = 0; row < 3; row++)
            {
                for (int col = 0; col < 4; col++)
                {
                    int x = 2 + col * 4;
                    int y = 3 + row * 5;
                    g.DrawRectangle(p, x, y, 3, 4);
                }
            }
        });

        public static Bitmap Markdown => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 3, 2, 14, 16);
            // Markdown heading hash
            g.DrawLine(p, 5, 6, 11, 6);
            g.DrawLine(p, 5, 9, 11, 9);
            g.DrawLine(p, 7, 5, 7, 10);
            g.DrawLine(p, 9, 5, 9, 10);
            // Body lines
            g.DrawLine(p, 5, 12, 14, 12);
            g.DrawLine(p, 5, 15, 11, 15);
        });

        public static Bitmap Pdf => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            var pts = new Point[] { new(3, 2), new(3, 18), new(15, 18), new(15, 6), new(11, 2), new(3, 2) };
            g.DrawPolygon(p, pts);
            g.DrawLine(p, 11, 2, 11, 6);
            g.DrawLine(p, 11, 6, 15, 6);
            g.DrawLine(p, 5, 8, 13, 8);
            g.DrawLine(p, 5, 10, 13, 10);
            using var badge = new SolidBrush(Color.FromArgb(235, 211, 47, 47));
            g.FillRectangle(badge, 4, 13, 10, 4);
            using var f = new Font("Segoe UI", 4f, FontStyle.Bold);
            TextRenderer.DrawText(
                g,
                "PDF",
                f,
                new Rectangle(4, 12, 10, 5),
                Color.White,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.NoPadding);
        });

        public static Bitmap Html => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 3, 3, 14, 14);
            using var f = new Font("Segoe UI", 7f, FontStyle.Bold);
            g.DrawString("</>", f, Brushes.White, 4, 5);
        });

        public static Bitmap Word => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            var pts = new Point[] { new(3, 2), new(3, 18), new(15, 18), new(15, 6), new(11, 2), new(3, 2) };
            g.DrawPolygon(p, pts);
            g.DrawLine(p, 11, 2, 11, 6);
            g.DrawLine(p, 11, 6, 15, 6);
            using var f = new Font("Segoe UI", 7f, FontStyle.Bold);
            g.DrawString("W", f, Brushes.White, 6, 6);
        });

        public static Bitmap PropertiesPanel => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 2, 3, 7, 14);
            g.DrawLine(p, 12, 5, 16, 5);
            g.DrawLine(p, 12, 9, 16, 9);
            g.DrawLine(p, 12, 13, 16, 13);
        });

        public static Bitmap CriticalPath => Make(g =>
        {
            using var p = new Pen(Color.White, 1.8f);
            g.DrawLine(p, 3, 15, 7, 11);
            g.DrawLine(p, 7, 11, 11, 13);
            g.DrawLine(p, 11, 13, 15, 5);
            using var accent = new Pen(Color.FromArgb(255, 100, 90), 2f);
            g.DrawLine(accent, 2, 16, 6, 12);
            g.DrawLine(accent, 6, 12, 10, 14);
            g.DrawLine(accent, 10, 14, 14, 4);
        });

        public static Bitmap Image => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 3, 3, 14, 12);
            g.DrawEllipse(p, 6, 6, 5, 4);
            g.DrawLine(p, 4, 16, 16, 4);
        });

        public static Bitmap Undo => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            // Arrow shaft pointing left
            g.DrawLine(p, 16, 7, 6, 7);
            // Arrowhead (pointing left)
            g.DrawLine(p, 6, 7, 9, 4);
            g.DrawLine(p, 6, 7, 9, 10);
            // Curve at right end going down
            g.DrawArc(p, 6, 7, 10, 9, 0, -180);
        });

        public static Bitmap Redo => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            // Arrow shaft pointing right
            g.DrawLine(p, 4, 7, 14, 7);
            // Arrowhead (pointing right)
            g.DrawLine(p, 14, 7, 11, 4);
            g.DrawLine(p, 14, 7, 11, 10);
            // Curve at left end going down
            g.DrawArc(p, 4, 7, 10, 9, 180, 180);
        });

        public static Bitmap Info => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawEllipse(p, 3, 3, 14, 14);
            using var b = new SolidBrush(Color.White);
            g.FillEllipse(b, 9, 6, 2, 2);
            g.DrawLine(p, 10, 9, 10, 15);
        });
    }
}
