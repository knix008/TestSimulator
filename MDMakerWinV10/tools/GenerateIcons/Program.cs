using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Runtime.InteropServices;

internal static class GenerateIcons
{
    const int Size = 32;

    static readonly Color WinBlue   = Color.FromArgb(0, 120, 212);
    static readonly Color DarkBlue  = Color.FromArgb(0, 90, 158);
    static readonly Color Gold      = Color.FromArgb(255, 185, 0);
    static readonly Color DarkGold  = Color.FromArgb(180, 125, 0);
    static readonly Color Green     = Color.FromArgb(16, 137, 62);
    static readonly Color Red       = Color.FromArgb(196, 43, 28);
    static readonly Color Gray      = Color.FromArgb(96, 96, 96);
    static readonly Color PageFill  = Color.FromArgb(252, 252, 255);
    static readonly Color PageEdge  = Color.FromArgb(110, 110, 130);

    public static void Main()
    {
        var outDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "assets", "icons"));
        Directory.CreateDirectory(outDir);

        Save(DrawFolder(), "folder.png", outDir);
        Save(DrawSave(), "save.png", outDir);
        Save(DrawRefresh(), "refresh.png", outDir);
        Save(DrawChevron(true), "move-up.png", outDir);
        Save(DrawChevron(false), "move-down.png", outDir);
        Save(DrawGenerate(), "generate.png", outDir);
        Save(DrawPreview(), "preview.png", outDir);
        Save(DrawSettings(), "settings.png", outDir);
        Save(DrawRenumber(), "renumber.png", outDir);
        Save(DrawDocument(), "document.png", outDir);
        Save(DrawList(), "list.png", outDir);
        Save(DrawMerge(), "merge.png", outDir);
        Save(DrawOk(), "ok.png", outDir);
        Save(DrawCancel(), "cancel.png", outDir);
        Save(DrawProjectNew(), "project-new.png", outDir);
        Save(DrawProjectOpen(), "project-open.png", outDir);
        Save(DrawProjectSave(), "project-save.png", outDir);
        Save(DrawProjectSaveAs(), "project-save-as.png", outDir);

        Save(ShellFile(".html"), "export-html.png", outDir);
        Save(ShellFile(".docx"), "export-word.png", outDir);
        Save(ShellFile(".pdf"), "export-pdf.png", outDir);

        Console.WriteLine($"Generated icons in {outDir}");
    }

    static void Save(Bitmap? bmp, string name, string dir)
    {
        if (bmp == null) throw new InvalidOperationException($"Failed: {name}");
        var path = Path.Combine(dir, name);
        bmp.Save(path, System.Drawing.Imaging.ImageFormat.Png);
        bmp.Dispose();
        Console.WriteLine($"  {name}");
    }

    static Bitmap Canvas(Action<Graphics> draw)
    {
        var bmp = new Bitmap(Size, Size, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        g.Clear(Color.Transparent);
        draw(g);
        return bmp;
    }

    static Pen P(Color c, float w = 1.5f) => new(c, w) { LineJoin = LineJoin.Round, StartCap = LineCap.Round, EndCap = LineCap.Round };
    static SolidBrush B(Color c) => new(c);

    static Bitmap DrawFolder() => Canvas(g =>
    {
        using var body = new GraphicsPath();
        body.AddLines(new[] { new Point(3, 10), new Point(12, 10), new Point(14, 7), new Point(29, 7), new Point(29, 27), new Point(3, 27) });
        g.FillPath(B(Gold), body);
        g.DrawPath(P(DarkGold, 1.2f), body);
        g.FillRectangle(B(Color.FromArgb(255, 210, 60)), 3, 10, 26, 4);
    });

    static Bitmap DrawSave() => Canvas(g =>
    {
        g.FillRectangle(B(Color.FromArgb(0, 99, 177)), 6, 4, 20, 24);
        g.DrawRectangle(P(DarkBlue, 1f), 6, 4, 20, 24);
        g.FillRectangle(B(Color.FromArgb(200, 220, 240)), 9, 4, 14, 7);
        g.FillRectangle(B(Color.White), 9, 13, 14, 12);
        g.DrawRectangle(P(DarkBlue, 0.8f), 9, 13, 14, 12);
        g.FillRectangle(B(DarkBlue), 11, 4, 10, 3);
        g.FillRectangle(B(Color.FromArgb(0, 70, 130)), 13, 17, 6, 2);
    });

    // 원형 화살표(리로드) — 상단 화살촉, 시계 방향
    static Bitmap DrawRefresh() => Canvas(g =>
    {
        var rect = new RectangleF(6.5f, 6.5f, 19, 19);
        using var pen = P(WinBlue, 3.2f);
        g.DrawArc(pen, rect, 50, 295);
        g.FillPolygon(B(WinBlue), new PointF[] { new(16, 6), new(22, 10), new(18, 13) });
    });

    static Bitmap DrawChevron(bool up) => Canvas(g =>
    {
        var pts = up
            ? new[] { new Point(16, 8), new Point(26, 22), new Point(6, 22) }
            : new[] { new Point(16, 24), new Point(26, 10), new Point(6, 10) };
        g.FillPolygon(B(WinBlue), pts);
        g.DrawPolygon(P(DarkBlue, 1f), pts);
    });

    static Bitmap DrawGenerate() => Canvas(g =>
    {
        g.FillRectangle(B(Color.FromArgb(220, 230, 245)), 4, 6, 11, 14);
        g.DrawRectangle(P(PageEdge, 1f), 4, 6, 11, 14);
        g.FillRectangle(B(PageFill), 7, 3, 11, 14);
        g.DrawRectangle(P(PageEdge, 1f), 7, 3, 11, 14);
        g.DrawLine(P(PageEdge, 0.8f), 9, 3, 9, 6);
        g.DrawLine(P(PageEdge, 0.8f), 9, 6, 12, 6);
        g.FillRectangle(B(WinBlue), 18, 12, 11, 15);
        g.DrawRectangle(P(DarkBlue, 1f), 18, 12, 11, 15);
        using var pen = P(Color.White, 2.2f);
        g.DrawLine(pen, 20, 20, 27, 20);
        g.DrawLine(pen, 23, 17, 23, 23);
        using var f = new Font("Segoe UI", 7f, FontStyle.Bold);
        g.DrawString("MD", f, B(Color.White), 19, 12);
    });

    static Bitmap DrawPreview() => Canvas(g =>
    {
        g.DrawArc(P(Gray, +2f), 3, 9, 26, 14, 0, 180);
        g.DrawArc(P(Gray, 2f), 3, 9, 26, 14, 180, 180);
        g.FillEllipse(B(WinBlue), 10, 13, 12, 12);
        g.FillEllipse(B(Color.White), 12, 15, 8, 8);
        g.FillEllipse(B(Color.FromArgb(30, 30, 30)), 14, 17, 4, 4);
    });

    static Bitmap DrawSettings() => Canvas(g =>
    {
        var cx = 16f; var cy = 16f; var outer = 11f; var inner = 7f;
        var pts = new PointF[8];
        for (int i = 0; i < 8; i++)
        {
            double a = i * Math.PI / 4 - Math.PI / 2;
            double b = a + Math.PI / 8;
            pts[i] = new PointF(cx + (float)(outer * Math.Cos(a)), cy + (float)(outer * Math.Sin(a)));
        }
        g.FillEllipse(B(Gray), cx - 4, cy - 4, 8, 8);
        using var path = new GraphicsPath();
        for (int i = 0; i < 8; i++)
        {
            double a1 = i * Math.PI / 4 - Math.PI / 2;
            double a2 = a1 + Math.PI / 4;
            var p1 = new PointF(cx + (float)(outer * Math.Cos(a1)), cy + (float)(outer * Math.Sin(a1)));
            var p2 = new PointF(cx + (float)(inner * Math.Cos(a1 + Math.PI / 8)), cy + (float)(inner * Math.Sin(a1 + Math.PI / 8)));
            var p3 = new PointF(cx + (float)(outer * Math.Cos(a2)), cy + (float)(outer * Math.Sin(a2)));
            if (i == 0) path.StartFigure();
            path.AddLine(p1, p2);
            path.AddLine(p2, p3);
        }
        path.CloseFigure();
        g.FillPath(B(Color.FromArgb(140, 140, 145)), path);
        g.DrawPath(P(Color.FromArgb(80, 80, 85), 0.8f), path);
        g.FillEllipse(B(Gray), cx - 4, cy - 4, 8, 8);
    });

    static Bitmap DrawRenumber() => Canvas(g =>
    {
        using var f = new Font("Segoe UI", 8f, FontStyle.Bold);
        g.DrawString("1.", f, B(WinBlue), 4, 5);
        g.DrawString("2.", f, B(WinBlue), 4, 13);
        g.DrawString("3.", f, B(WinBlue), 4, 21);
        g.DrawLine(P(Gray, 1.2f), 16, 8, 28, 8);
        g.DrawLine(P(Gray, 1.2f), 16, 16, 28, 16);
        g.DrawLine(P(Gray, 1.2f), 16, 24, 28, 24);
        using var pen = P(Green, 2f);
        g.DrawArc(pen, 20, 2, 10, 10, 200, 120);
        g.FillPolygon(B(Green), new[] { new Point(28, 4), new Point(28, 10), new Point(24, 7) });
    });

    static Bitmap DrawDocument() => Canvas(g =>
    {
        g.FillRectangle(B(PageFill), 8, 3, 16, 26);
        g.DrawRectangle(P(PageEdge, 1.2f), 8, 3, 16, 26);
        g.DrawLine(P(PageEdge, 1f), 12, 3, 20, 10);
        g.DrawLine(P(PageEdge, 1f), 20, 10, 20, 12);
        g.DrawLine(P(PageEdge, 1f), 12, 10, 20, 10);
        g.DrawLine(P(Color.FromArgb(200, 200, 210), 1f), 11, 15, 21, 15);
        g.DrawLine(P(Color.FromArgb(200, 200, 210), 1f), 11, 19, 21, 19);
        g.DrawLine(P(Color.FromArgb(200, 200, 210), 1f), 11, 23, 18, 23);
    });

    static Bitmap DrawList() => Canvas(g =>
    {
        for (int i = 0; i < 3; i++)
        {
            int y = 7 + i * 9;
            g.FillEllipse(B(WinBlue), 5, y, 4, 4);
            g.DrawLine(P(Gray, 1.5f), 12, y + 2, 27, y + 2);
        }
    });

    static Bitmap DrawMerge() => Canvas(g =>
    {
        g.FillRectangle(B(Color.FromArgb(220, 230, 245)), 3, 8, 10, 13);
        g.DrawRectangle(P(PageEdge, 1f), 3, 8, 10, 13);
        g.FillRectangle(B(Color.FromArgb(220, 230, 245)), 3, 14, 10, 13);
        g.DrawRectangle(P(PageEdge, 1f), 3, 14, 10, 13);
        using var pen = P(WinBlue, 2.5f);
        g.DrawLine(pen, 15, 16, 21, 16);
        g.FillPolygon(B(WinBlue), new[] { new Point(21, 12), new Point(27, 16), new Point(21, 20) });
        g.FillRectangle(B(PageFill), 22, 9, 8, 14);
        g.DrawRectangle(P(PageEdge, 1f), 22, 9, 8, 14);
    });

    static Bitmap DrawOk() => Canvas(g =>
    {
        g.FillEllipse(B(Green), 4, 4, 24, 24);
        using var pen = P(Color.White, 3f);
        g.DrawLines(pen, new[] { new Point(9, 16), new Point(14, 22), new Point(24, 10) });
    });

    static Bitmap DrawCancel() => Canvas(g =>
    {
        g.FillEllipse(B(Color.FromArgb(240, 240, 240)), 4, 4, 24, 24);
        g.DrawEllipse(P(Gray, 1.2f), 4, 4, 24, 24);
        using var pen = P(Red, 2.5f);
        g.DrawLine(pen, 11, 11, 21, 21);
        g.DrawLine(pen, 21, 11, 11, 21);
    });

    static Bitmap DrawProjectNew() => Canvas(g =>
    {
        g.FillRectangle(B(PageFill), 6, 5, 14, 20);
        g.DrawRectangle(P(PageEdge, 1.2f), 6, 5, 14, 20);
        g.DrawLine(P(PageEdge, 1f), 10, 5, 16, 11);
        g.DrawLine(P(PageEdge, 1f), 16, 11, 16, 13);
        using var pen = P(Green, 2.2f);
        g.DrawLine(pen, 22, 14, 22, 26);
        g.DrawLine(pen, 16, 20, 28, 20);
    });

    static Bitmap DrawProjectOpen() => Canvas(g =>
    {
        using var body = new GraphicsPath();
        body.AddLines(new[] { new Point(2, 12), new Point(10, 12), new Point(12, 9), new Point(22, 9), new Point(22, 24), new Point(2, 24) });
        g.FillPath(B(Gold), body);
        g.DrawPath(P(DarkGold, 1f), body);
        g.FillRectangle(B(PageFill), 12, 14, 14, 14);
        g.DrawRectangle(P(PageEdge, 1f), 12, 14, 14, 14);
        using var f = new Font("Segoe UI", 6f, FontStyle.Bold);
        g.DrawString("MD", f, B(WinBlue), 14, 16);
    });

    static Bitmap DrawProjectSave() => Canvas(g =>
    {
        g.FillRectangle(B(Color.FromArgb(0, 99, 177)), 8, 4, 16, 22);
        g.DrawRectangle(P(DarkBlue, 1f), 8, 4, 16, 22);
        g.FillRectangle(B(Color.White), 11, 12, 10, 10);
        g.DrawRectangle(P(DarkBlue, 0.8f), 11, 12, 10, 10);
        using var f = new Font("Segoe UI", 6f, FontStyle.Bold);
        g.DrawString("M", f, B(DarkBlue), 13, 13);
    });

    static Bitmap DrawProjectSaveAs() => Canvas(g =>
    {
        g.FillRectangle(B(PageFill), 4, 6, 13, 18);
        g.DrawRectangle(P(PageEdge, 1.2f), 4, 6, 13, 18);
        g.FillRectangle(B(PageFill), 10, 3, 13, 18);
        g.DrawRectangle(P(PageEdge, 1.2f), 10, 3, 13, 18);
        using var pen = P(WinBlue, 2f);
        g.DrawLine(pen, 22, 18, 28, 24);
        g.FillPolygon(B(WinBlue), new[] { new Point(24, 24), new Point(28, 24), new Point(26, 28) });
    });

    static Bitmap? ShellFile(string ext)
    {
        var shfi = new SHFILEINFO();
        SHGetFileInfo($"file{ext}", 0x80, ref shfi, (uint)Marshal.SizeOf(shfi), 0x100 | 0x10);
        if (shfi.hIcon == IntPtr.Zero) return null;
        using var icon = Icon.FromHandle(shfi.hIcon);
        var src = icon.ToBitmap();
        DestroyIcon(shfi.hIcon);
        return Resize(src, Size);
    }

    static Bitmap Resize(Image src, int size)
    {
        if (src.Width == size && src.Height == size)
            return new Bitmap(src);
        var bmp = new Bitmap(size, size);
        using var g = Graphics.FromImage(bmp);
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.DrawImage(src, 0, 0, size, size);
        return bmp;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct SHFILEINFO
    {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbSizeFileInfo, uint uFlags);

    [DllImport("user32.dll")]
    static extern bool DestroyIcon(IntPtr hIcon);
}
