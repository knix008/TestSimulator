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
        _cache["folder"]      = DrawFolder();
        _cache["folder_open"] = DrawFolderOpen();
        _cache["file"]        = DrawFile();
        _cache["search"]      = DrawSearch();
        _cache["zip"]         = DrawZip();

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
        _cache["index"]       = DrawIndex();
        _cache["stop"]        = DrawStop();
        _cache["bookmark"]    = DrawBookmark();
        _cache["preview"]     = DrawPreview();
        _cache["properties"]  = DrawProperties();
        _cache["unzip"]       = DrawUnzip();
        _cache["exit"]        = DrawExit();
        _cache["select_all"]  = DrawSelectAll();
        _cache["open_with"]   = DrawOpenWith();
        _cache["info"]        = DrawInfo();

        _cache["settings"]    = DrawSettings();
        _cache["language"]    = DrawLanguage();
        _cache["lang_ko"]     = DrawGlyph("가", "Malgun Gothic", 11f, WinBlue);
        _cache["lang_en"]     = DrawGlyph("A", "Segoe UI", 12f, Color.FromArgb(196, 80, 0));
        _cache["theme"]       = DrawTheme();
        _cache["light"]       = DrawLight();
        _cache["dark"]        = DrawDark();
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

    private static Image DrawFolder() => B(g =>
    {
        using var body = new GraphicsPath();
        body.AddRectangle(new RectangleF(1, 5, 14, 9));
        body.AddPolygon(new PointF[] { new(1, 5), new(1, 3), new(6, 3), new(7, 5) });
        g.FillPath(Br(Gold), body);
        g.DrawPath(P(DarkGold, 1f), body);
        g.FillRectangle(Br(Color.FromArgb(255, 210, 80)), new RectangleF(2, 6, 12, 2));
    });

    private static Image DrawFolderOpen() => B(g =>
    {
        g.FillRectangle(Br(Color.FromArgb(255, 200, 54)), new RectangleF(1, 4, 12, 5));
        g.DrawRectangle(P(DarkGold, 1f), 1, 4, 12, 5);
        using var front = new GraphicsPath();
        front.AddPolygon(new PointF[] { new(2, 7), new(15, 7), new(13, 14), new(1, 14) });
        g.FillPath(Br(Color.FromArgb(255, 188, 33)), front);
        g.DrawPath(P(DarkGold, 1f), front);
    });

    private static Image DrawFile() => B(g =>
    {
        g.FillRectangle(Br(PageFill), new RectangleF(3, 1, 10, 14));
        g.DrawRectangle(P(PageBord, 1f), 3, 1, 10, 14);
        g.FillPolygon(Br(Color.FromArgb(210, 232, 255)), new PointF[] { new(10, 1), new(13, 4), new(10, 4) });
        g.DrawLine(P(PageBord, 0.9f), 10, 1, 13, 4);
        g.DrawLine(P(WinBlue, 1f), 5, 7, 11, 7);
        g.DrawLine(P(WinBlue, 1f), 5, 10, 11, 10);
    });

    private static Image DrawSearch() => B(g =>
    {
        g.FillEllipse(Br(Color.FromArgb(222, 244, 255)), 1, 1, 10, 10);
        g.DrawEllipse(P(WinBlue, 1.8f), 1, 1, 10, 10);
        g.DrawLine(P(Color.FromArgb(255, 140, 0), 2.5f), 9.5f, 9.5f, 14, 14);
    });

    private static Image DrawZip() => B(g =>
    {
        g.FillRectangle(Br(Color.FromArgb(232, 244, 255)), new RectangleF(3, 1, 10, 14));
        g.DrawRectangle(P(WinBlue, 1f), 3, 1, 10, 14);
        g.FillRectangle(Br(Color.FromArgb(255, 210, 80)), new RectangleF(6, 1, 3, 14));
        for (int y = 2; y < 14; y += 3)
            g.FillRectangle(Br(Color.FromArgb(115, 88, 30)), new RectangleF(7, y, 1, 1));
        g.DrawLine(P(GreenOk, 1.5f), 10, 11, 13, 14);
    });

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

    // 다른 패널로 복사: 두 겹친 페이지(복사=복제) + 파란 오른쪽 화살표
    private static Image DrawCopyRight() => B(g =>
    {
        // 뒤 페이지
        g.FillRectangle(Br(Color.FromArgb(200, 210, 230)), new RectangleF(3, 3, 6, 11));
        g.DrawRectangle(P(PageBord, 1f), 3, 3, 6, 11);
        // 앞 페이지
        g.FillRectangle(Br(PageFill), new RectangleF(1, 1, 6, 11));
        g.DrawRectangle(P(PageBord, 1f), 1, 1, 6, 11);
        // 파란 화살표
        using var pen = P(WinBlue, 2.3f);
        g.DrawLine(pen, 9, 9, 14, 9);
        g.FillPolygon(Br(WinBlue), new PointF[] { new(11, 6), new(15, 9), new(11, 12) });
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

    // 다른 패널로 이동: 단일 항목(폴더) + 굵은 주황 화살표(이동). 색·형태를 복사와 달리해 구분.
    private static Image DrawMoveRight() => B(g =>
    {
        var move = Color.FromArgb(230, 120, 0);
        // 단일 폴더
        using var body = new GraphicsPath();
        body.AddRectangle(new RectangleF(1, 5, 6, 7));
        body.AddPolygon(new PointF[] { new(1, 5), new(1, 3), new(4, 3), new(5, 5) });
        g.FillPath(Br(Color.FromArgb(255, 214, 140)), body);
        g.DrawPath(P(DarkGold, 1f), body);
        // 굵은 주황 화살표
        using var pen = P(move, 2.8f);
        g.DrawLine(pen, 8, 8, 15, 8);
        g.FillPolygon(Br(move), new PointF[] { new(11, 4), new(15, 8), new(11, 12) });
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

    // 글자 아이콘(언어 구분 등): 16×16 박스 중앙에 한 글자를 그린다.
    private static Image DrawGlyph(string text, string fontName, float sizePx, Color color) => B(g =>
    {
        using var font = new Font(fontName, sizePx, FontStyle.Bold, GraphicsUnit.Pixel);
        using var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString(text, font, Br(color), new RectangleF(0, 0, 16, 16), sf);
    });

    // 색인: 데이터베이스 실린더(새로고침·검색 아이콘과 구분)
    private static Image DrawIndex() => B(g =>
    {
        var fill = Color.FromArgb(222, 244, 255);
        using var pen = P(WinBlue, 1.4f);
        // 몸통
        g.FillRectangle(Br(fill), new RectangleF(3, 4, 10, 8));
        g.DrawLine(pen, 3, 4, 3, 12);
        g.DrawLine(pen, 13, 4, 13, 12);
        // 아래 테두리(곡선)
        g.DrawArc(pen, 3, 9, 10, 4, 0, 180);
        // 중간 띠
        g.DrawArc(pen, 3, 5, 10, 4, 0, 180);
        // 상단 타원
        g.FillEllipse(Br(fill), 3, 2, 10, 4);
        g.DrawEllipse(pen, 3, 2, 10, 4);
    });

    // 멈춤: 빨간 정지 사각형
    private static Image DrawStop() => B(g =>
    {
        g.FillRectangle(Br(RedDel), new RectangleF(3, 3, 10, 10));
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

    // 프로그램 정보: 현대적인 정보 원형 아이콘
    private static Image DrawInfo() => B(g =>
    {
        using var ring = P(WinBlue, 1.6f);
        g.FillEllipse(Br(Color.FromArgb(235, 246, 255)), 1, 1, 14, 14);
        g.DrawEllipse(ring, 1.5f, 1.5f, 13, 13);
        using var dot = Br(WinBlue);
        g.FillEllipse(dot, 7, 4, 2, 2);
        using var pen = P(WinBlue, 1.8f);
        g.DrawLine(pen, 8, 8, 8, 12);
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

    // 설정: 톱니바퀴
    private static Image DrawSettings() => B(g =>
    {
        const float cx = 8f, cy = 8f;
        for (int i = 0; i < 8; i++)
        {
            double a = i * Math.PI / 4;
            float tx = cx + (float)Math.Cos(a) * 6f - 1.6f;
            float ty = cy + (float)Math.Sin(a) * 6f - 1.6f;
            g.FillRectangle(Br(WinBlue), tx, ty, 3.2f, 3.2f);
        }
        g.FillEllipse(Br(WinBlue), 3, 3, 10, 10);
        g.FillEllipse(Br(Color.White), 6, 6, 4, 4);
    });

    // 언어: 지구본
    private static Image DrawLanguage() => B(g =>
    {
        g.FillEllipse(Br(Color.FromArgb(222, 244, 255)), 1, 1, 14, 14);
        using var pen = P(WinBlue, 1.2f);
        g.DrawEllipse(pen, 1, 1, 14, 14);
        g.DrawEllipse(pen, 5, 1, 6, 14);   // 세로 자오선
        g.DrawLine(pen, 1.5f, 8, 14.5f, 8); // 적도
        g.DrawArc(pen, 1.5f, 3, 13, 10, 200, 140); // 위선
        g.DrawArc(pen, 1.5f, 3, 13, 10, 20, 140);
    });

    // 테마: 반은 해, 반은 밤(전환)
    private static Image DrawTheme() => B(g =>
    {
        g.FillEllipse(Br(Gold), 2, 2, 12, 12);
        using var half = new GraphicsPath();
        half.AddPie(2, 2, 12, 12, -90, 180); // 오른쪽 절반
        g.FillPath(Br(Color.FromArgb(60, 66, 80)), half);
        g.DrawEllipse(P(Color.FromArgb(150, 130, 60), 1f), 2, 2, 12, 12);
    });

    // 밝게: 해
    private static Image DrawLight() => B(g =>
    {
        using var pen = P(Gold, 1.6f);
        for (int i = 0; i < 8; i++)
        {
            double a = i * Math.PI / 4;
            g.DrawLine(pen,
                8 + (float)Math.Cos(a) * 5.5f, 8 + (float)Math.Sin(a) * 5.5f,
                8 + (float)Math.Cos(a) * 7.5f, 8 + (float)Math.Sin(a) * 7.5f);
        }
        g.FillEllipse(Br(Gold), 4, 4, 8, 8);
        g.DrawEllipse(P(DarkGold, 1f), 4, 4, 8, 8);
    });

    // 어둡게: 초승달
    private static Image DrawDark() => B(g =>
    {
        using var moon = new GraphicsPath();
        moon.AddEllipse(2, 2, 12, 12);
        using var cut = new GraphicsPath();
        cut.AddEllipse(6, 0, 12, 12);
        using var region = new Region(moon);
        region.Exclude(cut);
        g.FillRegion(Br(Color.FromArgb(255, 200, 90)), region);
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
