using System.Drawing.Drawing2D;

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
            using var p = new Pen(Color.White, 1.5f);
            // Three lines (indented)
            g.DrawLine(p, 2, 5, 18, 5);
            g.DrawLine(p, 6, 10, 18, 10);
            g.DrawLine(p, 6, 15, 18, 15);
            // Arrow
            using var ap = new Pen(Color.White, 2f);
            g.DrawLine(ap, 2, 10, 5, 10);
            g.DrawLine(ap, 3, 8, 5, 10);
            g.DrawLine(ap, 3, 12, 5, 10);
        });

        public static Bitmap Outdent => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawLine(p, 2, 5, 18, 5);
            g.DrawLine(p, 6, 10, 18, 10);
            g.DrawLine(p, 6, 15, 18, 15);
            using var ap = new Pen(Color.White, 2f);
            g.DrawLine(ap, 7, 10, 4, 10);
            g.DrawLine(ap, 6, 8, 4, 10);
            g.DrawLine(ap, 6, 12, 4, 10);
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

        public static Bitmap Today => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 2, 4, 16, 14);
            g.DrawLine(p, 2, 8, 18, 8);
            g.DrawLine(p, 6, 2, 6, 6);
            g.DrawLine(p, 14, 2, 14, 6);
            // Today marker
            using var b = new SolidBrush(Color.FromArgb(255, 100, 100));
            g.FillRectangle(b, 9, 10, 4, 5);
        });

        public static Bitmap Properties => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 2, 2, 16, 16);
            g.DrawLine(p, 5, 7, 15, 7);
            g.DrawLine(p, 5, 10, 15, 10);
            g.DrawLine(p, 5, 13, 11, 13);
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

        public static Bitmap Markdown => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            g.DrawRectangle(p, 3, 2, 14, 16);
            using var f = new Font("Segoe UI", 8f, FontStyle.Bold);
            g.DrawString("M", f, Brushes.White, 6, 5);
            g.DrawLine(p, 5, 14, 15, 14);
        });

        public static Bitmap Pdf => Make(g =>
        {
            using var p = new Pen(Color.White, 1.5f);
            var pts = new Point[] { new(3, 2), new(3, 18), new(15, 18), new(15, 6), new(11, 2), new(3, 2) };
            g.DrawPolygon(p, pts);
            g.DrawLine(p, 11, 2, 11, 6);
            g.DrawLine(p, 11, 6, 15, 6);
            using var f = new Font("Segoe UI", 6f, FontStyle.Bold);
            g.DrawString("PDF", f, Brushes.White, 4, 9);
        });
    }
}
