using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

namespace FileMasterWinV10.Helpers;

/// <summary>
/// 메뉴·툴바용 16×16 아이콘을 제공합니다.
/// 시스템 Stock 아이콘을 우선 사용하고, 없는 것은 직접 그립니다.
/// </summary>
public static class MenuIconProvider
{
    // ── Windows Shell stock-icon API ──────────────────────────────────────

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SHSTOCKICONINFO
    {
        public uint cbSize;
        public IntPtr hIcon;
        public int iSysImageIndex;
        public int iIcon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szPath;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHGetStockIconInfo(uint siid, uint uFlags, ref SHSTOCKICONINFO psii);

    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr hIcon);

    private const uint SHGSI_ICON      = 0x100;
    private const uint SHGSI_SMALLICON = 0x001;

    // ── SHSTOCKICONID values used here ───────────────────────────────────
    private const uint SIID_DOCNOASSOC  = 0;
    private const uint SIID_FOLDER      = 3;
    private const uint SIID_FOLDEROPEN  = 4;
    private const uint SIID_RECYCLER    = 31;
    private const uint SIID_FIND        = 22;
    private const uint SIID_ZIPFILE     = 105;

    // ── Icon cache ───────────────────────────────────────────────────────

    private static readonly Dictionary<string, Image?> _cache = new();

    static MenuIconProvider()
    {
        _cache["folder"]      = Stock(SIID_FOLDER);
        _cache["folder_open"] = Stock(SIID_FOLDEROPEN);
        _cache["file"]        = Stock(SIID_DOCNOASSOC);
        _cache["search"]      = Stock(SIID_FIND);
        _cache["zip"]         = Stock(SIID_ZIPFILE);

        _cache["folder_new"]  = DrawFolderNew();
        _cache["file_new"]    = DrawFileNew();
        _cache["copy"]        = DrawCopy();
        _cache["copy_right"]  = DrawCopyRight();
        _cache["cut"]         = DrawCut();
        _cache["paste"]       = DrawPaste();
        _cache["move_right"]  = DrawMoveRight();
        _cache["rename"]      = DrawRename();
        _cache["delete"]      = DrawDelete();
        _cache["refresh"]     = DrawRefresh();
        _cache["bookmark"]    = DrawBookmark();
        _cache["preview"]     = DrawPreview();
        _cache["properties"]  = DrawProperties();
        _cache["unzip"]       = DrawUnzip();
        _cache["exit"]        = DrawExit();
        _cache["select_all"]  = DrawSelectAll();
        _cache["open_with"]   = DrawOpenWith();
    }

    public static Image? Get(string key) =>
        _cache.TryGetValue(key, out var img) ? img : null;

    // ── Stock icon loader ────────────────────────────────────────────────

    private static Image? Stock(uint siid)
    {
        try
        {
            var info = new SHSTOCKICONINFO { cbSize = (uint)Marshal.SizeOf<SHSTOCKICONINFO>() };
            if (SHGetStockIconInfo(siid, SHGSI_ICON | SHGSI_SMALLICON, ref info) != 0) return null;
            if (info.hIcon == IntPtr.Zero) return null;
            var icon = Icon.FromHandle(info.hIcon);
            var bmp = new Bitmap(icon.ToBitmap(), 16, 16);
            icon.Dispose();
            DestroyIcon(info.hIcon);
            return bmp;
        }
        catch { return null; }
    }

    // ── Drawing helpers ──────────────────────────────────────────────────

    private static Bitmap B(Action<Graphics> draw)
    {
        var bmp = new Bitmap(16, 16, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.Clear(Color.Transparent);
        draw(g);
        return bmp;
    }

    private static readonly Color WinBlue  = Color.FromArgb(0, 120, 212);
    private static readonly Color Gold      = Color.FromArgb(255, 185, 0);
    private static readonly Color DarkGold  = Color.FromArgb(180, 125, 0);
    private static readonly Color GreenOk   = Color.FromArgb(16, 124, 16);
    private static readonly Color RedDel    = Color.FromArgb(196, 43, 28);
    private static readonly Color PageFill  = Color.FromArgb(245, 245, 250);
    private static readonly Color PageBord  = Color.FromArgb(90, 90, 110);
    private static readonly Color ArrowCol  = Color.FromArgb(0, 99, 177);
    private static readonly Color GrayText  = Color.FromArgb(80, 80, 80);

    private static Pen P(Color c, float w = 1.5f) => new(c, w) { LineJoin = LineJoin.Round, StartCap = LineCap.Round, EndCap = LineCap.Round };
    private static SolidBrush Br(Color c) => new(c);

    // ── Drawn icons ──────────────────────────────────────────────────────

    // 새 폴더: 노란 폴더 + 녹색 +
    private static Image DrawFolderNew() => B(g =>
    {
        using var body = new GraphicsPath();
        body.AddRectangle(new RectangleF(1, 5, 13, 9));
        body.AddPolygon(new PointF[] { new(1,5), new(1,3), new(5,3), new(6,5) });
        g.FillPath(Br(Gold), body);
        g.DrawPath(P(DarkGold, 1f), body);
        using var pen = P(GreenOk, 2f);
        g.DrawLine(pen, 10.5f, 9f, 10.5f, 14f);
        g.DrawLine(pen, 8f, 11.5f, 13f, 11.5f);
    });

    // 새 파일: 흰 페이지 + 녹색 +
    private static Image DrawFileNew() => B(g =>
    {
        var rect = new RectangleF(2, 1, 8, 11);
        g.FillRectangle(Br(PageFill), rect);
        g.DrawRectangle(P(PageBord, 1f), 2, 1, 8, 11);
        g.DrawLine(P(PageBord, 1f), 7, 1, 10, 4);
        g.DrawLine(P(PageBord, 1f), 10, 4, 10, 6);
        g.DrawLine(P(PageBord, 1f), 7, 4, 10, 4);
        using var pen = P(GreenOk, 2f);
        g.DrawLine(pen, 10f, 8f, 10f, 14f);
        g.DrawLine(pen, 7f, 11f, 13f, 11f);
    });

    // 복사: 두 페이지
    private static Image DrawCopy() => B(g =>
    {
        g.FillRectangle(Br(Color.FromArgb(200, 210, 230)), new RectangleF(4, 3, 9, 11));
        g.DrawRectangle(P(PageBord, 1f), 4, 3, 9, 11);
        g.FillRectangle(Br(PageFill), new RectangleF(2, 1, 9, 11));
        g.DrawRectangle(P(PageBord, 1f), 2, 1, 9, 11);
        g.DrawLine(P(PageBord, 0.8f), 4, 3, 4, 1);
        g.DrawLine(P(PageBord, 0.8f), 4, 3, 6, 3);
    });

    // 다른 패널로 복사: 페이지 + 오른쪽 화살표
    private static Image DrawCopyRight() => B(g =>
    {
        g.FillRectangle(Br(PageFill), new RectangleF(1, 2, 7, 12));
        g.DrawRectangle(P(PageBord, 1f), 1, 2, 7, 12);
        using var pen = P(WinBlue, 2.5f);
        g.DrawLine(pen, 10, 8, 15, 8);
        var pts = new PointF[] { new(11, 5), new(15, 8), new(11, 11) };
        g.FillPolygon(Br(WinBlue), pts);
    });

    // 잘라내기: 가위
    private static Image DrawCut() => B(g =>
    {
        using var pen = P(GrayText, 1.8f);
        // 두 날
        g.DrawLine(pen, 7, 7, 14, 1);
        g.DrawLine(pen, 7, 7, 14, 14);
        // 두 링
        g.DrawEllipse(P(GrayText, 1.5f), 1, 3, 6, 6);
        g.DrawEllipse(P(GrayText, 1.5f), 1, 9, 6, 6);
        g.FillEllipse(Br(Color.White), 2, 4, 4, 4);
        g.FillEllipse(Br(Color.White), 2, 10, 4, 4);
    });

    // 붙여넣기: 클립보드
    private static Image DrawPaste() => B(g =>
    {
        g.FillRectangle(Br(Color.FromArgb(220, 210, 195)), new RectangleF(2, 4, 11, 11));
        g.DrawRectangle(P(GrayText, 1f), 2, 4, 11, 11);
        g.FillRectangle(Br(Color.FromArgb(160, 140, 110)), new RectangleF(5, 2, 5, 4));
        g.DrawRectangle(P(GrayText, 1f), 5, 2, 5, 4);
        g.FillRectangle(Br(PageFill), new RectangleF(4, 7, 8, 6));
        g.DrawRectangle(P(PageBord, 0.8f), 4, 7, 8, 6);
    });

    // 다른 패널로 이동: 화살표
    private static Image DrawMoveRight() => B(g =>
    {
        g.FillRectangle(Br(Color.FromArgb(200, 220, 240)), new RectangleF(1, 4, 6, 8));
        g.DrawRectangle(P(PageBord, 1f), 1, 4, 6, 8);
        using var pen = P(WinBlue, 2.5f);
        g.DrawLine(pen, 9, 8, 15, 8);
        g.FillPolygon(Br(WinBlue), new PointF[] { new(10, 5), new(15, 8), new(10, 11) });
    });

    // 이름 바꾸기: 연필
    private static Image DrawRename() => B(g =>
    {
        var pts = new PointF[] { new(3, 13), new(10, 4), new(13, 7), new(5, 15) };
        g.FillPolygon(Br(Color.FromArgb(255, 215, 0)), pts);
        g.DrawPolygon(P(Color.FromArgb(160, 130, 0), 1f), pts);
        g.DrawLine(P(Color.FromArgb(160, 130, 0), 1f), 10, 4, 13, 7);
        g.FillPolygon(Br(Color.FromArgb(200, 180, 150)), new PointF[] { new(2, 14), new(3, 13), new(5, 15) });
        var tip = new PointF[] { new(3, 13), new(4, 12), new(4, 14) };
        g.FillPolygon(Br(GrayText), tip);
    });

    // 삭제: 빨간 X
    private static Image DrawDelete() => B(g =>
    {
        using var pen = P(RedDel, 2.5f);
        g.DrawLine(pen, 3, 3, 13, 13);
        g.DrawLine(pen, 13, 3, 3, 13);
    });

    // 새로고침: 순환 화살표
    private static Image DrawRefresh() => B(g =>
    {
        using var pen = P(WinBlue, 2f);
        g.DrawArc(pen, 2, 2, 12, 12, 60, 240);
        g.DrawArc(pen, 2, 2, 12, 12, 240, 240);
        // 화살촉 위
        g.FillPolygon(Br(WinBlue), new PointF[] { new(12, 2), new(14, 6), new(10, 5) });
        // 화살촉 아래
        g.FillPolygon(Br(WinBlue), new PointF[] { new(4, 14), new(2, 10), new(6, 11) });
    });

    // 즐겨찾기: 별
    private static Image DrawBookmark() => B(g =>
    {
        var star = StarPoints(8, 8, 6.5f, 3f, 5);
        g.FillPolygon(Br(Gold), star);
        g.DrawPolygon(P(DarkGold, 1f), star);
    });

    // 미리보기: 눈
    private static Image DrawPreview() => B(g =>
    {
        g.DrawArc(P(GrayText, 1.5f), 1, 4, 14, 8, 180, 180);
        g.DrawArc(P(GrayText, 1.5f), 1, 4, 14, 8, 0, 180);
        g.FillEllipse(Br(WinBlue), 5, 6, 6, 6);
        g.FillEllipse(Br(Color.White), 6, 7, 4, 4);
        g.FillEllipse(Br(Color.FromArgb(20, 20, 20)), 7, 8, 2, 2);
    });

    // 속성: ℹ 원
    private static Image DrawProperties() => B(g =>
    {
        g.FillEllipse(Br(WinBlue), 1, 1, 14, 14);
        using var font = new Font("Segoe UI", 9f, FontStyle.Bold);
        var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString("i", font, Br(Color.White), new RectangleF(1, 1, 14, 14), sf);
    });

    // 압축 해제: 상자 + 아래 화살표
    private static Image DrawUnzip() => B(g =>
    {
        g.FillRectangle(Br(Color.FromArgb(200, 225, 200)), new RectangleF(1, 7, 14, 8));
        g.DrawRectangle(P(GreenOk, 1.2f), 1, 7, 14, 8);
        g.FillRectangle(Br(Color.FromArgb(160, 200, 160)), new RectangleF(1, 7, 14, 3));
        using var pen = P(GreenOk, 2.5f);
        g.DrawLine(pen, 8, 1, 8, 9);
        g.FillPolygon(Br(GreenOk), new PointF[] { new(5, 7), new(11, 7), new(8, 11) });
    });

    // 연결 프로그램으로 열기: 창 + 화살표
    private static Image DrawOpenWith() => B(g =>
    {
        g.FillRectangle(Br(Color.FromArgb(200, 220, 250)), new RectangleF(1, 1, 9, 9));
        g.DrawRectangle(P(WinBlue, 1f), 1, 1, 9, 9);
        g.FillRectangle(Br(WinBlue), new RectangleF(1, 1, 9, 3));
        using var pen = P(ArrowCol, 2f);
        g.DrawLine(pen, 11, 8, 15, 12);
        g.DrawLine(pen, 12, 8, 15, 8);
        g.DrawLine(pen, 15, 8, 15, 11);
    });

    // 모두 선택: 점선 사각형
    private static Image DrawSelectAll() => B(g =>
    {
        using var pen = new Pen(WinBlue, 1.5f) { DashStyle = DashStyle.Dash };
        g.DrawRectangle(pen, 2, 2, 12, 12);
        g.FillRectangle(Br(Color.FromArgb(40, 0, 120, 212)), new RectangleF(2, 2, 12, 12));
    });

    // 종료: 전원 버튼
    private static Image DrawExit() => B(g =>
    {
        using var pen = P(RedDel, 2f);
        g.DrawArc(pen, 2, 3, 12, 12, -230, 280);
        g.DrawLine(P(RedDel, 2f), 8, 1, 8, 8);
    });

    // ── Star helper ──────────────────────────────────────────────────────

    private static PointF[] StarPoints(float cx, float cy, float outerR, float innerR, int points)
    {
        var pts = new PointF[points * 2];
        double step = Math.PI / points;
        for (int i = 0; i < points * 2; i++)
        {
            double angle = i * step - Math.PI / 2;
            float r = (i % 2 == 0) ? outerR : innerR;
            pts[i] = new PointF(cx + (float)(r * Math.Cos(angle)), cy + (float)(r * Math.Sin(angle)));
        }
        return pts;
    }
}
